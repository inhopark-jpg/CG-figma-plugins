// Pure layout for Organize Sections — no figma API here, so test/layout.test.mjs
// can run it in Node. code.ts reads the selected section into an Item tree,
// calls organize(), and writes the changed positions, sizes and fills back.
//
// Every section is laid out from the inside out: child sections first (their
// size decides the parent's), then the section itself. Non-section children
// (frames, components, brackets, text…) never change size; in the page and
// component layouts they move together as one rigid "content" block.
//
// A transparent section below the selected one is a note (examples, usage
// notes — usually with a dashed outline). It is never a sub page, building
// block, pattern or template: it keeps its transparent fill, gets its own
// padding cleaned up, and otherwise moves with the content around it.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// Section background, in the order the plugin alternates them:
// transparent → white → light gray → dark gray → light gray → …
export type Tone = 'none' | 'white' | 'light' | 'dark' | 'other'

export interface Item {
  id: string
  name: string
  section: boolean
  rect: Rect // axis-aligned bounds relative to the parent section
  tone?: Tone // sections: current background
  comps?: string[] // sections: names of direct COMPONENT / COMPONENT_SET children
  children?: Item[] // sections only
  // Non-section children: component usage, read from the canvas.
  comp?: boolean // a COMPONENT or COMPONENT_SET (a definition, not an example)
  defs?: { id: string; name: string }[] // components it defines; a variant carries its set's name
  uses?: string[] // main components of the instances directly inside it
}

export type Mode = 'basic' | 'page' | 'component'

export const PAD = 100 // section edge → content
export const GAP = 100 // between sibling sections
export const PAGE_BAND = 1000 // page layout: screens → sub pages, and above the building-block row
export const COMP_BAND = 200 // component layout: between pattern / template / building-block bands

const EPS = 0.5

export const BUILDING_BLOCK = /building[\s_-]*block/i
const SKELETON = /(^|[\s./])skeleton\b/i
const PATTERN = /(^|[\s./])pattern\b/i

export function nextTone(t: Tone): Tone {
  return t === 'none' ? 'white' : t === 'white' ? 'light' : t === 'light' ? 'dark' : 'light'
}

export interface Result {
  tree: Item
  tones: { id: string; tone: Tone }[] // sections whose background changes
}

export function isNote(c: Item): boolean {
  return c.section && c.tone === 'none'
}

export function organize(root: Item, mode: Mode): Result {
  const tree = clone(root)
  const { x, y } = tree.rect
  if (mode === 'basic') tidy(tree)
  else arrange(tree, mode)
  // The selected section stays where it is; everything inside moves.
  tree.rect.x = x
  tree.rect.y = y
  const tones: Result['tones'] = []
  paint(tree, tree.tone || 'none', tones)
  return { tree, tones }
}

function clone(it: Item): Item {
  return { ...it, rect: { ...it.rect }, children: it.children && it.children.map(clone) }
}

// `outer` is the tone the children continue from. Notes stay transparent and
// are skipped: sections inside a note continue from the note's parent.
function paint(s: Item, outer: Tone, out: Result['tones']) {
  const tone = nextTone(outer)
  for (const c of s.children || []) {
    if (!c.section) continue
    if (isNote(c)) {
      paint(c, outer, out)
      continue
    }
    if (c.tone !== tone) out.push({ id: c.id, tone })
    c.tone = tone
    paint(c, tone, out)
  }
}

// ---------------------------------------------------------------------------
// Basic cleanup: every section wraps its children with PAD. The arrangement
// is kept, but the gap between a section and the nearest section after it
// (right or below) becomes GAP. Gaps that involve content or notes stay as
// drawn, so brackets and examples keep their place next to a component.

function tidy(s: Item) {
  const kids = s.children || []
  if (!kids.length) return
  for (const c of kids) if (c.section) tidy(c)
  // Neighbours are judged on the fitted children (each section already wraps
  // its content), so a second run sees the same neighbours as the first.
  const fitted = kids.map((c) => ({ ...c.rect }))
  const block = kids.map((c) => c.section && !isNote(c))
  const xs = solve(fitted, 'x', block)
  const ys = solve(fitted, 'y', block)
  kids.forEach((c, i) => {
    c.rect.x = xs[i]
    c.rect.y = ys[i]
  })
  separate(kids, fitted)
  wrap(s)
}

// New start of each child on one axis. A child that sits after another one on
// this axis (and overlaps it on the other axis) follows the nearest such one:
// GAP after it when both are sections (`block`), else the gap as drawn.
// Two children that overlap on both axes (a section grew into its neighbour)
// count as one after the other on the axis where they overlap less.
// A child with nothing before it stays where it is.
export function solve(rects: Rect[], axis: 'x' | 'y', block: boolean[] = []): number[] {
  const S = axis, L = axis === 'x' ? 'w' : 'h'
  const n = rects.length
  const end = (r: Rect) => r[S] + r[L]
  const span = (a: Rect, b: Rect, ax: 'x' | 'y') => {
    const l = ax === 'x' ? 'w' : 'h'
    return Math.min(a[ax] + a[l], b[ax] + b[l]) - Math.max(a[ax], b[ax])
  }
  const other = axis === 'x' ? 'y' : 'x'
  const order = rects.map((_, i) => i).sort((a, b) => rects[a][S] - rects[b][S] || end(rects[a]) - end(rects[b]) || a - b)
  const rank: number[] = new Array(n)
  order.forEach((i, r) => (rank[i] = r))
  const after = (j: number, i: number) => {
    if (rank[j] >= rank[i]) return false
    const a = rects[j], b = rects[i]
    const o = span(a, b, other)
    if (o <= EPS) return false
    if (end(a) <= b[S] + EPS) return true
    const own = span(a, b, axis)
    return axis === 'x' ? own <= o : own < o
  }
  const prev: number[][] = rects.map((_, i) => rects.map((_, j) => j).filter((j) => after(j, i)))
  // Only the nearest ones count: drop j when j → k → i also exists.
  const near = prev.map((ps) => ps.filter((j) => !ps.some((k) => k !== j && prev[k].indexOf(j) >= 0)))
  const pos: number[] = new Array(n)
  for (const i of order) {
    pos[i] = near[i].length
      ? Math.max(...near[i].map((j) => pos[j] + rects[j][L] + (block[i] && block[j] ? GAP : rects[i][S] - end(rects[j]))))
      : rects[i][S]
  }
  return pos
}

// The two axes are solved separately, so two children that were apart only
// diagonally can end up overlapping. Push the later one (by original
// position) down below the other; children that overlapped before are left.
function separate(kids: Item[], before: Rect[]) {
  const hit = (a: Rect, b: Rect) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
  for (let round = 0; round < kids.length; round++) {
    let moved = false
    for (let i = 0; i < kids.length; i++)
      for (let j = 0; j < kids.length; j++) {
        if (i === j || hit(before[i], before[j])) continue
        const a = kids[i].rect, b = kids[j].rect
        const later = before[j].y > before[i].y || (before[j].y === before[i].y && before[j].x > before[i].x)
        if (!later || !hit(a, b)) continue
        b.y = a.y + a.h + (kids[i].section && kids[j].section ? GAP : 0)
        moved = true
      }
    if (!moved) return
  }
}

// Fits a section around its children with PAD on every side. The children
// keep their place on the canvas; the section's frame moves instead.
function wrap(s: Item) {
  const kids = s.children || []
  if (!kids.length) return
  const minX = Math.min(...kids.map((c) => c.rect.x))
  const minY = Math.min(...kids.map((c) => c.rect.y))
  const maxX = Math.max(...kids.map((c) => c.rect.x + c.rect.w))
  const maxY = Math.max(...kids.map((c) => c.rect.y + c.rect.h))
  for (const c of kids) {
    c.rect.x += PAD - minX
    c.rect.y += PAD - minY
  }
  s.rect.x += minX - PAD
  s.rect.y += minY - PAD
  s.rect.w = maxX - minX + 2 * PAD
  s.rect.h = maxY - minY + 2 * PAD
}

// ---------------------------------------------------------------------------
// Page and component layouts. A section is stacked in up to three bands:
//
//   above   pattern sections (component layout)               one row
//   middle  content block | main sections (one row)
//           sections that belong to the content stack under it (component layout)
//   below   building-block / skeleton sections                 one row; a single one may span the full width
//
// A single below section spans the full width to show it is shared: always in
// the page layout, and in the component layout only when there are main
// sections (templates) above it — a skeleton used by all of them. A building
// block of one template or of the skeleton itself keeps its own width.
//
// Notes count as content. Page layout gives the sections of a row the same
// height; in the component layout every section wraps its own content.
//
// Which band a child section goes to is decided first by component usage
// between the parent's own content and its child sections (usage()), and only
// when that says nothing, by names (byName()):
//
// Page layout:      blank-named or "building-block" sections → below, the rest
//                   (sub pages) → main, the page's own screens = content.
// Component layout: "building-block" or skeleton sections → below, pattern
//                   sections → above. Other sections are main (in a group
//                   section with no components of its own) or stack under the
//                   template's content (in a section that has components).

export type Role = 'above' | 'main' | 'stack' | 'below'

export function role(c: Item, mode: 'page' | 'component', parent: Item, root: Item = parent): Role {
  const hasComps = (parent.comps || []).length > 0
  return usage(c, mode, parent, root) || byName(c, mode, hasComps)
}

export function byName(c: Item, mode: 'page' | 'component', parentHasComps: boolean): Role {
  if (mode === 'page') return !c.name.trim() || BUILDING_BLOCK.test(c.name) ? 'below' : 'main'
  const comps = c.comps || []
  if (BUILDING_BLOCK.test(c.name) || comps.some((n) => SKELETON.test(n))) return 'below'
  if (PATTERN.test(c.name) || (comps.length > 0 && comps.every((n) => PATTERN.test(n)))) return 'above'
  return parentHasComps ? 'stack' : 'main'
}

// The direction of use, not how often something is used: a template used by
// many patterns is still not a skeleton, because its patterns sit inside it
// and use the parent — they are not its siblings.
//
//   above  the child uses a component of the parent (a pattern fixing the template)
//   below  the child's components are used from outside the child, anywhere in
//          the selected section (`root`): by the parent, a sibling (skeleton
//          under its templates) or further up (a building block of the
//          template two levels above). In the component layout every used
//          component must be a building block (name starts with "."): a
//          composite template using `btn-primary` from the group next to it
//          does not push that group below.
//
// Users are component definitions in the component layout (the instances in
// example frames and notes do not count) and any content in the page layout
// (screens are frames). null when usage says nothing.
export function usage(c: Item, mode: 'page' | 'component', parent: Item, root: Item = parent): Role | null {
  const counts = (n: Item) => mode === 'page' || !!n.comp
  const parentDefs = new Set<string>()
  for (const n of parent.children || []) if (!n.section) for (const d of n.defs || []) parentDefs.add(d.id)
  const inside = tally(c, counts)
  if (mode === 'component') for (const u of Array.from(inside.keys())) if (parentDefs.has(u)) return 'above'
  const all = tallyAll(root, mode)
  const used = defsIn(c).filter((d) => (all.get(d.id) || 0) > (inside.get(d.id) || 0))
  if (!used.length) return null
  if (mode === 'page' || used.every((d) => d.name.startsWith('.'))) return 'below'
  return null
}

// How often each component is used inside `s`, by the users that count.
function tally(s: Item, counts: (n: Item) => boolean): Map<string, number> {
  const out = new Map<string, number>()
  const walk = (it: Item) => {
    for (const n of it.children || []) {
      if (n.section) walk(n)
      else if (counts(n)) for (const u of n.uses || []) out.set(u, (out.get(u) || 0) + 1)
    }
  }
  walk(s)
  return out
}

const tallies = new WeakMap<Item, Record<string, Map<string, number>>>()
function tallyAll(root: Item, mode: 'page' | 'component'): Map<string, number> {
  let t = tallies.get(root)
  if (!t) tallies.set(root, (t = {}))
  return t[mode] || (t[mode] = tally(root, (n) => mode === 'page' || !!n.comp))
}

function defsIn(s: Item): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = []
  for (const n of s.children || []) {
    if (n.section) out.push(...defsIn(n))
    else out.push(...(n.defs || []))
  }
  return out
}



// A section that spans its parent's width passes the extra width on to its
// own full-width child.
const spanning = new WeakMap<Item, Item>()

function widen(s: Item, w: number) {
  if (w <= s.rect.w) return
  s.rect.w = w
  const kid = spanning.get(s)
  if (kid) widen(kid, w - 2 * PAD)
}

function arrange(s: Item, mode: 'page' | 'component', root: Item = s) {
  const kids = s.children || []
  if (!kids.length) return
  const secs = kids.filter((c) => c.section && !isNote(c))
  const nodes = kids.filter((c) => !c.section || isNote(c))
  for (const c of secs) arrange(c, mode, root)
  for (const c of nodes) if (c.section) tidy(c)

  const band = mode === 'page' ? PAGE_BAND : COMP_BAND
  const same = mode === 'page' // rows share one height
  const groups: Record<Role, Item[]> = { above: [], main: [], stack: [], below: [] }
  for (const c of secs) groups[role(c, mode, s, root)].push(c)
  const byX = (a: Item, b: Item) => a.rect.x - b.rect.x || a.rect.y - b.rect.y
  groups.above.sort(byX)
  groups.main.sort(byX)
  groups.below.sort(byX)
  groups.stack.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)

  let y = PAD
  let width = 0
  const bands: number[] = [] // bottom of each band placed so far

  // Above
  if (groups.above.length) {
    const r = row(groups.above, PAD, y, same)
    width = Math.max(width, r.w)
    y += r.h
    bands.push(y)
  }

  // Middle: content column (content + stacked sections) then main sections.
  const hasMiddle = nodes.length > 0 || groups.stack.length > 0 || groups.main.length > 0
  if (hasMiddle) {
    if (bands.length) y += band
    let x = PAD
    let colW = 0
    let colH = 0
    if (nodes.length) {
      const b = bounds(nodes)
      for (const n of nodes) {
        n.rect.x += x - b.x
        n.rect.y += y - b.y
      }
      colW = b.w
      colH = b.h
    }
    for (const c of groups.stack) {
      if (colH) colH += GAP
      c.rect.x = x
      c.rect.y = y + colH
      colW = Math.max(colW, c.rect.w)
      colH += c.rect.h
    }
    if (colW) x += colW + (groups.main.length ? band : 0)
    let midH = colH
    if (groups.main.length) {
      const r = row(groups.main, x, y, same)
      x += r.w
      midH = Math.max(midH, r.h)
    }
    width = Math.max(width, x - PAD)
    y += midH
    bands.push(y)
  }

  // Below
  if (groups.below.length) {
    if (bands.length) y += band
    const r = row(groups.below, PAD, y, same)
    width = Math.max(width, r.w)
    y += r.h
    if (groups.below.length === 1 && (mode === 'page' || groups.main.length > 0)) {
      widen(groups.below[0], width)
      spanning.set(s, groups.below[0])
    }
  }

  s.rect.w = width + 2 * PAD
  s.rect.h = y + PAD
}

// Places sections left to right from (x, y) with GAP, top-aligned; with
// `same`, all as tall as the tallest.
function row(items: Item[], x: number, y: number, same: boolean): { w: number; h: number } {
  const h = Math.max(...items.map((c) => c.rect.h))
  let cx = x
  for (const c of items) {
    c.rect.x = cx
    c.rect.y = y
    if (same) c.rect.h = h
    cx += c.rect.w + GAP
  }
  return { w: cx - GAP - x, h }
}

function bounds(items: Item[]): Rect {
  const x = Math.min(...items.map((c) => c.rect.x))
  const y = Math.min(...items.map((c) => c.rect.y))
  return {
    x,
    y,
    w: Math.max(...items.map((c) => c.rect.x + c.rect.w)) - x,
    h: Math.max(...items.map((c) => c.rect.y + c.rect.h)) - y,
  }
}
