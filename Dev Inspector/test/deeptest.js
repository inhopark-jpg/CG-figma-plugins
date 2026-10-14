// Go to Main Component twice, nested, then walk all the way back. Every tree
// on the trail must come back with its own row marked, not just the last one.
const fs = require("fs"), vm = require("vm");
const { el } = require("./domshim.js");
const M = require("./mock.js");
const DIR = require("path").resolve(__dirname, "..");

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

// ── three levels: Screen ▸ instance A ▸ (A's main) ▸ instance 가 ▸ (가's main)
const gaMain = M.mk({ type: "COMPONENT", name: "ga-main", width: 16, height: 16,
  fills: [], strokes: [], effects: [], children: [] });
const deepLeaf = M.mk({ type: "INSTANCE", name: "leaf", width: 8, height: 8,
  mainComp: { id: gaMain.id, name: "leaf-main", key: "kl", remote: false, parent: null } });
const ga = M.mk({ type: "INSTANCE", name: "가", width: 16, height: 16, children: [deepLeaf],
  mainComp: { id: gaMain.id, name: "ga-main", key: "kga", remote: false, parent: null } });
const aMain = M.mk({ type: "COMPONENT", name: "A-main", width: 40, height: 40,
  fills: [], strokes: [], effects: [], children: [ga] });
const aInner = M.mk({ type: "INSTANCE", name: "가", width: 16, height: 16, children: [],
  mainComp: { id: gaMain.id, name: "ga-main", key: "kga", remote: false, parent: null } });
const instA = M.mk({ type: "INSTANCE", name: "A", width: 40, height: 40, children: [aInner],
  mainComp: { id: aMain.id, name: "A-main", key: "ka", remote: false, parent: null } });
const screen = M.mk({ type: "FRAME", name: "Screen", width: 200, height: 200, x: 0, y: 0,
  fills: [], strokes: [], effects: [], children: [instA], clipsContent: false });
screen.parent = M.page; aMain.parent = M.page; gaMain.parent = M.page;
M.page.children.push(screen, aMain, gaMain);
[instA, aInner, ga, deepLeaf].forEach(n => { n.getMainComponentAsync = async () => n.mainComp; });
[screen, aMain, gaMain].forEach(n => (function idx(x) { M.nodesById[x.id] = x; (x.children || []).forEach(idx); })(n));

const els = {};
const ui = vm.createContext({
  document: { getElementById: i => (els[i] = els[i] || el(i)), createElement: t => el(t),
              body: { appendChild() {}, removeChild() {} }, addEventListener() {} },
  window: { addEventListener() {}, innerWidth: 460 },
  parent: { postMessage: m => M.figma.ui.onmessage(m.pluginMessage, {}) },
  console, Object, Array, Math, String, Number, JSON, RegExp, Date,
  Blob: function () {}, URL: { createObjectURL: () => "b", revokeObjectURL() {} },
  TextDecoder: function () { return { decode: () => "" }; }, setTimeout, clearTimeout,
});
vm.runInContext(fs.readFileSync(DIR + "/ui.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1], ui);
M.figma.ui.postMessage = m => ui.onmessage({ data: { pluginMessage: m } });

const push = async node => {
  M.figma.currentPage.selection = [node];
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });
};
const marked = () => (els.main.innerHTML.match(/data-pick="([^"]+)"[^>]*>/g) || []) &&
  (function () {
    const out = [];
    els.main.querySelectorAll("[data-pick]").forEach(r => {
      if ((r.getAttribute("class") || "").indexOf("origin") >= 0) out.push(r.getAttribute("data-pick"));
    });
    return out;
  })();
const clickMainOn = id => {
  const b = els.main.querySelectorAll("[data-nav-from]")
    .filter(x => x.getAttribute("data-nav-from") === id)[0];
  if (!b) throw new Error("no go-to-main button on " + id);
  b.onclick({ stopPropagation() {} });
};

(async () => {
  ui.S.tab = "inspect";
  // Navigation round-trips through the bridge on its own (nav-node -> navNode ->
  // push), so only genuine canvas selections are pushed by hand here.
  const settle = () => new Promise(r => setTimeout(r, 30));

  // 1. start on Screen; jump to A's main from the tree row for A
  await push(screen);
  ok("start: Screen tree", ui.S.node.tree.rootId === screen.id);
  clickMainOn(instA.id);
  await settle();
  ok("landed on A's main", ui.S.node.id === aMain.id, ui.S.node.name);

  // 2. from inside A's main, jump again from the row for 가
  ui.S.treeOpen[ga.id] = true; ui.renderBody();
  clickMainOn(ga.id);
  await settle();
  ok("landed on 가's main", ui.S.node.id === gaMain.id, ui.S.node.name);
  ok("two markers on the trail", Object.keys(ui.S.origins).length === 2,
     JSON.stringify(ui.S.origins));
  ok("back stack is two deep", ui.S.back.length === 2,
     JSON.stringify(ui.S.back.map(b => b.name)));

  // 3. back once -> A's main, with 가 marked
  ui.step(ui.S.back, ui.S.fwd, false);
  await settle();
  ok("back once lands on A's main", ui.S.node.id === aMain.id, ui.S.node.name);
  ok("가 is marked", marked().indexOf(ga.id) >= 0, JSON.stringify(marked()));

  // 4. back again -> Screen, with A marked. THIS is what only worked one level deep.
  ui.step(ui.S.back, ui.S.fwd, false);
  await settle();
  ok("back twice lands on Screen", ui.S.node.id === screen.id, ui.S.node.name);
  ok("A is marked two levels back", marked().indexOf(instA.id) >= 0, JSON.stringify(marked()));
  ok("exactly one row marked here", marked().length === 1, JSON.stringify(marked()));

  // 5. forward lands unmarked: it moves toward where you had already gone
  ui.step(ui.S.fwd, ui.S.back, true);
  await settle();
  ok("forward lands on A's main again", ui.S.node.id === aMain.id, ui.S.node.name);
  ok("forward shows no marker", marked().length === 0, JSON.stringify(marked()));
  ok("but the marker is only hidden, not discarded", !!ui.S.origins[aMain.id],
     JSON.stringify(ui.S.origins));

  // 6. back again from there marks it once more
  ui.step(ui.S.back, ui.S.fwd, false);
  await settle();
  ok("back from there lands on Screen", ui.S.node.id === screen.id, ui.S.node.name);
  ok("and marks A again", marked().indexOf(instA.id) >= 0, JSON.stringify(marked()));
  ui.step(ui.S.fwd, ui.S.back, true);
  await settle();
  ok("forward is still unmarked the second time", marked().length === 0, JSON.stringify(marked()));

  // 7. a fresh canvas selection ends the trail
  await push(screen);
  ok("selecting anew clears every marker", Object.keys(ui.S.origins).length === 0,
     JSON.stringify(ui.S.origins));
  ok("nothing marked after that", marked().length === 0, JSON.stringify(marked()));

  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL DEEP-HISTORY TESTS PASSED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
