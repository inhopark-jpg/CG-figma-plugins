// Arrow Connect — point-indicator style connector arrows for Figma Design files.
//
// Each arrow is a group of plain layers (dot, dotted line, chevron, label)
// whose connection is stored as plugin data on the group; target layers are
// never modified. While the plugin panel is open, arrows are redrawn whenever a
// connected layer (or any of its ancestors) changes. "Refresh all" fixes arrows
// that went stale while the plugin was closed.

type Side = 'auto' | 'left' | 'right' | 'top' | 'bottom'
type FixedSide = Exclude<Side, 'auto'>

interface Style {
  fromSide: Side
  toSide: Side
  color: string
  label: boolean
}

interface Conn extends Style {
  fromId: string
  toId: string
  // Id of the group this was written on. A different id means the arrow was
  // duplicated (plugin data travels with copies) and still points at the
  // original's layers — see adoptCopy().
  selfId?: string
  // Where the arrow and its layers were at the last draw, so a copy can find
  // the matching copies of its layers.
  snap?: Snap
}

interface Snap {
  group: Point
  from: Seen
  to: Seen
}

interface Seen extends Rect {
  name: string
  type: NodeType
}

interface Point {
  x: number
  y: number
}

const KEY = 'conn'
const DEFAULTS_KEY = 'defaults'
const LANG_KEY = 'lang'

// ---------------------------------------------------------------------------
// i18n — figma.notify / closePlugin / relaunch strings. The panel has its own
// dictionary in ui.html. Layer names (point-indicator, line, …) are never
// translated: findParts() looks them up by name.

type Lang = 'ko' | 'en'
let lang: Lang = 'ko'
const MSG = {
  ko: {
    pickTwo: '연결할 layer를 정확히 두 개 선택하세요.',
    detached: (n: number) => `화살표 ${n}개를 분리했습니다. 이제 일반 layer입니다.`,
    pickArrows: '분리할 화살표를 선택하세요.',
    redrew: (ok: number, lost: number) => `화살표 ${ok}개를 다시 그렸습니다${lost ? ` (${lost}개는 대상을 잃음)` : ''}.`,
    lost: (n: number) => `화살표 ${n}개가 대상을 잃었습니다 (흐리게 표시됨).`,
    relaunchOpen: '화살표 편집',
    relaunchRefresh: '이 페이지의 모든 화살표 다시 그리기',
  },
  en: {
    pickTwo: 'Select exactly two layers to connect.',
    detached: (n: number) => `Detached ${n} arrow${n === 1 ? '' : 's'}. They are now plain layers.`,
    pickArrows: 'Select arrows to detach.',
    redrew: (ok: number, lost: number) => `Redrew ${ok} arrow${ok === 1 ? '' : 's'}${lost ? `, ${lost} lost their target` : ''}.`,
    lost: (n: number) => `${n} arrow${n === 1 ? '' : 's'} lost their target (shown faded).`,
    relaunchOpen: 'Edit arrow',
    relaunchRefresh: 'Redraw all arrows on this page',
  },
}
const M = () => MSG[lang]
const DEFAULT_STYLE: Style = { fromSide: 'auto', toSide: 'auto', color: '#8A38F5', label: false }

// point-indicator spec
const DOT = 6
const LINE_WEIGHT = 1
const HALO_WEIGHT = 2
const DASH = [1, 1]
const HEAD_DEPTH = 6
const HEAD_HALF = 6.5
const HEAD_WEIGHT = 1.5
const LABEL_FONT: FontName = { family: 'Inter', style: 'Regular' }
const LABEL_SIZE = 16
const LABEL_GAP_H = 12
const LABEL_GAP_V = 8
// Space between the target layer and the arrowhead (or the label, if shown)
const TARGET_MARGIN_H = 12
const TARGET_MARGIN_V = 8
const CORNER = 8
const STUB = 24

const WHITE: SolidPaint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } }
const BLACK: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }

let defaults: Style = { ...DEFAULT_STYLE }

function paint(hex: string): SolidPaint {
  const n = parseInt(hex.replace('#', ''), 16)
  return { type: 'SOLID', color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } }
}

// ---------------------------------------------------------------------------
// Index: arrowId -> Conn, targetId -> arrowIds (current page only)

const arrows = new Map<string, Conn>()
const byTarget = new Map<string, Set<string>>()
const arrowNodes = new Map<string, GroupNode>()

function readConn(node: BaseNode): Conn | null {
  const raw = node.getPluginData(KEY)
  if (!raw) return null
  try {
    return { ...DEFAULT_STYLE, ...JSON.parse(raw) } as Conn
  } catch {
    return null
  }
}

function writeConn(node: BaseNode, conn: Conn) {
  node.setPluginData(KEY, JSON.stringify(conn))
}

function indexArrow(node: GroupNode, conn: Conn) {
  const id = node.id
  unindexArrow(id)
  arrows.set(id, conn)
  arrowNodes.set(id, node)
  for (const t of [conn.fromId, conn.toId]) {
    if (!byTarget.has(t)) byTarget.set(t, new Set())
    byTarget.get(t)!.add(id)
  }
}

function unindexArrow(id: string) {
  const conn = arrows.get(id)
  if (!conn) return
  arrows.delete(id)
  arrowNodes.delete(id)
  for (const t of [conn.fromId, conn.toId]) {
    const set = byTarget.get(t)
    if (!set) continue
    set.delete(id)
    if (set.size === 0) byTarget.delete(t)
  }
}

function buildIndex() {
  arrows.clear()
  byTarget.clear()
  const nodes = figma.currentPage.findAllWithCriteria({ types: ['GROUP'], pluginData: { keys: [KEY] } })
  for (const node of nodes) {
    const conn = readConn(node)
    if (conn) indexArrow(node, conn)
  }
}

// ---------------------------------------------------------------------------
// Geometry

type Dir = 'right' | 'left' | 'up' | 'down'
const V: Record<Dir, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }
const OUTWARD: Record<FixedSide, Dir> = { left: 'left', right: 'right', top: 'up', bottom: 'down' }
const INWARD: Record<FixedSide, Dir> = { left: 'right', right: 'left', top: 'down', bottom: 'up' }

const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const unit = (a: Point, b: Point): Point => {
  const d = dist(a, b) || 1
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }
}

function pageOf(node: BaseNode): PageNode | null {
  let n: BaseNode | null = node
  while (n && n.type !== 'PAGE') n = n.parent
  return n as PageNode | null
}

function boundsOf(node: SceneNode): Rect | null {
  return 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null
}

function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

// Picks the side of `a` that faces `b`.
function autoSide(a: Rect, b: Rect): FixedSide {
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const nx = dx / Math.max(a.width + b.width, 1)
  const ny = dy / Math.max(a.height + b.height, 1)
  if (Math.abs(nx) >= Math.abs(ny)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function anchor(r: Rect, side: FixedSide): Point {
  switch (side) {
    case 'left':
      return { x: r.x, y: r.y + r.height / 2 }
    case 'right':
      return { x: r.x + r.width, y: r.y + r.height / 2 }
    case 'top':
      return { x: r.x + r.width / 2, y: r.y }
    case 'bottom':
      return { x: r.x + r.width / 2, y: r.y + r.height }
  }
}

// Removes duplicate and collinear points.
function clean(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && dist(last, p) < 0.5) continue
    out.push(p)
  }
  for (let i = out.length - 2; i > 0; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]]
    if ((Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5)) {
      out.splice(i, 1)
    }
  }
  return out
}

// Axis-aligned, leaves along `startDir`, arrives along `endDir`, never doubles back.
function validRoute(pts: Point[], startDir: Dir, endDir: Dir): boolean {
  if (pts.length < 2) return false
  const dirs: Point[] = []
  for (let i = 1; i < pts.length; i++) {
    const u = unit(pts[i - 1], pts[i])
    if (Math.abs(u.x) > 0.01 && Math.abs(u.y) > 0.01) return false
    dirs.push({ x: Math.round(u.x), y: Math.round(u.y) })
  }
  const s = V[startDir]
  const e = V[endDir]
  const last = dirs[dirs.length - 1]
  if (dirs[0].x !== s.x || dirs[0].y !== s.y || last.x !== e.x || last.y !== e.y) return false
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i].x === -dirs[i - 1].x && dirs[i].y === -dirs[i - 1].y) return false
  }
  return true
}

function routeLength(pts: Point[]) {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i])
  return l
}

function elbowRoute(S: Point, E: Point, startDir: Dir, endDir: Dir): Point[] {
  const p1 = add(S, V[startDir], STUB)
  const p2 = add(E, V[endDir], -STUB)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const middles: Point[][] = [
    [],
    [{ x: p2.x, y: p1.y }],
    [{ x: p1.x, y: p2.y }],
    [{ x: mx, y: p1.y }, { x: mx, y: p2.y }],
    [{ x: p1.x, y: my }, { x: p2.x, y: my }],
  ]
  let best: Point[] | null = null
  let bestScore = Infinity
  for (const mid of middles) {
    for (const pts of [clean([S, ...mid, E]), clean([S, p1, ...mid, p2, E])]) {
      if (!validRoute(pts, startDir, endDir)) continue
      const score = (pts.length - 2) * 1e6 + routeLength(pts)
      if (score < bestScore) {
        bestScore = score
        best = pts
      }
    }
  }
  return best ?? [S, E]
}

// Offset of a node's parent in absolute coordinates (0,0 for a page).
// Group children are positioned in the group's parent space, so skip groups.
function parentOffset(node: SceneNode): Point {
  let parent = node.parent
  while (parent && parent.type === 'GROUP') parent = parent.parent
  if (parent && parent.type !== 'PAGE' && 'absoluteTransform' in parent) {
    const t = (parent as SceneNode & { absoluteTransform: Transform }).absoluteTransform
    return { x: t[0][2], y: t[1][2] }
  }
  return { x: 0, y: 0 }
}

async function setPath(vector: VectorNode, pts: Point[]) {
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const vertices: VectorVertex[] = pts.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  const segments: VectorSegment[] = []
  for (let i = 0; i < pts.length - 1; i++) segments.push({ start: i, end: i + 1 })
  if (vector.rotation !== 0) vector.rotation = 0
  await vector.setVectorNetworkAsync({ vertices, segments })
  const off = parentOffset(vector)
  vector.x = minX - off.x
  vector.y = minY - off.y
}

function setPos(node: SceneNode, abs: Point) {
  const off = parentOffset(node)
  node.x = abs.x - off.x
  node.y = abs.y - off.y
}

// ---------------------------------------------------------------------------
// Arrow layers
//
// point-indicator (group)
//   dot-halo   ellipse, white 0.5 outline
//   line       group
//     line-halo   white 2px
//     line-dotted 1px, dash 1/1
//     arrowhead   chevron 6×13, 1.5px
//   text       Inter Regular 16
//   dot        ellipse

type Parts = {
  dotHalo: EllipseNode
  lineGroup: GroupNode
  halo: VectorNode
  dotted: VectorNode
  head: VectorNode
  text: TextNode
  dot: EllipseNode
}

function makeDot(name: string, halo: boolean): EllipseNode {
  const e = figma.createEllipse()
  e.name = name
  e.resize(DOT, DOT)
  if (halo) {
    e.strokes = [WHITE]
    e.strokeWeight = 0.5
    e.strokeAlign = 'OUTSIDE'
  }
  return e
}

function makeVector(name: string, weight: number): VectorNode {
  const v = figma.createVector()
  v.name = name
  v.fills = []
  v.strokeWeight = weight
  v.strokeCap = 'NONE'
  v.strokeJoin = 'MITER'
  return v
}

async function makeText(): Promise<TextNode> {
  await figma.loadFontAsync(LABEL_FONT)
  const t = figma.createText()
  t.name = 'text'
  t.fontName = LABEL_FONT
  t.fontSize = LABEL_SIZE
  t.lineHeight = { unit: 'PERCENT', value: 100 }
  t.fills = [BLACK]
  t.characters = 'text'
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
  return t
}

async function createArrowGroup(parent: BaseNode & ChildrenMixin): Promise<GroupNode> {
  const halo = makeVector('line-halo', HALO_WEIGHT)
  halo.strokes = [WHITE]
  const dotted = makeVector('line-dotted', LINE_WEIGHT)
  dotted.dashPattern = DASH
  const head = makeVector('arrowhead', HEAD_WEIGHT)
  const dotHalo = makeDot('dot-halo', true)
  const text = await makeText()
  const dot = makeDot('dot', false)
  for (const n of [dotHalo, halo, dotted, head, text, dot]) parent.appendChild(n)
  const lineGroup = figma.group([halo, dotted, head], parent)
  lineGroup.name = 'line'
  const group = figma.group([dotHalo, lineGroup, text, dot], parent)
  group.name = 'point-indicator'
  group.insertChild(1, lineGroup) // bottom → top: dot-halo, line, text, dot
  return group
}

function findParts(group: GroupNode): Parts | null {
  const get = <T extends SceneNode>(name: string, type: NodeType) =>
    group.findOne((n) => n.name === name && n.type === type) as T | null
  const parts = {
    dotHalo: get<EllipseNode>('dot-halo', 'ELLIPSE'),
    lineGroup: get<GroupNode>('line', 'GROUP'),
    halo: get<VectorNode>('line-halo', 'VECTOR'),
    dotted: get<VectorNode>('line-dotted', 'VECTOR'),
    head: get<VectorNode>('arrowhead', 'VECTOR'),
    text: get<TextNode>('text', 'TEXT'),
    dot: get<EllipseNode>('dot', 'ELLIPSE'),
  }
  return Object.values(parts).every(Boolean) ? (parts as Parts) : null
}

// Draws the arrow from S (dot) to the target anchor, leaving room for the label.
async function drawArrow(group: GroupNode, a: Rect, b: Rect, conn: Conn): Promise<boolean> {
  const parts = findParts(group)
  if (!parts) return false
  const fs = conn.fromSide === 'auto' ? autoSide(a, b) : conn.fromSide
  const ts = conn.toSide === 'auto' ? autoSide(b, a) : conn.toSide
  const S = anchor(a, fs)
  const target = anchor(b, ts)
  const arrive = INWARD[ts]
  const horizontal = arrive === 'left' || arrive === 'right'
  const { text } = parts

  // Keep a margin off the target; with a label, the label fills the space
  // between the margin and the tip.
  let extent = horizontal ? TARGET_MARGIN_H : TARGET_MARGIN_V
  text.visible = conn.label
  if (conn.label) extent += horizontal ? text.width + LABEL_GAP_H : text.height + LABEL_GAP_V
  const tip = add(target, V[arrive], -extent)
  if (conn.label) {
    const tl =
      arrive === 'right' ? { x: tip.x + LABEL_GAP_H, y: tip.y - text.height / 2 }
      : arrive === 'left' ? { x: tip.x - LABEL_GAP_H - text.width, y: tip.y - text.height / 2 }
      : arrive === 'down' ? { x: tip.x - text.width / 2, y: tip.y + LABEL_GAP_V }
      : { x: tip.x - text.width / 2, y: tip.y - LABEL_GAP_V - text.height }
    setPos(text, tl)
  }

  const pts = elbowRoute(S, tip, OUTWARD[fs], arrive)
  const color = paint(conn.color)

  // Line (halo under the dotted stroke)
  for (const v of [parts.halo, parts.dotted]) {
    await setPath(v, pts)
    v.cornerRadius = CORNER
  }
  parts.dotted.strokes = [color]

  // Chevron along the last segment
  const dir = unit(pts[pts.length - 2], tip)
  const n = { x: -dir.y, y: dir.x }
  const base = add(tip, dir, -HEAD_DEPTH)
  await setPath(parts.head, [add(base, n, HEAD_HALF), tip, add(base, n, -HEAD_HALF)])
  parts.head.strokes = [color]

  // Dot
  for (const d of [parts.dotHalo, parts.dot]) {
    d.fills = [color]
    setPos(d, { x: S.x - DOT / 2, y: S.y - DOT / 2 })
  }
  return true
}

// ---------------------------------------------------------------------------
// Redraw

async function getScene(id: string): Promise<SceneNode | null> {
  const node = await figma.getNodeByIdAsync(id)
  if (!node || node.removed || node.type === 'PAGE' || node.type === 'DOCUMENT') return null
  return node as SceneNode
}

function setOrphan(group: GroupNode, orphan: boolean) {
  const prefix = '⚠ '
  if (orphan && !group.name.startsWith(prefix)) {
    group.name = prefix + group.name
    group.opacity = 0.35
  } else if (!orphan && group.name.startsWith(prefix)) {
    group.name = group.name.slice(prefix.length)
    group.opacity = 1
  }
}

// ---------------------------------------------------------------------------
// Duplicates: a copied arrow is re-pointed at the copies of its layers.

const same = (a: number, b: number) => Math.abs(a - b) < 0.5

// The layer standing in for `id` in a copy moved by `d`: same type, size and
// name (last drawn or current), at the original's position (last drawn or
// current) shifted by `d`.
async function findCopy(id: string, seen: Seen, d: Point): Promise<string | null> {
  const orig = await getScene(id)
  const now = orig && boundsOf(orig)
  const spots = [seen, ...(now ? [now] : [])].map((r) => ({ x: r.x + d.x, y: r.y + d.y, width: r.width, height: r.height }))
  // The original may have been renamed since the copy was made.
  const names = [seen.name, ...(orig ? [orig.name] : [])]
  const type = orig ? orig.type : seen.type
  for (const n of figma.currentPage.findAllWithCriteria({ types: [type] })) {
    if (n.id === id || names.indexOf(n.name) < 0 || arrows.has(n.id) || arrowOf(n)) continue
    const b = boundsOf(n)
    if (b && spots.some((s) => same(b.x, s.x) && same(b.y, s.y) && same(b.width, s.width) && same(b.height, s.height))) return n.id
  }
  return null
}

// Each end moves to its copy if one was made alongside the arrow; an end whose
// layer wasn't copied stays on the original. Arrows from before `snap` existed
// keep their layers.
async function adoptCopy(group: GroupNode, conn: Conn): Promise<Conn> {
  const next: Conn = { ...conn, selfId: group.id }
  const at = group.absoluteBoundingBox
  if (!conn.selfId || !conn.snap || !at) return next
  const d = { x: at.x - conn.snap.group.x, y: at.y - conn.snap.group.y }
  next.fromId = (await findCopy(conn.fromId, conn.snap.from, d)) || conn.fromId
  next.toId = (await findCopy(conn.toId, conn.snap.to, d)) || conn.toId
  return next
}

function seen(node: SceneNode, r: Rect): Seen {
  return { x: r.x, y: r.y, width: r.width, height: r.height, name: node.name, type: node.type }
}

// Returns false if the arrow is gone or its targets are missing.
async function redrawArrow(arrowId: string): Promise<boolean> {
  const group = await getScene(arrowId)
  let conn = group && readConn(group)
  if (!group || group.type !== 'GROUP' || !conn) {
    unindexArrow(arrowId)
    return false
  }
  if (conn.selfId !== group.id) {
    conn = await adoptCopy(group, conn)
    writeConn(group, conn)
    indexArrow(group, conn)
  }
  const [from, to] = await Promise.all([getScene(conn.fromId), getScene(conn.toId)])
  const page = pageOf(group)
  const a = from && pageOf(from) === page ? boundsOf(from) : null
  const b = to && pageOf(to) === page ? boundsOf(to) : null
  if (!a || !b) {
    setOrphan(group, true)
    return false
  }
  setOrphan(group, false)
  if (!(await drawArrow(group, a, b, conn))) return false
  const at = group.absoluteBoundingBox
  if (at && from && to) {
    conn = { ...conn, snap: { group: { x: at.x, y: at.y }, from: seen(from, a), to: seen(to, b) } }
    writeConn(group, conn)
    arrows.set(group.id, conn)
  }
  return true
}

async function refreshAll(): Promise<{ ok: number; orphaned: number }> {
  buildIndex()
  let ok = 0
  let orphaned = 0
  for (const id of Array.from(arrows.keys())) {
    if (await redrawArrow(id)) ok++
    else if (arrows.has(id)) orphaned++
  }
  return { ok, orphaned }
}

// ---------------------------------------------------------------------------
// Live mode: watch the current page and redraw affected arrows.

let live = true
let pendingIds = new Set<string>()
const pendingArrows = new Set<string>()
let flushTimer: number | null = null
let flushing = false

async function isAffected(targetId: string, changed: Set<string>): Promise<boolean> {
  if (changed.has(targetId)) return true
  const node = await figma.getNodeByIdAsync(targetId)
  if (!node || node.removed) return true
  for (let n = node.parent; n && n.type !== 'PAGE'; n = n.parent) {
    if (changed.has(n.id)) return true
  }
  return false
}

async function flush() {
  flushTimer = null
  if (flushing) {
    scheduleFlush()
    return
  }
  flushing = true
  const changed = pendingIds
  pendingIds = new Set()
  const toRedraw = new Set(pendingArrows)
  pendingArrows.clear()
  try {
    for (const [targetId, arrowIds] of byTarget) {
      if (await isAffected(targetId, changed)) arrowIds.forEach((id) => toRedraw.add(id))
    }
    for (const id of toRedraw) await redrawArrow(id)
  } finally {
    flushing = false
  }
}

function scheduleFlush() {
  if (flushTimer === null) flushTimer = setTimeout(flush, 16) as unknown as number
}

// The arrow group a node belongs to, if any.
function arrowOf(node: BaseNode): GroupNode | null {
  for (let n: BaseNode | null = node.parent; n && n.type !== 'PAGE'; n = n.parent) {
    if (arrows.has(n.id) && n.type === 'GROUP') return n
  }
  return null
}

const LABEL_PROPS = new Set<NodeChangeProperty>(['characters', 'fontSize', 'fontName', 'width', 'height', 'textAutoResize'])

function onNodeChange(event: NodeChangeEvent) {
  for (const change of event.nodeChanges) {
    if (change.type === 'DELETE') {
      if (arrows.has(change.id)) {
        unindexArrow(change.id)
        continue
      }
    } else if (change.type === 'CREATE') {
      // Duplicated arrows carry the plugin data with them; undo can restore targets.
      const node = change.node
      if (!node.removed && node.type === 'GROUP') {
        const conn = readConn(node)
        if (conn) {
          indexArrow(node, conn)
          pendingArrows.add(node.id)
          continue
        }
      }
    } else if (arrows.has(change.id)) {
      // Our own redraws (and edits to the arrow itself) — ignore.
      continue
    } else if (!change.node.removed) {
      const owner = arrowOf(change.node)
      if (owner) {
        // Editing the label text changes its size, which moves the tip.
        if (change.node.type === 'TEXT' && change.properties.some((p) => LABEL_PROPS.has(p))) pendingArrows.add(owner.id)
        continue
      }
    }
    pendingIds.add(change.id)
  }
  if (live && (pendingIds.size || pendingArrows.size)) scheduleFlush()
}

let watchedPage: PageNode | null = null

function watchCurrentPage() {
  if (watchedPage) watchedPage.off('nodechange', onNodeChange)
  watchedPage = figma.currentPage
  watchedPage.on('nodechange', onNodeChange)
}

// ---------------------------------------------------------------------------
// Commands

function connectable(node: SceneNode): boolean {
  return !arrows.has(node.id) && !arrowOf(node) && boundsOf(node) !== null
}

// Nearest common section (so the arrow travels with it), else the page.
function containerFor(a: SceneNode, b: SceneNode): BaseNode & ChildrenMixin {
  const chain = (n: BaseNode) => {
    const out: BaseNode[] = []
    for (let p = n.parent; p; p = p.parent) out.push(p)
    return out
  }
  const bChain = new Set(chain(b))
  for (const p of chain(a)) {
    if (!bChain.has(p)) continue
    if (p.type === 'SECTION' || p.type === 'PAGE') return p as BaseNode & ChildrenMixin
  }
  return figma.currentPage
}

async function connect() {
  const sel = figma.currentPage.selection.filter(connectable)
  if (sel.length !== 2) {
    figma.notify(M().pickTwo)
    return
  }
  const [from, to] = sel
  // New arrows always start with automatic sides and no label.
  const conn: Conn = { fromId: from.id, toId: to.id, ...defaults, fromSide: 'auto', toSide: 'auto', label: false }
  const group = await createArrowGroup(containerFor(from, to))
  writeConn(group, conn)
  group.setRelaunchData({ open: M().relaunchOpen, refresh: M().relaunchRefresh })
  indexArrow(group, conn)
  await redrawArrow(group.id)
  figma.currentPage.selection = [group]
  justCreated = group
}

// The arrow just made by Connect stays the panel's edit target until the
// selection moves elsewhere, so it can be styled right away.
let justCreated: GroupNode | null = null

function onSelectionChange() {
  if (justCreated) {
    const conn = readConn(justCreated)
    const keep = new Set([justCreated.id, conn?.fromId, conn?.toId])
    const sel = figma.currentPage.selection
    if (justCreated.removed || !sel.length || sel.some((n) => !keep.has(n.id))) justCreated = null
  }
  postState()
}

// Arrows attached to a layer.
function attachedArrows(node: SceneNode): GroupNode[] {
  const ids = byTarget.get(node.id)
  if (!ids) return []
  return Array.from(ids)
    .map((id) => arrowNodes.get(id))
    .filter((g): g is GroupNode => !!g && !g.removed)
}

// The single layer selected, when it isn't an arrow itself.
function selectedLayer(): SceneNode | null {
  const sel = figma.currentPage.selection
  return sel.length === 1 && connectable(sel[0]) ? sel[0] : null
}

function selectedArrows(): GroupNode[] {
  const out = new Map<string, GroupNode>()
  if (justCreated && !justCreated.removed && arrows.has(justCreated.id)) out.set(justCreated.id, justCreated)
  for (const n of figma.currentPage.selection) {
    const g = arrows.has(n.id) && n.type === 'GROUP' ? n : arrowOf(n)
    if (g) out.set(g.id, g)
  }
  // A layer with exactly one arrow attached edits that arrow.
  const layer = !out.size && selectedLayer()
  if (layer) {
    const attached = attachedArrows(layer)
    if (attached.length === 1) out.set(attached[0].id, attached[0])
  }
  return Array.from(out.values())
}

async function updateSelected(fn: (c: Conn) => Conn) {
  for (const g of selectedArrows()) {
    const conn = fn(readConn(g)!)
    writeConn(g, conn)
    indexArrow(g, conn)
    await redrawArrow(g.id)
  }
}

async function setLabelText(text: string) {
  for (const g of selectedArrows()) {
    const t = findParts(g)?.text
    if (!t) continue
    if (t.fontName !== figma.mixed) await figma.loadFontAsync(t.fontName)
    else await Promise.all(t.getRangeAllFontNames(0, t.characters.length).map((f) => figma.loadFontAsync(f)))
    t.characters = text || ' '
    await redrawArrow(g.id)
  }
}

function detachSelected() {
  const sel = selectedArrows()
  for (const g of sel) {
    setOrphan(g, false)
    g.setPluginData(KEY, '')
    g.setRelaunchData({})
    unindexArrow(g.id)
  }
  figma.notify(sel.length ? M().detached(sel.length) : M().pickArrows)
}

// ---------------------------------------------------------------------------
// UI state

function postState(status?: string) {
  const sel = figma.currentPage.selection
  const arrowSel = selectedArrows()
  const layers = sel.filter(connectable)
  let style: Style & { text?: string } = defaults
  if (arrowSel.length) {
    const c = readConn(arrowSel[0])!
    style = { fromSide: c.fromSide, toSide: c.toSide, color: c.color, label: c.label, text: findParts(arrowSel[0])?.text.characters }
  }
  const layer = selectedLayer()
  figma.ui.postMessage({
    type: 'state',
    mode: arrowSel.length ? 'arrows' : layers.length === 2 ? 'ready' : 'idle',
    arrows: arrowSel.length,
    // Set when editing through a selected layer, or when that layer has several arrows.
    via: layer && arrowSel.length && !justCreated ? layer.name : null,
    attached: layer ? attachedArrows(layer).length : 0,
    layers: layers.map((n) => n.name),
    style,
    live,
    count: arrows.size,
    status,
    lang,
  })
}

type Msg =
  | { type: 'connect' }
  | { type: 'style'; patch: Partial<Style> }
  | { type: 'text'; text: string }
  | { type: 'swap' }
  | { type: 'detach' }
  | { type: 'refresh' }
  | { type: 'live'; on: boolean }
  | { type: 'resize'; height: number }
  | { type: 'lang'; lang: Lang }

async function onMessage(msg: Msg) {
  if (msg.type === 'resize') {
    figma.ui.resize(280, Math.max(120, Math.min(msg.height, 600)))
    return
  }
  switch (msg.type) {
    case 'connect':
      await connect()
      break
    case 'style':
      // Edits apply to the selected arrows, or become the style for new arrows.
      if (selectedArrows().length) {
        await updateSelected((c) => ({ ...c, ...msg.patch }))
      } else {
        defaults = { ...defaults, ...msg.patch }
        await figma.clientStorage.setAsync(DEFAULTS_KEY, defaults)
      }
      break
    case 'text':
      await setLabelText(msg.text)
      break
    case 'swap':
      await updateSelected((c) => ({ ...c, fromId: c.toId, toId: c.fromId, fromSide: c.toSide, toSide: c.fromSide }))
      break
    case 'detach':
      detachSelected()
      break
    case 'refresh': {
      const r = await refreshAll()
      figma.notify(M().redrew(r.ok, r.orphaned))
      break
    }
    case 'lang':
      lang = msg.lang === 'en' ? 'en' : 'ko'
      await figma.clientStorage.setAsync(LANG_KEY, lang)
      break
    case 'live':
      live = msg.on
      if (live) await refreshAll()
      break
  }
  postState()
}

// ---------------------------------------------------------------------------
// Entry

async function main() {
  lang = (await figma.clientStorage.getAsync(LANG_KEY)) === 'en' ? 'en' : 'ko'
  if (figma.command === 'refresh') {
    const { ok, orphaned } = await refreshAll()
    figma.closePlugin(M().redrew(ok, orphaned))
    return
  }

  defaults = { ...DEFAULT_STYLE, ...((await figma.clientStorage.getAsync(DEFAULTS_KEY)) || {}), fromSide: 'auto', toSide: 'auto', label: false }
  figma.showUI(__html__, { width: 280, height: 300, themeColors: true })
  const { orphaned } = await refreshAll()
  if (orphaned) figma.notify(M().lost(orphaned))
  watchCurrentPage()
  postState()

  figma.on('selectionchange', onSelectionChange)
  figma.on('currentpagechange', async () => {
    justCreated = null
    watchCurrentPage()
    await refreshAll()
    postState()
  })
  figma.ui.onmessage = onMessage
}

main()
