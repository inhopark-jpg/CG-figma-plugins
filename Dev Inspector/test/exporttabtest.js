// The Export tab must agree with the Icons tab: same repairs, same subject.
const fs = require("fs"), vm = require("vm"), path = require("path");
const { el } = require("./domshim.js");
const M = require("./mock.js");
const DIR = path.resolve(__dirname, "..");

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

const els = {}, sent = [];
const ui = vm.createContext({
  document: { getElementById: i => (els[i] = els[i] || el(i)), createElement: t => { const e = el(t); e.click = () => {}; return e; },
              body: { appendChild() {}, removeChild() {} }, addEventListener() {}, execCommand: () => true },
  window: { addEventListener() {}, innerWidth: 460 },
  parent: { postMessage: m => sent.push(m.pluginMessage) },
  console, Object, Array, Math, String, Number, JSON, RegExp, Date,
  Blob: function (p) { this.parts = p; }, URL: { createObjectURL: () => "b", revokeObjectURL() {} },
  TextDecoder: function () { return { decode: () => "" }; }, setTimeout: f => setTimeout(f, 0), clearTimeout,
  Uint8Array, DataView,
});
vm.runInContext(fs.readFileSync(path.join(DIR, "ui.html"), "utf8").match(/<script>([\s\S]*)<\/script>/)[1], ui);

const show = async node => {
  M.figma.currentPage.selection = [node];
  ui.S.tab = "export";
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });
};
const runRow = () => {
  sent.length = 0;
  els.main.querySelector("[data-export-run]").onclick({ stopPropagation() {}, preventDefault() {} });
  return sent.find(m => m.type === "export-run");
};
const checkState = (h, attr) => {
  const m = h.match(new RegExp('hcheck([^"]*)" ' + attr));
  return m ? (m[1].indexOf("on") >= 0 ? "CHECKED" : "unchecked") : "absent";
};

(async () => {
  /* ---- 1. a layer with export settings already saved in Figma ---- */
  const card = M.NODES.Card;
  card.exportSettings = [{ format: "SVG", constraint: { type: "SCALE", value: 1 },
    suffix: "", contentsOnly: true, svgIdAttribute: true, svgSimplifyStroke: true }];
  await show(card);
  ui.S.exportRows[0].open = true; ui.renderBody();
  let h = els.main.innerHTML;

  ok("drop-0%-opacity checkbox present", h.includes("data-exp-hidden"));
  ok("clip-path checkbox present", h.includes("data-exp-clip"));
  ok("repair stroke shows checked", checkState(h, "data-exp-patch") === "CHECKED",
     checkState(h, "data-exp-patch"));
  ok("label parts shows checked", checkState(h, "data-exp-label") === "CHECKED",
     checkState(h, "data-exp-label"));
  ok("drop invisible shows checked", checkState(h, "data-exp-hidden") === "CHECKED",
     checkState(h, "data-exp-hidden"));
  ok("clean clip shows checked", checkState(h, "data-exp-clip") === "CHECKED",
     checkState(h, "data-exp-clip"));

  let row = runRow().rows[0];
  ok("and the sent row agrees with the boxes",
     row.patchStroke === true && row.labelParts === true &&
     row.dropInvisible === true && row.cleanClip === true, JSON.stringify(row));

  // unticking one must actually turn it off, not just redraw
  els.main.querySelectorAll("[data-exp-hidden]")[0].onclick({ stopPropagation() {}, preventDefault() {} });
  ok("unticking drop-invisible sticks", ui.S.exportRows[0].dropInvisible === false);
  ok("and reaches the main thread as false", runRow().rows[0].dropInvisible === false);
  els.main.querySelectorAll("[data-exp-clip]")[0].onclick({ stopPropagation() {}, preventDefault() {} });
  ok("unticking clean-clip sticks", ui.S.exportRows[0].cleanClip === false);

  /* ---- 2. selecting an icon wrapper exports the asset inside ---- */
  const glyph = M.mk({ type: "INSTANCE", name: ".favorite", width: 16, height: 16,
    mainComp: { id: "mcfav", name: ".favorite", key: "kfav", remote: true, parent: null } });
  const frame = M.mk({ type: "INSTANCE", name: "icon-frame", width: 24, height: 24, children: [glyph],
    mainComp: { id: "mcif2", name: "icon-frame", key: "kif2", remote: false, parent: null } });
  frame.getMainComponentAsync = async () => frame.mainComp;
  glyph.getMainComponentAsync = async () => glyph.mainComp;
  frame.parent = M.page; M.page.children.push(frame);
  (function idx(n) { M.nodesById[n.id] = n; (n.children || []).forEach(idx); })(frame);

  await show(frame);
  ok("wrapper's inner asset reported", !!ui.S.node.exportAsset &&
     ui.S.node.exportAsset.name === ".favorite", JSON.stringify(ui.S.node.exportAsset));
  h = els.main.innerHTML;
  ok("the option is offered", h.includes("data-export-inner"));
  ok("and on by default", checkState(h, "data-export-inner") === "CHECKED");
  ok("button names the asset", h.includes(".favorite"), (h.match(/data-export-run>[^<]*/) || [])[0]);

  let run = runRow();
  ok("exports the asset, not the frame", run.nodeId === glyph.id,
     run.nodeId + " (frame is " + frame.id + ")");

  // turning it off falls back to the frame
  els.main.querySelector("[data-export-inner]").onclick({ stopPropagation() {}, preventDefault() {} });
  ok("unticking exports the frame again", runRow().nodeId === frame.id);

  /* ---- 3. an ordinary layer is never redirected ---- */
  await show(M.NODES.Card);
  ok("no inner-asset option on a plain frame", !ui.S.node.exportAsset,
     JSON.stringify(ui.S.node.exportAsset));
  ok("option not rendered", !els.main.innerHTML.includes("data-export-inner"));
  ok("exports the selection itself", runRow().nodeId === M.NODES.Card.id);

  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL EXPORT TAB TESTS PASSED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
