// Invariant: at most ONE row in the structure tree is ever highlighted.
const { boot, state, ok, done } = require("./harness.js");

// Read the live elements, not innerHTML: pickLayer patches classes on the DOM
// without re-rendering, so the markup string lags behind what's on screen.
const hl = els => {
  const out = [];
  els.main.querySelectorAll(".trow").forEach(r => {
    const c = r.getAttribute("class") || "";
    if (/\b(self|picked|origin)\b/.test(c)) out.push(c);
  });
  return out;
};

/* ---------- 1. origin marker vs. a row picked on canvas ---------- */
{
  const { ctx, els } = boot();
  ctx.S.tab = "inspect";
  const card = state("Card");
  ctx.onmessage({ data: { pluginMessage: card } });
  ctx.S.treeOpen["n5"] = true;
  ctx.renderBody();

  // pick a row, then jump to a main component from a different row
  ctx.pickLayer("n5", null);
  ctx.renderBody();
  ok("picked row highlighted on its own", hl(els).length === 1, JSON.stringify(hl(els)));

  const btn = els.main.querySelectorAll("[data-nav-from]")
    .filter(b => b.getAttribute("data-nav-from") === "n2")[0];
  btn.onclick({ stopPropagation() {} });
  const other = state("Set");
  ctx.S.navTarget = other.node.id;
  ctx.onmessage({ data: { pluginMessage: other } });
  ctx.S.navTarget = card.node.id;
  ctx.onmessage({ data: { pluginMessage: card } });
  ctx.S.pickedId = "n5";                 // as if the pick survived the round trip
  ctx.renderBody();

  const rows = hl(els);
  ok("only one row highlighted after coming back", rows.length === 1, JSON.stringify(rows));
  ok("and it is the origin marker", /origin/.test(rows[0] || ""), rows[0]);
}

/* ---------- 2. the screenshot's case: the inspected layer is itself a row ---------- */
{
  const { ctx, els } = boot();
  ctx.S.tab = "inspect";
  const card = JSON.parse(JSON.stringify(state("Card")));

  // Anchor the tree above the inspected layer, the way selecting a variant
  // inside a component set does: the current node becomes a listed row.
  const kid = card.node.tree.root.children[0];
  card.node.tree.root.current = false;
  kid.current = true;
  card.node.id = kid.id;

  ctx.onmessage({ data: { pluginMessage: card } });
  let rows = hl(els);
  ok("the current row alone is highlighted", rows.length === 1, JSON.stringify(rows));
  ok("styled as the selection", /\bself\b/.test(rows[0] || ""), rows[0]);

  // now record an origin in that same tree and come back to it
  ctx.S.treeOpen[kid.id] = true;
  ctx.renderBody();
  const b = els.main.querySelectorAll("[data-nav-from]")
    .filter(x => x.getAttribute("data-nav-from") === "n2")[0];
  ok("a nested go-to-main exists to click", !!b);
  b.onclick({ stopPropagation() {} });

  const other = state("Set");
  ctx.S.navTarget = other.node.id;
  ctx.onmessage({ data: { pluginMessage: other } });
  ctx.S.navTarget = card.node.id;
  ctx.onmessage({ data: { pluginMessage: card } });

  rows = hl(els);
  ok("still only one highlight, not two", rows.length === 1, JSON.stringify(rows));
  ok("the origin outranks the selection", /origin/.test(rows[0] || ""), rows[0]);
  ok("the selected row keeps its non-clickable behaviour",
     els.main.querySelectorAll(".trow").some(r => /\bcurrent\b/.test(r.getAttribute("class") || "")),
     els.main.querySelectorAll(".trow").map(r => r.getAttribute("class")).join(" | "));

  // clearing the marker hands the highlight back
  ctx.S.origins = {};
  ctx.renderBody();
  rows = hl(els);
  ok("selection highlighted again once the marker clears",
     rows.length === 1 && /\bself\b/.test(rows[0]), JSON.stringify(rows));
}

/* ---------- 3. the reported case: land via Back on a listed row, then click
      another row to select it. Both used to stay green. ---------- */
{
  const { ctx, els } = boot();
  ctx.S.tab = "inspect";
  const card = JSON.parse(JSON.stringify(state("Card")));
  const kid = card.node.tree.root.children[0];        // .dialog-layout equivalent
  card.node.tree.root.current = false;
  kid.current = true;
  card.node.id = kid.id;
  ctx.onmessage({ data: { pluginMessage: card } });
  ctx.S.treeOpen[kid.id] = true;
  ctx.renderBody();
  ok("landed with the current row highlighted", hl(els).length === 1, JSON.stringify(hl(els)));

  // click a DIFFERENT row to select it on canvas — the panel keeps inspecting
  // the old layer, so .self and .picked are on different rows
  const row = els.main.querySelectorAll("[data-pick]")
    .filter(r => r.getAttribute("data-pick") === "n2")[0];
  ok("found a nested row to click", !!row);
  row.onclick({ stopPropagation() {} });
  let rows = hl(els);
  ok("click marks exactly one row, immediately", rows.length === 1, JSON.stringify(rows));
  ok("and it is the clicked row", /picked/.test(rows[0] || ""), rows[0]);

  // and it survives the next render, not just the click
  ctx.renderBody();
  rows = hl(els);
  ok("still one after a re-render", rows.length === 1, JSON.stringify(rows));
  ok("still the clicked row", /picked/.test(rows[0] || ""), rows[0]);
}

/* ---------- 4. a pick outside the tree must not blank the tree ---------- */
{
  const { ctx, els } = boot();
  ctx.S.tab = "inspect";
  const card = JSON.parse(JSON.stringify(state("Card")));
  const kid = card.node.tree.root.children[0];
  card.node.tree.root.current = false;
  kid.current = true;
  card.node.id = kid.id;
  ctx.onmessage({ data: { pluginMessage: card } });
  ctx.S.pickedId = "not-a-node-in-this-tree";
  ctx.renderBody();
  const rows = hl(els);
  ok("tree keeps its own highlight", rows.length === 1 && /\bself\b/.test(rows[0]),
     JSON.stringify(rows));
}

done("SINGLE-HIGHLIGHT TESTS");
