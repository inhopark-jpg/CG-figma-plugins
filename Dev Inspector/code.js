/* ============================================================
   Dev Inspector — main thread
   Read-only inspector for Dev Mode. This plugin never mutates the
   document; it only reads node properties, resolves variables/styles,
   changes the selection, and exports images.

   The whole point of the plugin is that the Plugin API exposes things
   Dev Mode's built-in Inspect panel hides (text truncation, grid gap
   tokens, effects further down the tree, component nesting), so most of
   this file is "read the property, resolve its bound variable, hand the
   UI a {label, value, token} row".
   ============================================================ */

var CFG = {
  ICON_FRAME: "icon-frame",   // name that always marks an icon wrapper
  ICON_MAX_PX: 64,            // structural detection: icons are small
  ICON_MAX_NODES: 80,         // ...and simple
  LANGUAGE_COLLECTION: "language", // variable collection whose modes are languages
  MAX_TRANSLATIONS: 200,
  MAX_COLORS: 60,
  MAX_COLOR_NODES: 50,   // layers recorded per colour
  MAX_TREE_DEPTH: 8,
  MAX_TREE_NODES: 300,
  MAX_EFFECT_NODES: 60,
  // A whole icon library page is a legitimate selection, so this is high enough
  // to cover one. It is a guard against a pathological selection building
  // thousands of cards, not a considered ceiling on how many icons you may
  // export — anything cut is now reported rather than silently dropped.
  MAX_ICONS: 500,
  MAX_SEGMENTS: 24,
  MAX_PATH: 8,
  FOCUS_MS: 280,         // camera glide duration when focusing a layer
  THUMB_PX: 144,         // exported thumbnail size; the UI scales it down, so
                         // changing the display size never re-exports
};

figma.showUI(__html__, { width: 460, height: 740, themeColors: true });

var lang = "ko";
// figma.notify strings — the UI has its own dictionaries (T / L / V in ui.html).
var MSG = {
  ko: { notFound: "Layer를 찾을 수 없습니다", cantExport: "이 layer는 내보낼 수 없습니다", exportFailed: "내보내기 실패: " },
  en: { notFound: "Layer not found", cantExport: "This layer can't be exported", exportFailed: "Export failed: " },
};
function M(k) { return (MSG[lang] || MSG.ko)[k]; }
var prefs = null;      // panel preferences (pane heights, thumbnail settings)
var pinnedId = null;   // set while navigating the component tree, cleared by any selection change
var treeRootId = null;    // node the component tree is currently rooted at
var keepAnchorFor = null; // node id allowed to inherit the previous tree root

// Clicking a row in the panel selects that layer on the canvas but must NOT
// re-point the panel: you stay on the component you were reading. selfSelect
// marks the one selectionchange we cause, so it is swallowed; every other
// selectionchange is the user picking on canvas and does re-point the panel.
// inspectedId remembers what the panel is showing, so the pin survives any
// later refresh that would otherwise read the (now different) canvas selection.
var selfSelect = false;
var inspectedId = null;

// Hover preview, used only by the Language table. It borrows the canvas
// selection and puts it back on the way out. hoverActive deliberately does NOT
// try to recognise our own selection by comparing ids — Figma normalises what
// you assign (layers inside instances, for one), so a normalised result would
// look like a genuine user pick, throw away the restore point and leave the
// hovered layer selected for good. While a hover is live the pointer is over
// the panel, not the canvas, so every selectionchange is ours.
var hoverActive = false;
var hoverPrev = null;

function sortedIds(nodes) { return nodes.map(function (n) { return n.id; }).sort(); }
function sameIds(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------------- messaging ---------------- */

figma.on("selectionchange", function () {
  if (hoverActive) return;                        // hover preview traffic
  if (selfSelect) { selfSelect = false; return; } // our own row click — panel stays put
  pinnedId = null;
  push();
});
figma.on("currentpagechange", function () {
  selfSelect = false;
  hoverActive = false;
  hoverPrev = null;
  pinnedId = null;
  push();
});

figma.ui.onmessage = async function (msg) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case "ready": {
      var saved = await figma.clientStorage.getAsync("lang");
      if (saved === "en" || saved === "ko") lang = saved;
      var savedP = await figma.clientStorage.getAsync("prefs");
      if (savedP && typeof savedP === "object") prefs = savedP;
      else {
        // migrate the older heights-only key
        var savedH = await figma.clientStorage.getAsync("panelHeights");
        if (savedH && typeof savedH === "object") prefs = { heights: savedH };
      }
      push();
      break;
    }
    case "refresh":      push(); break;
    case "inspect-node": pinnedId = msg.nodeId; push(); break;
    case "unpin":        pinnedId = null; push(); break;
    case "select-node":  await selectNode(msg.nodeId, !!msg.focus); break;
    case "nav-node":     await navNode(msg.nodeId, !!msg.keepTree, !!msg.focus); break;
    // Both export paths belong to a run the UI opened and will close: it holds
    // the results until "export-done" arrives, then writes one file or one zip.
    // The run id comes from the UI so it can file results without guessing.
    case "export-run":
      for (var ei = 0; ei < (msg.rows || []).length; ei++) {
        await exportWithSettings(msg.nodeId, msg.rows[ei], msg.runId);
      }
      figma.ui.postMessage({ type: "export-done", runId: msg.runId });
      break;
    case "export-batch":
      var items = msg.items || [];
      for (var bi = 0; bi < items.length; bi++) {
        await exportWithSettings(items[bi].nodeId, items[bi].row, msg.runId);
        // Hundreds of exports take real time; without this the button just sits
        // there and the export looks hung.
        figma.ui.postMessage({
          type: "export-progress", runId: msg.runId, done: bi + 1, total: items.length,
        });
      }
      figma.ui.postMessage({ type: "export-done", runId: msg.runId });
      break;
    case "icon-preview": await iconPreview(msg.nodeId); break;
    // One page of cards at a time. Sent as a batch so the exports run in
    // sequence here rather than as N concurrent messages.
    case "icon-previews":
      var ids = msg.nodeIds || [];
      for (var pi = 0; pi < ids.length; pi++) await iconPreview(ids[pi]);
      break;
    case "select-layer": await selectLayer(msg.nodeIds || [msg.nodeId]); break;
    case "hover-layer":  await hoverLayer(msg.nodeId); break;
    case "hover-end":    await hoverEnd(); break;
    case "set-lang":
      lang = msg.lang === "en" ? "en" : "ko";
      figma.clientStorage.setAsync("lang", lang);
      break;
    case "set-prefs":
      prefs = msg.prefs || null;
      figma.clientStorage.setAsync("prefs", prefs);
      break;
    case "thumb": await thumbFor(msg.nodeId, msg.fromId); break;
    case "notify":       figma.notify(String(msg.message || "")); break;
  }
};

async function push() {
  try {
    figma.ui.postMessage(await buildState());
  } catch (e) {
    figma.ui.postMessage({ type: "state", lang: lang, selection: "error", error: String(e && e.message || e) });
  }
}

async function buildState() {
  var base = { type: "state", lang: lang, prefs: prefs };
  var node = null;

  if (pinnedId) {
    node = await figma.getNodeByIdAsync(pinnedId);
    if (!node || node.removed) { pinnedId = null; node = null; }
  }
  if (!node) {
    var sel = figma.currentPage.selection;
    if (sel.length === 0) return Object.assign(base, { selection: "none" });
    if (sel.length > 1)  return Object.assign(base, { selection: "multiple", count: sel.length });
    node = sel[0];
  }

  inspectedId = node.id;
  return Object.assign(base, {
    selection: "node",
    pinned: !!pinnedId,
    node: await inspectNode(node),
  });
}

/* ---------------- small helpers ---------------- */

function isMixed(v) { return v === figma.mixed; }

function num(v) {
  if (v === null || v === undefined) return null;
  if (isMixed(v)) return "Mixed";
  if (typeof v !== "number") return String(v);
  return String(Math.round(v * 100) / 100);
}

// "SPACE_BETWEEN" -> "Space between"
function pretty(v) {
  if (v === null || v === undefined) return null;
  if (isMixed(v)) return "Mixed";
  var s = String(v).toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function has(node, prop) { return node && prop in node; }

// `"children" in node` is true for a node whose children property exists but is
// undefined, and every tree walk then throws on .length. One guard covers all of them.
function hasKids(n) { return !!(n && n.children && n.children.length); }

function row(k, v, token, extra) {
  if (v === null || v === undefined || v === "") return null;
  var r = { k: k, v: String(v) };
  if (token) r.tok = token;
  if (extra) Object.assign(r, extra);
  return r;
}

function clean(rows) { return rows.filter(function (r) { return !!r; }); }

function hex(c) {
  function h(x) { var s = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16); return s.length === 1 ? "0" + s : s; }
  return ("#" + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
}

function pct(v) { return Math.round(v * 100) + "%"; }

// A leading dot makes the file hidden on macOS and Linux, so a folder of
// exported icons looks completely empty while holding every one of them.
// Trailing dots and spaces are what Windows refuses.
function safeName(s) {
  var out = String(s || "icon").replace(/[\/\\:*?"<>|]/g, "-").trim();
  out = out.replace(/^\.+/, "").replace(/[. ]+$/, "");
  return out || "icon";
}

function pageOf(node) {
  var p = node;
  while (p && p.type !== "PAGE") p = p.parent;
  return p;
}

/* ---------------- variable / style resolution ---------------- */

var varCache = new Map();
var styleCache = new Map();

async function varInfo(id) {
  if (!id) return null;
  if (varCache.has(id)) return varCache.get(id);
  var info = null;
  try {
    var v = await figma.variables.getVariableByIdAsync(id);
    if (v) info = { id: v.id, name: v.name };
  } catch (e) { /* variable from an unavailable library */ }
  varCache.set(id, info);
  return info;
}

// Name of the variable bound to node[prop], or null. `idx` picks an entry when
// the binding is an array (fills, strokes, layoutGrids, componentProperties).
async function boundVar(node, prop, idx) {
  if (!node || !node.boundVariables) return null;
  var alias = node.boundVariables[prop];
  if (!alias) return null;
  if (Array.isArray(alias)) alias = alias[idx || 0];
  if (!alias || !alias.id) return null;
  var info = await varInfo(alias.id);
  return info ? info.name : null;
}

// Same, but for the per-object boundVariables carried by paints/effects/grids.
async function boundVarOf(obj, prop) {
  if (!obj || !obj.boundVariables) return null;
  var alias = obj.boundVariables[prop];
  if (!alias || !alias.id) return null;
  var info = await varInfo(alias.id);
  return info ? info.name : null;
}

// varInfo only keeps the name; the translation table needs values and the
// owning collection too.
var varFullCache = new Map();
var colCache = new Map();

async function varFull(id) {
  if (!id) return null;
  if (varFullCache.has(id)) return varFullCache.get(id);
  var out = null;
  try {
    var v = await figma.variables.getVariableByIdAsync(id);
    if (v) out = {
      id: v.id, name: v.name, collectionId: v.variableCollectionId,
      resolvedType: v.resolvedType, valuesByMode: v.valuesByMode,
      description: v.description || "",
    };
  } catch (e) {}
  varFullCache.set(id, out);
  return out;
}

async function collectionOf(id) {
  if (!id) return null;
  if (colCache.has(id)) return colCache.get(id);
  var out = null;
  try {
    var c = await figma.variables.getVariableCollectionByIdAsync(id);
    if (c) out = { id: c.id, name: c.name, modes: c.modes, defaultModeId: c.defaultModeId };
  } catch (e) {}
  colCache.set(id, out);
  return out;
}

async function styleName(id) {
  if (!id || isMixed(id)) return null;
  if (styleCache.has(id)) return styleCache.get(id);
  var name = null;
  try {
    var s = await figma.getStyleByIdAsync(id);
    if (s) name = s.name;
  } catch (e) { /* style from an unavailable library */ }
  styleCache.set(id, name);
  return name;
}

// value + its bound variable, in one row
async function vrow(node, k, prop, fmt) {
  if (!has(node, prop)) return null;
  var raw = node[prop];
  var v = fmt ? fmt(raw) : num(raw);
  return row(k, v, await boundVar(node, prop));
}

/* ---------------- paints & effects ---------------- */

async function gradientStops(p) {
  var out = [];
  var src = p.gradientStops || [];
  for (var i = 0; i < src.length; i++) {
    var g = src[i];
    out.push({
      hex: hex(g.color),
      alpha: g.color.a === undefined ? 1 : g.color.a,
      tok: await boundVarOf(g, "color"),
    });
  }
  return out;
}

async function paintInfo(p, styleN) {
  var o = { type: p.type, visible: p.visible !== false };
  if (p.type === "SOLID") {
    o.summary = hex(p.color) + (p.opacity !== undefined && p.opacity < 1 ? " · " + pct(p.opacity) : "");
    o.swatch = hex(p.color);
    o.alpha = p.opacity === undefined ? 1 : p.opacity;
    o.tok = await boundVarOf(p, "color");
  } else if (p.type === "IMAGE") {
    o.summary = "Image · " + pretty(p.scaleMode);
  } else if (p.type === "VIDEO") {
    o.summary = "Video";
  } else if (p.type === "PATTERN") {
    o.summary = "Pattern";
  } else {
    // Each gradient stop carries its own colour variable, so a two-stop
    // gradient can reference two tokens — read them per stop, not off the paint.
    o.kind = "gradient";
    o.stops = await gradientStops(p);
    o.label = pretty(String(p.type).replace("GRADIENT_", "")) + " gradient";
    o.summary = o.stops.map(function (st) { return st.hex + " " + pct(st.alpha); }).join(" → ");
    o.gradient = o.stops.map(function (st) { return st.hex; });
    o.tokens = o.stops.map(function (st) { return st.tok; });
    o.hasTokens = o.tokens.some(function (x) { return !!x; });
  }
  if (p.blendMode && p.blendMode !== "NORMAL") o.summary += " · " + pretty(p.blendMode);
  if (styleN) o.style = styleN;
  return o;
}

async function effectInfo(e) {
  var o = { type: e.type, visible: e.visible !== false, rows: [] };
  o.label = pretty(e.type);

  if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
    var off = e.offset || { x: 0, y: 0 };
    o.summary = num(off.x) + " " + num(off.y) + " " + num(e.radius) +
      (e.spread ? " " + num(e.spread) : "") + " · " + hex(e.color) + " " + pct(e.color.a === undefined ? 1 : e.color.a);
    o.swatch = hex(e.color);
    o.rows = clean([
      row("offsetX", num(off.x), await boundVarOf(e, "offsetX")),
      row("offsetY", num(off.y), await boundVarOf(e, "offsetY")),
      row("blur", num(e.radius), await boundVarOf(e, "radius")),
      row("spread", num(e.spread || 0), await boundVarOf(e, "spread")),
      row("color", hex(e.color) + " " + pct(e.color.a === undefined ? 1 : e.color.a), await boundVarOf(e, "color")),
      row("blend", e.blendMode && e.blendMode !== "NORMAL" ? pretty(e.blendMode) : null),
      row("showBehind", e.showShadowBehindNode ? "Yes" : null),
    ]);
  } else if (e.type === "GLASS") {
    var parts = ["Blur " + num(e.radius)];
    if (e.refraction !== undefined) parts.push("Refraction " + pct(e.refraction));
    if (e.depth !== undefined) parts.push("Depth " + num(e.depth));
    o.summary = parts.join(" · ");
    o.rows = clean([
      row("blur", num(e.radius), await boundVarOf(e, "radius")),
      row("refraction", e.refraction !== undefined ? pct(e.refraction) : null, await boundVarOf(e, "refraction")),
      row("depth", e.depth !== undefined ? num(e.depth) : null, await boundVarOf(e, "depth")),
      row("dispersion", e.dispersion !== undefined ? pct(e.dispersion) : null, await boundVarOf(e, "dispersion")),
      row("lightAngle", e.lightAngle !== undefined ? num(e.lightAngle) + "°" : null, await boundVarOf(e, "lightAngle")),
      row("lightIntensity", e.lightIntensity !== undefined ? pct(e.lightIntensity) : null, await boundVarOf(e, "lightIntensity")),
    ]);
  } else if (e.type === "NOISE") {
    o.summary = pretty(e.noiseType) + (e.noiseSize !== undefined ? " · Size " + num(e.noiseSize) : "") +
      (e.density !== undefined ? " · " + pct(e.density) : "");
    if (e.color) o.swatch = hex(e.color);
    o.rows = clean([
      row("noiseType", pretty(e.noiseType)),
      row("noiseSize", e.noiseSize !== undefined ? num(e.noiseSize) : null),
      row("density", e.density !== undefined ? pct(e.density) : null),
      row("opacity", e.opacity !== undefined ? pct(e.opacity) : null),
    ]);
  } else if (e.type === "TEXTURE") {
    o.summary = "Size " + num(e.noiseSize) + (e.radius !== undefined ? " · Blur " + num(e.radius) : "");
    o.rows = clean([
      row("noiseSize", e.noiseSize !== undefined ? num(e.noiseSize) : null),
      row("blur", e.radius !== undefined ? num(e.radius) : null, await boundVarOf(e, "radius")),
      row("clipToShape", e.clipToShape ? "Yes" : null),
    ]);
  } else {
    // LAYER_BLUR / BACKGROUND_BLUR (and their progressive variants)
    o.summary = "Blur " + num(e.radius);
    o.rows = clean([ row("blur", num(e.radius), await boundVarOf(e, "radius")) ]);
  }
  return o;
}

/* ============================================================
   Inspection
   ============================================================ */

async function inspectNode(node) {
  varCache.clear();
  styleCache.clear();
  varFullCache.clear();
  colCache.clear();

  // Some properties throw depending on node type (componentPropertyDefinitions on
  // a variant, for one). One bad section must never blank out the whole panel.
  var warn = [];
  async function part(name, fn, fallback) {
    try {
      var v = await fn();
      return v === undefined ? fallback : v;
    } catch (e) {
      warn.push(name + ": " + (e && e.message ? e.message : String(e)));
      return fallback;
    }
  }

  // Read before the literal so the list and its truncation flag can both land
  // in the state without changing the shape every consumer already reads.
  var iconsFound = await part("icons", function () { return findIcons(node); },
                              { list: [], truncated: false });

  var d = {
    id: node.id,
    name: node.name,
    type: node.type,
    path: await part("path", function () { return pathOf(node); }, []),
    badges: await part("badges", function () { return badgesFor(node); }, []),
    size: await part("size", function () { return sizeOf(node); }, null),
    main: await part("main", function () { return mainInfo(node); }, null),
    description: await part("description", function () { return descriptionOf(node); }, null),
    modes: await part("modes", function () { return modesSection(node); }, null),
    props: await part("props", function () { return componentProps(node); }, []),
    scroll: await part("scroll", function () { return scrollSection(node); }, null),
    layout: await part("layout", function () { return layoutSection(node); }, null),
    grids: await part("grids", function () { return layoutGridsSection(node); }, null),
    appearance: await part("appearance", function () { return appearanceSection(node); }, null),
    text: node.type === "TEXT" ? await part("text", function () { return textSection(node); }, null) : null,
    effects: await part("effects", function () { return collectEffects(node); }, { groups: [], truncated: false }),
    tree: await part("tree", function () { return anchoredTree(node); }, null),
    icons: iconsFound.list,
    iconsTruncated: iconsFound.truncated,
    translation: await part("translation", function () { return translationSection(node); }, null),
    colors: await part("colors", function () { return selectionColors(node); }, null),
    exportable: has(node, "exportAsync"),
    exportSettings: await part("exportSettings", function () { return exportRows(node); }, []),
    exportAsset: await part("exportAsset", function () { return exportAssetInfo(node); }, null),
  };
  d.warnings = warn;
  return d;
}

/* ---------------- explicit variable modes ---------------- */
/* resolvedVariableModes lists every collection's inherited mode, which is noise.
   explicitVariableModes only has entries where a designer deliberately picked a
   mode on this layer — that's the thing worth surfacing to a dev. */

async function modesSection(node) {
  if (!has(node, "explicitVariableModes")) return null;
  var evm = node.explicitVariableModes;
  if (!evm) return null;
  var rows = [];
  for (var cid in evm) {
    var col = null;
    try { col = await figma.variables.getVariableCollectionByIdAsync(cid); } catch (e) {}
    if (!col) continue;
    var modeName = evm[cid];
    var modes = col.modes || [];
    for (var i = 0; i < modes.length; i++) {
      if (modes[i].modeId === evm[cid]) { modeName = modes[i].name; break; }
    }
    var isDefault = col.defaultModeId === evm[cid];
    rows.push({ k: col.name, v: modeName, raw: true, flag: !isDefault });
  }
  return rows.length ? rows : null;
}

function pathOf(node) {
  var out = [], p = node.parent;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    out.unshift({ id: p.id, name: p.name, type: p.type });
    p = p.parent;
  }
  if (out.length > CFG.MAX_PATH) out = out.slice(out.length - CFG.MAX_PATH);
  return out;
}

function badgesFor(node) {
  var b = [];
  if (node.type === "INSTANCE") b.push("Instance");
  else if (node.type === "COMPONENT_SET") b.push("Component set");
  else if (node.type === "COMPONENT") {
    b.push(node.parent && node.parent.type === "COMPONENT_SET" ? "Variant" : "Component");
  }
  else b.push(pretty(node.type));
  if (has(node, "visible") && node.visible === false) b.push("Hidden");
  if (has(node, "locked") && node.locked) b.push("Locked");
  if (has(node, "isMask") && node.isMask) b.push("Mask");
  return b;
}

function sizeOf(node) {
  if (!has(node, "width")) return null;
  var o = { w: num(node.width), h: num(node.height) };
  if (has(node, "layoutSizingHorizontal")) {
    o.sh = pretty(node.layoutSizingHorizontal);
    o.sv = pretty(node.layoutSizingVertical);
  }
  return o;
}

async function mainInfo(node) {
  if (node.type === "INSTANCE") {
    var m = null;
    try { m = await node.getMainComponentAsync(); } catch (e) {}
    if (!m) return { missing: true };
    var set = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : null;
    return {
      id: m.id,
      name: set ? set.name : m.name,
      variant: set ? m.name : null,
      key: m.key,
      remote: !!m.remote,
      setId: set ? set.id : null,
    };
  }
  if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") {
    return { id: node.parent.id, name: node.parent.name, variant: node.name, key: node.key, remote: false, isSelf: true };
  }
  return null;
}

// An INSTANCE_SWAP property's value is either a node id ("107:4553") for a local
// component or a component key for a library one. Either way a dev wants a name.
async function swapName(v) {
  var name = null;
  if (/^\d+:\d+$/.test(v)) {
    try {
      var n = await figma.getNodeByIdAsync(v);
      if (n) name = n.parent && n.parent.type === "COMPONENT_SET" ? n.parent.name + " / " + n.name : n.name;
    } catch (e) {}
  }
  if (!name) {
    try {
      var c = await figma.importComponentByKeyAsync(v);
      if (c) name = c.parent && c.parent.type === "COMPONENT_SET" ? c.parent.name + " / " + c.name : c.name;
    } catch (e) {}
  }
  return name || v;
}

// The component's own documentation. Instances inherit it from their main
// component, and a variant falls back to its set's description.
async function descriptionOf(node) {
  var host = null;
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") host = node;
  else if (node.type === "INSTANCE") {
    try { host = await node.getMainComponentAsync(); } catch (e) { host = null; }
  }
  if (!host) return null;
  var d = host.description || "";
  if (!d && host.parent && host.parent.type === "COMPONENT_SET") d = host.parent.description || "";
  return d ? d : null;
}

async function componentProps(node) {
  var out = [];
  if (node.type === "INSTANCE" && node.componentProperties) {
    var props = node.componentProperties;
    for (var key in props) {
      var p = props[key];
      var tok = null;
      if (p.boundVariables && p.boundVariables.value && p.boundVariables.value.id) {
        var info = await varInfo(p.boundVariables.value.id);
        tok = info ? info.name : null;
      }
      var val = p.value;
      if (p.type === "INSTANCE_SWAP" && val) val = await swapName(String(val));
      out.push({
        name: String(key).split("#")[0],
        type: p.type,
        value: typeof val === "boolean" ? (val ? "True" : "False") : String(val),
        tok: tok,
      });
    }
  }
  // Reading componentPropertyDefinitions on a variant throws — the definitions
  // live on its parent component set.
  var defHost = node;
  if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") defHost = node.parent;
  if (defHost.type === "COMPONENT_SET" || defHost.type === "COMPONENT") {
    var defs = null;
    try { defs = defHost.componentPropertyDefinitions; } catch (e) { defs = null; }
    if (!defs) return out;
    for (var k in defs) {
      var d = defs[k];
      out.push({
        name: String(k).split("#")[0],
        type: d.type,
        value: d.type === "VARIANT" ? (d.variantOptions || []).join(" / ") : String(d.defaultValue),
        def: true,
      });
    }
  }
  return out;
}

/* ---------------- scroll behavior ---------------- */

// The editor's Scroll behavior panel: how this layer moves when the frame
// around it scrolls, and whether it scrolls its own contents. Neither shows up
// in Dev Mode's Inspect, and both change how a component has to be built.
function scrollSection(node) {
  var out = { position: null, overflow: null };
  // scrollBehavior is on every scene node, but a layer sitting straight on the
  // page has nothing to scroll past, so the editor hides the row there too.
  var p = node.parent;
  if (p && p.type !== "PAGE" && has(node, "scrollBehavior") && node.scrollBehavior) {
    out.position = node.scrollBehavior;
  }
  if (has(node, "overflowDirection")) out.overflow = node.overflowDirection || "NONE";
  if (out.position === null && out.overflow === null) return null;
  return out;
}

/* ---------------- layout ---------------- */

async function layoutSection(node) {
  if (!has(node, "width")) return null;
  var mode = has(node, "layoutMode") ? node.layoutMode : "NONE";
  var p = node.parent;
  var parentMode = p && has(p, "layoutMode") ? p.layoutMode : null;

  // Structured rather than a flat row list, so the UI can lay it out the way
  // the editor's own Auto layout panel does.
  var L = {
    mode: mode, parentMode: parentMode,
    align: null, sizing: null, gap: null, crossGap: null,
    pad: null, grid: null, span: null,
    absolute: false, clips: null, rows: [],
  };

  L.absolute = has(node, "layoutPositioning") && node.layoutPositioning === "ABSOLUTE";
  // Auto layout drives size only for children it actually flows. An absolutely
  // positioned layer — or any child of a plain frame — is sized by its
  // constraints instead, and layoutSizingHorizontal reports FIXED for those,
  // which made everything look pinned regardless of the parent.
  var flowed = parentMode && parentMode !== "NONE" && !L.absolute;
  var cons = has(node, "constraints") && node.constraints ? node.constraints : null;

  var sh = null, sv = null;
  if (flowed && has(node, "layoutSizingHorizontal")) {
    sh = pretty(node.layoutSizingHorizontal);
    sv = pretty(node.layoutSizingVertical);
  } else if (cons) {
    sh = constraintLabel(cons.horizontal, true);
    sv = constraintLabel(cons.vertical, false);
  }

  L.sizing = {
    w: { v: num(node.width), mode: sh, tok: await boundVar(node, "width") },
    h: { v: num(node.height), mode: sv, tok: await boundVar(node, "height") },
  };

  if (mode === "GRID") {
    L.grid = {
      cols: num(node.gridColumnCount),
      rows: num(node.gridRowCount),
      colGap: { v: num(node.gridColumnGap), tok: await boundVar(node, "gridColumnGap") },
      rowGap: { v: num(node.gridRowGap), tok: await boundVar(node, "gridRowGap") },
    };
  } else if (mode === "HORIZONTAL" || mode === "VERTICAL") {
    L.align = {
      mode: mode,
      primary: node.primaryAxisAlignItems,
      counter: node.counterAxisAlignItems,
      wrap: node.layoutWrap === "WRAP",
    };
    var spaceBetween = node.primaryAxisAlignItems === "SPACE_BETWEEN";
    L.gap = {
      v: spaceBetween ? "Auto" : num(node.itemSpacing),
      tok: await boundVar(node, "itemSpacing"),
      auto: spaceBetween,
    };
    if (node.layoutWrap === "WRAP") {
      L.crossGap = { v: num(node.counterAxisSpacing), tok: await boundVar(node, "counterAxisSpacing") };
    }
    if (node.itemReverseZIndex) L.rows.push(row("zReverse", "Yes"));
    if (node.strokesIncludedInLayout) L.rows.push(row("strokeInLayout", "Yes"));
  }

  L.pad = await paddingBlock(node);

  if (parentMode && parentMode !== "NONE") {
    if (parentMode === "GRID") {
      L.span = {
        colSpan: has(node, "gridColumnSpan") ? num(node.gridColumnSpan) : null,
        rowSpan: has(node, "gridRowSpan") ? num(node.gridRowSpan) : null,
        colStart: has(node, "gridColumnAnchorIndex") ? num(node.gridColumnAnchorIndex) : null,
        rowStart: has(node, "gridRowAnchorIndex") ? num(node.gridRowAnchorIndex) : null,
      };
    }
    if (has(node, "layoutAlign") && node.layoutAlign === "STRETCH") L.rows.push(row("alignSelf", "Stretch"));
  }

  // X/Y and the distances to each parent edge — Dev Mode shows neither, but
  // they are the first thing a dev needs for an absolutely-placed layer.
  if (has(node, "x") && typeof node.x === "number") {
    L.pos = { x: num(node.x), y: num(node.y) };
    var pw = p && typeof p.width === "number" ? p.width : null;
    var ph = p && typeof p.height === "number" ? p.height : null;
    // Distances to the parent's edges only mean something inside a container
    // that actually frames the layer. A variant sits on a component set, which
    // is a canvas of variants rather than a layout, and a top-level layer has
    // only the page above it — in both cases the numbers are noise.
    var pt = p ? p.type : null;
    var framed = pt && pt !== "PAGE" && pt !== "DOCUMENT" &&
                 pt !== "COMPONENT_SET" && pt !== "SECTION";
    if (framed && pw !== null && ph !== null && !flowed) {
      L.edges = {
        t: num(node.y),
        r: num(pw - (node.x + node.width)),
        b: num(ph - (node.y + node.height)),
        l: num(node.x),
      };
    }
  }

  if (has(node, "clipsContent")) L.clips = !!node.clipsContent;
  L.rows = clean(L.rows.concat(await constraintRows(node)));
  return L;
}

// Figma's own names for the constraint values, so "Left and right" reads the
// same here as it does in the editor.
function constraintLabel(v, horizontal) {
  if (v === "MIN") return horizontal ? "Left" : "Top";
  if (v === "MAX") return horizontal ? "Right" : "Bottom";
  if (v === "CENTER") return "Center";
  if (v === "STRETCH") return horizontal ? "Left and right" : "Top and bottom";
  if (v === "SCALE") return "Scale";
  return null;
}

// Padding as four values plus which axes happen to pair up, so the UI can show
// one field per axis when the sides match and separate fields when they don't.
async function paddingBlock(node) {
  if (!has(node, "paddingTop")) return null;
  var t = node.paddingTop, r = node.paddingRight, b = node.paddingBottom, l = node.paddingLeft;
  var kt = await boundVar(node, "paddingTop"), kr = await boundVar(node, "paddingRight");
  var kb = await boundVar(node, "paddingBottom"), kl = await boundVar(node, "paddingLeft");
  if (!t && !r && !b && !l && !kt && !kr && !kb && !kl) return null;
  return {
    t: { v: num(t), tok: kt }, r: { v: num(r), tok: kr },
    b: { v: num(b), tok: kb }, l: { v: num(l), tok: kl },
    pairedV: t === b && kt === kb,
    pairedH: l === r && kl === kr,
    uniform: t === r && r === b && b === l && kt === kr && kr === kb && kb === kl,
  };
}

async function constraintRows(node) {
  var out = [];
  var keys = [["minWidth", "minW"], ["maxWidth", "maxW"], ["minHeight", "minH"], ["maxHeight", "maxH"]];
  for (var i = 0; i < keys.length; i++) {
    if (!has(node, keys[i][0])) continue;
    var v = node[keys[i][0]];
    if (v === null || v === undefined) continue;
    out.push(row(keys[i][1], num(v), await boundVar(node, keys[i][0])));
  }
  return clean(out);
}

// Legacy layout grids (column/row/grid guides) — their gutter/margin tokens
// are one of the things Dev Mode never surfaces.
async function layoutGridsSection(node) {
  if (!has(node, "layoutGrids") || !node.layoutGrids || !node.layoutGrids.length) return null;
  var out = [];
  for (var i = 0; i < node.layoutGrids.length; i++) {
    var g = node.layoutGrids[i];
    var rows = clean([
      row("pattern", pretty(g.pattern)),
      g.pattern === "GRID" ? row("cellSize", num(g.sectionSize), await boundVarOf(g, "sectionSize")) : null,
      g.pattern !== "GRID" ? row("count", g.count === Infinity ? "Auto" : num(g.count), await boundVarOf(g, "count")) : null,
      g.pattern !== "GRID" ? row("gutter", num(g.gutterSize), await boundVarOf(g, "gutterSize")) : null,
      g.pattern !== "GRID" ? row("gridMargin", num(g.offset), await boundVarOf(g, "offset")) : null,
      g.pattern !== "GRID" && g.sectionSize !== undefined ? row("gridWidth", num(g.sectionSize), await boundVarOf(g, "sectionSize")) : null,
      row("alignment", pretty(g.alignment)),
    ]);
    out.push({ visible: g.visible !== false, rows: rows });
  }
  var styleN = await styleName(node.gridStyleId);
  return { style: styleN, grids: out };
}

/* ---------------- appearance ---------------- */

async function appearanceSection(node) {
  var rows = [], fills = [], strokes = [];

  if (has(node, "fills") && !isMixed(node.fills)) {
    var fStyle = await styleName(node.fillStyleId);
    for (var i = 0; i < node.fills.length; i++) {
      var pi = await paintInfo(node.fills[i], i === 0 ? fStyle : null);
      if (!pi.tok) {
        var nodeTok = await boundVar(node, "fills", i);
        if (nodeTok) pi.tok = nodeTok;
      }
      fills.push(pi);
    }
  }
  var stroke = null;
  if (has(node, "strokes") && node.strokes.length) {
    var sStyle = await styleName(node.strokeStyleId);
    for (var j = 0; j < node.strokes.length; j++) {
      var si = await paintInfo(node.strokes[j], j === 0 ? sStyle : null);
      if (!si.tok) {
        var sTok = await boundVar(node, "strokes", j);
        if (sTok) si.tok = sTok;
      }
      strokes.push(si);
    }
    stroke = await strokeBlock(node);
  }

  if (has(node, "opacity") && node.opacity < 1) rows.push(row("opacity", pct(node.opacity), await boundVar(node, "opacity")));

  // corner radius
  if (has(node, "cornerRadius")) {
    if (isMixed(node.cornerRadius)) {
      var corners = [["topLeftRadius", "radiusTL"], ["topRightRadius", "radiusTR"],
                     ["bottomRightRadius", "radiusBR"], ["bottomLeftRadius", "radiusBL"]];
      for (var c = 0; c < corners.length; c++) {
        if (has(node, corners[c][0])) rows.push(row(corners[c][1], num(node[corners[c][0]]), await boundVar(node, corners[c][0])));
      }
    } else if (node.cornerRadius) {
      rows.push(row("radius", num(node.cornerRadius), await boundVar(node, "topLeftRadius")));
    }
    if (has(node, "cornerSmoothing") && node.cornerSmoothing) rows.push(row("smoothing", pct(node.cornerSmoothing)));
  }

  if (has(node, "blendMode") && node.blendMode !== "PASS_THROUGH" && node.blendMode !== "NORMAL") {
    rows.push(row("blend", pretty(node.blendMode)));
  }
  if (has(node, "rotation") && Math.round(node.rotation) !== 0) rows.push(row("rotation", num(node.rotation) + "°"));

  var r = clean(rows);
  if (!r.length && !fills.length && !strokes.length) return null;
  return { rows: r, fills: fills, strokes: strokes, stroke: stroke };
}

// Mirrors the editor's stroke section: position + weight, the four side
// weights, and the dash/cap/join settings. Width profile is deliberately left
// out — it isn't useful to a dev reading specs.
async function strokeBlock(node) {
  var b = { align: null, weight: null, weightTok: null, sides: null, perSide: false };

  if (has(node, "strokeAlign")) b.align = pretty(node.strokeAlign);
  if (has(node, "strokeWeight")) {
    b.weight = num(node.strokeWeight);
    b.weightTok = await boundVar(node, "strokeWeight");
  }

  var defs = [["strokeTopWeight", "t"], ["strokeRightWeight", "r"],
              ["strokeBottomWeight", "b"], ["strokeLeftWeight", "l"]];
  if (has(node, defs[0][0])) {
    b.sides = {};
    var vals = [];
    for (var i = 0; i < defs.length; i++) {
      var v = node[defs[i][0]];
      vals.push(v);
      b.sides[defs[i][1]] = { v: num(v), tok: await boundVar(node, defs[i][0]) };
    }
    // Only worth showing four fields when they actually differ.
    b.perSide = !vals.every(function (v) { return v === vals[0]; });
  }

  var dp = has(node, "dashPattern") && node.dashPattern ? node.dashPattern : [];
  if (!dp.length) b.style = "Solid";
  else if (dp.length === 2) { b.style = "Dashed"; b.dash = num(dp[0]); b.gap = num(dp[1]); }
  else { b.style = "Custom"; b.pattern = dp.map(num).join(", "); }

  if (has(node, "strokeCap") && !isMixed(node.strokeCap) && node.strokeCap !== "NONE") {
    b.cap = pretty(node.strokeCap);
  } else if (has(node, "strokeCap") && isMixed(node.strokeCap)) {
    b.cap = "Mixed";
  }
  if (has(node, "strokeJoin") && !isMixed(node.strokeJoin)) b.join = pretty(node.strokeJoin);
  if (has(node, "strokeMiterLimit") && b.join === "Miter") {
    b.miter = num(node.strokeMiterLimit);
  }
  return b;
}

/* ---------------- typography ---------------- */

function lineHeightStr(lh) {
  if (!lh || isMixed(lh)) return isMixed(lh) ? "Mixed" : null;
  if (lh.unit === "AUTO") return "Auto";
  return num(lh.value) + (lh.unit === "PERCENT" ? "%" : "");
}
function letterSpacingStr(ls) {
  if (!ls || isMixed(ls)) return isMixed(ls) ? "Mixed" : null;
  return num(ls.value) + (ls.unit === "PERCENT" ? "%" : "");
}
function fontStr(f) {
  if (isMixed(f)) return "Mixed";
  if (!f) return null;
  return f.family + " " + f.style;
}

// The typographic detail rows — hidden behind the style name when a text style
// is applied, shown inline when it isn't.
async function typeRows(node) {
  return clean([
    row("font", fontStr(node.fontName)),
    row("weight", isMixed(node.fontWeight) ? "Mixed" : num(node.fontWeight)),
    row("size", num(node.fontSize), await boundVar(node, "fontSize")),
    row("lineHeight", lineHeightStr(node.lineHeight), await boundVar(node, "lineHeight")),
    row("letterSpacing", letterSpacingStr(node.letterSpacing), await boundVar(node, "letterSpacing")),
    row("paragraphSpacing", node.paragraphSpacing ? num(node.paragraphSpacing) : null, await boundVar(node, "paragraphSpacing")),
    row("paragraphIndent", node.paragraphIndent ? num(node.paragraphIndent) : null),
    row("case", node.textCase && node.textCase !== "ORIGINAL" ? pretty(node.textCase) : null),
    row("decoration", node.textDecoration && node.textDecoration !== "NONE" ? pretty(node.textDecoration) : null),
    has(node, "leadingTrim") && node.leadingTrim && node.leadingTrim !== "NONE" ? row("leadingTrim", pretty(node.leadingTrim)) : null,
  ]);
}

async function textSection(node) {
  var t = { rows: [], detailRows: [], segments: [] };

  var tsid = node.textStyleId;
  if (isMixed(tsid)) {
    t.mixed = true;
    t.segments = await textSegments(node);
  } else if (tsid) {
    t.styleName = await styleName(tsid);
    t.styleId = tsid;
    t.detailRows = await typeRows(node);   // shown only when the style name is clicked
  } else {
    t.detailRows = await typeRows(node);
    t.noStyle = true;                       // no style -> UI shows details expanded
  }

  // The Dev Mode blind spots: truncation + max lines.
  t.truncate = {
    mode: has(node, "textTruncation") ? node.textTruncation : "DISABLED",
    maxLines: has(node, "maxLines") ? node.maxLines : null,
  };

  t.rows = clean([
    row("autoResize", pretty(node.textAutoResize)),
    row("truncate", t.truncate.mode === "ENDING" ? "Ending (…)" : "Off", null, { flag: t.truncate.mode === "ENDING" }),
    row("maxLines", t.truncate.maxLines ? num(t.truncate.maxLines) : (t.truncate.mode === "ENDING" ? "Unlimited" : null),
        null, { flag: !!t.truncate.maxLines }),
    row("alignH", pretty(node.textAlignHorizontal)),
    row("alignV", pretty(node.textAlignVertical)),
    has(node, "textWrap") && node.textWrap === "BALANCE" ? row("wrapText", "Balance") : null,
    has(node, "listSpacing") && node.listSpacing ? row("listSpacing", num(node.listSpacing)) : null,
    has(node, "hangingPunctuation") && node.hangingPunctuation ? row("hangingPunct", "Yes") : null,
  ]);

  // content + its variable binding (string variables bound to characters)
  t.characters = isMixed(node.characters) ? "" : String(node.characters || "");
  t.contentVar = await boundVar(node, "characters");

  // text color
  t.fills = [];
  if (has(node, "fills") && !isMixed(node.fills)) {
    var fStyle = await styleName(node.fillStyleId);
    for (var i = 0; i < node.fills.length; i++) {
      var pi = await paintInfo(node.fills[i], i === 0 ? fStyle : null);
      if (!pi.tok) {
        var nt = await boundVar(node, "fills", i);
        if (nt) pi.tok = nt;
      }
      t.fills.push(pi);
    }
  }
  return t;
}

async function textSegments(node) {
  var out = [];
  var segs = [];
  try {
    segs = node.getStyledTextSegments(["fontName", "fontSize", "textStyleId", "lineHeight", "letterSpacing", "textCase", "textDecoration"]);
  } catch (e) { return out; }
  for (var i = 0; i < segs.length && i < CFG.MAX_SEGMENTS; i++) {
    var s = segs[i];
    out.push({
      text: s.characters.length > 60 ? s.characters.slice(0, 60) + "…" : s.characters,
      style: await styleName(s.textStyleId),
      rows: clean([
        row("font", fontStr(s.fontName)),
        row("size", num(s.fontSize)),
        row("lineHeight", lineHeightStr(s.lineHeight)),
        row("letterSpacing", letterSpacingStr(s.letterSpacing)),
        row("case", s.textCase && s.textCase !== "ORIGINAL" ? pretty(s.textCase) : null),
        row("decoration", s.textDecoration && s.textDecoration !== "NONE" ? pretty(s.textDecoration) : null),
      ]),
    });
  }
  return out;
}

/* ---------------- effects (own + anywhere in the subtree) ---------------- */
/* Dev Mode only shows the effects of the exact node you clicked. Devs need to
   know a card has a shadow even when they selected the card's wrapper, so we
   walk down and report every effect we find, with a jump link. */

async function collectEffects(rootNode) {
  var out = [];
  var scanned = 0;

  async function visit(n, depth) {
    if (out.length >= CFG.MAX_EFFECT_NODES || scanned > 4000) return;
    scanned++;
    if (has(n, "effects") && n.effects && !isMixed(n.effects) && n.effects.length) {
      var items = [];
      for (var i = 0; i < n.effects.length; i++) items.push(await effectInfo(n.effects[i]));
      out.push({
        nodeId: n.id,
        nodeName: n.name,
        nodeType: n.type,
        depth: depth,
        own: depth === 0,
        style: await styleName(n.effectStyleId),
        items: items,
      });
    }
    if (hasKids(n)) {
      for (var c = 0; c < n.children.length; c++) await visit(n.children[c], depth + 1);
    }
  }

  await visit(rootNode, 0);
  return { groups: out, truncated: out.length >= CFG.MAX_EFFECT_NODES };
}

/* ---------------- component structure tree ---------------- */
/* Non-component layers are flattened away, so the tree reads as "this component
   is built from these components", the way a wiki contents list reads. */

// Selecting a layer inside the tree shouldn't collapse the tree down to that
// layer — the surrounding structure is the whole point. So the tree stays rooted
// where it was for as long as the inspected node lives somewhere inside it, and
// only re-roots once the selection moves out of that subtree.
// The tree normally roots at whatever is selected and lists only its contents.
// The one exception is clicking a row *inside* the tree: that shouldn't yank
// the tree down to the row you clicked, so those navigations (and only those)
// ask to inherit the existing root by setting keepAnchorFor.
async function anchoredTree(node) {
  if (keepAnchorFor && keepAnchorFor !== node.id) keepAnchorFor = null;

  var root = null;
  if (keepAnchorFor === node.id && treeRootId && treeRootId !== node.id) {
    var anchor = await figma.getNodeByIdAsync(treeRootId);
    if (anchor && !anchor.removed && isWithin(anchor, node)) root = anchor;
  }
  if (!root) { root = node; keepAnchorFor = null; }
  treeRootId = root.id;
  return componentTree(root, node.id);
}

function isWithin(ancestor, node) {
  var p = node;
  while (p) {
    if (p.id === ancestor.id) return true;
    p = p.parent;
  }
  return false;
}

async function componentTree(rootNode, currentId) {
  var budget = { n: 0 };
  var children = await walkInstances(rootNode, 0, budget, currentId, false);
  var self = await treeEntry(rootNode);
  self.children = children;
  self.root = true;
  self.current = rootNode.id === currentId;
  return {
    root: self,
    rootId: rootNode.id,
    count: budget.n,
    truncated: budget.n >= CFG.MAX_TREE_NODES,
  };
}

// isSlot: true when a SLOT node was crossed on the way down, i.e. the component
// we're about to record was placed *into* a slot. It's deliberately reset when
// descending into that component — a component's own internals aren't "in a
// slot" just because the component itself was slotted.
function looksLikeSlot(n) {
  return !!n && typeof n.type === "string" && n.type.indexOf("SLOT") !== -1;
}

async function walkInstances(node, depth, budget, currentId, inSlot) {
  var out = [];
  if (depth >= CFG.MAX_TREE_DEPTH || !hasKids(node)) return out;
  for (var i = 0; i < node.children.length; i++) {
    if (budget.n >= CFG.MAX_TREE_NODES) break;
    var c = node.children[i];
    if (c.type === "INSTANCE" || c.type === "COMPONENT" || c.type === "COMPONENT_SET") {
      budget.n++;
      var e = await treeEntry(c);
      e.slot = !!inSlot;
      // treeEntry labels a variant with its set's name, which is right when the
      // variant appears on its own but makes every child of a component set
      // read identically. Under its own set, the variant string is the useful
      // half.
      if (c.type === "COMPONENT" && c.parent && c.parent.type === "COMPONENT_SET" && c.parent.id === node.id) {
        e.name = c.name;
        // A variant is not an instance of anything: the "main component"
        // treeEntry pointed at is the set this row already sits inside. Flag it
        // so the row offers to go to the variant itself instead.
        e.isVariant = true;
        e.mainId = null;
      }
      e.current = c.id === currentId;
      e.children = await walkInstances(c, depth + 1, budget, currentId, false);
      out.push(e);
    } else if (hasKids(c)) {
      // plain frame/group/slot: look through it without adding a level
      var nested = await walkInstances(c, depth, budget, currentId, inSlot || looksLikeSlot(c));
      for (var k = 0; k < nested.length; k++) out.push(nested[k]);
    }
  }
  return out;
}

async function treeEntry(node) {
  var e = { id: node.id, name: node.name, type: node.type, children: [], hidden: node.visible === false };
  // A variant's own name is its property string ("state=default, size=lg"), which
  // is unreadable in a tree — show the set it belongs to instead.
  if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") {
    e.name = node.parent.name;
    e.variant = node.name;
    e.mainId = node.parent.id;
  }
  if (node.type === "INSTANCE") {
    var m = null;
    try { m = await node.getMainComponentAsync(); } catch (err) {}
    if (m) {
      var set = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : null;
      e.mainId = m.id;
      // Thumbnail comes from the main component (the specific variant), not
      // this instance — the instance may be resized, overridden or partly
      // hidden here, and the canonical component is what a dev wants to see.
      // Keying on it also means every instance of a component shares one
      // exported thumbnail.
      e.thumbId = m.id;
      e.mainName = set ? set.name : m.name;
      e.variant = set ? m.name : null;
      e.remote = !!m.remote;
    } else {
      e.detached = true;
    }
    e.icon = isIconFrame(node);
  }
  return e;
}

/* ---------------- selection colours ---------------- */
/* Every colour used anywhere inside the selection, the way Dev Mode's own
   "Selection colors" works: grouped by variable/style when one is bound and by
   raw value otherwise, remembering which layer each one is painted on so a
   click can select it. */

async function selectionColors(node) {
  var byKey = {};
  var order = [];
  var scanned = 0;

  async function addPaint(p, owner, styleId, idx, isStroke) {
    if (!p || p.visible === false) return;
    if (order.length >= CFG.MAX_COLORS) return;

    var tok = await boundVarOf(p, "color");
    if (!tok) tok = await boundVar(owner, isStroke ? "strokes" : "fills", idx);
    var st = await styleName(styleId);

    var key, entry;
    if (p.type === "SOLID") {
      var h = hex(p.color);
      var a = p.opacity === undefined ? 1 : p.opacity;
      key = tok ? "v:" + tok : (st ? "s:" + st : "c:" + h + "@" + a);
      entry = { kind: "solid", hex: h, alpha: a, summary: h + (a < 1 ? " · " + pct(a) : "") };
    } else if (p.type === "IMAGE" || p.type === "VIDEO" || p.type === "PATTERN") {
      key = "i:" + p.type;
      entry = { kind: "image", summary: pretty(p.type) };
    } else {
      var gs = await gradientStops(p);
      var toks = gs.map(function (g) { return g.tok; });
      var named = toks.filter(function (x) { return !!x; });
      // Two stops bound to two variables is two tokens, not one.
      key = named.length ? "v:" + toks.join(">")
          : (st ? "s:" + st : "g:" + p.type + ":" + gs.map(function (g) { return g.hex; }).join(","));
      entry = {
        kind: "gradient",
        stops: gs.map(function (g) { return g.hex; }),
        tokens: named.length ? toks : null,
        summary: pretty(String(p.type).replace("GRADIENT_", "")) + " gradient · " +
          gs.map(function (g) { return g.hex + " " + pct(g.alpha); }).join(" → "),
      };
    }

    if (!byKey[key]) {
      entry.key = key;
      entry.token = tok || null;
      entry.style = st || null;
      entry.count = 0;
      entry.nodeIds = [];
      byKey[key] = entry;
      order.push(entry);
    }
    var e = byKey[key];
    e.count++;
    if (e.nodeIds.length < CFG.MAX_COLOR_NODES && e.nodeIds.indexOf(owner.id) === -1) {
      e.nodeIds.push(owner.id);
    }
  }

  async function visit(n) {
    if (scanned > 4000 || order.length >= CFG.MAX_COLORS) return;
    scanned++;
    if (n.visible !== false) {
      if (has(n, "fills") && !isMixed(n.fills) && n.fills) {
        for (var i = 0; i < n.fills.length; i++) await addPaint(n.fills[i], n, n.fillStyleId, i, false);
      }
      if (has(n, "strokes") && n.strokes) {
        for (var j = 0; j < n.strokes.length; j++) await addPaint(n.strokes[j], n, n.strokeStyleId, j, true);
      }
    }
    if (hasKids(n)) {
      for (var c = 0; c < n.children.length; c++) await visit(n.children[c]);
    }
  }

  await visit(node);
  if (!order.length) return null;

  // Most-used first, which puts the layer's dominant colours at the top.
  order.sort(function (a, b) { return b.count - a.count; });
  return { colors: order, truncated: order.length >= CFG.MAX_COLORS };
}

/* ---------------- translation ---------------- */
/* Strings live in a variable collection whose modes are languages. For the
   selected layer we collect every string variable bound anywhere inside it and
   lay them out as variable × language, so a dev can see at a glance which
   copy is missing a translation. */

async function translationSection(node) {
  var rows = [];
  var byVar = {};
  var collection = null;
  var scanned = 0;

  async function consider(varId, owner) {
    if (!varId || rows.length >= CFG.MAX_TRANSLATIONS) return;
    if (byVar[varId]) { byVar[varId].count++; return; }

    var v = await varFull(varId);
    if (!v) return;
    var col = await collectionOf(v.collectionId);
    if (!col || String(col.name).toLowerCase() !== CFG.LANGUAGE_COLLECTION) return;
    // First matching collection wins — one table, one set of language columns.
    if (!collection) collection = col;
    else if (collection.id !== col.id) return;

    var values = {};
    for (var i = 0; i < col.modes.length; i++) {
      values[col.modes[i].modeId] = await resolveVarValue(v.valuesByMode[col.modes[i].modeId], 0);
    }
    // The group path is noise in a table this narrow — show the leaf, keep the
    // full path for the tooltip.
    var full = String(v.name);
    var slash = full.lastIndexOf("/");
    var entry = {
      varId: varId, name: slash >= 0 ? full.slice(slash + 1) : full, fullName: full,
      desc: v.description || "",
      nodeId: owner.id, nodeName: owner.name,
      count: 1, values: values,
    };
    byVar[varId] = entry;
    rows.push(entry);
  }

  // Only TEXT nodes are ever recorded. A string variable can only drive text,
  // so the row must point at the text layer itself — reporting the instance
  // that exposes the property highlighted the wrapper instead of the text.
  async function visit(n) {
    if (rows.length >= CFG.MAX_TRANSLATIONS || scanned > 4000) return;
    scanned++;
    if (n.type === "TEXT") {
      var varId = null;
      if (n.boundVariables && n.boundVariables.characters) {
        varId = n.boundVariables.characters.id;           // bound on the text node
      }
      if (!varId) varId = propBoundVarId(n);              // bound via an instance property
      if (varId) await consider(varId, n);
    }
    if (hasKids(n)) {
      for (var i = 0; i < n.children.length; i++) await visit(n.children[i]);
    }
  }

  // Text exposed as a component property is bound on the instance, under the
  // key the text node references. Walk up to the instance that supplies it.
  function propBoundVarId(textNode) {
    var refs = textNode.componentPropertyReferences;
    if (!refs || !refs.characters) return null;
    var key = refs.characters;
    var p = textNode.parent;
    while (p) {
      if (p.type === "INSTANCE" && p.componentProperties) {
        var pr = p.componentProperties[key];
        if (pr) {
          return pr.boundVariables && pr.boundVariables.value
            ? pr.boundVariables.value.id
            : null; // literal value, no variable behind it
        }
      }
      p = p.parent;
    }
    return null;
  }

  await visit(node);
  if (!collection || !rows.length) return null;

  return {
    collection: collection.name,
    modes: collection.modes.map(function (m) {
      return { modeId: m.modeId, name: m.name, isDefault: m.modeId === collection.defaultModeId };
    }),
    rows: rows,
    truncated: rows.length >= CFG.MAX_TRANSLATIONS,
  };
}

// A mode's value can point at another variable; follow one or two hops so the
// table shows real copy rather than an alias blob.
async function resolveVarValue(val, depth) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  if (val.type === "VARIABLE_ALIAS" && val.id && depth < 3) {
    var v = await varFull(val.id);
    if (!v) return null;
    // An alias has no mode of its own here — take its default-ish first value.
    for (var k in v.valuesByMode) {
      return await resolveVarValue(v.valuesByMode[k], depth + 1);
    }
  }
  return null;
}

/* ---------------- icons ---------------- */
/* Every icon in this file is an `icon-frame` instance with the actual icon
   nested inside, so exporting should work from any ancestor selection, not
   just when the icon layer itself is selected. */

// True when the node, or anything between it and `root`, is toggled off.
function isHidden(node, root) {
  var p = node;
  while (p) {
    if (p.visible === false) return true;
    if (root && p.id === root.id) break;
    p = p.parent;
  }
  return false;
}

function isIconFrame(node) {
  if (!node || !node.name) return false;
  if (node.type !== "INSTANCE" && node.type !== "COMPONENT" && node.type !== "FRAME") return false;
  return node.name.toLowerCase().indexOf(CFG.ICON_FRAME) !== -1;
}

// The asset inside a wrapper: the first nested component that isn't itself an
// icon-frame. This is what gets exported — exporting the wrapper gave you its
// padding and layout box rather than the icon.
function iconAsset(node) {
  if (hasKids(node)) {
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i];
      if ((c.type === "INSTANCE" || c.type === "COMPONENT") && !isIconFrame(c)) return c;
      if (hasKids(c)) {
        var deeper = iconAsset(c);
        if (deeper) return deeper;
      }
    }
  }
  return null;
}

// The Export tab exports whatever is selected. When that selection is an icon
// wrapper, the asset inside is what a dev actually wants — the same rule the
// Icons tab applies — so the panel offers it instead of the frame.
function exportAssetInfo(node) {
  if (!isIconNode(node)) return null;
  var a = iconAsset(node);
  if (!a || a.id === node.id) return null;
  return { id: a.id, name: a.name };
}

function iconLabel(node) {
  var a = iconAsset(node);
  return a ? a.name : null;
}

/* Figma's own icon detection isn't documented, so this is a structural
   approximation of it: a small, simple container whose subtree is vector
   artwork and contains no text. It catches icons that aren't named, while the
   ICON_FRAME name match stays as an explicit override. */
var VECTOR_TYPES = {
  VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, POLYGON: 1, LINE: 1,
};
var SHAPE_TYPES = { ELLIPSE: 1, RECTANGLE: 1 };

function vectorStats(n, cap) {
  var vectors = 0, count = 0, ok = true;
  (function walk(x) {
    if (!ok) return;
    if (++count > cap) { ok = false; return; }
    if (x.type === "TEXT") { ok = false; return; }   // text means it's not an icon
    if (VECTOR_TYPES[x.type]) vectors++;
    else if (SHAPE_TYPES[x.type]) vectors += 0;      // shapes alone aren't enough
    if (hasKids(x)) {
      for (var i = 0; i < x.children.length && ok; i++) walk(x.children[i]);
    }
  })(n);
  return ok ? vectors : -1;
}

function looksLikeIcon(node) {
  if (!node || !node.width || !node.height) return false;
  // cheap gates first — most nodes fail here, so the subtree walk stays bounded
  if (node.width > CFG.ICON_MAX_PX || node.height > CFG.ICON_MAX_PX) return false;
  var ty = node.type;
  if (ty !== "FRAME" && ty !== "COMPONENT" && ty !== "INSTANCE" && ty !== "GROUP") return false;
  if (!hasKids(node) || !node.children.length) return false;
  return vectorStats(node, CFG.ICON_MAX_NODES) > 0;
}

function isIconNode(node) {
  return isIconFrame(node) || looksLikeIcon(node);
}

// Layer trail from the inspected node down to the icon, so two identical
// icon-frames in one component are distinguishable.
function iconPath(n, root) {
  var parts = [], p = n.parent;
  while (p && p.id !== root.id && p.type !== "PAGE") { parts.unshift(p.name); p = p.parent; }
  return parts.slice(-2).join(" / ");
}

async function findIcons(node) {
  var seen = {}, out = [];
  var hitCap = false;

  function add(n, rel) {
    // Export the asset, not the wrapper. The card is named after the asset too,
    // so what you see is what you get.
    var asset = iconAsset(n) || n;
    if (out.length >= CFG.MAX_ICONS) { hitCap = true; return; }
    if (seen[asset.id]) return;
    seen[asset.id] = true;
    out.push({
      nodeId: asset.id,                 // export + navigation target
      name: n.name,                     // the wrapper, for context
      label: asset === n ? n.name : asset.name,
      rel: rel,                         // "self" | "ancestor" | "child"
      w: num(asset.width),
      h: num(asset.height),
      hidden: isHidden(n, node),
      path: iconPath(n, node),
    });
  }

  if (isIconNode(node)) add(node, "self");

  // an ancestor icon — selecting the glyph inside should still let you export
  var p = node.parent;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    if (isIconNode(p)) add(p, "ancestor");
    p = p.parent;
  }

  // Walk down, stopping at each icon: descending into one would report its
  // inner vectors as separate icons.
  (function scan(n, depth) {
    if (out.length >= CFG.MAX_ICONS) { hitCap = true; return; }
    if (depth > CFG.MAX_TREE_DEPTH + 4) return;
    if (!hasKids(n)) return;
    for (var i = 0; i < n.children.length; i++) {
      var c = n.children[i];
      if (isIconNode(c)) { add(c, "child"); continue; }
      scan(c, depth + 1);
    }
  })(node, 0);

  return { list: out, truncated: hitCap };
}

/* ---------------- actions ---------------- */

// Select a layer on the canvas from a panel row, without re-pointing the panel.
// The inspected node is pinned first so any later push keeps showing it.
// Preview a layer on the canvas for as long as the pointer rests on its row.
async function hoverLayer(id) {
  var node = await figma.getNodeByIdAsync(id);
  if (!node || node.removed) return;
  if (pageOf(node) !== figma.currentPage) return; // never change pages for a hover

  if (!hoverActive) {
    hoverPrev = sortedIds(figma.currentPage.selection);
    hoverActive = true;
  }
  if (sameIds(sortedIds(figma.currentPage.selection), [id])) return;
  try { figma.currentPage.selection = [node]; } catch (e) {}
}

async function hoverEnd() {
  if (!hoverActive) return;
  var ids = hoverPrev || [];
  var nodes = [];
  for (var i = 0; i < ids.length; i++) {
    var n = await figma.getNodeByIdAsync(ids[i]);
    if (n && !n.removed && pageOf(n) === figma.currentPage) nodes.push(n);
  }
  if (!sameIds(sortedIds(figma.currentPage.selection), sortedIds(nodes))) {
    try { figma.currentPage.selection = nodes; } catch (e) {}
  }
  // Cleared only after the restore, so the restore itself stays suppressed.
  hoverPrev = null;
  hoverActive = false;
}

// Takes a list because one row can stand for several layers — a colour in
// Selection colors is painted on every layer that uses it, and clicking it
// should select all of them, not just the first.
async function selectLayer(ids) {
  hoverActive = false;
  hoverPrev = null;
  var nodes = [];
  for (var i = 0; i < ids.length; i++) {
    var n = await figma.getNodeByIdAsync(ids[i]);
    if (n && !n.removed) nodes.push(n);
  }
  if (!nodes.length) { figma.notify(M("notFound")); return; }

  var page = pageOf(nodes[0]);
  if (page && page.id !== figma.currentPage.id) {
    try { await figma.setCurrentPageAsync(page); } catch (e) { return; }
  }
  // A multi-layer selection can't span pages.
  nodes = nodes.filter(function (n) { return pageOf(n) === figma.currentPage; });
  if (!nodes.length) return;

  // An assignment that changes nothing fires no event, and the flag would then
  // swallow the user's next real pick.
  if (sameIds(sortedIds(figma.currentPage.selection), sortedIds(nodes))) return;

  if (inspectedId) pinnedId = inspectedId;
  selfSelect = true;
  try {
    figma.currentPage.selection = nodes;
  } catch (e) {
    selfSelect = false; // library nodes and read-only contexts can refuse selection
  }
}

async function selectNode(id, focus) {
  hoverActive = false;
  hoverPrev = null;
  var node = await figma.getNodeByIdAsync(id);
  if (!node || node.removed) { figma.notify(M("notFound")); return false; }
  var page = pageOf(node);
  var switchedPage = false;
  try {
    if (page && page.id !== figma.currentPage.id) {
      await figma.setCurrentPageAsync(page);
      switchedPage = true;
    }
  } catch (e) {}
  try {
    figma.currentPage.selection = [node];
  } catch (e) { /* library nodes and read-only contexts can refuse selection */ }
  // Selecting from the panel deliberately leaves the camera alone, even when
  // the layer is off-screen. The exception is `focus` — used by "Go to Main
  // Component" and the history buttons, which land somewhere else entirely and
  // would be useless without bringing the viewport along. Across pages there is
  // nothing to interpolate between, so that case stays an instant cut.
  if (focus) focusOn([node], !switchedPage);
  var sel = figma.currentPage.selection;
  return sel.length === 1 && sel[0].id === id;
}

/* ---------------- camera ---------------- */
/* There is no animation API, but viewport.center and viewport.zoom are both
   writable, so the move can be tweened by hand. Rather than re-deriving Figma's
   own framing (padding, clamping, multi-node bounds), we let
   scrollAndZoomIntoView compute the destination, read it back, restore the
   original viewport and glide to it — so the endpoint is exactly where the
   instant version would have landed. Both writes happen in one synchronous run,
   so no frame is painted in between. */

var focusTimer = null;

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function focusOn(nodes, animate) {
  if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }

  var canAnimate = animate && typeof setInterval === "function";
  if (!canAnimate) {
    try { figma.viewport.scrollAndZoomIntoView(nodes); } catch (e) {}
    return;
  }

  var from, to;
  try {
    from = { cx: figma.viewport.center.x, cy: figma.viewport.center.y, zoom: figma.viewport.zoom };
    figma.viewport.scrollAndZoomIntoView(nodes);
    to = { cx: figma.viewport.center.x, cy: figma.viewport.center.y, zoom: figma.viewport.zoom };
  } catch (e) {
    return; // already jumped, or the viewport refused — either way, leave it
  }

  var moved = Math.abs(to.cx - from.cx) + Math.abs(to.cy - from.cy);
  var zoomed = Math.abs(Math.log(to.zoom / from.zoom));
  if (moved < 0.5 && zoomed < 0.001) return; // already framed

  // Rewind and play the move.
  figma.viewport.zoom = from.zoom;
  figma.viewport.center = { x: from.cx, y: from.cy };

  var logFrom = Math.log(from.zoom), logTo = Math.log(to.zoom);
  var start = Date.now();
  focusTimer = setInterval(function () {
    var t = (Date.now() - start) / CFG.FOCUS_MS;
    if (t >= 1) {
      clearInterval(focusTimer);
      focusTimer = null;
      figma.viewport.zoom = to.zoom;
      figma.viewport.center = { x: to.cx, y: to.cy };
      return;
    }
    var e = easeInOut(t);
    // Zoom reads as linear to the eye only on a log scale.
    figma.viewport.zoom = Math.exp(logFrom + (logTo - logFrom) * e);
    figma.viewport.center = { x: from.cx + (to.cx - from.cx) * e, y: from.cy + (to.cy - from.cy) * e };
  }, 16);
}

// Opening a component from the structure tree should also highlight it on the
// canvas. When the node can't be selected (a library main component, say) we
// fall back to inspecting it in place.
async function navNode(id, keepTree, focus) {
  keepAnchorFor = keepTree ? id : null;
  var ok = await selectNode(id, focus);
  pinnedId = ok ? null : id;
  push();
}

// Row thumbnail for the component tree. Bounded by the node's longer side so a
// wide banner and a tall column both come back at a sane size, and exported once
// at THUMB_PX — the UI scales it down, so the size slider costs nothing.
async function thumbFor(id, fromId) {
  var node = await figma.getNodeByIdAsync(id);

  // A main component often lives on another page or in a library, where
  // getNodeByIdAsync can come back empty. Resolving it through the instance
  // works in those cases; failing that, fall back to the instance itself so a
  // row never loses its thumbnail entirely.
  if ((!node || node.removed) && fromId) {
    var inst = await figma.getNodeByIdAsync(fromId);
    if (inst && inst.type === "INSTANCE") {
      try { node = await inst.getMainComponentAsync(); } catch (e) {}
    }
    if (!node || node.removed) node = inst;
  }

  if (!node || node.removed || !has(node, "exportAsync")) return;
  if (!node.width || !node.height) return;

  var constraint = node.width >= node.height
    ? { type: "WIDTH", value: CFG.THUMB_PX }
    : { type: "HEIGHT", value: CFG.THUMB_PX };
  try {
    var bytes = await node.exportAsync({ format: "PNG", constraint: constraint });
    figma.ui.postMessage({ type: "thumb-data", nodeId: id, bytes: bytes });
  } catch (e) { /* unrenderable node — the row just keeps its glyph */ }
}

// Small PNG for the export card's thumbnail.
async function iconPreview(id) {
  var node = await figma.getNodeByIdAsync(id);
  if (!node || !has(node, "exportAsync")) return;
  try {
    var bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
    figma.ui.postMessage({ type: "preview-data", nodeId: id, bytes: bytes });
  } catch (e) { /* hidden or unrenderable node — the card just shows no preview */ }
}

// Figma stores export settings on the node; mirror them so the Export tab opens
// with whatever the designer already set up, exactly like the native panel.
function exportRows(node) {
  if (!has(node, "exportSettings") || !node.exportSettings) return [];
  var out = [];
  for (var i = 0; i < node.exportSettings.length && i < 8; i++) {
    var es = node.exportSettings[i];
    var c = es.constraint || { type: "SCALE", value: 1 };
    out.push({
      format: es.format === "SVG_STRING" ? "SVG" : es.format,
      scaleMode: c.type,
      scaleValue: c.value,
      suffix: es.suffix || "",
      contentsOnly: es.contentsOnly !== false,
      colorProfile: es.colorProfile || "SRGB",
      resampling: "BASIC",
      svgIdAttribute: es.svgIdAttribute !== false,
      svgOutlineText: !!es.svgOutlineText,
      svgSimplifyStroke: es.svgSimplifyStroke !== false,
      // Figma stores none of these, but the main thread treats an absent flag
      // as on. Spell them out so the panel's checkboxes match what happens.
      patchStroke: true,
      labelParts: true,
      dropInvisible: true,
      cleanClip: true,
    });
  }
  return out;
}

/* Figma splits a group's fill and stroke into separate <path> elements and
   omits stroke-width on the stroke ones. SVG then defaults them to 1, which is
   the "stroke is always 1" symptom — Figma writes nothing, the renderer fills
   in 1. A single vector gets an explicit stroke-width and is fine, so the bug
   only shows on grouped layers.

   This walks the exported markup keeping track of the enclosing <g id="…">,
   looks each layer up in the node tree by name, and writes the real values
   back. Opacity gets the same treatment when it is missing. */
/* A group has no stroke of its own — the stroke lives on the vectors inside it.
   Reading strokeWeight off the group yields 0, so the effective weight has to
   come up from the first descendant that actually strokes something. Computed
   bottom-up in one pass rather than re-walking per node. */
function strokeIndex(node) {
  var byName = {};
  (function collect(n) {
    var own = null;
    if (has(n, "strokes") && n.strokes && n.strokes.length &&
        typeof n.strokeWeight === "number" && n.strokeWeight > 0) {
      own = n.strokeWeight;
    }
    var inherited = null;
    if (hasKids(n)) {
      for (var i = 0; i < n.children.length; i++) {
        var w = collect(n.children[i]);
        if (inherited === null) inherited = w;
      }
    }
    var eff = own !== null ? own : inherited;
    if (n.name && byName[n.name] === undefined) {
      byName[n.name] = {
        w: eff,
        op: has(n, "opacity") && typeof n.opacity === "number" ? n.opacity : null,
      };
    }
    return eff;
  })(node);
  return byName;
}

var DRAW_TAGS = { path: 1, rect: 1, circle: 1, ellipse: 1, polygon: 1, polyline: 1, line: 1 };
// Content inside these is machinery, not artwork — never relabel it.
var DEFS_TAGS = { defs: 1, clipPath: 1, mask: 1, pattern: 1, filter: 1, marker: 1, symbol: 1 };

// Find where an element ends, counting nested tags of the same name.
function endOfElement(svg, tag, from) {
  var re = new RegExp("<(/?)" + tag + "(?![\\w-])([^>]*?)(/?)>", "g");
  re.lastIndex = from;
  var depth = 1, m;
  while ((m = re.exec(svg))) {
    if (m[1]) { depth--; if (depth === 0) return re.lastIndex; }
    else if (!m[3]) depth++;
  }
  return svg.length;   // unbalanced markup: drop to the end rather than guess
}

// A layer parked at 0% opacity is switched-off artwork, not faint detail, so it
// has no business in the exported file. The whole subtree goes: a transparent
// group hides everything inside it. Cutting the source range rather than
// blanking tags keeps any text content from being orphaned.
function stripInvisible(svg, node) {
  var byName = strokeIndex(node);
  function opOf(id) {
    if (!id) return null;
    var info = byName[id] || byName[id.replace(/_\d+$/, "")];
    return info ? info.op : null;
  }

  function invisible(attrs, nodeOp) {
    if (nodeOp === 0) return true;
    var o = attrs.match(/\sopacity="([^"]*)"/);
    if (o && parseFloat(o[1]) === 0) return true;
    // A paint can be zeroed per property instead of on the whole element.
    var hasFill = /\sfill="(?!none)[^"]+"/.test(attrs);
    var hasStroke = /\sstroke="(?!none)[^"]+"/.test(attrs);
    if (!hasFill && !hasStroke) return false;
    var fo = attrs.match(/\sfill-opacity="([^"]*)"/);
    var so = attrs.match(/\sstroke-opacity="([^"]*)"/);
    return (!hasFill || (fo && parseFloat(fo[1]) === 0)) &&
           (!hasStroke || (so && parseFloat(so[1]) === 0));
  }

  var tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  var cuts = [], defsDepth = 0, m;
  while ((m = tagRe.exec(svg))) {
    var close = m[1], tag = m[2], attrs = m[3], selfClose = m[4];
    if (close) { if (DEFS_TAGS[tag] && defsDepth > 0) defsDepth--; continue; }
    if (DEFS_TAGS[tag]) { if (!selfClose) defsDepth++; continue; }
    // Anything in defs is machinery something else points at; removing it
    // would break the reference rather than tidy the file.
    if (defsDepth > 0 || tag === "svg") continue;
    if (tag !== "g" && !DRAW_TAGS[tag]) continue;

    var idm = attrs.match(/\sid="([^"]*)"/);
    if (!invisible(attrs, opOf(idm ? idm[1] : null))) continue;

    var end = selfClose ? tagRe.lastIndex : endOfElement(svg, tag, tagRe.lastIndex);
    cuts.push([m.index, end]);
    tagRe.lastIndex = end;   // whatever is inside goes with it
  }
  for (var i = cuts.length - 1; i >= 0; i--) {
    svg = svg.slice(0, cuts[i][0]) + svg.slice(cuts[i][1]);
  }
  return svg;
}

// A frame with "Clip content" on exports as <g clip-path="url(#…)"> backed by a
// clipPath holding one rect the size of the canvas. That rect crops nothing —
// the artwork already sits in exactly that box, and the outermost <svg> hides
// overflow anyway — but reopening the file turns it into a "Clip path group"
// plus a stray Mask layer. Only a full-canvas, untransformed, square-cornered
// rect qualifies; anything that could actually crop is left alone.
function dropCanvasClip(svg) {
  var head = svg.match(/<svg\b([^>]*)>/);
  if (!head) return svg;

  var x0 = 0, y0 = 0, w = null, h = null;
  var vb = head[1].match(/\sviewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/);
  if (vb) { x0 = +vb[1]; y0 = +vb[2]; w = +vb[3]; h = +vb[4]; }
  else {
    var wm = head[1].match(/\swidth="([\d.]+)"/), hm = head[1].match(/\sheight="([\d.]+)"/);
    if (!wm || !hm) return svg;
    w = +wm[1]; h = +hm[1];
  }
  function near(a, b) { return Math.abs(a - b) < 0.01; }

  var re = /<clipPath\b([^>]*)>\s*<rect([^>]*?)\/?>\s*<\/clipPath>/g;
  var m, dead = [];
  while ((m = re.exec(svg))) {
    var idm = m[1].match(/\sid="([^"]+)"/);
    var a = m[2];
    if (!idm) continue;
    if (/\stransform=/.test(a) || /\srx=/.test(a) || /\sry=/.test(a)) continue;
    var rw = a.match(/\swidth="([\d.]+)"/), rh = a.match(/\sheight="([\d.]+)"/);
    var rx = a.match(/\sx="([-\d.]+)"/), ry = a.match(/\sy="([-\d.]+)"/);
    if (!rw || !rh) continue;
    if (!near(+rw[1], w) || !near(+rh[1], h)) continue;
    if (!near(rx ? +rx[1] : 0, x0) || !near(ry ? +ry[1] : 0, y0)) continue;
    dead.push({ id: idm[1], block: m[0] });
  }

  for (var i = 0; i < dead.length; i++) {
    var q = dead[i].id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    svg = svg.replace(new RegExp('\\s*clip-path="url\\(#' + q + '\\)"', "g"), "");
    svg = svg.replace(dead[i].block, "");
  }
  // defs that held nothing but those is now dead weight.
  return svg.replace(/<defs>\s*<\/defs>\s*/g, "");
}

// Emptying a group leaves the wrapper behind, and a bare <g id="negative"></g>
// still opens as a named layer — the switched-off layer looks like it survived.
// Repeated until nothing changes, because emptying an inner group can empty the
// one around it. Groups inside defs are left alone: a mask or clipPath is
// referenced by id, so an empty one is still doing a job.
function pruneEmptyGroups(svg) {
  for (;;) {
    var tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
    var defsDepth = 0, cut = null, m;
    while ((m = tagRe.exec(svg))) {
      var close = m[1], tag = m[2], selfClose = m[4];
      if (close) { if (DEFS_TAGS[tag] && defsDepth > 0) defsDepth--; continue; }
      if (DEFS_TAGS[tag]) { if (!selfClose) defsDepth++; continue; }
      if (defsDepth > 0 || tag !== "g" || selfClose) continue;
      var empty = svg.slice(tagRe.lastIndex).match(/^\s*<\/g>/);
      if (empty) { cut = [m.index, tagRe.lastIndex + empty[0].length]; break; }
    }
    if (!cut) return svg;
    svg = svg.slice(0, cut[0]) + svg.slice(cut[1]);
  }
}

function patchSvg(svg, node, cfg) {
  var labelParts = cfg.labelParts !== false;
  var fixStroke = cfg.patchStroke !== false;
  if (cfg.dropInvisible !== false) svg = stripInvisible(svg, node);
  if (cfg.cleanClip !== false) svg = dropCanvasClip(svg);
  // Both passes can leave a wrapper holding nothing; tidy once, after both.
  if (cfg.dropInvisible !== false || cfg.cleanClip !== false) svg = pruneEmptyGroups(svg);

  var byName = strokeIndex(node);

  // Figma de-duplicates repeated layer names with a _2, _3 … suffix.
  function lookup(id) {
    if (!id) return null;
    if (byName[id]) return byName[id];
    var base = id.replace(/_\d+$/, "");
    return byName[base] || null;
  }

  var stack = [];        // ids of the open <g> elements
  var defsDepth = 0;     // >0 while inside defs/clipPath/mask/…
  function context(ownId) {
    var info = lookup(ownId);
    if (info) return info;
    for (var i = stack.length - 1; i >= 0; i--) {
      info = lookup(stack[i]);
      if (info) return info;
    }
    return null;
  }

  return svg.replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g, function (m, close, tag, attrs, selfClose) {
    if (close) {
      if (tag === "g") stack.pop();
      else if (DEFS_TAGS[tag] && defsDepth > 0) defsDepth--;
      return m;
    }

    var idm = attrs.match(/\sid="([^"]*)"/);
    var ownId = idm ? idm[1] : null;

    if (DEFS_TAGS[tag]) { if (!selfClose) defsDepth++; return m; }
    if (tag === "g") { if (!selfClose) stack.push(ownId); return m; }
    if (!DRAW_TAGS[tag] || defsDepth > 0) return m;

    var hasFill = /\sfill="(?!none)[^"]+"/.test(attrs);
    var hasStroke = /\sstroke="(?!none)[^"]+"/.test(attrs);
    if (!hasFill && !hasStroke) return m;

    var add = "";
    var rewritten = attrs;

    /* Figma splits a group's paint into one anonymous path per property, so
       nothing distinguishes the fill halves from the stroke halves. A class
       fixes that and — unlike an id, which must be unique — can repeat, so
       `.stroke {}` addresses all of them at once. Ids are deliberately left
       alone: the group keeps its own name and no synthetic ones are invented.

       A single vector carries both paints on one element rather than being
       split, so it gets both classes and `.stroke` still selects it. */
    if (labelParts) {
      var kind = hasFill && hasStroke ? "fill stroke" : (hasStroke ? "stroke" : "fill");
      var cm = attrs.match(/\sclass="([^"]*)"/);
      if (!cm) {
        add += ' class="' + kind + '"';
      } else {
        var have = cm[1].split(/\s+/);
        var want = kind.split(" ").filter(function (k) { return have.indexOf(k) === -1; });
        if (want.length) {
          rewritten = attrs.replace(/(\sclass=")([^"]*)(")/, "$1$2 " + want.join(" ") + "$3");
        }
      }
    }

    if (hasStroke && fixStroke) {
      var info = context(ownId);
      // A width of 0 would hide the stroke outright — worse than leaving it
      // absent, where the SVG default of 1 at least keeps it visible.
      if (info && info.w > 0 && !/\sstroke-width=/.test(attrs)) {
        add += ' stroke-width="' + (Math.round(info.w * 1000) / 1000) + '"';
      }
      // Opacity only from the element's own layer: a group's opacity is already
      // on the <g>, and repeating it on each child would multiply it.
      var ownInfo = lookup(ownId);
      if (ownInfo && ownInfo.op !== null && ownInfo.op < 1 && !/\sopacity=/.test(attrs)) {
        add += ' opacity="' + (Math.round(ownInfo.op * 1000) / 1000) + '"';
      }
    }

    if (!add && rewritten === attrs) return m;
    return "<" + tag + rewritten + add + (selfClose ? "/" : "") + ">";
  });
}

function exportSettingsFor(c, lean) {
  var s = { format: c.format === "JPG" ? "JPG" : c.format, contentsOnly: c.contentsOnly !== false };
  if (c.suffix) s.suffix = c.suffix;
  if (c.format === "PNG" || c.format === "JPG") {
    s.constraint = { type: c.scaleMode || "SCALE", value: c.scaleValue || 1 };
    // colorProfile and imageResampling are the two the API may reject; `lean`
    // is the retry that drops them.
    if (!lean) {
      if (c.colorProfile) s.colorProfile = c.colorProfile;
      if (c.resampling) s.imageResampling = c.resampling;
    }
  } else if (c.format === "SVG") {
    s.svgOutlineText = !!c.svgOutlineText;
    s.svgIdAttribute = c.svgIdAttribute !== false;
    s.svgSimplifyStroke = c.svgSimplifyStroke !== false;
  }
  return s;
}

// Some export fields aren't accepted by every Figma build. Probe once, then
// remember, instead of failing the export.
var leanExports = false;

async function exportWithSettings(id, cfg, runId) {
  var node = await figma.getNodeByIdAsync(id);
  if (!node || node.removed || !has(node, "exportAsync")) {
    figma.notify(M("cantExport"));
    return;
  }
  // SVG_STRING gives us text to repair; anything else comes back as bytes.
  var wantsPatch = cfg.format === "SVG" &&
    (cfg.patchStroke !== false || cfg.labelParts !== false ||
     cfg.dropInvisible !== false || cfg.cleanClip !== false);
  var settings = exportSettingsFor(cfg, false);
  if (wantsPatch) settings.format = "SVG_STRING";

  var result = null;
  if (!leanExports) {
    try {
      result = await node.exportAsync(settings);
    } catch (e) { leanExports = true; }
  }
  if (result === null) {
    var lean = exportSettingsFor(cfg, true);
    if (wantsPatch) lean.format = "SVG_STRING";
    try {
      result = await node.exportAsync(lean);
    } catch (e2) {
      figma.notify(M("exportFailed") + (e2 && e2.message ? e2.message : e2));
      return;
    }
  }

  var msg = {
    type: "export-data",
    name: safeName(node.name) + (cfg.suffix || ""),
    format: cfg.format,
    runId: runId,
  };
  if (typeof result === "string") msg.svg = patchSvg(result, node, cfg);
  else msg.bytes = result;
  figma.ui.postMessage(msg);
}

