// Change Marker — plugin sandbox.
//
// Markers are Figma comments, not layers: a comment can't be dragged into a
// frame or slot, and developers can see it in Dev Mode.
//
// Comments can only be created/deleted through the REST API, which the sandbox
// can't reach (no fetch), so the UI iframe makes all network calls. This file is
// the thin service around it:
//   - stores entries in figma.root plugin data (per file, travels with the file)
//   - stores the personal access token in figma.clientStorage (per user)
//   - works out where a new comment should be pinned (centre of the view)
//   - moves the view to a comment's pin
//
// Expiry: plugins don't run in the background, so expired entries are swept
// when the plugin opens (and on the manual Refresh button).

const STORE_KEY = 'entries';
const FILE_KEY = 'fileKey';
const TOKEN_KEY = 'token';
const LANG_KEY = 'lang';

// The few strings the sandbox shows itself. The UI has its own table (i18n.js).
const L = {
  en: {
    noPosition: 'This comment has no position',
    gone: 'The layer this comment was pinned to no longer exists',
    moved: 'Moved to the comment — press C to show comment pins',
  },
  ko: {
    noPosition: '이 코멘트에는 위치 정보가 없습니다',
    gone: '이 코멘트가 고정된 layer가 더 이상 없습니다',
    moved: '코멘트 위치로 이동했습니다 — C를 누르면 코멘트 핀이 표시됩니다',
  },
};

let lang = 'ko';
const t = (key, ...vars) => {
  const value = (L[lang] || L.en)[key];
  return typeof value === 'function' ? value(...vars) : value;
};
// A comment pins to a frame + offset; these are the types that count as one.
const FRAMEISH = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

figma.showUI(__html__, { width: 340, height: 560, themeColors: true });

// ---------------------------------------------------------------- storage --

function loadEntries() {
  try {
    const raw = figma.root.getPluginData(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function pad2(n) { return String(n).padStart(2, '0'); }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// --------------------------------------------------------------- geometry --

function pageOf(node) {
  let p = node;
  while (p && p.type !== 'PAGE') p = p.parent;
  return p;
}

// Topmost frame under an absolute point, searching sections too. Outer frames
// only: pinning to the artboard rather than a small nested frame keeps the
// comment where the designer sees it.
function frameAt(parent, x, y) {
  const kids = parent.children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i];
    if (!k.visible) continue;
    if (k.type === 'SECTION') {
      const found = frameAt(k, x, y);
      if (found) return found;
      continue;
    }
    if (!FRAMEISH.has(k.type)) continue;
    const b = k.absoluteBoundingBox;
    if (b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return k;
  }
  return null;
}

// Where the next comment goes: a pin at the centre of the current view.
// Pinned to the frame under that point when there is one, so the comment
// travels with the frame and lands on the right page; otherwise bare canvas
// coordinates. Never a region, and never tied to the selection.
function resolvePlacement() {
  const c = figma.viewport.center;
  // The REST API rejects fractional coordinates ("'x' must be a valid number,
  // received type Float"), and viewport centres are nearly always fractional.
  const round = (v) => Math.round(v);
  const frame = frameAt(figma.currentPage, c.x, c.y);
  if (frame) {
    const tf = frame.absoluteTransform;
    return {
      ok: true,
      clientMeta: { node_id: frame.id, node_offset: { x: round(c.x - tf[0][2]), y: round(c.y - tf[1][2]) } },
      target: frame.name,
      page: figma.currentPage.name,
    };
  }
  return {
    ok: true,
    clientMeta: { x: round(c.x), y: round(c.y) },
    target: 'Canvas',
    page: figma.currentPage.name,
  };
}

// --------------------------------------------------------------- messages --

const handlers = {
  async init() {
    const token = (await figma.clientStorage.getAsync(TOKEN_KEY)) || '';
    lang = (await figma.clientStorage.getAsync(LANG_KEY)) || 'ko';
    figma.ui.postMessage({
      type: 'init',
      entries: loadEntries(),
      token,
      // figma.fileKey needs "enablePrivatePluginApi" in the manifest; if it's
      // unavailable the UI asks for the file link once and stores it here.
      fileKey: figma.fileKey || figma.root.getPluginData(FILE_KEY) || '',
      today: today(),
      lang,
    });
  },

  // Asked for right before posting, so the pin lands where the view is now.
  async placementNow({ rid }) {
    figma.ui.postMessage({ type: 'placementNow', rid, placement: resolvePlacement() });
  },

  // The UI owns the entry list; the sandbox just persists it with the file.
  async save({ entries }) {
    figma.root.setPluginData(STORE_KEY, JSON.stringify(entries));
  },

  async setLang({ lang: next }) {
    lang = next === 'en' ? 'en' : 'ko';
    await figma.clientStorage.setAsync(LANG_KEY, lang);
  },

  async saveToken({ token }) {
    await figma.clientStorage.setAsync(TOKEN_KEY, token);
  },

  async saveFileKey({ fileKey }) {
    figma.root.setPluginData(FILE_KEY, fileKey);
  },

  async notify({ text, error }) {
    figma.notify(text, { error: !!error });
  },

  // Move the view to where the comment pin actually is. client_meta is
  // refreshed from the API on every sync, so this follows a pin that was
  // dragged somewhere else in Figma.
  async goto({ clientMeta }) {
    if (!clientMeta) return figma.notify(t('noPosition'));
    let x = clientMeta.x;
    let y = clientMeta.y;
    if (clientMeta.node_id) {
      let node = null;
      try {
        node = await figma.getNodeByIdAsync(clientMeta.node_id);
      } catch (err) {
        node = null;
      }
      if (!node || node.removed) return figma.notify(t('gone'));
      const page = pageOf(node);
      if (page && page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
      // A pin dragged onto empty canvas can come back anchored to a node with
      // no transform of its own (a page), where the offset is already absolute.
      const tf = node.absoluteTransform;
      const off = clientMeta.node_offset || { x: 0, y: 0 };
      x = (tf ? tf[0][2] : 0) + (off.x || 0);
      y = (tf ? tf[1][2] : 0) + (off.y || 0);
    }
    if (typeof x !== 'number' || typeof y !== 'number') return figma.notify(t('noPosition'));
    figma.viewport.center = { x, y };
    if (figma.viewport.zoom < 0.5) figma.viewport.zoom = 0.75;
    figma.notify(t('moved'));
  },
};

figma.ui.onmessage = async (msg) => {
  try {
    await handlers[msg.type](msg);
  } catch (err) {
    console.error(err);
    figma.notify(String(err && err.message ? err.message : err), { error: true });
  }
};
