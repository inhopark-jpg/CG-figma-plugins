// Pure layout logic for Organize Comp Variants — no figma API, so test/layout.test.mjs
// can run it in Node against recorded variant positions.

export type Axis = 'x' | 'y'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface V extends Box {
  id: string
  variantProperties: { [prop: string]: string } | null
}

// A group of variants sharing one value of `prop` on an axis. Leaves are cells.
export interface TNode<T extends V = V> {
  prop: string
  value: string
  items: T[]
  kids: TNode<T>[]
  depth: number
  label: number // label text length along the axis
  content: number // children (or cell) length along the axis
  size: number // max(content, room the label needs)
  start: number // offset from the first cell, along the axis
}

// Spacing, in px. Gaps grow by STEP for every level a group sits above the cells.
export const OVERSHOOT = 8 // a bracket reaches this far past the cells it covers
export const GAP = 40
export const STEP = 40

export const variantValue = (v: V, prop: string) => (v.variantProperties && v.variantProperties[prop]) || ''
// Axis inference — from where the variants sit now.

export const center = (v: Box, axis: Axis) => (axis === 'x' ? v.x + v.width / 2 : v.y + v.height / 2)
export const length = (v: Box, axis: Axis) => (axis === 'x' ? v.width : v.height)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function groupBy<T extends V>(items: T[], prop: string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const v of items) {
    const k = variantValue(v, prop)
    const list = out.get(k)
    if (list) list.push(v)
    else out.set(k, [v])
  }
  return out
}

// Share of the position spread along `axis` explained by the property's value
// (η²): 1 = the value alone decides the position, 0 = unrelated.
export function explained(items: V[], prop: string, axis: Axis): number {
  const all = items.map((v) => center(v, axis))
  const m = mean(all)
  const total = all.reduce((s, c) => s + (c - m) ** 2, 0)
  if (total < 1e-6) return 0
  let between = 0
  for (const g of groupBy(items, prop).values()) between += g.length * (mean(g.map((v) => center(v, axis))) - m) ** 2
  return between / total
}

export function assignAxes(items: V[], props: string[]): Record<Axis, string[]> {
  const out: Record<Axis, string[]> = { x: [], y: [] }
  const unsure: string[] = []
  for (const p of props) {
    const ex = explained(items, p, 'x')
    const ey = explained(items, p, 'y')
    // Inner properties explain little spread on either axis, so compare strictly.
    if (Math.abs(ex - ey) < 1e-3) unsure.push(p)
    else out[ex > ey ? 'x' : 'y'].push(p)
  }
  // Ambiguous (e.g. a freshly combined set): properties with more values go on X first.
  const count = (p: string) => groupBy(items, p).size
  unsure.sort((a, b) => count(b) - count(a))
  for (const p of unsure) out[out.x.length <= out.y.length ? 'x' : 'y'].push(p)
  return out
}

// Walking the variants along the axis, the outer property changes value least often.
export function nestingOrder(items: V[], props: string[], axis: Axis): string[] {
  const other: Axis = axis === 'x' ? 'y' : 'x'
  const sorted = items.slice().sort((a, b) => center(a, axis) - center(b, axis) || center(a, other) - center(b, other))
  const changes = (p: string) => {
    let n = 0
    for (let i = 1; i < sorted.length; i++) if (variantValue(sorted[i], p) !== variantValue(sorted[i - 1], p)) n++
    return n
  }
  const count = (p: string) => groupBy(items, p).size
  return props.slice().sort((a, b) => changes(a) - changes(b) || count(a) - count(b) || props.indexOf(a) - props.indexOf(b))
}

// Groups keep their current order (by mean position), so a re-run is stable and
// inner groups may order their values differently under different parents.
export function buildTree<T extends V>(items: T[], props: string[], axis: Axis, depth = 0): TNode<T>[] {
  if (!props.length) return []
  const [prop, ...rest] = props
  return Array.from(groupBy(items, prop).entries())
    .map(([value, group]) => ({ value, group, at: mean(group.map((v) => center(v, axis))) }))
    .sort((a, b) => a.at - b.at)
    .map(({ value, group }) => ({
      prop,
      value,
      items: group,
      kids: buildTree(group, rest, axis, depth + 1),
      depth,
      label: 0,
      content: 0,
      size: 0,
      start: 0,
    }))
}

export function walk<T extends V>(nodes: TNode<T>[], fn: (n: TNode<T>) => void) {
  for (const n of nodes) {
    fn(n)
    walk(n.kids, fn)
  }
}

// Sizes: a leaf is as long as its longest variant; a group is its children plus
// gaps; either grows to fit its label so neighbouring brackets never collide.
export function measure(nodes: TNode[], axis: Axis, levels: number): number {
  const gap = (d: number) => GAP + STEP * (levels - 1 - d)
  let total = 0
  nodes.forEach((n, i) => {
    n.content = n.kids.length ? measure(n.kids, axis, levels) : Math.max(...n.items.map((v) => length(v, axis)))
    n.size = Math.max(n.content, n.label - OVERSHOOT * 2)
    total += n.size + (i ? gap(n.depth) : 0)
  })
  return total
}

export function place(nodes: TNode[], start: number, levels: number) {
  let cursor = start
  for (const n of nodes) {
    n.start = cursor
    if (n.kids.length) place(n.kids, cursor + (n.size - n.content) / 2, levels)
    cursor += n.size + GAP + STEP * (levels - 1 - n.depth)
  }
}

export interface Plan<T extends V> {
  trees: Record<Axis, TNode<T>[]> // labeled groups; empty when no property sits on that axis
  levels: Record<Axis, number>
  total: Record<Axis, number> // grid length, without set padding
  cell: Map<string, Record<Axis, TNode<T>>> // variant id → its column (x) and row (y) leaf
  overlaps: number // variants sharing a cell with another
}

// Everything except touching the canvas. `label` is called once per group, in
// tree order, and returns that group's label length along the axis.
export function plan<T extends V>(items: T[], props: string[], label: (n: TNode<T>, axis: Axis) => number): Plan<T> {
  const axes = assignAxes(items, props)
  const trees = { x: [] as TNode<T>[], y: [] as TNode<T>[] }
  const levels = { x: axes.x.length, y: axes.y.length }
  const grid = { x: [] as TNode<T>[], y: [] as TNode<T>[] }
  const total = { x: 0, y: 0 }
  for (const axis of ['x', 'y'] as const) {
    trees[axis] = buildTree(items, nestingOrder(items, axes[axis], axis), axis)
    walk(trees[axis], (n) => (n.label = label(n, axis)))
    // No property on this axis: one row (or column) holding everything, unlabeled.
    grid[axis] = trees[axis].length
      ? trees[axis]
      : [{ prop: '', value: '', items, kids: [], depth: 0, label: 0, content: 0, size: 0, start: 0 }]
    total[axis] = measure(grid[axis], axis, levels[axis])
    place(grid[axis], 0, levels[axis])
  }

  const cell = new Map<string, Record<Axis, TNode<T>>>()
  const leaves = new Map<string, Partial<Record<Axis, TNode<T>>>>()
  for (const axis of ['x', 'y'] as const)
    walk(grid[axis], (n) => {
      if (n.kids.length) return
      for (const v of n.items) leaves.set(v.id, { ...leaves.get(v.id), [axis]: n })
    })
  const taken = new Map<string, number>()
  for (const [id, l] of leaves) {
    const c = l as Record<Axis, TNode<T>>
    cell.set(id, c)
    const key = `${c.x.start}|${c.y.start}`
    taken.set(key, (taken.get(key) || 0) + 1)
  }
  let overlaps = 0
  for (const n of taken.values()) if (n > 1) overlaps += n
  return { trees, levels, total, cell, overlaps }
}

// Brackets placed by hand (or by an older run) that belong to `set`: they sit
// in the band left of or above it, and no other set in the same parent is
// closer — so a neighbouring set's brackets survive.
export function strayBrackets<T extends Box>(set: Box, brackets: T[], otherSets: Box[]): T[] {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  const gap = (a: Box, b: Box) =>
    Math.hypot(
      Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)),
      Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)),
    )
  return brackets.filter((b) => {
    const left = b.x + b.width <= set.x + 1 && overlap(b.y, b.y + b.height, set.y, set.y + set.height)
    const above = b.y + b.height <= set.y + 1 && overlap(b.x, b.x + b.width, set.x, set.x + set.width)
    if (!left && !above) return false
    const mine = gap(b, set)
    return otherSets.every((o) => gap(b, o) > mine)
  })
}

// Value order each property should have in Figma's property panel: the order
// its values first appear in the laid-out grid (columns left → right, rows
// top → bottom). Inner properties whose order differs between groups take the
// first group's order.
export function valueOrder<T extends V>(p: Plan<T>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const axis of ['x', 'y'] as const)
    walk(p.trees[axis], (n) => {
      const list = out[n.prop] || (out[n.prop] = [])
      if (list.indexOf(n.value) < 0) list.push(n.value)
    })
  return out
}

// Order in which to put variants back into the set so that every property's
// values first appear in `wanted` order (Figma appends a value when it first
// reappears). Greedy: take the first remaining variant whose new values are
// each the next wanted one. That never blocks a later choice, so it finds a
// perfect order whenever one exists; otherwise it takes the variant with the
// fewest out-of-order values. Ties keep the incoming (layer) order.
export function appendSequence<T extends V>(items: T[], wanted: Record<string, string[]>): T[] {
  const props = Object.keys(wanted)
  const seen: Record<string, Set<string>> = {}
  const next: Record<string, number> = {}
  for (const p of props) {
    seen[p] = new Set()
    next[p] = 0
  }
  const misses = (v: T) =>
    props.reduce((n, p) => {
      const val = variantValue(v, p)
      return seen[p].has(val) || val === wanted[p][next[p]] ? n : n + 1
    }, 0)
  const rest = items.slice()
  const out: T[] = []
  while (rest.length) {
    let best = 0
    let bestMiss = Infinity
    rest.forEach((v, i) => {
      const m = misses(v)
      if (m < bestMiss) {
        best = i
        bestMiss = m
      }
    })
    const v = rest.splice(best, 1)[0]
    out.push(v)
    for (const p of props) {
      seen[p].add(variantValue(v, p))
      while (next[p] < wanted[p].length && seen[p].has(wanted[p][next[p]])) next[p]++
    }
  }
  return out
}

// An existing bracket: which axis it labels, its text, and the variants inside its span.
export interface OldLabel {
  axis: Axis | null
  label: string
  covers: Set<string>
}

const squash = (s: string) => s.replace(/\s+/g, '')

// Takes the old bracket for group `n` out of `pool`: same axis and label
// (whitespace ignored), covering most of the group's variants. When several
// share the label and none covers the group, none is taken — a fresh bracket
// is made instead of guessing. Reusing it keeps what is attached to it
// (annotations on its label layer).
export function takeOld<O extends OldLabel>(pool: O[], n: TNode, axis: Axis): O | null {
  const want = squash(`${n.prop}:${n.value}`)
  const same = pool.filter((o) => o.axis === axis && squash(o.label) === want)
  if (!same.length) return null
  const score = (o: O) => n.items.filter((v) => o.covers.has(v.id)).length
  same.sort((a, z) => score(z) - score(a))
  if (same.length > 1 && score(same[0]) === 0) return null
  pool.splice(pool.indexOf(same[0]), 1)
  return same[0]
}
