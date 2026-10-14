// Change Marker — widget.
//
// Every node of this widget is either:
//   - a launcher (no synced state yet): a small "Change Marker" button you insert
//     from the widgets menu. Clicking it opens the manager.
//   - a marker (synced state `m`): a colored badge showing who placed it and when.
//
// Plugins can't insert widgets, so markers are made by cloning an existing node
// of this widget (the first "Add marker" turns the launcher itself into a marker).
// Widgets don't nest into frames when dragged, which is why markers are widgets
// rather than rectangles.
//
// Storage:
//   - Entries live in figma.root plugin data (key "entries"): scoped to this file.
//   - Each marker's synced state holds its entry id plus a copy of the entry's
//     color/label (so the badge can render on its own) and who placed it, when.
//     The canvas is the source of truth: entry.markerIds is rebuilt on each scan.
//
// Expiry: widget code only runs on interaction, never in the background, so
// expired entries are swept whenever the manager opens (and on Refresh).

const { widget } = figma;
const { h, AutoLayout, Text, useSyncedState, usePropertyMenu, useWidgetNodeId } = widget;

const STORE_KEY = 'entries';
const ALLOWED_PARENTS = new Set(['PAGE', 'SECTION']);
const BADGE_HEIGHT = 24;
const GAP = 4;              // gap between a badge and the layer it points at
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ------------------------------------------------------------------ badge --

// Dark text on light colors (yellow), white text on the rest.
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1A1A1A' : '#FFFFFF';
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 1) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Badge(m) {
  const fg = textOn(m.color);
  const dim = fg === '#FFFFFF' ? { r: 1, g: 1, b: 1, a: 0.25 } : { r: 0, g: 0, b: 0, a: 0.12 };
  return h(AutoLayout, {
      name: 'badge',
      height: BADGE_HEIGHT,
      fill: m.color,
      stroke: { r: 1, g: 1, b: 1, a: 0.9 },
      strokeWidth: 1.5,
      cornerRadius: BADGE_HEIGHT / 2,
      padding: { left: 3, right: 9 },
      spacing: 5,
      verticalAlignItems: 'center',
      effect: { type: 'drop-shadow', color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 1 }, blur: 3 },
    },
    h(AutoLayout, {
        width: 18, height: 18, cornerRadius: 9, fill: dim,
        horizontalAlignItems: 'center', verticalAlignItems: 'center',
      },
      h(Text, { fontSize: 8, fontWeight: 700, fill: fg }, initials(m.author))),
    h(Text, { fontSize: 11, fontWeight: 600, fill: fg }, `${m.author} · ${m.dateLabel}`));
}

function Launcher(onClick) {
  return h(AutoLayout, {
      name: 'launcher',
      fill: '#FFFFFF',
      stroke: '#E6E6E6',
      cornerRadius: 8,
      padding: { vertical: 7, horizontal: 10 },
      spacing: 6,
      verticalAlignItems: 'center',
      hoverStyle: { fill: '#F5F5F5' },
      effect: { type: 'drop-shadow', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 1 }, blur: 3 },
      onClick,
    },
    h(Text, { fontSize: 12, fontWeight: 600, fill: '#1A1A1A' }, 'Change Marker'),
    h(Text, { fontSize: 11, fill: '#888888' }, 'Click to open'));
}

function ChangeMarker() {
  const [m] = useSyncedState('m', null);
  const nodeId = useWidgetNodeId();
  const open = () => openManager(nodeId, m ? m.entryId : null);
  usePropertyMenu([{ itemType: 'action', propertyName: 'open', tooltip: 'Open Change Marker' }], open);
  return m ? Badge(m) : Launcher(open);
}


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

const markerState = (node) => node.widgetSyncedState.m || null;

function isOurWidget(node) {
  return !node.removed && node.type === 'WIDGET' && node.widgetId === figma.widgetId;
}

function isMarker(node) {
  return isOurWidget(node) && !!markerState(node);
}

function setMarkerState(node, m) {
  node.setWidgetSyncedState({ m });
  node.name = `Change · ${m.label}`;
}

// All markers in the document.
async function findAllMarkers() {
  await figma.loadAllPagesAsync();
  return figma.root.findAllWithCriteria({ types: ['WIDGET'] }).filter(isMarker);
}

async function findMarkers(entryId) {
  return (await findAllMarkers()).filter((n) => markerState(n).entryId === entryId);
}

// Rectangles from the plugin's pre-widget version. Reported as leftovers.
function findLegacyRects() {
  return figma.root
    .findAllWithCriteria({ types: ['RECTANGLE'], pluginData: { keys: ['entryId'] } })
    .filter((n) => n.getPluginData('entryId'));
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

// Widgets don't nest when dragged on the canvas, but they can still be moved
// into a frame from the Layers panel. Lift them back out, same visual spot.
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

// Where "Add marker" puts the next badge (its top-left corner), plus a
// human description of it. Markers themselves are ignored as a selection.
function resolvePlacement() {
  const page = figma.currentPage;
  const sel = page.selection.filter((n) => !isOurWidget(n));

  if (sel.length === 1 && sel[0].type === 'SECTION') {
    const s = sel[0];
    const b = s.absoluteBoundingBox;
    return { parent: s, x: b.x + b.width / 2, y: b.y + b.height / 2, desc: `Center of section “${s.name}”`, subject: '' };
  }

  const box = sel.length ? unionBox(sel) : null;
  if (box) {
    const parent = containersOf(sel[0]).find((c) => sel.every((n) => isAncestor(c, n))) || page;
    const noun = sel.length === 1 ? `“${sel[0].name}”` : `${sel.length} selected layers`;
    return {
      parent,
      x: box.x,
      y: box.y - BADGE_HEIGHT - GAP,
      desc: `Above ${noun}${inSection(parent)}`,
      subject: sel.length === 1 ? sel[0].name : `${sel.length} layers`,
    };
  }

  const c = figma.viewport.center;
  const parent = sectionAt(page, c.x, c.y) || page;
  return { parent, x: c.x, y: c.y, desc: `Center of viewport${inSection(parent)}`, subject: '' };
}

function dateLabel(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// Any live node of this widget to clone new markers from. Prefers the node the
// manager was opened from; falls back to any marker if that one was deleted.
async function cloneSource() {
  const own = session.sourceId && (await figma.getNodeByIdAsync(session.sourceId));
  if (own && isOurWidget(own)) return own;
  return (await findAllMarkers())[0] || null;
}

async function createMarker(entry) {
  const source = await cloneSource();
  if (!source) {
    figma.notify('Insert the Change Marker widget again to add markers', { error: true });
    return null;
  }
  const { parent, x, y, subject } = resolvePlacement();
  const now = new Date();
  const user = figma.currentUser;
  const m = {
    entryId: entry.id,
    color: entry.color,
    label: entry.label,
    author: (user && user.name) || 'Unknown',
    placedAt: now.toISOString(),
    dateLabel: dateLabel(now),
    target: subject,
  };
  // The launcher becomes the first marker instead of staying on the canvas.
  let node;
  if (!markerState(source)) {
    node = source;
    setMarkerState(node, m);
  } else {
    node = source.cloneWidget({ m });
    node.name = `Change · ${m.label}`;
  }
  parent.appendChild(node); // appended last = floats above siblings
  const p = toLocal(parent, x, y);
  node.x = p.x;
  node.y = p.y;
  return node;
}

// ------------------------------------------------------------------ sweep --

let session = { sourceId: null, focusEntryId: null };
let orphanIds = [];
let markerLog = [];   // info about every live marker, for the UI's log

function markerInfo(node) {
  const m = markerState(node);
  const page = pageOf(node);
  const section = containersOf(node).find((c) => c.type === 'SECTION');
  return {
    id: node.id,
    entryId: m.entryId,
    page: page.name,
    section: section ? section.name : null,
    target: m.target,
    author: m.author,
    createdAt: m.placedAt,
  };
}

// Rebuild entry.markerIds from the canvas. With `expire`, also delete expired
// entries + their markers and lift misplaced markers out of working layers.
async function sweep({ expire }) {
  const t = today();
  let entries = loadEntries();
  const markers = await findAllMarkers();
  const byEntry = new Map(entries.map((e) => [e.id, []]));
  const orphans = findLegacyRects();
  for (const n of markers) {
    const list = byEntry.get(markerState(n).entryId);
    if (list) list.push(n);
    else orphans.push(n);
  }

  const result = { expired: 0, removed: 0, relocated: 0 };
  if (expire) {
    for (const e of entries) {
      if (!isExpired(e, t)) continue;
      result.expired++;
      for (const n of byEntry.get(e.id)) { n.remove(); result.removed++; }
    }
    entries = entries.filter((e) => !isExpired(e, t));
    for (const e of entries) for (const n of byEntry.get(e.id)) if (relocateIfNeeded(n)) result.relocated++;
  }

  for (const e of entries) e.markerIds = byEntry.get(e.id).map((n) => n.id);
  saveEntries(entries);
  orphanIds = orphans.map((n) => n.id);
  markerLog = entries.flatMap((e) => byEntry.get(e.id).map(markerInfo));
  return result;
}

function selectedEntryId() {
  const entries = loadEntries();
  for (const n of figma.currentPage.selection) {
    const m = isMarker(n) && markerState(n);
    if (m && entries.some((e) => e.id === m.entryId)) return m.entryId;
  }
  return null;
}

function postTarget() {
  figma.ui.postMessage({
    type: 'target',
    target: resolvePlacement().desc,
    selectedEntryId: selectedEntryId(),
    selectedMarkerIds: figma.currentPage.selection.filter(isMarker).map((n) => n.id),
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

async function refreshState() {
  await sweep({ expire: false });
  postState();
}

function notifySweep(r) {
  const parts = [];
  if (r.expired) parts.push(`${r.expired} expired ${r.expired === 1 ? 'entry' : 'entries'} cleared (${r.removed} marker${r.removed === 1 ? '' : 's'})`);
  if (r.relocated) parts.push(`${r.relocated} marker${r.relocated === 1 ? '' : 's'} moved out of frames`);
  if (parts.length) figma.notify(parts.join(' · '));
}

// While the manager is open: lift markers moved into a frame (via the Layers
// panel) back out, and keep the log + counts live. Waits until the marker has
// been still for a moment so it never fights an in-progress drag.
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
    const focus = loadEntries().some((e) => e.id === session.focusEntryId) ? session.focusEntryId : null;
    figma.ui.postMessage({ type: 'boot', openEntryId: focus });
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
    if (restyle) for (const n of await findMarkers(id)) setMarkerState(n, { ...markerState(n), color, label });
    figma.commitUndo();
    await refreshState();
  },

  async delete({ id }) {
    for (const n of await findMarkers(id)) n.remove();
    saveEntries(loadEntries().filter((e) => e.id !== id));
    figma.commitUndo();
    await refreshState();
  },

  async addMarker({ id }) {
    const entry = loadEntries().find((e) => e.id === id);
    if (!entry) return;
    if (await createMarker(entry)) {
      figma.commitUndo();
      await refreshState();
    }
  },

  async selectMarkers({ id }) {
    const markers = await findMarkers(id);
    if (!markers.length) return figma.notify('This entry has no markers yet');
    let onPage = markers.filter((n) => pageOf(n).id === figma.currentPage.id);
    if (!onPage.length) {
      const page = pageOf(markers[0]);
      await figma.setCurrentPageAsync(page);
      onPage = markers.filter((n) => pageOf(n).id === page.id);
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

// Opens the manager window. The returned promise keeps the widget's code
// running until the window is closed. If the window is already open (e.g.
// "Open Change Marker" on another badge), it just jumps to that badge's entry.
let managerOpen = false;
let closeWaiters = [];

function openManager(sourceId, focusEntryId) {
  session = { sourceId, focusEntryId };
  if (managerOpen) {
    figma.ui.postMessage({ type: 'boot', openEntryId: focusEntryId });
    return new Promise((resolve) => closeWaiters.push(resolve));
  }
  return new Promise((resolve) => {
    try {
      figma.showUI(__html__, { width: 340, height: 540, themeColors: true, title: 'Change Marker' });
      managerOpen = true;
      closeWaiters.push(resolve);
      figma.ui.onmessage = async (msg) => {
        try {
          await handlers[msg.type](msg);
        } catch (err) {
          console.error(err);
          figma.notify(String(err && err.message ? err.message : err), { error: true });
        }
      };
      figma.on('close', () => {
        managerOpen = false;
        closeWaiters.splice(0).forEach((r) => r());
      });
    } catch (err) {
      console.error(err);
      figma.notify(`Couldn't open Change Marker: ${err && err.message ? err.message : err}`, { error: true });
      resolve();
    }
  });
}

// Registered last on purpose: Figma can run a pending click handler from
// inside register(), so every `let` above must already be initialized.
widget.register(ChangeMarker);
