const h = require("./harness.js");
const { boot, state, ok, done } = h;

/* ---------- 1. Scroll behavior ---------- */
console.log("scroll behavior");
{
  const { ctx, els } = boot();
  const st = state("Card");
  ok("code.js emits a scroll block", !!st.node.scroll, JSON.stringify(st.node.scroll));
  ok("no Position on a page-level frame", st.node.scroll.position === null);
  ok("Overflow read from overflowDirection", st.node.scroll.overflow === "VERTICAL");

  ctx.S.tab = "inspect";
  ctx.onmessage({ data: { pluginMessage: st } });
  const html = els.main.innerHTML;
  ok("section rendered", html.includes('data-sec="scroll"'));
  ok("labelled Scroll behavior", html.includes("Scroll behavior"));
  ok("shows No scrolling / Vertical", html.includes("Vertical") && !html.includes("Scroll with parent"));
  // ordering: scroll must come before layout in the Inspect tab
  ok("sits above Layout", html.indexOf('data-sec="scroll"') < html.indexOf('data-sec="layout"'));
}
{
  const { ctx, els } = boot();
  const st = state("Button");
  ok("nested layer gets a Position", st.node.scroll && st.node.scroll.position === "STICKY_SCROLLS",
     JSON.stringify(st.node.scroll));
  ctx.S.tab = "inspect";
  ctx.onmessage({ data: { pluginMessage: st } });
  ok("sticky wording", els.main.innerHTML.includes("Sticky (stay in place when scrolling past)"));
  ctx.setLang("ko");
  ok("korean wording", els.main.innerHTML.includes("고정됨 (지나갈 때 제자리 유지)"));
}

/* ---------- 2. Language description column ---------- */
console.log("\nlanguage description column");
{
  const { ctx, els } = boot();
  const st = state("Card");
  const rows = st.node.translation.rows;
  ok("desc carried through", rows.some(r => r.desc === "Primary CTA on the hero card."),
     JSON.stringify(rows.map(r => [r.name, r.desc])));
  ctx.S.tab = "language";
  ctx.onmessage({ data: { pluginMessage: st } });
  const html = els.main.innerHTML;
  ok("header cell present", /<th class="tr-desc">Description<span class="colres"/.test(html));
  ok("filled description shown", html.includes("Primary CTA on the hero card."));
  ok("empty description shows a dash", /<td class="tr-desc none"[^>]*>-<\/td>/.test(html));
  // column order: name, description, then the mode values
  const r = html.slice(html.indexOf('<tbody>'));
  ok("description sits between name and values",
     r.indexOf('tr-desc') > r.indexOf('tr-name') && r.indexOf('tr-desc') < r.indexOf("Get started"));
  ok("filled description is copyable", html.includes('class="tr-desc copy"'));
}

/* ---------- 3. Icons: Export all ---------- */
console.log("\nicons: export all");
{
  const { ctx, els, sent } = boot();
  const st = state("Card");
  ctx.S.tab = "icons";
  ctx.onmessage({ data: { pluginMessage: st } });
  const html = els.main.innerHTML;
  ok("button present", html.includes("data-export-all"));
  ok("lives in the sticky section header",
     html.indexOf("data-export-all") < html.indexOf("data-icon="));
  ok("inside sec-actions", /sec-actions[^]{0,600}data-export-all/.test(html));  // batch controls sit between

  const n = st.node.icons.length;
  sent.length = 0;
  const btn = els.main.querySelector("[data-export-all]");
  ok("button is wired", !!(btn && btn.onclick));
  btn.onclick({ stopPropagation() {} });
  const batch = sent.filter(m => m.type === "export-batch");
  ok("posts one batch message", batch.length === 1);
  ok("covers every icon", batch[0] && batch[0].items.length === n, "icons=" + n);
  ok("rows carry format + options",
     batch[0] && batch[0].items[0].row.format === "SVG" && batch[0].items[0].row.patchStroke === true,
     JSON.stringify(batch[0] && batch[0].items[0].row));

  // per-card format now lives in state, so Export all follows it
  const id = st.node.icons[0].nodeId;
  const fmt = els.main.querySelector("[data-fmt]");
  fmt.value = "PNG";
  fmt.onchange();
  ok("format change lands in state", ctx.S.iconOpts[id].fmt === "PNG");
  sent.length = 0;
  els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
  const b2 = sent.filter(m => m.type === "export-batch")[0];
  ok("batch picks up the changed format", b2.items[0].row.format === "PNG");

  // and it survives a re-render, which used to reset the select
  ctx.renderBody();
  ok("select re-renders as PNG",
     /<select data-fmt[^>]*>[^]*?<option value="PNG" selected/.test(els.main.innerHTML));

  // collapsed section: still exportable, because rows come from state
  ctx.S.open.icons = false;
  ctx.renderBody();
  sent.length = 0;
  const cb = els.main.querySelector("[data-export-all]");
  ok("button still there when collapsed", !!cb);
  cb.onclick({ stopPropagation() {} });
  ok("collapsed export still sends every icon",
     sent.filter(m => m.type === "export-batch")[0].items.length === n);
}

done("NEW FEATURE TESTS");
