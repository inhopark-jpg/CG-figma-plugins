const fs = require("fs"), vm = require("vm");

const MIXED = Symbol("mixed");
let posted = [];

// ---- fake document -------------------------------------------------------
const vars = {
  "v1": { id: "v1", name: "spacing/md" },
  "v2": { id: "v2", name: "spacing/grid-gap" },
  "v3": { id: "v3", name: "color/surface/default" },
  "v4": { id: "v4", name: "radius/lg" },
  "v5": { id: "v5", name: "string/cta-label" },
  "v6": { id: "v6", name: "size/size-40" },
  "v7": { id: "v7", name: "spacing/global/spacing-16" },
  "v8": { id: "v8", name: "size/size-48" },
  "g1": { id: "g1", name: "gradient/light/overlay-down" },
  "g2": { id: "g2", name: "neutral/light-alpha/0" },
  "L1": { id: "L1", name: "cta/get-started", variableCollectionId: "VC:lang", resolvedType: "STRING",
          description: "Primary CTA on the hero card.",
          valuesByMode: { "M:en": "Get started", "M:ko": "시작하기", "M:ja": "--" } },
  "L2": { id: "L2", name: "cta/learn-more", variableCollectionId: "VC:lang", resolvedType: "STRING",
          valuesByMode: { "M:en": "Learn more", "M:ko": "", "M:ja": "詳細" } },
};
const LANG_COL = {
  id: "VC:lang", name: "language", defaultModeId: "M:en",
  modes: [{ modeId: "M:en", name: "English" }, { modeId: "M:ko", name: "한국어" }, { modeId: "M:ja", name: "日本語" }],
};
const styles = {
  "S:text1": { id: "S:text1", name: "Body/Medium" },
  "S:eff1":  { id: "S:eff1",  name: "Elevation/Card" },
};

function mk(o) {
  const n = Object.assign({ id: "n" + (mk.i = (mk.i || 0) + 1), name: "node", visible: true, locked: false }, o);
  if (n.children) n.children.forEach(c => { c.parent = n; });
  if (n.exportable !== false) n.exportAsync = async (st) => (st && st.format === "SVG_STRING")
    ? '<svg xmlns="http://www.w3.org/2000/svg"><g id="' + n.name + '"><path fill="black"/></g></svg>'
    : new Uint8Array([1, 2, 3]);
  n.findAllWithCriteria = function (crit) {
    const out = [];
    (function walk(x) {
      (x.children || []).forEach(c => { if (crit.types.indexOf(c.type) >= 0) out.push(c); walk(c); });
    })(n);
    return out;
  };
  return n;
}

const iconGlyph = mk({ type: "INSTANCE", name: "check", width: 16, height: 16,
  mainComp: { id: "mc-check", name: "check", key: "kchk", remote: true, parent: null } });
const iconFrame = mk({ type: "INSTANCE", name: "icon-frame", width: 24, height: 24,
  children: [iconGlyph],
  mainComp: { id: "mc-if", name: "icon-frame", key: "kif", remote: false, parent: null } });

const label = mk({
  type: "TEXT", name: "Label", width: 100, height: 20,
  characters: "Get started", textStyleId: "S:text1",
  componentPropertyReferences: { characters: "Label#2:0" },
  fontName: { family: "Inter", style: "Semi Bold" }, fontWeight: 600, fontSize: 14,
  lineHeight: { unit: "PERCENT", value: 140 }, letterSpacing: { unit: "PIXELS", value: 0 },
  paragraphSpacing: 0, paragraphIndent: 0, textCase: "ORIGINAL", textDecoration: "NONE",
  textTruncation: "ENDING", maxLines: 2, textAutoResize: "HEIGHT",
  textAlignHorizontal: "LEFT", textAlignVertical: "TOP",
  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, boundVariables: {} }],
  fillStyleId: "", effects: [],
  boundVariables: {},
  getStyledTextSegments: () => [],
});

const label2 = mk({
  type: "TEXT", name: "Caption", width: 80, height: 16,
  characters: "Get started", textStyleId: "", fontName: { family: "Inter", style: "Regular" },
  fontWeight: 400, fontSize: 12, lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PIXELS", value: 0 },
  paragraphSpacing: 0, paragraphIndent: 0, textCase: "ORIGINAL", textDecoration: "NONE",
  textTruncation: "DISABLED", maxLines: null, textAutoResize: "WIDTH_AND_HEIGHT",
  textAlignHorizontal: "LEFT", textAlignVertical: "TOP",
  fills: [], strokes: [], effects: [], fillStyleId: "",
  boundVariables: { characters: { type: "VARIABLE_ALIAS", id: "L1" } },
  getStyledTextSegments: () => [],
});

const inner = mk({
  type: "INSTANCE", name: "Button/Primary", width: 120, height: 40,
  scrollBehavior: "STICKY_SCROLLS",
  layoutMode: "HORIZONTAL", layoutWrap: "NO_WRAP", itemSpacing: 8,
  primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
  primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "FIXED",
  layoutSizingHorizontal: "HUG", layoutSizingVertical: "FIXED",
  paddingTop: 0, paddingRight: 16, paddingBottom: 0, paddingLeft: 16,
  minWidth: 48, clipsContent: true,
  boundVariables: { height: { id: "v6" }, itemSpacing: { id: "v1" },
                    paddingLeft: { id: "v7" }, paddingRight: { id: "v7" }, minWidth: { id: "v8" } },
  children: [iconFrame, label, label2],
  effects: [{ type: "DROP_SHADOW", visible: true, color: { r: 0, g: 0, b: 0, a: 0.12 },
              offset: { x: 0, y: 2 }, radius: 8, spread: 0, blendMode: "NORMAL",
              boundVariables: { radius: { type: "VARIABLE_ALIAS", id: "v4" } } }],
  effectStyleId: "S:eff1",
  componentProperties: {
    "Size#1:0": { type: "VARIANT", value: "Large" },
    "Label#2:0": { type: "TEXT", value: "Learn more", boundVariables: { value: { id: "L2" } } },
    "Show icon#3:0": { type: "BOOLEAN", value: true },
    "icon#4:0": { type: "INSTANCE_SWAP", value: "107:4553" },
  },
  mainComp: { id: "mc-btn", name: "Size=Large", key: "kbtn", remote: false,
              parent: { type: "COMPONENT_SET", id: "cs-btn", name: "Button" } },
});

const scrim = mk({ type: "RECTANGLE", name: ".pattern-scrim", width: 320, height: 60,
  x: 12, y: 24, layoutPositioning: "ABSOLUTE",
  constraints: { horizontal: "STRETCH", vertical: "MIN" },
  strokeWeight: 2, strokeAlign: "INSIDE",
  strokeTopWeight: 0, strokeRightWeight: 0, strokeBottomWeight: 0, strokeLeftWeight: 1,
  dashPattern: [0.10000000149011612, 4],
  strokeCap: "ROUND", strokeJoin: "MITER", strokeMiterLimit: 28.96,
  fills: [{ type: "GRADIENT_LINEAR", opacity: 1, blendMode: "NORMAL",
    gradientStops: [
      { color: { r:1, g:1, b:1, a:1 }, position: 0, boundVariables: { color: { id: "g1" } } },
      { color: { r:1, g:1, b:1, a:0 }, position: 1, boundVariables: { color: { id: "g2" } } },
    ] }],
  strokes: [{ type: "SOLID", color: { r: 0.05, g: 0.06, b: 0.07 }, opacity: 0.7, boundVariables: {} }],
  effects: [], fillStyleId: "", strokeStyleId: "" });

const card = mk({
  type: "FRAME", name: "Card", width: 320, height: 200, x: 0, y: 0,
  layoutMode: "GRID", gridColumnCount: 2, gridRowCount: 2, gridColumnGap: 16, gridRowGap: 8,
  paddingTop: 16, paddingRight: 24, paddingBottom: 16, paddingLeft: 8,
  clipsContent: true, opacity: 1, blendMode: "PASS_THROUGH", rotation: 0,
  scrollBehavior: "SCROLLS", overflowDirection: "VERTICAL",
  cornerRadius: 12, cornerSmoothing: 0,
  fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.12 }, boundVariables: { color: { id: "v3" } } }],
  fillStyleId: "", strokes: [], effects: [],
  layoutGrids: [{ pattern: "COLUMNS", count: 12, gutterSize: 16, offset: 24, alignment: "STRETCH",
                  visible: true, boundVariables: { gutterSize: { id: "v2" } } }],
  explicitVariableModes: { "VC:1": "M:2" },
  boundVariables: { gridColumnGap: { id: "v2" }, gridRowGap: { id: "v1" },
                    paddingTop: { id: "v1" }, paddingRight: { id: "v1" },
                    paddingBottom: { id: "v1" }, paddingLeft: { id: "v1" },
                    topLeftRadius: { id: "v4" } },
  children: [inner, scrim],
});


const variant = mk({ type: "COMPONENT", name: "Size=Large", width: 120, height: 40, fills: [], strokes: [], effects: [], children: [] });
Object.defineProperty(variant, "componentPropertyDefinitions", {
  get() { throw new Error("Cannot get componentPropertyDefinitions of a component that is a variant of a component set. Use the component set instead."); },
});
const cset = mk({ type: "COMPONENT_SET", name: "Button", width: 140, height: 60, children: [variant],
  description: "Primary action button.\nUse one per dialog.",
  componentPropertyDefinitions: { "Size": { type: "VARIANT", variantOptions: ["Small", "Large"] } },
  fills: [], strokes: [], effects: [] });
variant.parent = cset;

const page = mk({ type: "PAGE", name: "Page 1", children: [card, cset] });
card.parent = page;

// ---- fake plugin API -----------------------------------------------------
const nodesById = { "107:4553": { id: "107:4553", name: "sprout", type: "COMPONENT", parent: { type: "COMPONENT_SET", name: "icon" } } };
(function idx(n) { nodesById[n.id] = n; (n.children || []).forEach(idx); })(page);

const figma = {
  mixed: MIXED,
  editorType: "dev",
  showUI() {},
  notify(m) { console.log("  notify:", m); },
  ui: { postMessage(m) { posted.push(m); }, onmessage: null },
  clientStorage: { getAsync: async () => "en", setAsync: async () => {} },
  currentPage: Object.assign(page, { selection: [ { Scrim: scrim, Card: card, Label: label, Button: inner, Variant: variant, Set: cset }[process.env.SEL || "Card"] ] }),
  on() {},
  getNodeByIdAsync: async (id) => nodesById[id] || null,
  getStyleByIdAsync: async (id) => styles[id] || null,
  setCurrentPageAsync: async () => {},
  viewport: { scrollAndZoomIntoView() {} },
  variables: {
    getVariableByIdAsync: async (id) => vars[id] || null,
    getVariableCollectionByIdAsync: async (id) => id === "VC:1"
      ? { id, name: "theme", defaultModeId: "M:1", modes: [{ modeId: "M:1", name: "light" }, { modeId: "M:2", name: "dark" }] }
      : (id === "VC:lang" ? LANG_COL : null),
  },
  importComponentByKeyAsync: async (k) => null,
};
[iconFrame, iconGlyph, inner].forEach(n => { n.getMainComponentAsync = async () => n.mainComp; });

const ctx = vm.createContext({ figma, __html__: "", console, Map, Symbol, Object, Array, Math, String, Number, JSON, Infinity, Promise, Uint8Array });
vm.runInContext(fs.readFileSync(process.argv[2] || require("path").resolve(__dirname, "..", "code.js"), "utf8"), ctx);

const NODES = { Scrim: scrim, Card: card, Label: label, Button: inner, Variant: variant, Set: cset, IconFrame: iconFrame, Sprout: iconGlyph };
module.exports = { ctx, figma, NODES, posted, mk, nodesById, page, card };
if (require.main !== module) return;
(async () => {
  if (process.env.SEQ) {
    // Inspect several layers in a row through one long-lived plugin instance,
    // the way a real session does.
    for (const name of process.env.SEQ.split(",")) {
      figma.currentPage.selection = [NODES[name]];
      const st = await ctx.buildState();
      const tr = st.node.tree;
      const flat = [];
      (function walk(e, d) { flat.push(" ".repeat(d) + (e.current ? "> " : "  ") + e.name); (e.children||[]).forEach(c => walk(c, d+1)); })(tr.root, 0);
      console.log(`select ${name.padEnd(10)} treeRoot=${tr.root.name.padEnd(14)}`);
      console.log(flat.join("\n"));
    }
    return;
  }
  const state = await ctx.buildState();
  console.log(JSON.stringify(state, null, 1));
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
