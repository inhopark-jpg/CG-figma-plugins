// Canvas side of Organize Sections: reads a section into an Item tree,
// runs layout.ts, and writes positions, sizes and backgrounds back.
// Kept apart from code.ts (UI and messages) so it can be run on its own.

import { Item, Mode, Rect, Tone, organize } from './layout'

// Section backgrounds (canvas data, matching the Rider-App files).
const TONE_RGB: Record<'white' | 'light' | 'dark', RGB> = {
  white: { r: 1, g: 1, b: 1 },
  light: { r: 0xf2 / 255, g: 0xf2 / 255, b: 0xf2 / 255 },
  dark: { r: 0xe6 / 255, g: 0xe6 / 255, b: 0xe6 / 255 },
}

// ---------------------------------------------------------------------------
// Canvas → Item tree

function toneOf(node: SectionNode): Tone {
  const fills = node.fills
  if (fills === figma.mixed) return 'other'
  const shown = fills.filter((p) => p.visible !== false && (p.opacity === undefined || p.opacity > 0))
  if (!shown.length) return 'none'
  const top = shown[shown.length - 1]
  if (top.type !== 'SOLID' || (top.opacity !== undefined && top.opacity < 1)) return 'other'
  const c = top.color
  const is = (v: number) => [c.r, c.g, c.b].every((ch) => Math.abs(ch * 255 - v) < 1.5)
  return is(255) ? 'white' : is(0xf2) ? 'light' : is(0xe6) ? 'dark' : 'other'
}

// Axis-aligned bounds of a non-section child, relative to its section, snapped
// outward to whole pixels so every later offset is an integer.
function boundsIn(n: SceneNode, ox: number, oy: number): Rect {
  const b = n.absoluteBoundingBox || {
    x: n.absoluteTransform[0][2],
    y: n.absoluteTransform[1][2],
    width: n.width,
    height: n.height,
  }
  const x = Math.floor(b.x - ox)
  const y = Math.floor(b.y - oy)
  return { x, y, w: Math.ceil(b.x - ox + b.width) - x, h: Math.ceil(b.y - oy + b.height) - y }
}

// Main components of the instances directly inside `node` (not inside those
// instances): what this component or screen is built from.
async function usesOf(node: SceneNode): Promise<string[]> {
  const out: string[] = []
  const stack: SceneNode[] = [node]
  while (stack.length) {
    const n = stack.pop() as SceneNode
    if (n.type === 'INSTANCE') {
      const main = await n.getMainComponentAsync()
      if (main) out.push(main.id)
      continue
    }
    if ('children' in n) for (const c of n.children) stack.push(c)
  }
  return out
}

function defsOf(n: SceneNode): { id: string; name: string }[] {
  if (n.type === 'COMPONENT') return [{ id: n.id, name: n.name }]
  if (n.type === 'COMPONENT_SET') return n.children.map((v) => ({ id: v.id, name: n.name }))
  return []
}

export async function read(node: SectionNode, nodes: Map<string, SceneNode>, usage: boolean): Promise<Item> {
  nodes.set(node.id, node)
  const ox = node.absoluteTransform[0][2]
  const oy = node.absoluteTransform[1][2]
  const children: Item[] = []
  for (const c of node.children) {
    if (c.type === 'SECTION') {
      children.push(await read(c, nodes, usage))
      continue
    }
    nodes.set(c.id, c)
    const it: Item = { id: c.id, name: c.name, section: false, rect: boundsIn(c, ox, oy) }
    if (usage) {
      it.comp = c.type === 'COMPONENT' || c.type === 'COMPONENT_SET'
      it.defs = defsOf(c)
      it.uses = await usesOf(c)
    }
    children.push(it)
  }
  return {
    id: node.id,
    name: node.name,
    section: true,
    rect: { x: Math.round(node.x), y: Math.round(node.y), w: Math.round(node.width), h: Math.round(node.height) },
    tone: toneOf(node),
    comps: node.children.filter((c) => c.type === 'COMPONENT' || c.type === 'COMPONENT_SET').map((c) => c.name),
    children,
  }
}

// ---------------------------------------------------------------------------
// Item tree → canvas. Returns how many sections moved or changed size.

function write(before: Item, after: Item, nodes: Map<string, SceneNode>, isRoot: boolean): number {
  const node = nodes.get(before.id)
  if (!node) return 0
  let changed = 0
  if (before.section && node.type === 'SECTION') {
    const a = after.rect, b = before.rect
    if (!isRoot && (a.x !== b.x || a.y !== b.y)) {
      node.x = a.x
      node.y = a.y
    }
    if (a.w !== b.w || a.h !== b.h) node.resizeWithoutConstraints(Math.max(1, a.w), Math.max(1, a.h))
    if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) changed++
    const kids = before.children || []
    const next = after.children || []
    kids.forEach((k, i) => (changed += write(k, next[i], nodes, false)))
  } else {
    const dx = after.rect.x - before.rect.x
    const dy = after.rect.y - before.rect.y
    if (dx) node.x += dx
    if (dy) node.y += dy
  }
  return changed
}

function countSections(it: Item): number {
  return (it.children || []).reduce((n, c) => n + (c.section ? countSections(c) : 0), 1)
}

export interface Summary {
  sections: number // sections in the selected trees
  changed: number // sections moved or resized
  recolored: number // sections whose background changed
}

export async function organizeSections(roots: SectionNode[], mode: Mode): Promise<Summary> {
  const sum: Summary = { sections: 0, changed: 0, recolored: 0 }
  for (const root of roots) {
    const nodes = new Map<string, SceneNode>()
    // Component usage only matters for the page and component layouts.
    const before = await read(root, nodes, mode !== 'basic')
    const { tree, tones } = organize(before, mode)
    sum.changed += write(before, tree, nodes, true)
    for (const { id, tone } of tones) {
      const node = nodes.get(id)
      if (node && node.type === 'SECTION' && tone !== 'none' && tone !== 'other') {
        node.fills = [{ type: 'SOLID', color: TONE_RGB[tone] }]
        sum.recolored++
      }
    }
    sum.sections += countSections(before)
  }
  return sum
}
