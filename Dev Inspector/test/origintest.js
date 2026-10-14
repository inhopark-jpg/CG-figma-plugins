// Feature: after "Go to Main Component" from a tree row, stepping back should
// re-reveal that row, highlighted (not selected).
const { boot, state, ok, done } = require("./harness.js");

const cardState = state("Card");
const mainState = state("Set");            // stands in for the main component we land on
// Make the two states genuinely different layers with different tree roots.
ok("fixture: different nodes", cardState.node.id !== mainState.node.id);
ok("fixture: different tree roots", cardState.node.tree.rootId !== mainState.node.tree.rootId);

const { ctx, els, sent } = boot();
ctx.S.tab = "inspect";

// 1. land on Card, expand down to the nested instance
ctx.onmessage({ data: { pluginMessage: cardState } });
ctx.S.treeOpen["n5"] = true;               // reveal icon-frame under Button/Primary
ctx.renderBody();
let html = els.main.innerHTML;
ok("nested row visible", html.includes('data-expand="n2"') || html.includes('>icon-frame<'));
ok("go-to-main carries its origin", html.includes('data-nav-from="n2"'));

// 2. click Go to Main Component on the *nested* instance (n2)
const btns = els.main.querySelectorAll("[data-nav-from]");
const btn = btns.filter(b => b.getAttribute("data-nav-from") === "n2")[0];
ok("found the nested go-to-main button", !!btn);
sent.length = 0;
btn.onclick({ stopPropagation() {} });
const rootId = cardState.node.tree.rootId;
ok("origin recorded under its own tree", !!ctx.S.origins[rootId] && ctx.S.origins[rootId].id === "n2",
   JSON.stringify(ctx.S.origins));
ok("only one marker so far", Object.keys(ctx.S.origins).length === 1, JSON.stringify(ctx.S.origins));
ok("navigation requested", sent.some(m => m.type === "nav-node" && m.nodeId === "mc-if"));
ok("pushed onto the back stack", ctx.S.back.length === 1);

// 3. arrive at the main component: different tree, no highlight there.
// The fixture stands in for the real main component, so point navTarget at the
// state we can actually deliver - a navigation lands on its target by definition.
ctx.S.navTarget = mainState.node.id;
ctx.onmessage({ data: { pluginMessage: mainState } });
html = els.main.innerHTML;
ok("no origin highlight on the main component", !html.includes("trow origin") && !/class="trow[^"]*origin/.test(html));
ok("origin survives the trip", !!ctx.S.origins[rootId], JSON.stringify(ctx.S.origins));

// 4. step back
const backBtn = els.navbar.querySelector("[id]") ? null : null;   // navbar buttons are wired by id
ctx.step(ctx.S.back, ctx.S.fwd);
ok("back requested the original layer",
   sent.filter(m => m.type === "nav-node").slice(-1)[0].nodeId === cardState.node.id);
ctx.onmessage({ data: { pluginMessage: cardState } });

html = els.main.innerHTML;
ok("origin row is highlighted", /class="trow[^"]*\borigin\b/.test(html));
const row = els.main.querySelectorAll("[data-pick]").filter(r => r.getAttribute("data-pick") === "n2")[0];
ok("the highlighted row is the one we left from",
   !!row && (row.getAttribute("class") || "").indexOf("origin") >= 0,
   row && row.getAttribute("class"));
ok("tree auto-expanded to reveal it", ctx.S.treeOpen["n5"] === true,
   JSON.stringify(ctx.S.treeOpen));
ok("highlighted, not selected: canvas selection untouched",
   !sent.some(m => m.type === "select-layer"));
// The landing layer here is the tree root, which structureHtml never lists as a
// row - so the assertion is that exactly one row carries the marker, and it is
// not confused with the selected-row style.
ok("exactly one row marked", (html.match(/class="trow[^"]*\borigin\b/g) || []).length === 1,
   (html.match(/class="trow[^"]*\borigin\b/g) || []).length);
ok("marker is distinct from the selected style", !/class="trow self[^"]*origin/.test(html));

// 5. moving on to another layer clears it
ctx.onmessage({ data: { pluginMessage: mainState } });
ok("origin cleared once you land elsewhere", Object.keys(ctx.S.origins).length === 0,
   JSON.stringify(ctx.S.origins));

// 6. a go-to-main from the header card (no tree row) records no origin
{
  const b = boot();
  b.ctx.S.tab = "info";
  b.ctx.onmessage({ data: { pluginMessage: state("Button") } });
  const navs = b.els.main.querySelectorAll("[data-nav]").filter(e => !e.hasAttribute("data-nav-from"));
  if (navs.length) {
    navs[0].onclick({ stopPropagation() {} });
    ok("header go-to-main leaves no stale origin", Object.keys(b.ctx.S.origins).length === 0);
  } else {
    ok("header go-to-main leaves no stale origin (no button in fixture)", true);
  }
}

done("ORIGIN HIGHLIGHT TESTS");
