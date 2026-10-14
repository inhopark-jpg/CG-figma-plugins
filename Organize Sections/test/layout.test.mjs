// Runs src/layout.ts against section trees recorded from Rider-App
// (Feature page examples, Button page). `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const out = join(mkdtempSync(join(tmpdir(), 'os-layout-')), 'layout.mjs')
const { outputFiles } = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/layout.ts', import.meta.url))],
  bundle: true, format: 'esm', write: false,
})
writeFileSync(out, outputFiles[0].text)
const { organize, nextTone, role, byName, PAD, GAP, PAGE_BAND, COMP_BAND } = await import(pathToFileURL(out))

let seq = 0
// section: name, x, y, w, h, tone, children, component names
const S = (name, x, y, w, h, kids = [], tone = 'light') => ({
  id: `s${seq++}`, name, section: true, rect: { x, y, w, h }, tone,
  comps: kids.filter((k) => k.comp).map((k) => k.name),
  children: kids,
})
// non-section child; comp = COMPONENT / COMPONENT_SET
const N = (name, x, y, w, h, comp = false) => ({ id: `n${seq++}`, name, section: false, rect: { x, y, w, h }, comp })
const C = (name, x, y, w, h) => N(name, x, y, w, h, true)
// component that defines `def` and is built from `uses` (main component ids)
const D = (name, def, uses = [], x = 100, y = 300, w = 200, h = 100) =>
  ({ ...N(name, x, y, w, h, true), defs: [{ id: def, name }], uses })
// screen frame built from `uses`
const F = (name, uses, x = 100, y = 100, w = 390, h = 844) => ({ ...N(name, x, y, w, h), uses })

const find = (tree, name) => {
  if (tree.name === name) return tree
  for (const c of tree.children || []) {
    const f = find(c, name)
    if (f) return f
  }
  return null
}
const right = (r) => r.x + r.w
const bottom = (r) => r.y + r.h

// Every section's children sit at least PAD inside it, and sibling sections never overlap.
function checkTidy(s, exactPad) {
  const kids = s.children || []
  if (!kids.length) return
  const minX = Math.min(...kids.map((c) => c.rect.x)), minY = Math.min(...kids.map((c) => c.rect.y))
  const maxX = Math.max(...kids.map((c) => right(c.rect))), maxY = Math.max(...kids.map((c) => bottom(c.rect)))
  if (exactPad) {
    assert.equal(minX, PAD, `${s.name} left pad`)
    assert.equal(minY, PAD, `${s.name} top pad`)
    assert.equal(s.rect.w - maxX, PAD, `${s.name} right pad`)
    assert.equal(s.rect.h - maxY, PAD, `${s.name} bottom pad`)
  } else {
    assert.ok(minX >= PAD && minY >= PAD && s.rect.w - maxX >= PAD && s.rect.h - maxY >= PAD, `${s.name} padding`)
  }
  const secs = kids.filter((c) => c.section)
  for (let i = 0; i < secs.length; i++)
    for (let j = i + 1; j < secs.length; j++) {
      const a = secs[i].rect, b = secs[j].rect
      const ov = Math.min(right(a), right(b)) > Math.max(a.x, b.x) && Math.min(bottom(a), bottom(b)) > Math.max(a.y, b.y)
      assert.ok(!ov, `${secs[i].name} overlaps ${secs[j].name} in ${s.name}`)
    }
  for (const c of secs) checkTidy(c, exactPad)
}

const strip = (t) => JSON.parse(JSON.stringify(t))
function idempotent(make, mode) {
  const once = organize(make(), mode).tree
  const twice = organize(strip(once), mode).tree
  assert.deepEqual(strip(twice), strip(once), `${mode}: second run changes nothing`)
}

// ---------------------------------------------------------------------------
// Fixtures

// Feature page "for example, settings page" (1253:2043), messed up: uneven
// padding, the building-block row too close, sub pages out of line, plus
// screens next to the sub pages.
const messyPage = () =>
  S('for example, settings page', -2659, -2156, 60000, 16000, [
    S(' ', 300, 12000, 50000, 2600, [
      S('building-block', 140, 260, 3184, 2187, [], 'dark'),
      S('building-block', 3500, 100, 3184, 2187, [], 'dark'),
      S('building-block', 6800, 180, 3184, 2187, [], 'dark'),
    ]),
    S('page', 100, 400, 26675, 11000, [
      N('screen-1', 150, 300, 390, 844),
      N('screen-2', 640, 320, 390, 844),
      S('', 150, 1300, 900, 600, [N('note', 300, 300, 200, 100)], 'none'), // transparent → note, not building-block
      S('flow', 1200, 300, 600, 400, [N('example', 100, 100, 300, 200)], 'none'), // transparent → note, not sub page
      S('', 300, 8000, 20000, 2700, [
        S('building-block', 100, 100, 3184, 2387, [], 'light'),
        S('building-block', 3500, 140, 3184, 2387, [], 'light'),
      ], 'dark'),
      S('sub page', 8211, 300, 18364, 7409, [
        S('', 100, 4922, 18164, 2387, [S('building-block', 100, 100, 3184, 2187, [], 'dark')]),
        S('sub-sub page', 4466, 100, 6849, 3611, [
          N('screen', 200, 200, 390, 844),
          S('building-block', 100, 1846, 6649, 1665, [
            S('building-block', 100, 100, 1738, 1465),
            S('building-block', 2100, 100, 1738, 1465),
          ], 'dark'),
        ]),
        S('sub-sub page', 11415, 400, 6849, 3000, []),
      ], 'dark'),
    ]),
    S('page', 27500, 100, 31241, 11196, [
      S(' ', 100, 8509, 31041, 2587, [S('building-block', 100, 100, 3184, 2387)], 'dark'),
      S('page', 8211, 100, 11415, 7409, [], 'dark'),
    ]),
  ], 'white')

// Feature page "component-A" (2465:20081) as drawn.
const componentA = () =>
  S('component-A', -9276, -2156, 4527, 4514, [
    S(' ', 100, 100, 3529, 4314, [
      S('building-block', 161, 2449, 3268, 1765, [
        S('building-block', 88, 555, 1101, 505, [C('this is a building block of theskeleton component', 416, 200, 106, 106)], 'dark'),
        S('building-block', 88, 1160, 1101, 505, [C('this is another building block of theskeleton component', 416, 195, 106, 106)], 'dark'),
        C('this is a skeleton component', 451, 285, 278, 106),
      ]),
      S('template-component-A1', 100, 100, 1529, 1508, [
        S('pattern that uses A1', 100, 82, 627, 584, [C('pattern that uses A1', 174, 239, 315, 106)], 'dark'),
        S('another pattern that uses A1', 802, 82, 627, 584, [C('template-component-A1', 157, 225, 318, 106)], 'dark'),
        C('template-component-A1', 373, 1055, 278, 106),
      ]),
      S('template-component-A2', 1729, 100, 1700, 1508, []),
    ], 'white'),
    S(' ', 3729, 100, 698, 647, [
      S('composite-template-component', 100, 100, 498, 447, [C('composite template', 100, 100, 298, 247)]),
    ], 'white'),
  ], 'none')

// Button page, one template section (btn-primary) with brackets and example sections.
const buttonPage = () =>
  S('button', -4654, 5383, 9503, 5576, [
    S('', 100, 100, 7712, 5376, [
      S('building-block', 100, 4552, 7512, 724, [
        C('.skeleton/btn', 261, 308, 1376, 316),
        N('address-platter', 236, 101, 390, 42),
        N('section-indicator', 100, 318, 145, 186),
      ]),
      S('btn-primary', 128, 100, 1942, 2531, [
        C('btn-primary', 442, 323, 1400, 749),
        N('section-indicator', 442, 266, 306, 38),
        N('section-indicator', 100, 335, 88, 161),
        N('address-platter', 442, 101, 390, 42),
        S('적용 예시', 442, 1178, 1335, 400, [N('example', 100, 100, 300, 200)], 'none'),
        S('색상 모드별 적용 예시', 442, 1635, 1009, 778, [N('example', 100, 100, 374, 250)], 'none'),
      ]),
      S('btn-ghost', 5673, 99, 1939, 3908, [C('btn-ghost', 528, 323, 1311, 2027)]),
    ], 'white'),
  ], 'none')

// ---------------------------------------------------------------------------

test('tones alternate transparent → white → light → dark → light', () => {
  assert.deepEqual(['none', 'white', 'light', 'dark', 'other'].map(nextTone), ['white', 'light', 'dark', 'light', 'light'])
  const { tree, tones } = organize(componentA(), 'basic')
  assert.equal(tree.tone, 'none', 'selected section keeps its fill')
  assert.equal(tree.children[0].tone, 'white')
  assert.equal(find(tree, 'template-component-A1').tone, 'light')
  assert.equal(find(tree, 'pattern that uses A1').tone, 'dark')
  assert.equal(tones.length, 0, 'component-A already follows the rule')
  const messy = messyPage()
  messy.children[0].tone = 'white' // wrong under a white section
  messy.children[0].children[1].tone = 'white'
  const page = organize(messy, 'basic')
  assert.deepEqual(page.tones, [
    { id: messy.children[0].id, tone: 'light' },
    { id: messy.children[0].children[1].id, tone: 'dark' },
  ])
})

test('notes stay transparent; sections inside continue the outer tone', () => {
  const make = () => S('root', 0, 0, 3000, 3000, [
    S('feature', 100, 100, 2000, 2000, [
      S('example', 100, 100, 1500, 1500, [S('inner', 100, 100, 500, 500, [], 'white')], 'none'),
    ], 'white'),
  ], 'white')
  const { tree, tones } = organize(make(), 'basic')
  const example = find(tree, 'example')
  assert.equal(example.tone, 'none')
  assert.equal(find(tree, 'feature').tone, 'light')
  assert.equal(find(tree, 'inner').tone, 'dark', 'continues from feature, skipping the note')
  assert.ok(!tones.some((t) => t.id === example.id))
})

test('basic: 100px padding everywhere, root stays put, idempotent', () => {
  for (const make of [messyPage, componentA, buttonPage]) {
    const before = make()
    const { tree } = organize(before, 'basic')
    assert.deepEqual([tree.rect.x, tree.rect.y], [before.rect.x, before.rect.y])
    checkTidy(tree, true)
    idempotent(make, 'basic')
  }
})

test('basic: nearest sections end up GAP apart, content keeps its gap', () => {
  const make = () => S('root', 0, 0, 3000, 2000, [
    S('a', 100, 100, 300, 300, [N('big', 100, 100, 600, 100)]), // grows to 800 wide
    S('b', 700, 100, 300, 300, [N('x', 100, 100, 100, 100)]), // 300 right of a
    S('c', 100, 650, 300, 300, [N('y', 150, 150, 50, 50)]), // shrinks to 250 tall, 250 below a
    N('note', 100, 1200, 400, 20), // 250 below c
    S('ex', 100, 1300, 300, 200, [N('z', 100, 100, 100, 100)], 'none'), // transparent note, 80 below the text
  ], 'white')
  const { tree } = organize(make(), 'basic')
  const [a, b, c, note, ex] = tree.children.map((k) => k.rect)
  assert.equal(a.w, 800)
  assert.equal(b.x - right(a), GAP, 'b moves to 100 right of a')
  assert.equal(c.y - bottom(a), GAP, 'c moves to 100 below a')
  assert.equal(note.y - bottom(c), 250, 'content keeps its own gap')
  assert.equal(ex.y - bottom(note), 80, 'notes keep their gap to content')
  checkTidy(tree, true)
  idempotent(make, 'basic')
})

test('basic: closing gaps never makes diagonal neighbours overlap', () => {
  const make = () => S('root', 0, 0, 3000, 3000, [
    S('top-left', 100, 100, 400, 300, [N('n', 100, 100, 200, 100)]),
    S('bottom-right', 900, 600, 400, 300, [N('n', 100, 100, 200, 100)]), // diagonal: no shared row or column
    S('left', 100, 500, 300, 900, [N('n', 100, 100, 100, 700)]), // pulls bottom-right left
  ], 'white')
  const { tree } = organize(make(), 'basic')
  checkTidy(tree, true)
  idempotent(make, 'basic')
})

test('page layout: screens | sub pages, building-block row 1000px below', () => {
  const { tree } = organize(messyPage(), 'page')
  checkTidy(tree, false)
  idempotent(messyPage, 'page')

  const [bbRow, page1, page2] = tree.children.map((c) => c)
  assert.equal(page1.rect.x, PAD)
  assert.equal(page1.rect.y, PAD)
  assert.equal(page2.rect.x, right(page1.rect) + GAP)
  assert.equal(page2.rect.y, PAD)
  assert.equal(page1.rect.h, page2.rect.h, 'pages in a row share a height')
  assert.equal(bbRow.rect.y, bottom(page1.rect) + PAGE_BAND)
  assert.equal(bbRow.rect.x, PAD)
  assert.equal(bbRow.rect.w, tree.rect.w - 2 * PAD, 'single building-block row spans the width')
  const bbs = bbRow.children.map((c) => c.rect)
  assert.ok(bbs.every((r) => r.y === PAD && r.h === bbs[0].h))
  assert.equal(bbs[1].x, right(bbs[0]) + GAP)

  // Inside "page": screens top left, sub page to their right, '' row below.
  const [s1, s2, note1, note2, bbs1, sub] = page1.children
  assert.deepEqual([s1.rect.x, s1.rect.y], [PAD, PAD], 'screen block starts at the padding')
  assert.equal(s2.rect.x - s1.rect.x, 490, 'screens keep their relative position')
  assert.equal(s2.rect.y - s1.rect.y, 20)
  // Transparent sections are notes: they move with the screens and wrap their own content.
  assert.equal(note2.rect.x - s1.rect.x, 1200 - 150 + 0, 'note keeps its place next to the screens')
  assert.equal(note2.rect.y - s1.rect.y, 0)
  assert.equal(note1.rect.y - s1.rect.y, 1300 - 300 + 200, 'note frame moves to wrap its content (content stays)')
  assert.deepEqual([note1.rect.w, note1.rect.h], [400, 300])
  assert.equal(note1.tone, 'none')
  assert.equal(sub.rect.x, right(note2.rect) + PAGE_BAND)
  assert.equal(sub.rect.y, PAD)
  assert.equal(bbs1.rect.y, Math.max(bottom(note1.rect), bottom(sub.rect)) + PAGE_BAND)

  // Sub-sub pages (one has a screen, one is empty) line up and share a height.
  const subs = sub.children.filter((c) => c.name === 'sub-sub page')
  assert.equal(subs[0].rect.y, subs[1].rect.y)
  assert.equal(subs[0].rect.h, subs[1].rect.h)
  // Building-block named container inside a sub-sub page goes below its screen.
  const inner = find(subs[0], 'building-block')
  assert.equal(inner.rect.y, PAD + 844 + PAGE_BAND)
})

test('component layout: patterns above, template middle, skeleton below', () => {
  const { tree } = organize(componentA(), 'component')
  checkTidy(tree, false)
  idempotent(componentA, 'component')

  const [group, composite] = tree.children
  assert.equal(composite.rect.x, right(group.rect) + GAP, 'groups side by side')
  assert.equal(composite.rect.y, group.rect.y)
  assert.equal(composite.rect.h, 447 + 2 * PAD, 'groups wrap their content, no shared height')

  const skel = find(group, 'building-block')
  const a1 = find(group, 'template-component-A1')
  const a2 = find(group, 'template-component-A2')
  assert.equal(a1.rect.y, PAD)
  assert.equal(a2.rect.x, right(a1.rect) + GAP)
  assert.equal(a2.rect.h, 1508, 'empty template keeps its size')
  assert.notEqual(a1.rect.h, a2.rect.h, 'templates wrap their content, no shared height')
  assert.equal(skel.rect.y, Math.max(bottom(a1.rect), bottom(a2.rect)) + COMP_BAND, 'skeleton section under the templates')
  assert.equal(skel.rect.w, group.rect.w - 2 * PAD, 'skeleton section spans the group')

  // Template A1: both pattern sections on top (one is named "pattern…" but holds a template-named component).
  const [p1, p2, comp] = a1.children
  assert.deepEqual([p1.rect.y, p2.rect.y], [PAD, PAD])
  assert.equal(a1.rect.h, bottom(comp.rect) + PAD, 'template wraps patterns + component')
  assert.equal(p2.rect.x, right(p1.rect) + GAP)
  assert.equal(comp.rect.y, bottom(p1.rect) + COMP_BAND)
  assert.equal(comp.rect.x, PAD)

  // Skeleton section: skeleton component on top, its building blocks in a row below.
  // Nothing sits beside them to share them, so none of them stretch.
  const [b1, b2, sk] = skel.children
  assert.deepEqual([sk.rect.x, sk.rect.y], [PAD, PAD])
  assert.equal(b1.rect.y, bottom(sk.rect) + COMP_BAND)
  assert.equal(b2.rect.y, b1.rect.y)
  assert.equal(b2.rect.x, right(b1.rect) + GAP)
  assert.deepEqual([b1.rect.w, b2.rect.w], [106 + 2 * PAD, 106 + 2 * PAD], 'building blocks wrap their content')
})

test('component layout: only a skeleton shared by templates above spans the width', () => {
  // Map Overlay: group with templates + skeleton section; the skeleton section has
  // one building-block section of its own, and a template has one too.
  const make = () => S('map-overlay', 0, 0, 20000, 5000, [
    S('', 2109, 100, 7853, 4270, [
      S('marker-set-point', 3501, 100, 1287, 2182, [
        C('marker-set-point', 261, 2016, 70, 67),
        S('building-block', 101, 100, 600, 500, [C('.marker-tail', 200, 200, 50, 50)], 'dark'),
      ]),
      S('marker-reference', 4888, 99, 2865, 1569, [C('marker-reference', 271, 1317, 210, 152)]),
      S('building-block', 100, 2721, 7653, 1449, [
        C('.skeleton/marker-general', 309, 405, 450, 463),
        S('building-block', 167, 946, 592, 403, [C('.skeleton/stop-direction-arrow', 280, 271, 36, 36)], 'dark'),
      ]),
    ], 'white'),
  ], 'none')
  const { tree } = organize(make(), 'component')
  checkTidy(tree, false)
  idempotent(make, 'component')
  const group = tree.children[0]
  const [setPoint, , skel] = group.children
  assert.equal(skel.rect.w, group.rect.w - 2 * PAD, 'shared skeleton spans the templates')
  const inner = skel.children[1]
  assert.equal(inner.rect.w, 36 + 2 * PAD, "skeleton's own building block wraps")
  const own = setPoint.children[1]
  assert.equal(own.rect.w, 50 + 2 * PAD, "a template's own building block wraps")
})

test('component layout: transparent example sections are notes that move with the set', () => {
  const { tree, tones } = organize(buttonPage(), 'component')
  checkTidy(tree, false)
  idempotent(buttonPage, 'component')
  const prim = find(tree, 'btn-primary')
  const [set, b1, b2, platter, ex1, ex2] = prim.children
  const src = find(buttonPage(), 'btn-primary').children
  for (const [n, o] of [[b1, src[1]], [b2, src[2]], [platter, src[3]], [ex1, src[4]], [ex2, src[5]]]) {
    assert.equal(n.rect.x - set.rect.x, o.rect.x - src[0].rect.x, `${n.name} stays next to the set`)
    assert.equal(n.rect.y - set.rect.y, o.rect.y - src[0].rect.y)
  }
  assert.equal(ex1.tone, 'none')
  assert.equal(ex2.tone, 'none')
  assert.ok(!tones.some((t) => t.id === ex1.id || t.id === ex2.id), 'notes are never recolored')
  const ghost = find(tree, 'btn-ghost')
  assert.equal(ghost.rect.y, prim.rect.y)
  assert.notEqual(ghost.rect.h, prim.rect.h, 'templates wrap their content')
  const group = tree.children[0]
  const skel = find(group, 'building-block')
  assert.equal(skel.rect.w, group.rect.w - 2 * PAD)
})

test('roles by name (fallback when usage says nothing)', () => {
  const r = (name, comps, mode = 'component', parent = false) =>
    byName({ name, comps, section: true, rect: { x: 0, y: 0, w: 1, h: 1 } }, mode, parent)
  assert.equal(r('', [], 'page'), 'below')
  assert.equal(r(' ', [], 'page'), 'below')
  assert.equal(r('Building Block', [], 'page'), 'below')
  assert.equal(r('settings', [], 'page'), 'main')
  assert.equal(r('top-bar', ['.skeleton/top-bar']), 'below')
  assert.equal(r('go back', ['.btn-ghost/pattern-go-back']), 'above')
  assert.equal(r('x', ['.pattern-scrim']), 'above')
  assert.equal(r('btn-ghost', ['btn-ghost']), 'main')
  assert.equal(r('btn-ghost', ['btn-ghost'], 'component', true), 'stack')
})

// Usage before names. Section names here say nothing on purpose; the
// structure is Map Overlay's (Rider-App), where every case below was checked.
test('roles by usage: skeleton, its building block and patterns, whatever their names', () => {
  const group = S('', 100, 100, 6000, 4000, [
    S('marker-set-point', 100, 100, 1200, 1500, [
      D('marker-set-point', 'tpl1', ['skel']),
      S('from-to', 100, 600, 800, 500, [D('marker-set-point/from-to', 'pat1', ['tpl1'])], 'dark'),
    ]),
    S('marker-reference', 1400, 100, 1200, 1500, [D('marker-reference', 'tpl2', ['skel'])]),
    S('shared shapes', 100, 2000, 3000, 1400, [
      D('.skeleton/marker-general', 'skel', ['arrow']),
      S('arrows', 100, 600, 600, 400, [D('.skeleton/stop-direction-arrow', 'arrow')], 'dark'),
    ]),
  ], 'white')
  const at = (name) => find(group, name)
  assert.equal(role(at('shared shapes'), 'component', group), 'below', 'used by the templates beside it')
  assert.equal(role(at('marker-set-point'), 'component', group), 'main', 'uses the skeleton, used by nobody beside it')
  assert.equal(role(at('from-to'), 'component', at('marker-set-point')), 'above', 'uses its parent template')
  assert.equal(role(at('arrows'), 'component', at('shared shapes')), 'below', 'used by the skeleton')

  const make = () => S('map-overlay', 0, 0, 9000, 6000, [JSON.parse(JSON.stringify(group))], 'none')
  const { tree } = organize(make(), 'component')
  idempotent(make, 'component')
  const g = tree.children[0]
  const skel = find(g, 'shared shapes')
  assert.equal(skel.rect.y, Math.max(...['marker-set-point', 'marker-reference'].map((n) => bottom(find(g, n).rect))) + COMP_BAND)
  assert.equal(skel.rect.w, g.rect.w - 2 * PAD, 'shared skeleton spans the templates')
})

test('roles by usage: a used template is not a building block', () => {
  // Button: btn-layout (composite template) uses btn-primary from the group beside it.
  const root = S('button', 0, 0, 9000, 6000, [
    S('', 100, 100, 3000, 2000, [S('btn-primary', 100, 100, 1000, 800, [D('btn-primary', 'bp')])], 'white'),
    S(' ', 3200, 100, 1500, 900, [S('btn-layout', 100, 100, 1000, 600, [D('btn-layout', 'bl', ['bp'])])], 'white'),
  ], 'none')
  assert.equal(role(root.children[0], 'component', root), 'main', 'used, but btn-primary has no "." → not below')
  // pattern-connector-line: the used component lacks the "." → the name decides.
  const tpl = S('pattern-connector-line', 0, 0, 2000, 1000, [
    D('pattern-connector-line', 'pcl', ['dot']),
    S('building-block', 100, 500, 600, 300, [D('pin-stop-connector-line-dot', 'dot')], 'dark'),
    S('dots', 800, 500, 600, 300, [D('pin-dot', 'dot2')], 'dark'),
  ])
  tpl.comps = ['pattern-connector-line']
  assert.equal(role(tpl.children[1], 'component', tpl), 'below', 'named building-block')
  assert.equal(role(tpl.children[2], 'component', tpl), 'stack', 'unused, no name hint')
})

test('roles by usage: examples do not count in the component layout, screens do in the page layout', () => {
  const tpl = S('btn-ghost', 0, 0, 3000, 2000, [
    D('btn-ghost', 'bg'),
    F('usage example', ['icons']), // a frame, not a component definition
    S('icon set', 100, 1000, 600, 300, [D('icon-set', 'icons')], 'dark'),
  ])
  tpl.comps = ['btn-ghost']
  assert.equal(role(tpl.children[2], 'component', tpl), 'stack')
  const page = S('settings', 0, 0, 9000, 6000, [
    F('settings screen', ['row']),
    S('widgets', 600, 100, 1000, 600, [D('settings-row', 'row')], 'dark'),
    S('notifications', 1800, 100, 3000, 2000, [F('notifications screen', ['row'])], 'dark'),
  ], 'light')
  assert.equal(role(page.children[1], 'page', page), 'below', 'used by the screens → building block')
  assert.equal(role(page.children[2], 'page', page), 'main', 'sub page')
})

test('roles by usage: a building block used two levels up still goes below', () => {
  // pattern-transit-route-path > building-block > "" holding .pattern-direction-triangle,
  // which the template two levels up uses. Its components all say "pattern".
  const tpl = S('pattern-transit-route-path', 0, 0, 2000, 1500, [
    D('pattern-transit-route-path', 'route', ['tri']),
    S('building-block', 100, 600, 600, 500, [
      D('.address-anchor', 'anchor', [], 100, 100, 200, 10),
      S('', 150, 200, 106, 107, [D('.pattern-direction-triangle', 'tri', [], 50, 50, 4, 5)], 'other'),
    ], 'dark'),
  ])
  tpl.comps = ['pattern-transit-route-path']
  const bb = tpl.children[1]
  bb.comps = ['.address-anchor']
  assert.equal(byName(bb.children[1], 'component', true), 'above', 'the name alone would put it on top')
  assert.equal(role(bb.children[1], 'component', bb, tpl), 'below', 'used by the template above → below')
  const make = () => S('root', 0, 0, 3000, 2000, [JSON.parse(JSON.stringify(tpl))], 'white')
  const { tree } = organize(make(), 'component')
  const inner = find(tree, 'building-block')
  const [anchor, tri] = inner.children
  assert.equal(tri.rect.y, bottom(anchor.rect) + COMP_BAND)
  idempotent(make, 'component')
})
