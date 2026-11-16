// Design tokens tab: which collections are offered, which can't be left out,
// and what the exported json says. This suite pins its rules, not the whole file.
const fs = require("fs"), vm = require("vm"), path = require("path");
const { boot, ok, done } = require("./harness.js");
const DIR = path.resolve(__dirname, "..");

const alias = id => ({ type: "VARIABLE_ALIAS", id });
const V = (id, cid, name, resolvedType, valuesByMode, description) =>
  ({ id, variableCollectionId: cid, name, resolvedType, valuesByMode, description: description || "" });
const vars = [
  V("v:b1", "C:base", "red/500", "COLOR", { "m:b": { r: 1, g: 0, b: 0, a: 1 } }),
  V("v:b2", "C:base", "red-alpha/50", "COLOR", { "m:b": { color: alias("v:b1"), opacity: 50 } }),
  V("v:s1", "C:sem", "fill/main", "COLOR", { "m:l": alias("v:b1"), "m:d": alias("v:b2"), "m:h": { r: 0, g: 0, b: 1, a: 1 } }, "main fill"),
  V("v:s2", "C:sem", "spacing/s", "FLOAT", { "m:l": 4, "m:d": 8, "m:h": 8 }),
  V("v:s3", "C:sem", "font-weight/bold", "FLOAT", { "m:l": 700, "m:d": 700, "m:h": 700 }),
  V("v:t1", "C:top", "gap", "FLOAT", { "m:t": alias("v:s2") }),
  V("v:e1", "C:ext", "brand", "COLOR", { "m:e": alias("VariableID:lib/1") }),
  V("v:u1", "C:uses", "brand-2", "COLOR", { "m:u": alias("v:e1") }),
];
const col = (id, name, modes, def) => ({
  id, name, defaultModeId: def || modes[0][0], modes: modes.map(m => ({ modeId: m[0], name: m[1] })),
  variableIds: vars.filter(v => v.variableCollectionId === id).map(v => v.id),
});
const cols = [
  col("C:base", "color-primitive", [["m:b", "Mode 1"]]),
  col("C:div", "––––", [["m:x", "Mode 1"]]),
  col("C:sem", "color-semantic", [["m:l", "light"], ["m:d", "dark"], ["m:h", "high"]]),
  col("C:top", "preset", [["m:t", "Mode 1"]]),
  col("C:ext", "ext", [["m:e", "Mode 1"]]),
  col("C:uses", "uses-ext", [["m:u", "Mode 1"]]),
];
const textStyles = [{
  name: "body/regular/b1", fontName: { family: "Pretendard", style: "Regular" }, fontSize: 14,
  lineHeight: { unit: "PERCENT", value: 150 }, letterSpacing: { unit: "PERCENT", value: -2 },
  boundVariables: { fontSize: alias("v:s2") },
}];
const stop = (position, id) => ({ position, color: { r: 0, g: 0, b: 0, a: 1 }, boundVariables: id ? { color: alias(id) } : {} });
let paintStyles = [{
  name: "gradient/down", paints: [{ type: "GRADIENT_LINEAR", gradientTransform: [[0, 1, 0], [-1, 0, 1]],
    gradientStops: [stop(0, "v:s1"), stop(1, "v:s1")] }],
}];

const figma = {
  showUI() {}, on() {}, ui: { postMessage() {} },
  clientStorage: { getAsync: async () => null, setAsync: async () => {} },
  variables: {
    getLocalVariableCollectionsAsync: async () => cols,
    getLocalVariablesAsync: async () => vars,
    getVariableByIdAsync: async id => vars.find(v => v.id === id) || null,
  },
  getLocalTextStylesAsync: async () => textStyles,
  getLocalPaintStylesAsync: async () => paintStyles,
};
const main = vm.createContext({ figma, __html__: "", console, Map, Object, Array, Math, String, Number, JSON, Promise, Date });
vm.runInContext(fs.readFileSync(DIR + "/code.js", "utf8"), main);
main.lang = "en";

(async () => {
  /* ---- 1. what the main thread offers ---- */
  const list = await main.tokensList();
  const byName = n => list.collections.find(c => c.name === n);
  ok("a collection with no variables is not offered", !byName("––––"),
     list.collections.map(c => c.name).join(", "));
  ok("collections keep Figma's order",
     list.collections.map(c => c.name).join(",") === "color-primitive,color-semantic,preset,ext,uses-ext");
  ok("an alias is a dependency", byName("color-semantic").deps.join() === "C:base");
  ok("colour + opacity inside one collection is not a dependency", byName("color-primitive").deps.length === 0);
  ok("an alias that leaves the file is counted", byName("ext").outside === 1);
  ok("modes are listed with the default", byName("color-semantic").modeList.map(m => m.name).join() === "light,dark,high" &&
     byName("color-semantic").defaultModeId === "m:l");
  ok("text styles depend on what they're bound to", list.textStyles.deps.join() === "C:sem");
  ok("gradient stops depend on what they're bound to", list.paintStyles.deps.join() === "C:sem");

  /* ---- 2. the tab, with nothing selected ---- */
  const { ctx, els, sent } = boot();
  let saved = null;
  ctx.document.createElement = t => ({ click() { saved = this.download; } });
  ctx.onmessage({ data: { pluginMessage: { type: "state", lang: "en", selection: "none" } } });
  ctx.S.tab = "tokens";
  ctx.onmessage({ data: { pluginMessage: list } });
  const rowOf = key => els.main.querySelectorAll("[data-tok-pick]").find(e => e.getAttribute("data-tok-pick") === key);
  const modeOf = name => els.main.querySelectorAll("[data-tok-mode]").find(e => e.getAttribute("data-tok-mode-name") === name);
  const html = () => els.main.innerHTML;
  const modeOn = name => { const e = modeOf(name); return e.classList.contains("link") || e.classList.contains("b-main"); };
  const allRow = () => els.main.querySelector("[data-tok-all]");
  const modeAll = () => els.main.querySelector("[data-tok-mode-all]");
  const isOn = key => rowOf(key).classList.contains("on");
  const isLocked = key => rowOf(key).hasAttribute("data-tok-off");
  const click = key => rowOf(key).onclick({ stopPropagation() {} });

  ok("the tab works without a selection", !!rowOf("C:base"), html().slice(0, 120));
  ok("its tab is in the bar", html().includes('data-tab="tokens"'));
  ok("the default list starts ticked", ["C:base", "C:sem", "$textStyles", "$paintStyles"].every(isOn));
  ok("anything else starts unticked", !isOn("C:top"));
  ok("an outside alias blocks the collection", isLocked("C:ext") && !isOn("C:ext") &&
     html().includes("1 alias outside this file"));
  ok("and anything that needs it", isLocked("C:uses") && !isOn("C:uses") && html().includes("Needs: ext"));
  ok("a referenced collection is locked, and says by whom", isLocked("C:base") && html().includes("Used by: color-semantic"));
  ok("color-semantic names every ticked row that needs it", html().includes("Used by: Text styles, Paint styles"));
  ok("style rows say which collections they use",
     (html().match(/Uses: color-semantic/g) || []).length === 2);
  ok("an unreferenced collection is free", !isLocked("C:top"));

  ok("a ticked collection with several modes lists them", ["light", "dark", "high"].every(n => !!modeOf(n)));
  ok("a single-mode one doesn't", !els.main.querySelectorAll("[data-tok-mode]").some(e => e.getAttribute("data-tok-mode") === "C:base"));
  ok("modes sit on one line under their collection, as chips",
     /data-tok-pick="C:sem"[\s\S]*?<\/div><div[^>]*>(<span class="badge[^"]*" data-tok-mode="C:sem"[^>]*>[^<]*<\/span>){3}/.test(html()));
  ok("the default mode is locked", modeOf("light").hasAttribute("data-tok-off") && modeOf("light").classList.contains("b-main"));
  modeOf("light").onclick({ stopPropagation() {} });
  ok("and clicking it does nothing", modeOn("light"));
  ok("all modes on: the button offers default only", modeAll()._html.startsWith("Default only<"));
  modeAll().onclick({ stopPropagation() {} });
  ok("default only leaves just the default", modeOn("light") && !modeOn("dark") && !modeOn("high"));
  ok("and the button now offers all", modeAll()._html.startsWith("All<"));
  modeAll().onclick({ stopPropagation() {} });
  ok("all turns every mode back on", ["light", "dark", "high"].every(modeOn));
  modeOf("high").onclick({ stopPropagation() {} });
  ok("another mode can be left out", !modeOn("high") && modeOn("dark"));
  ok("modes are saved by name", sent.some(m => m.type === "set-prefs" && m.prefs.tokModes["color-semantic"].high === false));

  click("C:top");
  ok("ticking a row the default left out works", isOn("C:top"));
  click("C:top");
  click("$textStyles");
  ok("still locked while one referrer is left", isLocked("C:sem"));
  click("$paintStyles");
  ok("unlocked once nothing ticked needs it", !isLocked("C:sem"));
  ok("and it stays ticked", isOn("C:sem"));
  click("C:sem");
  ok("unticking it frees what it needed, still ticked", !isOn("C:sem") && isOn("C:base") && !isLocked("C:base"));
  ok("and hides its modes", !modeOf("dark"));
  click("C:base");
  ok("nothing ticked, nothing to export", /data-tok-export disabled/.test(html()));

  click("C:sem");
  ok("ticking a row ticks the whole chain under it", isOn("C:sem") && isOn("C:base"));
  ok("the choice is saved", sent.some(m => m.type === "set-prefs" && m.prefs.tokSel && m.prefs.tokSel["color-semantic"] === true));
  ok("the mode choice outlives unticking", !modeOn("high"));

  ok("select-all is partial while preset is off", !allRow().classList.contains("on") && allRow()._html.includes("–"));
  allRow().onclick({ stopPropagation() {} });
  ok("select-all ticks every collection that can go", ["C:base", "C:sem", "C:top"].every(isOn) &&
     !isOn("C:ext") && !isOn("C:uses") && allRow().classList.contains("on"));
  allRow().onclick({ stopPropagation() {} });
  ok("and unticks them all again", !["C:base", "C:sem", "C:top"].some(isOn));
  ok("styles are not part of it", !isOn("$textStyles") && !isOn("$paintStyles"));
  click("C:sem");

  sent.length = 0;
  els.main.querySelector("[data-tok-export]").onclick({ stopPropagation() {} });
  const req = sent.find(m => m.type === "tokens-export");
  ok("export asks for exactly the ticked collections and modes",
     req && req.ids.slice().sort().join() === "C:base,C:sem" && !req.textStyles && !req.paintStyles &&
     req.modes["C:sem"].join() === "m:l,m:d" && req.modes["C:base"].join() === "m:b",
     JSON.stringify(req));

  /* ---- 3. the json ---- */
  const res = await main.tokensExport(["C:base", "C:sem", "C:top"], true, true);
  ok("exports", res.type === "tokens-json", JSON.stringify(res.problems));
  const j = JSON.parse(res.text);
  ok("no file header", res.text.endsWith("}\n") && res.text.startsWith('{\n  "color-primitive"'));
  ok("collections in Figma's order, then styles",
     Object.keys(j).join() === "color-primitive,color-semantic,preset,$textStyles,$paintStyles", Object.keys(j).join());
  ok("solid colour: hex, alpha 1.0", j["color-primitive"].red["500"].$value === "#ff0000" &&
     /"\$alpha": 1\.0\n/.test(res.text) && j["color-primitive"].red["500"].$alpha === 1);
  ok("colour + opacity: hex, alpha apart", j["color-primitive"]["red-alpha"]["50"].$value === "#ff0000" &&
     j["color-primitive"]["red-alpha"]["50"].$alpha === 0.5);
  ok("single mode: no mode list, ids or extensions", !("$extensions" in j["color-primitive"]) &&
     JSON.stringify(j["color-primitive"].red["500"]) === '{"$type":"color","$value":"#ff0000","$alpha":1}');
  ok("several modes: listed with the default", JSON.stringify(j["color-semantic"].$extensions) ===
     '{"com.figma.modes":["light","dark","high"],"com.figma.defaultMode":"light"}');
  ok("an alias is a {path}, per mode, with no alpha", j["color-semantic"].fill.main.$value === "{color-primitive.red.500}" &&
     !("$alpha" in j["color-semantic"].fill.main) &&
     j["color-semantic"].fill.main.$extensions["com.figma.modeValues"].dark === "{color-primitive.red-alpha.50}");
  ok("a literal colour per mode is the same pair",
     JSON.stringify(j["color-semantic"].fill.main.$extensions["com.figma.modeValues"].high) === '{"$value":"#0000ff","$alpha":1}');
  ok("descriptions and ids left out", !/\$description|variableId|\$generatedAt/.test(res.text));
  ok("font-weight is a number, spacing a dimension",
     j["color-semantic"]["font-weight"].bold.$type === "number" && j["color-semantic"].spacing.s.$type === "dimension");
  ok("text style: bound value as a reference, the rest literal",
     JSON.stringify(j.$textStyles["body/regular/b1"]) ===
     '{"fontFamily":"Pretendard","fontWeight":"Regular","fontSize":"{color-semantic.spacing.s}","lineHeight":"150%","letterSpacing":"-0.02em"}',
     JSON.stringify(j.$textStyles["body/regular/b1"]));
  ok("gradient: type, angle, stops by reference",
     JSON.stringify(j.$paintStyles["gradient/down"]) ===
     '{"type":"linear","angle":180,"stops":[{"position":0,"color":"{color-semantic.fill.main}"},{"position":1,"color":"{color-semantic.fill.main}"}]}',
     JSON.stringify(j.$paintStyles["gradient/down"]));
  ok("styles left out when unticked", !("$textStyles" in JSON.parse((await main.tokensExport(["C:base"], false, false)).text)));

  const two = JSON.parse((await main.tokensExport(["C:base", "C:sem"], false, false, { "C:sem": ["m:l", "m:d"] })).text);
  ok("an unticked mode is left out everywhere",
     JSON.stringify(two["color-semantic"].$extensions["com.figma.modes"]) === '["light","dark"]' &&
     !("high" in two["color-semantic"].fill.main.$extensions["com.figma.modeValues"]));
  const one = JSON.parse((await main.tokensExport(["C:base", "C:sem"], false, false, { "C:sem": [] })).text);
  ok("the default mode is written even if not asked for, and one mode left means no mode list",
     !("$extensions" in one["color-semantic"]) && one["color-semantic"].spacing.s.$value === 4 &&
     !("$extensions" in one["color-semantic"].spacing.s));

  const missing = await main.tokensExport(["C:sem"], false, false);
  ok("an alias into an unexported collection fails, not guesses",
     missing.type === "tokens-error" && missing.problems.some(p => p.includes("v:b1")), JSON.stringify(missing.problems));

  paintStyles = [{ name: "solid", paints: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }] },
                 { name: "loose", paints: [{ type: "GRADIENT_LINEAR", gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [stop(0)] }] }];
  const bad = await main.tokensExport(["C:base", "C:sem"], false, true);
  ok("a solid paint style is reported", bad.type === "tokens-error" && bad.problems.some(p => p.includes('"solid" is not a gradient')));
  ok("an unbound gradient stop is reported", bad.problems.some(p => p.includes('"loose" has a stop')), JSON.stringify(bad.problems));

  /* ---- 4. the UI handles the answers ---- */
  ctx.onmessage({ data: { pluginMessage: res } });
  ok("the json downloads as design-tokens.json", saved === "design-tokens.json", saved);
  ctx.onmessage({ data: { pluginMessage: bad } });
  ok("problems are listed in the tab", html().includes("notice err") && html().includes("is not a gradient"));

  ctx.S.lang = "ko"; ctx.renderBody();
  ok("Korean tab label", html().includes(">디자인 토큰<"));
  ok("Korean select-all", html().includes("Collection 전체"));

  done("TOKEN EXPORT TESTS");
})();
