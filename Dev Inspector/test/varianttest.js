// Variants: no parent-edge numbers, and a row that offers the variant itself
// rather than a "main component" that is really the set it already sits in.
const fs = require("fs"), vm = require("vm");
const { el } = require("./domshim.js");
const M = require("./mock.js");
const DIR = require("path").resolve(__dirname, "..");

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

// a second variant, so the set has a real list
const variantB = M.mk({ type: "COMPONENT", name: "Size=Small", width: 100, height: 32,
  x: 0, y: 60, fills: [], strokes: [], effects: [], children: [] });
const cset = M.NODES.Set;
cset.children.push(variantB);
variantB.parent = cset;
M.nodesById[variantB.id] = variantB;
// give the variants real coordinates inside the set
M.NODES.Variant.x = 0; M.NODES.Variant.y = 0;

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
const push = async n => { M.figma.currentPage.selection = [n]; ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } }); };

(async () => {
  /* ---- 1. edges ---- */
  ui.S.tab = "inspect";

  await push(M.NODES.Variant);
  ok("variant: no edge distances", !ui.S.node.layout.edges,
     JSON.stringify(ui.S.node.layout.edges));
  ok("variant: Top/Right/Bottom/Left not rendered",
     !/lp-fk">Top</.test(els.main.innerHTML) && !/lp-fk">Left</.test(els.main.innerHTML));

  await push(M.NODES.Card);                       // a frame sitting on the page
  ok("top-level layer: no edge distances", !ui.S.node.layout.edges,
     JSON.stringify(ui.S.node.layout.edges));

  await push(M.NODES.Scrim);                      // a rectangle inside a frame
  ok("layer inside a frame: edges still reported", !!ui.S.node.layout.edges,
     JSON.stringify(ui.S.node.layout.edges));
  ok("and rendered", /lp-fk">Top</.test(els.main.innerHTML) && /lp-fk">Left</.test(els.main.innerHTML));

  /* ---- 2. variant rows in the structure tree ---- */
  await push(cset);
  const tree = ui.S.node.tree;
  const kids = tree.root.children;
  ok("set lists its variants", kids.length === 2, JSON.stringify(kids.map(k => k.name)));
  ok("rows keep their own variant names",
     kids.map(k => k.name).sort().join(",") === "Size=Large,Size=Small",
     JSON.stringify(kids.map(k => k.name)));
  ok("flagged as variants", kids.every(k => k.isVariant === true));
  ok("no main component to point at", kids.every(k => !k.mainId),
     JSON.stringify(kids.map(k => k.mainId)));

  const html = els.main.innerHTML;
  ok("Variant badge shown", (html.match(/class="tvariant"/g) || []).length === 2,
     (html.match(/class="tvariant"/g) || []).length);
  ok("badge reads Variant", /class="tvariant"[^>]*>Variant</.test(html));
  ok("badge is component purple",
     /\.tvariant\s*\{[^}]*(#8a38f5|var\(--figma-component-purple\))/i.test(fs.readFileSync(DIR + "/ui.html", "utf8")));
  ok("button says Select this variant", html.includes("Select this variant"));
  ok("and no Go to Main Component on those rows", !html.includes("Go to Main Component"),
     (html.match(/class="xs tmain"[^>]*>[^<]*/g) || []).join(" | "));

  // the button targets the variant itself, not the set
  const btn = els.main.querySelectorAll("[data-nav]")
    .filter(b => b.getAttribute("data-nav") === kids[0].id)[0];
  ok("button navigates to the variant", !!btn);
  ok("not to the set it already sits in",
     els.main.querySelectorAll("[data-nav]").every(b => b.getAttribute("data-nav") !== cset.id),
     els.main.querySelectorAll("[data-nav]").map(b => b.getAttribute("data-nav")).join(","));
  btn.onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 30));
  ok("clicking it lands on the variant", ui.S.node.id === kids[0].id, ui.S.node.name);
  // earlier selections in this session are on the stack too; the set must be
  // the entry Back would return to
  ok("Back would return to the set", ui.S.back[ui.S.back.length - 1].id === cset.id,
     JSON.stringify(ui.S.back.map(b => b.name)));

  await push(cset);
  ui.setLang("ko");
  const ko = els.main.innerHTML;
  ok("badge translated", ko.includes("Component set의 variant입니다"), (ko.match(/tvariant"[^>]*>[^<]*/g) || []).join(" | "));
  ok("button translated", ko.includes("이 variant 선택"));

  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL VARIANT TESTS PASSED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
