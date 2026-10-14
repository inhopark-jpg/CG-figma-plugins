// A real icon library's worth of icons: more than the old 60 cap, and past the
// new one, so both the raised limit and its reporting get exercised.
const fs = require("fs"), vm = require("vm");
const { el } = require("./domshim.js");
const M = require("./mock.js");
const DIR = require("path").resolve(__dirname, "..");

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

function makeBar(count, label) {
  const icons = [];
  for (let i = 0; i < count; i++) {
    const glyph = M.mk({ type: "INSTANCE", name: "ic-" + i, width: 16, height: 16,
      mainComp: { id: "mc" + label + i, name: "ic-" + i, key: "k" + label + i, remote: true, parent: null } });
    const frame = M.mk({ type: "INSTANCE", name: "icon-frame", width: 24, height: 24, children: [glyph],
      mainComp: { id: "mcf" + label + i, name: "icon-frame", key: "kf" + label + i, remote: false, parent: null } });
    frame.getMainComponentAsync = async () => frame.mainComp;
    glyph.getMainComponentAsync = async () => glyph.mainComp;
    icons.push(frame);
  }
  const bar = M.mk({ type: "FRAME", name: "Library" + label, width: 400, height: 400, x: 0, y: 0,
    fills: [], strokes: [], effects: [], children: icons, clipsContent: false });
  bar.parent = M.page; M.page.children.push(bar);
  (function idx(n) { M.nodesById[n.id] = n; (n.children || []).forEach(idx); })(bar);
  return bar;
}

const els = {}, blobs = [], downloads = [], notifies = [];
let observed = [], fakeObserverUsed = false;
function FakeIO(cb) {
  fakeObserverUsed = true;
  this.cb = cb; this.seen = [];
  this.observe = el => { this.seen.push(el); observed.push(el); };
  this.unobserve = () => {};
  this.disconnect = () => {};
  // reveal the first `n` cards, the way scrolling would
  this.reveal = n => this.cb(this.seen.slice(0, n).map(t => ({ isIntersecting: true, target: t })));
}
const ui = vm.createContext({
  document: {
    getElementById: i => (els[i] = els[i] || el(i)),
    createElement: t => { const e = el(t); e.click = () => { if (e.download) downloads.push(e.download); }; return e; },
    body: { appendChild() {}, removeChild() {} }, addEventListener() {}, execCommand: () => true,
  },
  window: { addEventListener() {}, innerWidth: 460 },
  parent: { postMessage: m => {
    const pm = m.pluginMessage;
    if (pm.type === "notify") notifies.push(pm.message);
    return M.figma.ui.onmessage(pm, {});
  } },
  console, Object, Array, Math, String, Number, JSON, RegExp, Date,
  Blob: function (parts) { this.parts = parts; blobs.push(this); },
  URL: { createObjectURL: () => "b", revokeObjectURL() {} },
  TextDecoder: function () { return { decode: () => "" }; },
  IntersectionObserver: FakeIO,
  setTimeout: fn => setTimeout(fn, 0), clearTimeout, Uint8Array, DataView,
});
vm.runInContext(fs.readFileSync(DIR + "/ui.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1], ui);
M.figma.ui.postMessage = m => ui.onmessage({ data: { pluginMessage: m } });

function readZip(buf) {
  const b = Buffer.from(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  return { count: b.readUInt16LE(eocd + 10), size: b.length };
}

(async () => {
  /* ---------- 1. well past the old 60 cap ---------- */
  const bar = makeBar(180, "A");
  M.figma.currentPage.selection = [bar];
  ui.S.tab = "icons";
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });

  ok("all 180 icons found (old cap was 60)", ui.S.node.icons.length === 180,
     ui.S.node.icons.length);
  ok("not reported as truncated", ui.S.node.iconsTruncated === false,
     String(ui.S.node.iconsTruncated));
  ok("no truncation note shown", !els.main.innerHTML.includes("Showing the first"));

  /* ---------- 2. export all of them ---------- */
  const progress = [];
  const realOnMessage = ui.onmessage;
  ui.onmessage = e => {
    if (e.data.pluginMessage.type === "export-progress") progress.push(e.data.pluginMessage.done);
    return realOnMessage(e);
  };
  M.figma.ui.postMessage = m => ui.onmessage({ data: { pluginMessage: m } });

  blobs.length = 0; downloads.length = 0;
  els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 3000));

  ok("one download for the batch", downloads.length === 1, JSON.stringify(downloads));
  const z = readZip(blobs[blobs.length - 1].parts[0]);
  ok("zip holds all 180", z.count === 180, z.count + " entries, " + z.size + " bytes");
  ok("progress reported for every icon", progress.length === 180, progress.length);
  ok("progress counts up to the total",
     progress[0] === 1 && progress[progress.length - 1] === 180,
     progress[0] + ".." + progress[progress.length - 1]);
  ok("button label restored when done", !ui.S.exporting, JSON.stringify(ui.S.exporting));
  ok("button re-enabled", !/data-export-all disabled/.test(els.main.innerHTML));

  /* ---------- 3. paging, and previews scoped to the page ---------- */
  ui.S.previews = {}; ui.S.previewAsked = {};
  ui.S.iconPage = 0;
  const asked = [];
  const realPost = ui.parent.postMessage;
  ui.parent.postMessage = m => {
    if (m.pluginMessage.type === "icon-previews") asked.push(...m.pluginMessage.nodeIds);
    return realPost(m);
  };
  ui.renderBody();

  const cards = () => (els.main.innerHTML.match(/data-icon="/g) || []).length;
  ok("one page of cards rendered, not all 180", cards() === 50, cards());
  ok("pager shown", els.main.innerHTML.includes('data-icon-page="next"'));
  ok("page label", els.main.innerHTML.includes("Page 1 / 4"),
     (els.main.innerHTML.match(/Page \d+ \/ \d+/) || [])[0]);
  ok("range label", els.main.innerHTML.includes("1\u201350 of 180"),
     (els.main.innerHTML.match(/\d+\u2013\d+ of \d+/) || [])[0]);
  ok("prev disabled on the first page",
     /data-icon-page="prev" disabled/.test(els.main.innerHTML));

  // The bug this replaces: previews keyed off card visibility never fired,
  // because an icon without a preview renders its <img> as display:none and an
  // element with no box never intersects. Asking per page has no such
  // dependency — every card on the page must be requested.
  ok("every card on the page requested a preview", asked.length === 50, asked.length);
  ok("and they are exactly this page's icons",
     asked.join(",") === ui.S.node.icons.slice(0, 50).map(i => i.nodeId).join(","));
  ok("nothing beyond the page was requested",
     !asked.some(id => ui.S.node.icons.slice(50).some(i => i.nodeId === id)));
  ok("cards with no preview yet still render hidden imgs (the old trap)",
     els.main.innerHTML.includes('style="display:none"'));

  // turn the page
  asked.length = 0;
  els.main.querySelectorAll("[data-icon-page]")
    .filter(b => b.getAttribute("data-icon-page") === "next")[0]
    .onclick({ stopPropagation() {} });
  ok("advanced a page", ui.S.iconPage === 1, ui.S.iconPage);
  ok("page 2 label", els.main.innerHTML.includes("Page 2 / 4"));
  ok("page 2 range", els.main.innerHTML.includes("51\u2013100 of 180"));
  ok("page 2 requested its own previews", asked.length === 50, asked.length);
  ok("page 2 asked for the next slice",
     asked.join(",") === ui.S.node.icons.slice(50, 100).map(i => i.nodeId).join(","));

  // last page is a partial one, and next is disabled there
  ui.S.iconPage = 3; asked.length = 0; ui.renderBody();
  ok("last page holds the remainder", cards() === 30, cards());
  ok("next disabled on the last page",
     /data-icon-page="next" disabled/.test(els.main.innerHTML));
  ok("partial page requested only what it holds", asked.length === 30, asked.length);

  // already-loaded previews are not requested again
  asked.length = 0;
  ui.S.iconPage = 0; ui.renderBody();
  ok("previews already asked for are not re-requested", asked.length === 0, asked.length);

  // settings and Export all still act on the whole library, not the page
  ui.S.iconPage = 2; ui.renderBody();
  const afmt = els.main.querySelector("[data-all-fmt]");
  afmt.value = "PNG"; afmt.onchange({ stopPropagation() {} });
  ok("batch settings reach icons on other pages",
     ui.S.node.icons.every(i => ui.S.iconOpts[i.nodeId].fmt === "PNG"),
     Object.keys(ui.S.iconOpts).length + " icons carry settings");
  blobs.length = 0; downloads.length = 0;
  els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 3000));
  ok("Export all still exports every page", readZip(blobs[blobs.length - 1].parts[0]).count === 180,
     readZip(blobs[blobs.length - 1].parts[0]).count);
  ui.parent.postMessage = realPost;

  /* ---------- 4. past the new cap: reported, not silent ---------- */
  const big = makeBar(540, "B");
  M.figma.currentPage.selection = [big];
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });
  ok("capped at 500", ui.S.node.icons.length === 500, ui.S.node.icons.length);
  ok("truncation flagged", ui.S.node.iconsTruncated === true, String(ui.S.node.iconsTruncated));
  ok("and said out loud in the panel",
     els.main.innerHTML.includes("Showing the first 500 icons found"),
     (els.main.innerHTML.match(/Showing the first[^<]*/) || [])[0]);

  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL LARGE-LIBRARY TESTS PASSED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
