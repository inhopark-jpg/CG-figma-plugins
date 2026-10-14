// Organize Comp Variants — tidies a component set's variants into a grid and
// labels every axis with bracket instances ("prop:\nvalue").
//
// Runs once on the selected component set(s) and closes. A panel only opens
// when the bracket component this file uses was deleted or lost a part the
// plugin needs.
//
// Which variant property goes on which axis, and which one is the outer group,
// is read from the set's current arrangement: drag variants roughly into place,
// run the plugin, and it makes the arrangement exact and labels it.

import { Axis, TNode, OVERSHOOT, appendSequence, groupBy, length, plan, strayBrackets, takeOld, valueOrder, walk } from './layout'

// Bracket component set used by this file, kept on the document root so that
// renaming the set or its variants does not lose it.
interface Ref {
  setId: string
  rightId: string
  bottomId: string
  name: string
}

// One bracket direction the plugin instantiates: `right` labels rows (Y axis),
// `bottom` labels columns (X axis).
interface Part {
  comp: ComponentNode
  textKey: string
  showKey: string | null
}

interface Bracket {
  set: ComponentSetNode
  right: Part
  bottom: Part
}

type Missing = 'right' | 'bottom' | 'right-text' | 'bottom-text'
type Problem = { kind: 'deleted'; ref: Ref } | { kind: 'broken'; set: ComponentSetNode; missing: Missing[] }

const ROOT_KEY = 'bracketRef' // figma.root → Ref
const GEN_KEY = 'docFor' // generated bracket instance → id of the set it documents
const LIST_KEY = 'docBrackets' // documented set → ids of its generated brackets
const LANG_KEY = 'lang'
const BRACKET_NAME = 'section-indicator' // name of the bracket set this plugin creates or adopts

// Layout around the set, in px (spacing between cells lives in layout.ts).
const PAD = 20 // component set padding
const OFFSET = 20 // set edge → nearest bracket
const STACK = 8 // between bracket levels

// Bracket stroke color when the plugin builds the component (canvas data).
const PURPLE: RGB = { r: 0.592, g: 0.278, b: 1 }

// ---------------------------------------------------------------------------
// i18n — toasts. The panel has its own dictionary in ui.html. Layer names,
// property names and bracket labels are canvas data and never translated.

type Lang = 'ko' | 'en'
let lang: Lang = 'ko'
const MSG = {
  ko: {
    pickSet: 'Variant가 있는 component set을 선택하세요.',
    done: (sets: number, brackets: number) => `Component set ${sets}개를 정리했습니다 · 브래킷 ${brackets}개`,
    created: ' · 현재 페이지에 브래킷 component를 새로 만들었습니다',
    kept: (n: number) => ` · 기존 브래킷 ${n}개를 그대로 썼습니다 (어노테이션 유지)`,
    lost: (n: number) => ` · 어노테이션이 있던 브래킷 ${n}개는 맞는 그룹이 없어 지웠습니다`,
    reordered: (n: number) => ` · 속성 ${n}개의 값 순서를 캔버스에 맞췄습니다`,
    unordered: (list: string) => ` · 값 순서를 맞추지 못함: ${list}`,
    slotSkipped: (n: number) => ` · slot 속성이 있는 set ${n}개는 속성 값 순서를 그대로 두었습니다`,
    fontSkipped: (n: number) => ` · 폰트를 불러오지 못한 set ${n}개는 속성 값 순서를 그대로 두었습니다`,
    skipped: (n: number) => ` · 정리할 variant 속성이 없는 set ${n}개는 건너뜀`,
    overlaps: (n: number) => ` · 같은 속성 조합의 variant ${n}개가 겹칩니다`,
    nothing: '정리할 variant 속성이 없습니다. 값이 두 개 이상인 variant 속성이 필요합니다.',
    failed: (e: string) => `정리하지 못했습니다: ${e}`,
  },
  en: {
    pickSet: 'Select a component set with variants.',
    done: (sets: number, brackets: number) =>
      `Documented ${sets} component set${sets === 1 ? '' : 's'} · ${brackets} bracket${brackets === 1 ? '' : 's'}`,
    created: ' · created a bracket component on this page',
    kept: (n: number) => ` · reused ${n} existing bracket${n === 1 ? '' : 's'} (annotations kept)`,
    lost: (n: number) => ` · removed ${n} annotated bracket${n === 1 ? '' : 's'} with no matching group`,
    reordered: (n: number) => ` · matched value order of ${n} propert${n === 1 ? 'y' : 'ies'} to the canvas`,
    unordered: (list: string) => ` · could not match value order: ${list}`,
    slotSkipped: (n: number) => ` · kept the value order of ${n} set${n === 1 ? '' : 's'} with slot properties`,
    fontSkipped: (n: number) => ` · kept the value order of ${n} set${n === 1 ? '' : 's'} whose fonts could not be loaded`,
    skipped: (n: number) => ` · skipped ${n} set${n === 1 ? '' : 's'} with nothing to lay out`,
    overlaps: (n: number) => ` · ${n} variant${n === 1 ? '' : 's'} share a property combination and overlap`,
    nothing: 'Nothing to lay out. A variant property needs at least two values.',
    failed: (e: string) => `Could not document: ${e}`,
  },
}
type Msg = typeof MSG.ko
function M<K extends keyof Msg>(key: K, ...args: Msg[K] extends (...a: infer A) => string ? A : []): string {
  const v = MSG[lang][key] as unknown
  return typeof v === 'function' ? (v as (...a: unknown[]) => string)(...args) : (v as string)
}

// ---------------------------------------------------------------------------
// Bracket component: find it, check it, or build it.

function findPart(set: ComponentSetNode, id: string, dir: string): ComponentNode | null {
  const comps = set.children.filter((c): c is ComponentNode => c.type === 'COMPONENT')
  return (
    comps.find((c) => c.id === id) ||
    comps.find((c) => Object.values(c.variantProperties || {}).indexOf(dir) >= 0) ||
    null
  )
}

// The TEXT layer whose characters are driven by a component property.
function labelLayer(node: ComponentNode | InstanceNode, key?: string): TextNode | null {
  return node.findOne((n) => {
    if (n.type !== 'TEXT') return false
    const ref = n.componentPropertyReferences
    return !!ref && !!ref.characters && (!key || ref.characters === key)
  }) as TextNode | null
}

async function loadFonts(text: TextNode) {
  const fonts =
    text.characters.length > 0
      ? text.getRangeAllFontNames(0, text.characters.length)
      : text.fontName === figma.mixed
        ? []
        : [text.fontName]
  await Promise.all(fonts.map((f) => figma.loadFontAsync(f)))
}

// Checks that the set still has what the plugin uses and remembers it on the
// document. Names, colors and layout inside the set may change freely.
async function inspect(set: ComponentSetNode, ref: Ref | null): Promise<Bracket | Problem> {
  const missing: Missing[] = []
  const parts: Partial<Record<'right' | 'bottom', Part>> = {}
  for (const dir of ['right', 'bottom'] as const) {
    const comp = findPart(set, ref ? (dir === 'right' ? ref.rightId : ref.bottomId) : '', dir)
    if (!comp) {
      missing.push(dir)
      continue
    }
    const text = labelLayer(comp)
    if (!text) {
      missing.push(dir === 'right' ? 'right-text' : 'bottom-text')
      continue
    }
    const refs = text.componentPropertyReferences || {}
    parts[dir] = { comp, textKey: refs.characters as string, showKey: refs.visible || null }
  }
  if (missing.length || !parts.right || !parts.bottom) return { kind: 'broken', set, missing }

  const next: Ref = { setId: set.id, rightId: parts.right.comp.id, bottomId: parts.bottom.comp.id, name: set.name }
  figma.root.setPluginData(ROOT_KEY, JSON.stringify(next))
  for (const p of [parts.right, parts.bottom]) await loadFonts(labelLayer(p.comp, p.textKey) as TextNode)
  return { set, right: parts.right, bottom: parts.bottom }
}

function storedRef(): Ref | null {
  const raw = figma.root.getPluginData(ROOT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Ref
  } catch (e) {
    return null
  }
}

// Stored set → that set (or a Problem). Otherwise adopt a set by name — the
// stored one's (a restored component may come back with a new id) or
// `section-indicator` — and only then report it deleted or build a new one.
async function resolveBracket(): Promise<{ bracket: Bracket; created: boolean } | Problem> {
  const ref = storedRef()
  if (ref) {
    const node = await figma.getNodeByIdAsync(ref.setId)
    if (node && !node.removed && node.type === 'COMPONENT_SET') {
      const r = await inspect(node, ref)
      return 'kind' in r ? r : { bracket: r, created: false }
    }
  }
  await figma.loadAllPagesAsync()
  const names = ref ? [ref.name, BRACKET_NAME] : [BRACKET_NAME]
  for (const s of figma.root.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
    if (names.indexOf(s.name) < 0) continue
    const r = await inspect(s, null)
    if (!('kind' in r)) return { bracket: r, created: false }
  }
  if (ref) return { kind: 'deleted', ref }
  return { bracket: await buildBracket(), created: true }
}

async function buildBracket(): Promise<Bracket> {
  const set = await createBracketSet()
  const r = await inspect(set, null)
  if ('kind' in r) throw new Error('bracket component build failed')
  return r
}

// Same structure as the bracket the plugin was designed around: four
// directions, a `text` property and a `show-text` Boolean. The open side of
// the bracket faces the direction's name.
async function createBracketSet(): Promise<ComponentSetNode> {
  const font: FontName = { family: 'Inter', style: 'Regular' }
  await figma.loadFontAsync(font)
  const dirs = ['left', 'right', 'bottom', 'top'] as const
  const comps = dirs.map((dir) => {
    const horiz = dir === 'left' || dir === 'right'
    const comp = figma.createComponent()
    comp.name = `bracket-direction=${dir}`
    comp.fills = []
    comp.layoutMode = horiz ? 'HORIZONTAL' : 'VERTICAL'
    comp.itemSpacing = horiz ? 12 : 8
    comp.counterAxisAlignItems = 'CENTER'
    comp.primaryAxisAlignItems = dir === 'bottom' ? 'MAX' : 'MIN'

    const rect = figma.createRectangle()
    rect.name = 'bracket'
    rect.fills = []
    rect.strokes = [{ type: 'SOLID', color: PURPLE }]
    rect.strokeAlign = 'INSIDE'
    rect.strokeTopWeight = dir === 'top' ? 0 : 1
    rect.strokeRightWeight = dir === 'right' ? 0 : 1
    rect.strokeBottomWeight = dir === 'bottom' ? 0 : 1
    rect.strokeLeftWeight = dir === 'left' ? 0 : 1
    rect.resize(horiz ? 14 : 66, horiz ? 114 : 14)

    const text = figma.createText()
    text.name = 'text'
    text.fontName = font
    text.fontSize = 16
    text.lineHeight = { unit: 'PERCENT', value: 100 }
    text.characters = 'text'
    text.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]
    text.textAlignHorizontal = dir === 'left' ? 'LEFT' : dir === 'right' ? 'RIGHT' : 'CENTER'

    const textFirst = dir === 'right' || dir === 'bottom'
    comp.appendChild(textFirst ? text : rect)
    comp.appendChild(textFirst ? rect : text)
    comp.resize(horiz ? 56 : 66, horiz ? 114 : 38)
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'FIXED'
    if (horiz) rect.layoutSizingVertical = 'FILL'
    else rect.layoutSizingHorizontal = 'FILL'
    return comp
  })

  const page = figma.currentPage
  const others = page.children.slice()
  const set = figma.combineAsVariants(comps, page)
  set.name = BRACKET_NAME
  const textKey = set.addComponentProperty('text', 'TEXT', 'text')
  const showKey = set.addComponentProperty('show-text', 'BOOLEAN', true)
  for (const comp of comps) {
    const text = comp.findOne((n) => n.type === 'TEXT') as TextNode
    text.componentPropertyReferences = { characters: textKey, visible: showKey }
  }

  set.layoutMode = 'NONE'
  let y = PAD
  for (const comp of comps) {
    comp.x = PAD
    comp.y = y
    y += comp.height + 30
  }
  set.resizeWithoutConstraints(PAD * 2 + Math.max(...comps.map((c) => c.width)), y - 30 + PAD)
  set.strokes = [{ type: 'SOLID', color: PURPLE }]
  set.strokeWeight = 1
  set.dashPattern = [10, 5]
  set.cornerRadius = 5

  // Park it to the right of everything else on the page.
  if (others.length) {
    set.x = Math.max(...others.map((n) => n.x + n.width)) + 200
    set.y = Math.min(...others.map((n) => n.y))
  }
  return set
}

// ---------------------------------------------------------------------------
// Documenting one set.

// A bracket already documenting the set, read before anything moves so its
// span still tells which variants it labels.
interface OldBracket {
  inst: InstanceNode
  axis: Axis | null // null: a direction this plugin does not place (e.g. hand-made `left`)
  label: string
  covers: Set<string> // ids of the variants inside its span
}

// The set's brackets: the ones this plugin made for it, plus hand-made ones (or
// ones from before the plugin was used) beside it in the same parent. They are
// reused for the matching new groups so that whatever is attached to them —
// annotations on the label layer, above all — survives a re-run.
async function oldBrackets(set: ComponentSetNode, b: Bracket, variants: ComponentNode[]): Promise<OldBracket[]> {
  const found: InstanceNode[] = []
  let ids: string[] = []
  try {
    ids = JSON.parse(set.getPluginData(LIST_KEY) || '[]')
  } catch (e) {
    ids = []
  }
  // Both checks: a duplicated set carries the list, a duplicated bracket carries
  // the tag — neither may take the other copy's brackets.
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id)
    if (node && node.type === 'INSTANCE' && !node.removed && node.getPluginData(GEN_KEY) === set.id) found.push(node)
  }
  set.setPluginData(LIST_KEY, '')

  const parent = set.parent
  if (parent && 'children' in parent) {
    const loose: InstanceNode[] = []
    const others: ComponentSetNode[] = []
    for (const c of parent.children) {
      if (c.type === 'COMPONENT_SET' && c !== set) others.push(c)
      if (c.type !== 'INSTANCE' || c.getPluginData(GEN_KEY)) continue
      const mc = await c.getMainComponentAsync()
      if (mc && mc.parent && mc.parent.id === b.set.id) loose.push(c)
    }
    for (const n of strayBrackets(set, loose, others)) found.push(n)
  }

  const out: OldBracket[] = []
  for (const inst of found) {
    const mc = await inst.getMainComponentAsync()
    const axis: Axis | null = mc && mc.id === b.bottom.comp.id ? 'x' : mc && mc.id === b.right.comp.id ? 'y' : null
    const part = axis === 'x' ? b.bottom : b.right
    const prop = inst.componentProperties[part.textKey]
    const text = labelLayer(inst)
    const label = prop && typeof prop.value === 'string' ? prop.value : text ? text.characters : ''
    const box = inst.absoluteBoundingBox
    const covers = new Set<string>()
    if (box && axis) {
      for (const v of variants) {
        const vb = v.absoluteBoundingBox
        if (!vb) continue
        const c = axis === 'x' ? vb.x + vb.width / 2 : vb.y + vb.height / 2
        const lo = axis === 'x' ? box.x : box.y
        const hi = lo + (axis === 'x' ? box.width : box.height)
        if (c >= lo && c <= hi) covers.add(v.id)
      }
    }
    out.push({ inst, axis, label, covers })
  }
  return out
}

function annotated(node: SceneNode): boolean {
  if ('annotations' in node && node.annotations.length > 0) return true
  return 'children' in node && node.children.some(annotated)
}

// Makes each property's value order in the property panel match `wanted`.
// The Plugin API cannot set it, and neither layer order nor renaming changes it,
// but a value disappears when its last variant leaves the set and is appended
// again when one comes back. So every variant but the first of
// `appendSequence()` steps out to the page and comes back in that sequence.
// If no single sequence satisfies every property, the leftovers get a few
// per-value passes. Node ids, instances, overrides and — once the layer order
// is restored — the default variant are unaffected. Returns the properties
// that changed and those still wrong.
function syncValueOrder(set: ComponentSetNode, wanted: Record<string, string[]>): { fixed: string[]; failed: string[] } {
  const current = (prop: string) => {
    const def = set.componentPropertyDefinitions[prop]
    return (def && def.variantOptions) || []
  }
  const wrong = () => Object.keys(wanted).filter((p) => current(p).join('\u0000') !== wanted[p].join('\u0000'))
  const before = wrong()
  if (!before.length) return { fixed: [], failed: [] }

  const layers = set.children.slice()
  const page = figma.currentPage
  // Never empty the set: Figma deletes an empty set, and recombining would make a
  // new one (new id and key). Keeping one variant inside keeps the same set.
  const cycle = (vs: SceneNode[]) => {
    if (!vs.length || vs.length >= set.children.length) return
    for (const v of vs) page.appendChild(v)
    for (const v of vs) set.appendChild(v)
  }
  const variants = layers.filter((c): c is ComponentNode => c.type === 'COMPONENT')
  cycle(appendSequence(variants, wanted).slice(1))
  for (let pass = 0; pass < 3; pass++) {
    const todo = wrong()
    if (!todo.length) break
    for (const prop of todo)
      for (const value of wanted[prop])
        cycle(set.children.filter((c) => c.type === 'COMPONENT' && (c.variantProperties || {})[prop] === value))
  }
  layers.forEach((n, i) => set.insertChild(i, n))
  const failed = wrong()
  return { fixed: before.filter((p) => failed.indexOf(p) < 0), failed }
}

// syncValueOrder() moves variants out of the set and back. Two things break that:
// - Slot properties: outside the set a variant gets its own slot properties, and
//   when it comes back Figma does not merge them — the set gains duplicate
//   properties and ends up in an error state ("Component set has existing
//   errors"). Seen on Rider-App `.skeleton/marker-general`. Such sets keep
//   their value order.
// - Fonts: moving a node with text needs its fonts loaded ("unloaded font"
//   error from appendChild). A font that cannot be loaded skips the step too.
async function safeValueOrder(
  set: ComponentSetNode,
  wanted: Record<string, string[]>,
): Promise<{ fixed: string[]; failed: string[]; skipped: 'slot' | 'font' | null }> {
  const defs = set.componentPropertyDefinitions
  if (Object.keys(defs).some((k) => defs[k].type === 'SLOT')) return { fixed: [], failed: [], skipped: 'slot' }
  const fonts = new Map<string, FontName>()
  for (const t of set.findAllWithCriteria({ types: ['TEXT'] })) {
    const list = t.characters.length > 0 ? t.getRangeAllFontNames(0, t.characters.length) : t.fontName === figma.mixed ? [] : [t.fontName]
    for (const f of list) fonts.set(`${f.family}\u0000${f.style}`, f)
  }
  try {
    await Promise.all(Array.from(fonts.values()).map((f) => figma.loadFontAsync(f)))
  } catch (e) {
    return { fixed: [], failed: [], skipped: 'font' }
  }
  return { ...syncValueOrder(set, wanted), skipped: null }
}

// Instance labeled for group `n`: the matching old bracket if there is one,
// otherwise a new instance placed right above the set in the layer list.
function makeBracket(
  part: Part,
  n: TNode<ComponentNode>,
  axis: Axis,
  set: ComponentSetNode,
  old: OldBracket | null,
): { inst: InstanceNode; label: number } {
  let inst: InstanceNode
  if (old) {
    inst = old.inst
  } else {
    inst = part.comp.createInstance()
    const parent = set.parent as BaseNode & ChildrenMixin
    parent.insertChild(parent.children.indexOf(set) + 1, inst)
    if ('layoutMode' in parent && parent.layoutMode !== 'NONE') inst.layoutPositioning = 'ABSOLUTE'
  }
  const props: Record<string, string | boolean> = { [part.textKey]: `${n.prop}:\n${n.value}` }
  if (part.showKey) props[part.showKey] = true
  inst.setProperties(props)
  inst.setPluginData(GEN_KEY, set.id)
  const text = labelLayer(inst, part.textKey)
  return { inst, label: text ? length(text, axis) : 0 }
}

// X brackets keep a fixed width and hug their height; Y brackets the reverse.
function stretch(inst: InstanceNode, axis: Axis, len: number) {
  inst.resize(axis === 'x' ? len : inst.width, axis === 'y' ? len : inst.height)
  if (inst.layoutMode === 'NONE') return
  const hugWidth = axis === 'y'
  if (hugWidth === (inst.layoutMode === 'HORIZONTAL')) inst.primaryAxisSizingMode = 'AUTO'
  else inst.counterAxisSizingMode = 'AUTO'
}

// Brackets that would poke out of a section make it grow (never shrink).
function growSection(section: SectionNode, nodes: SceneNode[]) {
  const margin = 40
  const minX = Math.min(...nodes.map((n) => n.x))
  const minY = Math.min(...nodes.map((n) => n.y))
  const maxX = Math.max(...nodes.map((n) => n.x + n.width))
  const maxY = Math.max(...nodes.map((n) => n.y + n.height))
  const left = Math.max(0, margin - minX)
  const top = Math.max(0, margin - minY)
  const right = Math.max(0, maxX + margin - section.width)
  const bottom = Math.max(0, maxY + margin - section.height)
  if (!left && !top && !right && !bottom) return
  if (left || top) {
    section.x -= left
    section.y -= top
    for (const c of section.children) {
      c.x += left
      c.y += top
    }
  }
  section.resizeWithoutConstraints(section.width + left + right, section.height + top + bottom)
}

async function documentSet(
  set: ComponentSetNode,
  b: Bracket,
): Promise<{
  brackets: number
  kept: number
  lost: number
  overlaps: number
  reordered: string[]
  unordered: string[]
  skipped: 'slot' | 'font' | null
} | null> {
  const variants = set.children.filter((c): c is ComponentNode => c.type === 'COMPONENT')
  const defs = set.componentPropertyDefinitions
  const props = Object.keys(defs).filter((k) => defs[k].type === 'VARIANT' && groupBy(variants, k).size > 1)
  if (!variants.length || !props.length) return null

  const pool = await oldBrackets(set, b, variants)
  let kept = 0
  const insts = new Map<TNode<ComponentNode>, InstanceNode>()
  const p = plan(variants, props, (n, axis) => {
    const old = takeOld(pool, n, axis)
    if (old) kept++
    const { inst, label } = makeBracket(axis === 'x' ? b.bottom : b.right, n, axis, set, old)
    insts.set(n, inst)
    return label
  })
  // Old brackets left without a group are removed; count the annotated ones.
  let lost = 0
  for (const o of pool) {
    if (annotated(o.inst)) lost++
    o.inst.remove()
  }

  if (set.layoutMode !== 'NONE') set.layoutMode = 'NONE'
  const order = await safeValueOrder(set, valueOrder(p))

  // Cells: each variant is centered in its column × row.
  for (const v of variants) {
    const c = p.cell.get(v.id) as Record<Axis, TNode<ComponentNode>>
    v.x = Math.round(PAD + c.x.start + (c.x.size - v.width) / 2)
    v.y = Math.round(PAD + c.y.start + (c.y.size - v.height) / 2)
  }
  set.resizeWithoutConstraints(Math.round(PAD * 2 + p.total.x), Math.round(PAD * 2 + p.total.y))

  // Brackets, innermost level first, stacking outward from the set's top/left edge.
  for (const axis of ['x', 'y'] as const) {
    let edge = (axis === 'x' ? set.y : set.x) - OFFSET
    for (let d = p.levels[axis] - 1; d >= 0; d--) {
      let next = edge
      walk(p.trees[axis], (n) => {
        const inst = insts.get(n)
        if (n.depth !== d || !inst) return
        stretch(inst, axis, Math.round(n.size + OVERSHOOT * 2))
        const along = Math.round((axis === 'x' ? set.x : set.y) + PAD + n.start - OVERSHOOT)
        if (axis === 'x') {
          inst.x = along
          inst.y = Math.round(edge - inst.height)
          next = Math.min(next, inst.y)
        } else {
          inst.x = Math.round(edge - inst.width)
          inst.y = along
          next = Math.min(next, inst.x)
        }
      })
      edge = next - STACK
    }
  }

  const made = Array.from(insts.values())
  set.setPluginData(LIST_KEY, JSON.stringify(made.map((n) => n.id)))
  set.setRelaunchData({ document: '' })
  if (set.parent && set.parent.type === 'SECTION') growSection(set.parent, [set, ...made])
  return {
    brackets: made.length,
    kept,
    lost,
    overlaps: p.overlaps,
    reordered: order.fixed,
    unordered: order.failed,
    skipped: order.skipped,
  }
}

// ---------------------------------------------------------------------------
// Run

function pickSets(selection: readonly SceneNode[]): ComponentSetNode[] {
  const out: ComponentSetNode[] = []
  for (const node of selection) {
    let n: BaseNode | null = node
    while (n && n.type !== 'COMPONENT_SET') n = n.parent
    if (n && out.indexOf(n) < 0) out.push(n)
  }
  return out
}

let setIds: string[] = []
let problem: Problem | null = null
let uiOpen = false

async function run(extra: Record<string, unknown> = {}) {
  const res = await resolveBracket()
  if ('kind' in res) return showProblem(res, extra)

  let docs = 0
  let skipped = 0
  let brackets = 0
  let overlaps = 0
  let kept = 0
  let lost = 0
  let reordered = 0
  const unordered: string[] = []
  let slotSkipped = 0
  let fontSkipped = 0
  for (const id of setIds) {
    const set = await figma.getNodeByIdAsync(id)
    if (!set || set.type !== 'COMPONENT_SET') continue
    const r = await documentSet(set, res.bracket)
    if (!r) {
      skipped++
      continue
    }
    docs++
    brackets += r.brackets
    overlaps += r.overlaps
    kept += r.kept
    lost += r.lost
    reordered += r.reordered.length
    for (const prop of r.unordered) unordered.push(`${set.name} › ${prop}`)
    if (r.skipped === 'slot') slotSkipped++
    if (r.skipped === 'font') fontSkipped++
  }
  if (!docs) return figma.closePlugin(M('nothing'))
  let msg = M('done', docs, brackets)
  if (res.created) msg += M('created')
  if (kept) msg += M('kept', kept)
  if (lost) msg += M('lost', lost)
  if (reordered) msg += M('reordered', reordered)
  if (unordered.length) msg += M('unordered', unordered.join(', '))
  if (slotSkipped) msg += M('slotSkipped', slotSkipped)
  if (fontSkipped) msg += M('fontSkipped', fontSkipped)
  if (skipped) msg += M('skipped', skipped)
  if (overlaps) msg += M('overlaps', overlaps)
  figma.closePlugin(msg)
}

// ---------------------------------------------------------------------------
// Problem panel — only shown when the bracket component is gone or broken.

function postState(extra: Record<string, unknown> = {}) {
  if (!problem) return
  figma.ui.postMessage({
    type: 'state',
    kind: problem.kind,
    missing: problem.kind === 'broken' ? problem.missing : [],
    lang,
    ...extra,
  })
}

function showProblem(p: Problem, extra: Record<string, unknown> = {}) {
  problem = p
  if (!uiOpen) {
    uiOpen = true
    figma.showUI(__html__, { width: 360, height: 320, themeColors: true })
    figma.ui.onmessage = (msg) => onMessage(msg).catch(fail)
  }
  postState(extra)
}

// A bracket instance whose main component was deleted — selecting it shows
// Figma's "Restore component" in the right panel.
async function findOrphan(ref: Ref): Promise<InstanceNode | null> {
  const page = figma.currentPage
  const candidates = page
    .findAllWithCriteria({ types: ['INSTANCE'] })
    .filter((i) => i.getPluginData(GEN_KEY) || i.name === ref.name)
  for (const inst of candidates) {
    const mc = await inst.getMainComponentAsync()
    const owner = mc && mc.parent
    if (!mc || mc.removed || !owner || owner.removed || owner.id === ref.setId) return inst
  }
  return null
}

async function reveal(node: SceneNode) {
  let page: BaseNode | null = node
  while (page && page.type !== 'PAGE') page = page.parent
  if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page as PageNode)
  figma.currentPage.selection = [node]
  figma.viewport.scrollAndZoomIntoView([node])
}

async function onMessage(msg: { type: string; lang?: Lang; height?: number }) {
  switch (msg.type) {
    case 'lang':
      if (msg.lang === 'ko' || msg.lang === 'en') {
        lang = msg.lang
        await figma.clientStorage.setAsync(LANG_KEY, lang)
      }
      break
    case 'resize':
      if (msg.height) figma.ui.resize(360, Math.min(600, Math.max(120, msg.height)))
      break
    case 'close':
      figma.closePlugin()
      break
    case 'locate': {
      if (!problem) break
      if (problem.kind === 'broken') {
        await reveal(problem.set)
        postState({ located: 'set' })
      } else {
        const inst = await findOrphan(problem.ref)
        if (inst) await reveal(inst)
        postState({ located: inst ? 'instance' : 'none' })
      }
      break
    }
    case 'retry':
      // Still unresolved → the panel shows it was tried.
      await run({ retried: true })
      break
    case 'create':
      await buildBracket()
      await run()
      break
  }
}

function fail(e: unknown) {
  const text = e instanceof Error ? e.message : String(e)
  console.error('[organize-comp-variants]', e)
  figma.closePlugin(M('failed', text))
}

async function main() {
  const saved = await figma.clientStorage.getAsync(LANG_KEY)
  if (saved === 'ko' || saved === 'en') lang = saved
  const sets = pickSets(figma.currentPage.selection)
  if (!sets.length) return figma.closePlugin(M('pickSet'))
  setIds = sets.map((s) => s.id)
  await run()
}

main().catch(fail)
