// Change Marker — plugin sandbox (runs in Figma's main thread).
//
// Storage:
//   - Entries live in figma.root plugin data (key "entries"), so they are
//     scoped to this file and travel with it. figma.clientStorage is per-user
//     and NOT per-file, so it can't back file-specific entries.
//   - Each marker rectangle carries plugin data "entryId" pointing at its entry.
//     The canvas is the source of truth: entry.markerIds is rebuilt from a scan
//     on every sweep, so copy/pasted or manually deleted markers stay in sync.
//
// Expiry: plugins don't run in the background, so expired entries are swept
// when the plugin opens (and on the manual Refresh button).

const STORE_KEY = 'entries';
const MARKER_KEY = 'entryId';
const TARGET_KEY = 'target';       // name of what the marker was placed around
const CREATED_KEY = 'createdAt';   // ISO timestamp
const ALLOWED_PARENTS = new Set(['PAGE', 'SECTION']);
const STROKE_WEIGHT = 2;
const FILL_OPACITY = 0.08;
const PADDING = 8;          // gap between selection bounds and marker border
const VIEWPORT_SIZE = 96;   // on-screen px of a marker placed with nothing selected

figma.showUI(__html__, { width: 340, height: 540, themeColors: true });

// ---------------------------------------------------------------- storage --

function loadEntries() {
  try {
    const raw = figma.root.getPluginData(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveEntries(entries) {
  figma.root.setPluginData(STORE_KEY, JSON.stringify(entries));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// expiresAt is the day the markers disappear ("flag until Oct 1").
function isExpired(entry, t) {
  return entry.expiresAt !== null && entry.expiresAt <= t;
}

function uuid() {
  return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------- markers --

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function styleMarker(rect, entry) {
  const color = hexToRgb(entry.color);
  rect.name = `Change · ${entry.label}`;
  rect.strokes = [{ type: 'SOLID', color }];
  rect.strokeWeight = STROKE_WEIGHT;
  rect.strokeAlign = 'INSIDE';
  rect.fills = [{ type: 'SOLID', color, opacity: FILL_OPACITY }];
  rect.setRelaunchData({ open: `Change marker: ${entry.label}` });
}

// True for read-only copies of a marker that lives inside a main component
// (the copy shown in each instance). Content a designer drops into an
// instance's slot is real, movable content: it sits under a SLOT before any
// INSTANCE, so it doesn't count as a copy.
function isInstanceCopy(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'SLOT') return false;
    if (p.type === 'INSTANCE') return true;
  }
  return false;
}

// All real markers in the document (instance copies skipped).
async function findAllMarkers() {
  await figma.loadAllPagesAsync();
  return figma.root
    .findAllWithCriteria({ types: ['RECTANGLE'], pluginData: { keys: [MARKER_KEY] } })
    .filter((n) => n.getPluginData(MARKER_KEY) && !isInstanceCopy(n));
}

async function findMarkers(entryId) {
  return (await findAllMarkers()).filter((n) => n.getPluginData(MARKER_KEY) === entryId);
}

function pageOf(node) {
  let p = node;
  while (p && p.type !== 'PAGE') p = p.parent;
  return p;
}

function isAncestor(container, node) {
  for (let p = node.parent; p; p = p.parent) if (p.id === container.id) return true;
  return false;
}

// Page/section ancestors of a node, nearest first.
function containersOf(node) {
  const out = [];
  for (let p = node.parent; p; p = p.parent) {
    if (ALLOWED_PARENTS.has(p.type)) out.push(p);
    if (p.type === 'PAGE') break;
  }
  return out;
}

// Absolute canvas coords -> coords relative to a page or section.
// Sections can't be rotated, so a translation is enough.
function toLocal(parent, ax, ay) {
  if (parent.type === 'PAGE') return { x: ax, y: ay };
  const t = parent.absoluteTransform;
  return { x: ax - t[0][2], y: ay - t[1][2] };
}

// Markers must never live inside frames/components/instances. If one got
// dragged into a working layer, lift it to the nearest page/section while
// keeping it where it visually is.
function relocateIfNeeded(marker) {
  if (ALLOWED_PARENTS.has(marker.parent.type)) return false;
  const target = containersOf(marker)[0];
  const ax = marker.absoluteTransform[0][2];
  const ay = marker.absoluteTransform[1][2];
  try {
    target.appendChild(marker);
  } catch (err) {
    console.warn('Could not move marker out of', marker.parent.type, err);
    return false;
  }
  const p = toLocal(target, ax, ay);
  marker.x = p.x;
  marker.y = p.y;
  return true;
}

// Deepest visible section under an absolute point, topmost first.
function sectionAt(parent, x, y) {
  const kids = parent.children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i];
    if (k.type !== 'SECTION' || !k.visible) continue;
    const b = k.absoluteBoundingBox;
    if (b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      return sectionAt(k, x, y) || k;
    }
  }
  return null;
}

function unionBox(nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const b = n.absoluteBoundingBox;
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function inSection(parent) {
  return parent.type === 'SECTION' ? ` in “${parent.name}”` : '';
}

// Where "Add marker" will put the next marker, plus a human description of it.
function resolvePlacement() {
  const page = figma.currentPage;
  const sel = page.selection;
  const zoomSize = Math.max(16, Math.round(VIEWPORT_SIZE / figma.viewport.zoom));

  if (sel.length === 1 && sel[0].type === 'SECTION') {
    const s = sel[0];
    const b = s.absoluteBoundingBox;
    return {
      parent: s,
      rect: { x: b.x + b.width / 2 - zoomSize / 2, y: b.y + b.height / 2 - zoomSize / 2, width: zoomSize, height: zoomSize },
      desc: `Center of section “${s.name}”`,
      subject: '',
    };
  }

  const box = sel.length ? unionBox(sel) : null;
  if (box) {
    const parent = containersOf(sel[0]).find((c) => sel.every((n) => isAncestor(c, n))) || page;
    const noun = sel.length === 1 ? `“${sel[0].name}”` : `${sel.length} selected layers`;
    return {
      parent,
      rect: {
        x: box.x - PADDING, y: box.y - PADDING,
        width: Math.max(16, box.width + PADDING * 2), height: Math.max(16, box.height + PADDING * 2),
      },
      desc: `Around ${noun}${inSection(parent)}`,
      subject: sel.length === 1 ? sel[0].name : `${sel.length} layers`,
    };
  }

  const c = figma.viewport.center;
  const parent = sectionAt(page, c.x, c.y) || page;
  return {
    parent,
    rect: { x: c.x - zoomSize / 2, y: c.y - zoomSize / 2, width: zoomSize, height: zoomSize },
    desc: `Center of viewport${inSection(parent)}`,
    subject: '',
  };
}

function createMarker(entry) {
  const { parent, rect, subject } = resolvePlacement();
  const r = figma.createRectangle();
  r.resize(rect.width, rect.height);
  r.cornerRadius = 4;
  styleMarker(r, entry);
  r.setPluginData(MARKER_KEY, entry.id);
  r.setPluginData(TARGET_KEY, subject);
  r.setPluginData(CREATED_KEY, new Date().toISOString());
  parent.appendChild(r); // appended last = floats above siblings
  const p = toLocal(parent, rect.x, rect.y);
  r.x = p.x;
  r.y = p.y;
  return r;
}

// ------------------------------------------------------------------ sweep --

let orphanIds = [];
let markerLog = [];   // info about every live marker, for the UI's log

function markerInfo(m) {
  const page = pageOf(m);
  const section = containersOf(m).find((c) => c.type === 'SECTION');
  return {
    id: m.id,
    entryId: m.getPluginData(MARKER_KEY),
    page: page.name,
    section: section ? section.name : null,
    target: m.getPluginData(TARGET_KEY),
    createdAt: m.getPluginData(CREATED_KEY),
  };
}

// Rebuild entry.markerIds from the canvas. With `expire`, also delete expired
// entries + their markers and lift misplaced markers out of working layers.
async function sweep({ expire }) {
  const t = today();
  let entries = loadEntries();
  const markers = await findAllMarkers();
  const byEntry = new Map(entries.map((e) => [e.id, []]));
  const orphans = [];
  for (const m of markers) {
    const list = byEntry.get(m.getPluginData(MARKER_KEY));
    if (list) list.push(m);
    else orphans.push(m);
  }

  const result = { expired: 0, removed: 0, relocated: 0 };
  if (expire) {
    for (const e of entries) {
      if (!isExpired(e, t)) continue;
      result.expired++;
      for (const m of byEntry.get(e.id)) { m.remove(); result.removed++; }
    }
    entries = entries.filter((e) => !isExpired(e, t));
    for (const e of entries) for (const m of byEntry.get(e.id)) if (relocateIfNeeded(m)) result.relocated++;
  }

  for (const e of entries) e.markerIds = byEntry.get(e.id).map((m) => m.id);
  saveEntries(entries);
  orphanIds = orphans.map((m) => m.id);
  markerLog = entries.flatMap((e) => byEntry.get(e.id).map(markerInfo));
  return result;
}

function selectedEntryId() {
  const entries = loadEntries();
  for (const n of figma.currentPage.selection) {
    const id = n.getPluginData(MARKER_KEY);
    if (id && entries.some((e) => e.id === id)) return id;
  }
  return null;
}

function postTarget() {
  figma.ui.postMessage({
    type: 'target',
    target: resolvePlacement().desc,
    selectedEntryId: selectedEntryId(),
    selectedMarkerIds: figma.currentPage.selection.filter((n) => n.getPluginData(MARKER_KEY)).map((n) => n.id),
  });
}

function postState() {
  figma.ui.postMessage({
    type: 'state',
    today: today(),
    entries: loadEntries().map((e) => ({ ...e, count: e.markerIds.length })),
    orphans: orphanIds.length,
    markers: markerLog,
  });
  postTarget();
}

function notifySweep(r) {
  const parts = [];
  if (r.expired) parts.push(`${r.expired} expired ${r.expired === 1 ? 'entry' : 'entries'} cleared (${r.removed} marker${r.removed === 1 ? '' : 's'})`);
  if (r.relocated) parts.push(`${r.relocated} marker${r.relocated === 1 ? '' : 's'} moved out of frames`);
  if (parts.length) figma.notify(parts.join(' · '));
}

async function refreshState() {
  await sweep({ expire: false });
  postState();
}

function isMarker(node) {
  return !node.removed && node.type === 'RECTANGLE' && !!node.getPluginData(MARKER_KEY) && !isInstanceCopy(node);
}

// While the plugin is open: snap markers dropped into a frame/group/component
// back out to their page or section, and keep the log + counts live.
// Waits until the marker has been still for a moment so it never fights an
// in-progress drag (Figma reparents live while dragging over a frame).
let touched = new Set();
let settleTimer = null;
function onDocumentChange(event) {
  let relevant = false;
  for (const c of event.documentChanges) {
    if (c.type === 'DELETE') relevant = true;
    if ((c.type === 'CREATE' || c.type === 'PROPERTY_CHANGE') && isMarker(c.node)) {
      relevant = true;
      if (c.origin === 'LOCAL') touched.add(c.node);
    }
  }
  if (!relevant) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(async () => {
    let lifted = 0;
    for (const n of touched) if (isMarker(n) && relocateIfNeeded(n)) lifted++;
    touched = new Set();
    if (lifted) figma.notify('Markers can only sit on the page or in a section, so it was moved back out');
    await refreshState();
  }, 500);
}

// --------------------------------------------------------------- messages --

const handlers = {
  async ready() {
    const r = await sweep({ expire: true });
    notifySweep(r);
    postState();
    figma.ui.postMessage({ type: 'boot', openEntryId: figma.command === 'open' ? selectedEntryId() : null });
    figma.on('documentchange', onDocumentChange);
    figma.on('selectionchange', postTarget);
    figma.on('currentpagechange', postTarget);
  },

  async refresh() {
    const r = await sweep({ expire: true });
    notifySweep(r);
    if (!r.expired && !r.relocated) figma.notify('Everything is up to date');
    postState();
  },

  async create({ label, color, expiresAt }) {
    const entry = { id: uuid(), label, color, createdAt: today(), expiresAt, markerIds: [] };
    saveEntries([...loadEntries(), entry]);
    postState();
    figma.ui.postMessage({ type: 'created', id: entry.id });
  },

  async update({ id, label, color, expiresAt }) {
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const restyle = entry.color !== color || entry.label !== label;
    Object.assign(entry, { label, color, expiresAt });
    saveEntries(entries);
    if (restyle) for (const m of await findMarkers(id)) styleMarker(m, entry);
    figma.commitUndo();
    await refreshState();
  },

  async delete({ id }) {
    for (const m of await findMarkers(id)) m.remove();
    saveEntries(loadEntries().filter((e) => e.id !== id));
    figma.commitUndo();
    await refreshState();
  },

  async addMarker({ id }) {
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    createMarker(entry);
    figma.commitUndo();
    await refreshState();
  },

  async selectMarkers({ id }) {
    const markers = await findMarkers(id);
    if (!markers.length) return figma.notify('This entry has no markers yet');
    let onPage = markers.filter((m) => pageOf(m).id === figma.currentPage.id);
    if (!onPage.length) {
      const page = pageOf(markers[0]);
      await figma.setCurrentPageAsync(page);
      onPage = markers.filter((m) => pageOf(m).id === page.id);
    }
    figma.currentPage.selection = onPage;
    figma.viewport.scrollAndZoomIntoView(onPage);
    const elsewhere = markers.length - onPage.length;
    if (elsewhere) figma.notify(`${elsewhere} more marker${elsewhere === 1 ? '' : 's'} on other pages`);
  },

  // Jump to one marker, switching pages if needed.
  async focusMarker({ id }) {
    const n = await figma.getNodeByIdAsync(id);
    if (!n || n.removed) {
      figma.notify('That marker no longer exists');
      return refreshState();
    }
    const page = pageOf(n);
    if (page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
    figma.currentPage.selection = [n];
    figma.viewport.scrollAndZoomIntoView([n]);
  },

  async removeOrphans() {
    for (const id of orphanIds) {
      const n = await figma.getNodeByIdAsync(id);
      if (n && !n.removed) n.remove();
    }
    figma.commitUndo();
    await refreshState();
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
