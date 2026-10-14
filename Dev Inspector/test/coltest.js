// Language table columns must be draggable, land exactly, survive a re-render,
// and be remembered across sessions.
const { boot, state, ok, done } = require("./harness.js");

const { ctx, els, sent } = boot();
ctx.S.tab = "language";
const st = state("Card");
ctx.onmessage({ data: { pluginMessage: st } });

let html = els.main.innerHTML;
const nModes = st.node.translation.modes.length;

ok("table uses a colgroup", html.includes("<colgroup>"));
const cols = (html.match(/<col[ >]/g) || []).length;
ok("a col per column plus a spacer", cols === 2 + nModes + 1, cols + " cols, " + nModes + " modes");
ok("fixed layout is what makes a set width exact",
   /\.tr-table\s*\{[^}]*table-layout:\s*fixed/.test(html) ||
   /table-layout:\s*fixed/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "ui.html"), "utf8")));
ok("a grip on every real column", (html.match(/data-colres=/g) || []).length === 2 + nModes,
   (html.match(/data-colres=/g) || []).length);
ok("spacer cell in the header and in each row",
   html.includes('<th class="tr-pad">') && html.includes('<td class="tr-pad">'));

// --- drag the name column ---
const grips = els.main.querySelectorAll("[data-colres]");
ok("grips are wired", grips.every(g => typeof g.onmousedown === "function"));

const moves = [];
const docHandlers = {};
ctx.document.addEventListener = (type, fn) => { docHandlers[type] = fn; };
ctx.document.removeEventListener = (type) => { delete docHandlers[type]; };

grips[0].onmousedown({ clientX: 200, preventDefault() {}, stopPropagation() {} });
ok("drag started", ctx.S.dragging === true);
docHandlers.mousemove({ clientX: 260 });
ok("name column widened by the drag distance", ctx.S.langCols.name === 128 + 60,
   ctx.S.langCols.name);
docHandlers.mousemove({ clientX: 160 });
ok("dragging back narrows it", ctx.S.langCols.name === 128 - 40, ctx.S.langCols.name);
docHandlers.mousemove({ clientX: -900 });
ok("floors at a readable width, never zero", ctx.S.langCols.name === 56, ctx.S.langCols.name);
docHandlers.mouseup();
ok("drag ended", ctx.S.dragging === false);
ok("width persisted to prefs",
   sent.filter(m => m.type === "set-prefs").slice(-1)[0].prefs.langCols.name === 56,
   JSON.stringify(sent.filter(m => m.type === "set-prefs").slice(-1)[0].prefs.langCols));

// --- survives a re-render ---
ctx.S.langCols.name = 210;
ctx.renderBody();
html = els.main.innerHTML;
ok("re-render emits the dragged width",
   /<colgroup><col style="width:210px">/.test(html),
   (html.match(/<colgroup>.{0,90}/) || [])[0]);

// --- a mode column is independently sizable ---
const modeKey = "m:" + st.node.translation.modes[0].modeId;
els.main.querySelectorAll("[data-colres]")[2].onmousedown({ clientX: 0, preventDefault() {}, stopPropagation() {} });
docHandlers.mousemove({ clientX: 45 });
docHandlers.mouseup();
ok("mode column has its own width", ctx.S.langCols[modeKey] === 165 + 45,
   JSON.stringify(ctx.S.langCols));
ok("dragging one column leaves the others alone", ctx.S.langCols.name === 210,
   JSON.stringify(ctx.S.langCols));

// --- restored from saved prefs on a fresh session ---
{
  const b = boot();
  b.ctx.S.tab = "language";
  b.ctx.onmessage({ data: { pluginMessage: Object.assign({}, state("Card"), {
    prefs: { langCols: { name: 199 }, heights: {}, thumbs: {} } }) } });
  ok("saved widths come back next session", b.ctx.S.langCols.name === 199,
     JSON.stringify(b.ctx.S.langCols));
  ok("and are applied to the table",
     /<colgroup><col style="width:199px">/.test(b.els.main.innerHTML));
}

done("LANGUAGE COLUMN TESTS");
