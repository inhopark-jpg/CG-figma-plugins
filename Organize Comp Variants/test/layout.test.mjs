// Runs src/layout.ts against variant positions recorded from the Rider-App
// examples (button, badge, map marker, snackbar). `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const out = join(mkdtempSync(join(tmpdir(), 'cd-layout-')), 'layout.mjs')
const { outputFiles } = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/layout.ts', import.meta.url))],
  bundle: true, format: 'esm', write: false,
})
writeFileSync(out, outputFiles[0].text)
const { plan, walk, strayBrackets, valueOrder, appendSequence, takeOld, OVERSHOOT } = await import(pathToFileURL(out))

// "a=1, b=2" x y w h  →  variant
const v = (name, x, y, w, h) => ({
  id: name, x, y, width: w, height: h,
  variantProperties: Object.fromEntries(name.split(', ').map((kv) => kv.split('='))),
})
const propsOf = (vs) => Object.keys(vs[0].variantProperties)

const FIXTURES = {
  button: [
    ['state=default, loading=false, type=default, floating=false, liquid-glass=false', 20, 20],
    ['state=default, loading=false, type=default, floating=true, liquid-glass=false', 20, 594],
    ['state=default, loading=false, type=default, floating=true, liquid-glass=true', 20, 351],
    ['state=default, loading=false, type=destructive, floating=true, liquid-glass=true', 20, 438],
    ['state=disabled, loading=false, type=default, floating=true, liquid-glass=true', 720, 351],
    ['state=disabled, loading=false, type=destructive, floating=true, liquid-glass=true', 720, 438],
    ['state=default, loading=true, type=default, floating=false, liquid-glass=false', 1080, 20],
    ['state=default, loading=true, type=default, floating=true, liquid-glass=false', 1080, 594],
    ['state=default, loading=true, type=default, floating=true, liquid-glass=true', 1080, 351],
    ['state=default, loading=true, type=destructive, floating=true, liquid-glass=true', 1080, 438],
    ['state=default, loading=false, type=destructive, floating=false, liquid-glass=false', 20, 107],
    ['state=default, loading=false, type=destructive, floating=true, liquid-glass=false', 20, 681],
    ['state=default, loading=true, type=destructive, floating=false, liquid-glass=false', 1080, 107],
    ['state=default, loading=true, type=destructive, floating=true, liquid-glass=false', 1080, 681],
    ['state=disabled, loading=false, type=default, floating=false, liquid-glass=false', 720, 20],
    ['state=disabled, loading=false, type=default, floating=true, liquid-glass=false', 720, 594],
    ['state=disabled, loading=false, type=destructive, floating=false, liquid-glass=false', 720, 107],
    ['state=disabled, loading=false, type=destructive, floating=true, liquid-glass=false', 720, 681],
    ['state=pressed, loading=false, type=default, floating=false, liquid-glass=false', 370, 20],
    ['state=pressed, loading=false, type=default, floating=true, liquid-glass=false', 370, 594],
    ['state=pressed, loading=false, type=default, floating=true, liquid-glass=true', 370, 351],
    ['state=pressed, loading=false, type=destructive, floating=true, liquid-glass=true', 370, 438],
    ['state=pressed, loading=false, type=destructive, floating=false, liquid-glass=false', 370, 107],
    ['state=pressed, loading=false, type=destructive, floating=true, liquid-glass=false', 370, 681],
  ].map(([n, x, y]) => v(n, x, y, 300, 48)),
  badge: [
    ['size=md, type=brand', 195, 28, 44, 20], ['size=sm, type=brand', 278, 31, 33, 14], ['size=xs, type=brand', 369, 36, 4, 4],
    ['size=lg, type=brand', 107, 26, 57, 24], ['size=xl, type=brand', 19, 24, 63, 28],
    ['size=md, type=info', 195, 97, 44, 20], ['size=md, type=warning', 195, 171, 44, 20], ['size=md, type=error', 195, 246, 44, 20],
    ['size=md, type=success', 195, 321, 44, 20], ['size=sm, type=info', 278, 100, 33, 14], ['size=sm, type=warning', 278, 174, 33, 14],
    ['size=sm, type=error', 278, 249, 33, 14], ['size=sm, type=success', 278, 324, 33, 14], ['size=xs, type=info', 369, 105, 4, 4],
    ['size=xs, type=warning', 369, 179, 4, 4], ['size=xs, type=error', 369, 254, 4, 4], ['size=xs, type=success', 369, 329, 4, 4],
    ['size=lg, type=info', 107, 95, 57, 24], ['size=lg, type=warning', 107, 169, 57, 24], ['size=lg, type=error', 107, 244, 57, 24],
    ['size=lg, type=success', 107, 319, 57, 24], ['size=xl, type=info', 19, 93, 63, 28], ['size=xl, type=warning', 19, 167, 63, 28],
    ['size=xl, type=error', 19, 242, 63, 28], ['size=xl, type=success', 19, 317, 63, 28],
  ].map((a) => v(...a)),
  marker: [
    ['type=origin, snapped=false', 37, 20], ['type=origin, snapped=true', 37, 166], ['type=destination, snapped=false', 214, 20],
    ['type=destination, snapped=true', 214, 166], ['type=no-service, snapped=false', 374, 20],
  ].map(([n, x, y]) => v(n, x, y, 75, 78)),
  snackbar: [
    ['type=default, liquid-glass=true', 20, 20], ['type=info, liquid-glass=true', 20, 152], ['type=warning, liquid-glass=true', 20, 284],
    ['type=success, liquid-glass=true', 20, 416], ['type=error, liquid-glass=true', 20, 548], ['type=default, liquid-glass=false', 377, 20],
    ['type=info, liquid-glass=false', 377, 152], ['type=warning, liquid-glass=false', 377, 284], ['type=success, liquid-glass=false', 377, 416],
    ['type=error, liquid-glass=false', 377, 548],
  ].map(([n, x, y]) => v(n, x, y, 310, 112)),
}

// Label sizes like the real bracket: two lines of 16px text; width ≈ 8px per character.
const fakeLabel = (n, axis) => axis === 'y' ? 32 : 8 * Math.max(n.prop.length + 1, n.value.length)

// Tree as "prop=value" paths, outer → inner, in order.
function shape(trees) {
  const out = []
  const rec = (nodes, path) => nodes.forEach((n) => {
    const p = [...path, `${n.prop}=${n.value}`]
    n.kids.length ? rec(n.kids, p) : out.push(p.join(' / '))
  })
  rec(trees, [])
  return out
}

// Same placement as documentSet() in code.ts (PAD 20).
function apply(vs, p) {
  for (const x of vs) {
    const c = p.cell.get(x.id)
    x.x = Math.round(20 + c.x.start + (c.x.size - x.width) / 2)
    x.y = Math.round(20 + c.y.start + (c.y.size - x.height) / 2)
  }
}

test('button: X = loading > state, Y = floating > liquid-glass > type, current order kept', () => {
  const vs = FIXTURES.button
  const p = plan(vs, propsOf(vs), fakeLabel)
  assert.deepEqual(shape(p.trees.x), [
    'loading=false / state=default', 'loading=false / state=pressed', 'loading=false / state=disabled', 'loading=true / state=default',
  ])
  assert.deepEqual(shape(p.trees.y), [
    'floating=false / liquid-glass=false / type=default', 'floating=false / liquid-glass=false / type=destructive',
    'floating=true / liquid-glass=true / type=default', 'floating=true / liquid-glass=true / type=destructive',
    'floating=true / liquid-glass=false / type=default', 'floating=true / liquid-glass=false / type=destructive',
  ])
  assert.equal(p.overlaps, 0)
})

test('badge: X = size in on-canvas order (xl → xs), Y = type', () => {
  const vs = FIXTURES.badge
  const p = plan(vs, propsOf(vs), fakeLabel)
  assert.deepEqual(shape(p.trees.x), ['size=xl', 'size=lg', 'size=md', 'size=sm', 'size=xs'])
  assert.deepEqual(shape(p.trees.y), ['type=brand', 'type=info', 'type=warning', 'type=error', 'type=success'])
})

test('marker: missing combination leaves an empty cell', () => {
  const vs = FIXTURES.marker
  const p = plan(vs, propsOf(vs), fakeLabel)
  assert.deepEqual(shape(p.trees.x), ['type=origin', 'type=destination', 'type=no-service'])
  assert.deepEqual(shape(p.trees.y), ['snapped=false', 'snapped=true'])
  assert.equal(p.cell.size, 5)
})

test('snackbar: X = liquid-glass (true first, as on canvas), Y = type', () => {
  const vs = FIXTURES.snackbar
  const p = plan(vs, propsOf(vs), fakeLabel)
  assert.deepEqual(shape(p.trees.x), ['liquid-glass=true', 'liquid-glass=false'])
  assert.deepEqual(shape(p.trees.y), ['type=default', 'type=info', 'type=warning', 'type=success', 'type=error'])
})

test('re-running on its own output changes nothing', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const vs = fixture.map((x) => ({ ...x }))
    const first = plan(vs, propsOf(vs), fakeLabel)
    apply(vs, first)
    const before = vs.map((x) => [x.x, x.y])
    const second = plan(vs, propsOf(vs), fakeLabel)
    apply(vs, second)
    assert.deepEqual(shape(second.trees.x), shape(first.trees.x), name)
    assert.deepEqual(shape(second.trees.y), shape(first.trees.y), name)
    assert.deepEqual(vs.map((x) => [x.x, x.y]), before, name)
  }
})

test('brackets on the same level never overlap and always fit their label', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const vs = fixture.map((x) => ({ ...x }))
    const p = plan(vs, propsOf(vs), fakeLabel)
    for (const axis of ['x', 'y']) {
      const byDepth = {}
      walk(p.trees[axis], (n) => (byDepth[n.depth] ||= []).push(n))
      for (const nodes of Object.values(byDepth)) {
        nodes.forEach((n, i) => {
          assert.ok(n.size + OVERSHOOT * 2 >= n.label, `${name} ${axis} label fits`)
          if (i) assert.ok(nodes[i - 1].start + nodes[i - 1].size + OVERSHOOT < n.start - OVERSHOOT, `${name} ${axis} no overlap`)
        })
      }
    }
  }
})

test('single row: every property goes on X, Y stays unlabeled', () => {
  const vs = ['a=1, b=x', 'a=2, b=x', 'a=1, b=y', 'a=2, b=y'].map((n, i) => v(n, i * 100, 0, 80, 40))
  const p = plan(vs, propsOf(vs), fakeLabel)
  assert.equal(p.trees.y.length, 0)
  assert.equal(shape(p.trees.x).length, 4)
  assert.equal(p.overlaps, 0)
})

test('duplicate property combinations are reported', () => {
  const vs = ['a=1', 'a=2', 'a=2'].map((n, i) => ({ ...v(n, i * 100, 0, 80, 40), id: String(i) }))
  const p = plan(vs, ['a'], fakeLabel)
  assert.equal(p.overlaps, 2)
})

// Hand-made brackets around btn-primary in Rider-App, relative to the set (x, y, w, h).
const BUTTON_SET = { x: 0, y: 0, width: 1400, height: 749 }
const BUTTON_BRACKETS = [
  [0, -57, 306, 38], [0, -95, 1029, 38], [361, -57, 307, 38], [722, -57, 307, 38], [1084, -57, 306, 38], [1084, -95, 306, 38],
  [-99, 12, 79, 66], [-254, 12, 118, 161], [-254, 581, 118, 166], [-254, 339, 118, 165], [-342, 339, 88, 408],
  [-342, 12, 88, 161], [-132, 101, 112, 66], [-99, 339, 79, 66], [-99, 581, 79, 66], [-132, 428, 112, 66], [-132, 670, 112, 66],
].map(([x, y, width, height], i) => ({ id: String(i), x, y, width, height }))

test('stray brackets: every hand-made bracket around the button is picked up', () => {
  assert.equal(strayBrackets(BUTTON_SET, BUTTON_BRACKETS, []).length, BUTTON_BRACKETS.length)
})

test('stray brackets: brackets right of or below the set, or off its bands, stay', () => {
  const keep = [
    { id: 'right', x: 1450, y: 100, width: 80, height: 60 },
    { id: 'below', x: 100, y: 800, width: 80, height: 40 },
    { id: 'corner', x: -200, y: -200, width: 80, height: 40 },
  ]
  assert.deepEqual(strayBrackets(BUTTON_SET, keep, []), [])
})

test("stray brackets: a neighbouring set's brackets stay", () => {
  // Set B sits left of the button set in the same section, so B's own brackets fall in the button's left band.
  const b = { x: -900, y: 0, width: 400, height: 300 }
  const bBrackets = [{ id: 'b-row', x: -1000, y: 20, width: 80, height: 60 }, { id: 'b-col', x: -880, y: -60, width: 100, height: 40 }]
  const mine = BUTTON_BRACKETS.slice(0, 3)
  const picked = strayBrackets(BUTTON_SET, [...bBrackets, ...mine], [b]).map((n) => n.id)
  assert.deepEqual(picked, mine.map((n) => n.id))
})

test('value order follows the canvas: badge size xl → xs, button state default/pressed/disabled', () => {
  const badge = valueOrder(plan(FIXTURES.badge, propsOf(FIXTURES.badge), fakeLabel))
  assert.deepEqual(badge.size, ['xl', 'lg', 'md', 'sm', 'xs'])
  assert.deepEqual(badge.type, ['brand', 'info', 'warning', 'error', 'success'])
  const button = valueOrder(plan(FIXTURES.button, propsOf(FIXTURES.button), fakeLabel))
  assert.deepEqual(button.state, ['default', 'pressed', 'disabled'])
  assert.deepEqual(button.loading, ['false', 'true'])
  assert.deepEqual(button.floating, ['false', 'true'])
  assert.deepEqual(button['liquid-glass'], ['false', 'true']) // first group (floating=false) decides
  assert.deepEqual(button.type, ['default', 'destructive'])
})

// Value order Figma ends up with when variants are appended in this sequence.
const firstSeen = (seq, prop) => [...new Set(seq.map((x) => x.variantProperties[prop]))]

test('append sequence satisfies every property at once (all four examples)', () => {
  for (const [name, vs] of Object.entries(FIXTURES)) {
    const wanted = valueOrder(plan(vs, propsOf(vs), fakeLabel))
    const seq = appendSequence(vs, wanted)
    assert.equal(seq.length, vs.length, name)
    for (const prop of Object.keys(wanted)) assert.deepEqual(firstSeen(seq, prop), wanted[prop], `${name} ${prop}`)
  }
})

test('append sequence: properties that fought in the per-value approach', () => {
  // From the Figma experiment: loading=true only exists with state=default.
  const vs = ['state=disabled, loading=false', 'state=default, loading=true', 'state=pressed, loading=false', 'state=default, loading=false']
    .map((n) => v(n, 0, 0, 10, 10))
  const wanted = { state: ['default', 'pressed', 'disabled'], loading: ['true', 'false'] }
  const seq = appendSequence(vs, wanted)
  assert.deepEqual(firstSeen(seq, 'state'), wanted.state)
  assert.deepEqual(firstSeen(seq, 'loading'), wanted.loading)
})

// Re-running keeps the old bracket instances (and the annotations on them):
// each group takes the old bracket with its label that covers its variants.
// Button: `liquid-glass: false` labels a row group under both floating=false
// and floating=true, each with a different annotation in Rider-App.
test('takeOld matches old brackets by label and covered variants', () => {
  const vs = FIXTURES.button
  const ids = (pred) => new Set(vs.filter(pred).map((v) => v.id))
  const fp = (v, k) => v.variantProperties[k]
  const pool = [
    { tag: 'onFloating', axis: 'y', label: 'liquid-glass: false', covers: ids((v) => fp(v, 'floating') === 'true' && fp(v, 'liquid-glass') === 'false') },
    { tag: 'notFloating', axis: 'y', label: 'liquid-glass:\nfalse', covers: ids((v) => fp(v, 'floating') === 'false') },
    { tag: 'gone', axis: 'x', label: 'size:\nxl', covers: new Set() },
  ]
  const got = new Map()
  plan(vs, propsOf(vs), (n, axis) => {
    const o = takeOld(pool, n, axis)
    if (o) got.set(o.tag, n)
    return 0
  })
  assert.ok(got.get('notFloating').items.every((v) => fp(v, 'floating') === 'false'))
  assert.ok(got.get('onFloating').items.every((v) => fp(v, 'floating') === 'true' && fp(v, 'liquid-glass') === 'false'))
  assert.deepEqual(pool.map((o) => o.tag), ['gone'], 'brackets without a group are left to remove')

  // Same label twice and neither covers the group: take neither.
  const twins = [
    { axis: 'y', label: 'liquid-glass:\nfalse', covers: new Set() },
    { axis: 'y', label: 'liquid-glass:\nfalse', covers: new Set() },
  ]
  const n = { prop: 'liquid-glass', value: 'false', items: vs.slice(0, 2) }
  assert.equal(takeOld(twins, n, 'y'), null)
  assert.equal(takeOld([twins[0]], n, 'y'), twins[0], 'a single bracket with the label is taken')
})
