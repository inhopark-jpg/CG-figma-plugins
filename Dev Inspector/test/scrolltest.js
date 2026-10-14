// The Scroll behavior section should only spell out rows when something was
// actually changed from the default.
const { boot, state, ok, done } = require("./harness.js");

function render(sel, mutate) {
  const { ctx, els } = boot();
  ctx.S.tab = "inspect";
  const st = state(sel);
  if (mutate) mutate(st);
  ctx.onmessage({ data: { pluginMessage: st } });
  return { ctx, els, html: els.main.innerHTML, st };
}
// The section body up to the start of the next section - slicing at the first
// </div> only ever caught the first row.
const body = html => {
  const i = html.indexOf('data-secbody="scroll"');
  if (i < 0) return "";
  const next = html.indexOf('data-sec="', i);
  return html.slice(i, next < 0 ? html.length : next);
};

// Card is a page-level frame that scrolls vertically -> genuinely non-default
{
  const r = render("Card");
  ok("non-default: section present", r.html.includes('data-sec="scroll"'));
  ok("non-default: spells out Overflow", body(r.html).includes("Vertical"), body(r.html));
  ok("non-default: no placeholder", !body(r.html).includes("No scroll behavior"));
}

// everything at its default -> a single honest line
{
  const r = render("Card", st => { st.node.scroll = { position: "SCROLLS", overflow: "NONE" }; });
  ok("all-default: section still present", r.html.includes('data-sec="scroll"'));
  ok("all-default: says there is nothing to report",
     body(r.html).includes("No scroll behavior"), body(r.html));
  ok("all-default: no Position row", !body(r.html).includes("Scroll with parent"));
  ok("all-default: no Overflow row", !body(r.html).includes("No scrolling"));
  r.ctx.setLang("ko");
  ok("all-default: translated", r.els.main.innerHTML.includes("스크롤 동작 없음"));
}

// a partial default -> both rows, because a choice was made on one of them
{
  const r = render("Card", st => { st.node.scroll = { position: "STICKY_SCROLLS", overflow: "NONE" }; });
  ok("one non-default: shows the Position row",
     body(r.html).includes("Sticky (stay in place when scrolling past)"), body(r.html));
  ok("one non-default: still shows Overflow for context",
     body(r.html).includes("No scrolling"));
  ok("one non-default: no placeholder", !body(r.html).includes("No scroll behavior"));
}

// only one field known, and it is the default -> placeholder
{
  const r = render("Card", st => { st.node.scroll = { position: "SCROLLS", overflow: null }; });
  ok("position-only default: placeholder", body(r.html).includes("No scroll behavior"), body(r.html));
}
{
  const r = render("Card", st => { st.node.scroll = { position: null, overflow: "BOTH" }; });
  ok("overflow-only non-default: shows it", body(r.html).includes("Both directions"), body(r.html));
}

// nothing reported at all -> no section
{
  const r = render("Card", st => { st.node.scroll = null; });
  ok("no data: section omitted entirely", !r.html.includes('data-sec="scroll"'));
}

done("SCROLL BEHAVIOR TESTS");
