// Organize Sections — tidies the selected section and every section nested in
// it. Three commands, run from the panel:
//
//   basic      wrap content with even padding, keep the arrangement
//   page       screens | sub pages, building-block row underneath
//   component  patterns above, template in the middle, skeleton / building-blocks below
//
// All three also alternate section backgrounds (transparent → white → light
// gray → dark gray → light gray …). Positions are computed in layout.ts and
// written by apply.ts; this file handles the panel, selection and messages.

import { Mode } from './layout'
import { organizeSections } from './apply'

const LANG_KEY = 'lang'
const WIDTH = 320

type Lang = 'ko' | 'en'
let lang: Lang = 'ko'

// ---------------------------------------------------------------------------
// Selection

// Selected sections, minus those already inside another selected section.
function pickRoots(): SectionNode[] {
  const secs = figma.currentPage.selection.filter((n): n is SectionNode => n.type === 'SECTION')
  const ids = new Set(secs.map((s) => s.id))
  return secs.filter((s) => {
    for (let p = s.parent; p && p.type !== 'PAGE'; p = p.parent) if (ids.has(p.id)) return false
    return true
  })
}

function postState() {
  const roots = pickRoots()
  figma.ui.postMessage({
    type: 'state',
    lang,
    count: roots.length,
    name: roots.length === 1 ? roots[0].name : '',
    other: figma.currentPage.selection.length > 0 && !roots.length,
  })
}

// ---------------------------------------------------------------------------

async function run(mode: Mode) {
  const roots = pickRoots()
  if (!roots.length) {
    figma.ui.postMessage({ type: 'result', ok: false, code: 'noSection' })
    return
  }
  const sum = await organizeSections(roots, mode)
  figma.commitUndo()
  figma.ui.postMessage({ type: 'result', ok: true, mode, roots: roots.length, ...sum })
}

async function onMessage(msg: { type: string; lang?: Lang; height?: number; mode?: Mode }) {
  switch (msg.type) {
    case 'lang':
      if (msg.lang === 'ko' || msg.lang === 'en') {
        lang = msg.lang
        await figma.clientStorage.setAsync(LANG_KEY, lang)
      }
      break
    case 'resize':
      if (msg.height) figma.ui.resize(WIDTH, Math.min(640, Math.max(160, msg.height)))
      break
    case 'run':
      if (msg.mode === 'basic' || msg.mode === 'page' || msg.mode === 'component') await run(msg.mode)
      break
  }
}

async function main() {
  const saved = await figma.clientStorage.getAsync(LANG_KEY)
  if (saved === 'ko' || saved === 'en') lang = saved
  figma.showUI(__html__, { width: WIDTH, height: 420, themeColors: true })
  figma.ui.onmessage = (msg) =>
    onMessage(msg).catch((e) => {
      console.error('[organize-sections]', e)
      figma.ui.postMessage({ type: 'result', ok: false, code: 'failed', detail: e instanceof Error ? e.message : String(e) })
    })
  figma.on('selectionchange', postState)
  figma.on('currentpagechange', postState)
  postState()
}

main()
