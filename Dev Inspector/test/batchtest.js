// End-to-end: both threads wired together, with a frame that holds SEVERAL
// icons. The earlier fixture had exactly one, which is why a batch bug got
// through — one icon exercises none of the loop.
const fs = require("fs"), vm = require("vm");
const { el } = require("./domshim.js");
const M = require("./mock.js");
const DIR = require("path").resolve(__dirname, "..");
const zlib = require("zlib"), os = require("os"), path = require("path"), cp = require("child_process");

// Parse the central directory the way a real unzip does, rather than trusting
// the local headers the writer just emitted.
function readZip(buf) {
  const b = Buffer.from(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = b.readUInt16LE(eocd + 10), cdOff = b.readUInt32LE(eocd + 16);
  const out = [];
  let o = cdOff;
  for (let i = 0; i < count; i++) {
    if (b.readUInt32LE(o) !== 0x02014b50) throw new Error("bad central header at " + o);
    const crc = b.readUInt32LE(o + 16), csize = b.readUInt32LE(o + 20);
    const nlen = b.readUInt16LE(o + 28), elen = b.readUInt16LE(o + 30), clen = b.readUInt16LE(o + 32);
    const lho = b.readUInt32LE(o + 42);
    const name = b.slice(o + 46, o + 46 + nlen).toString("utf8");
    const lnlen = b.readUInt16LE(lho + 26), lelen = b.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const data = b.slice(start, start + csize);
    out.push({ name, text: data.toString("utf8"), crcOk: zlib.crc32 ? zlib.crc32(data) === crc : crcCheck(data, crc) });
    o += 46 + nlen + elen + clen;
  }
  return out;
}
let CT = null;
function crcCheck(buf, want) {
  if (!CT) { CT = []; for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CT[i] = c >>> 0; } }
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = (crc >>> 8) ^ CT[(crc ^ byte) & 0xFF];
  return ((crc ^ 0xFFFFFFFF) >>> 0) === want;
}
function systemUnzipWorks(bytes, expected) {
  const f = path.join(os.tmpdir(), "devinspector-test-" + Date.now() + ".zip");
  require("fs").writeFileSync(f, Buffer.from(bytes));
  try {
    const out = cp.execSync("unzip -t " + JSON.stringify(f), { encoding: "utf8" });
    const n = (out.match(/testing:/g) || []).length;
    return /No errors detected/.test(out) && n === expected;
  } catch (e) { console.log("    unzip said:", String(e.stdout || e.message).trim()); return false; }
  finally { try { require("fs").unlinkSync(f); } catch (e) {} }
}

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

// --- build a frame containing four icon-frames, each wrapping its own glyph ---
const names = ["sprout", "bus", "info", "star"];
const icons = names.map(nm => M.mk({
  type: "INSTANCE", name: "icon-frame", width: 24, height: 24,
  children: [M.mk({ type: "INSTANCE", name: nm, width: 16, height: 16,
    mainComp: { id: "mc-" + nm, name: nm, key: "k" + nm, remote: true, parent: null } })],
  mainComp: { id: "mcf-" + nm, name: "icon-frame", key: "kf" + nm, remote: false, parent: null },
}));
icons.forEach(f => {
  f.getMainComponentAsync = async () => f.mainComp;
  f.children[0].getMainComponentAsync = async () => f.children[0].mainComp;
});
const bar = M.mk({ type: "FRAME", name: "Toolbar", width: 200, height: 32, x: 0, y: 0,
  fills: [], strokes: [], effects: [], children: icons, clipsContent: false });
bar.parent = M.page;
M.page.children.push(bar);
(function idx(n) { M.nodesById[n.id] = n; (n.children || []).forEach(idx); })(bar);

// --- boot the UI against a DOM shim, and bridge the two message channels ---
const els = {}, downloads = [], blobs = [], copied = [];
const document = {
  getElementById: i => (els[i] = els[i] || el(i)),
  createElement: t => {
    const e = el(t);
    e.click = function () { if (e.download) downloads.push(e.download); };
    if (t === "textarea") Object.defineProperty(e, "value", {
      get: () => e._v, set(v) { e._v = v; copied.push(v); },
    });
    return e;
  },
  execCommand() { return true; },
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
};
const ui = vm.createContext({
  document, window: { addEventListener() {}, innerWidth: 460 },
  parent: { postMessage: m => { M.figma.ui.onmessage(m.pluginMessage, {}); } },
  console, Object, Array, Math, String, Number, JSON, RegExp, Date,
  Blob: function (parts) { this.parts = parts; blobs.push(this); },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  TextDecoder: function () { return { decode: () => "<svg/>" }; },
  setTimeout: (fn, ms) => setTimeout(fn, 0),   // collapse the download stagger
  clearTimeout,
});
vm.runInContext(fs.readFileSync(DIR + "/ui.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1], ui);
M.figma.ui.postMessage = m => ui.onmessage({ data: { pluginMessage: m } });

(async () => {
  M.figma.currentPage.selection = [bar];
  ui.S.tab = "icons";
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });

  const n = ui.S.node.icons.length;
  ok("fixture really has several icons", n === 4, "found " + n + ": " +
     ui.S.node.icons.map(i => i.label).join(", "));

  const cards = els.main.querySelectorAll("[data-icon]");
  ok("a card per icon", cards.length === n, cards.length);

  // --- Export all: one gesture must produce ONE download, because a plugin
  //     iframe is only allowed one. Many files therefore leave as a zip. ---
  downloads.length = 0; blobs.length = 0;
  const btn = els.main.querySelector("[data-export-all]");
  btn.onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 60));
  ok("exactly one download for the whole batch", downloads.length === 1,
     downloads.length + ": " + JSON.stringify(downloads));
  ok("delivered as a zip", /\.zip$/.test(downloads[0] || ""), downloads[0]);

  const zipBytes = blobs[blobs.length - 1].parts[0];
  const entries = readZip(zipBytes);
  ok("zip holds every icon", entries.length === n,
     entries.length + ": " + JSON.stringify(entries.map(e => e.name)));
  ok("entry names are the icon names",
     entries.map(e => e.name).sort().join(",") === names.map(x => x + ".svg").sort().join(","),
     JSON.stringify(entries.map(e => e.name)));
  ok("entry payloads are the exported svg",
     entries.every(e => /^<svg /.test(e.text) && e.text.includes("<path")),
     JSON.stringify(entries[0] && entries[0].text.slice(0, 60)));
  ok("crc of every entry checks out", entries.every(e => e.crcOk),
     JSON.stringify(entries.map(e => e.crcOk)));
  ok("unzips with the system unzip", systemUnzipWorks(zipBytes, n));

  // --- a single-icon export must stay a plain file, not a zip ---
  downloads.length = 0;
  const card0 = els.main.querySelectorAll("[data-icon]")[0];
  card0.querySelector("[data-exp]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 60));
  ok("one icon still downloads as a plain file",
     downloads.length === 1 && /\.svg$/.test(downloads[0]), JSON.stringify(downloads));

  // --- batch settings ---
  const head = els.main.innerHTML.slice(0, els.main.innerHTML.indexOf("data-icon="));
  ok("batch format control in the header", head.includes("data-all-fmt"));
  ok("batch scale control in the header", head.includes("data-all-scale"));
  ok("batch ••• settings in the header", head.includes("data-all-more"));

  const afmt = els.main.querySelector("[data-all-fmt]");
  afmt.value = "PNG";
  afmt.onchange({ stopPropagation() {} });
  ok("batch format writes through to every card",
     ui.S.node.icons.every(i => ui.S.iconOpts[i.nodeId].fmt === "PNG"),
     JSON.stringify(ui.S.node.icons.map(i => ui.S.iconOpts[i.nodeId].fmt)));
  ok("cards visibly show the new format",
     (els.main.innerHTML.match(/<option value="PNG" selected/g) || []).length >= n);

  downloads.length = 0; blobs.length = 0;
  els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 60));
  ok("batch run honours the format",
     readZip(blobs[blobs.length - 1].parts[0]).every(e => /\.png$/.test(e.name)),
     JSON.stringify(readZip(blobs[blobs.length - 1].parts[0]).map(e => e.name)));

  // ••• panel opens and its checkboxes reach every card
  els.main.querySelector("[data-all-more]").onclick({ stopPropagation() {} });
  ok("••• opens the batch settings panel", els.main.innerHTML.includes("data-all-patch"));
  els.main.querySelector("[data-all-svgid]").onclick({ stopPropagation() {} });
  ok("a batch checkbox writes through to every card",
     ui.S.node.icons.every(i => ui.S.iconOpts[i.nodeId].svgIdAttribute === false),
     JSON.stringify(ui.S.node.icons.map(i => ui.S.iconOpts[i.nodeId].svgIdAttribute)));

  // --- duplicate names must not collide inside the zip ---
  ui.S.node.icons.forEach(i => { ui.S.iconOpts[i.nodeId].fmt = "SVG"; });
  icons.forEach(f => { f.children[0].name = "same"; });
  M.figma.currentPage.selection = [bar];
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });
  downloads.length = 0; blobs.length = 0;
  els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 60));
  const dupes = readZip(blobs[blobs.length - 1].parts[0]);
  ok("same-named icons get distinct zip entries",
     new Set(dupes.map(e => e.name)).size === dupes.length,
     JSON.stringify(dupes.map(e => e.name)));

  // --- the Export tab shares the run machinery, so multi-row must zip too ---
  ui.S.tab = "export";
  M.figma.currentPage.selection = [bar];
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });
  ui.S.exportRows = [
    Object.assign(ui.defaultExportRow(0), { format: "PNG", suffix: "" }),
    Object.assign(ui.defaultExportRow(1), { format: "PNG", suffix: "@2x" }),
  ];
  ui.renderBody();
  downloads.length = 0; blobs.length = 0;
  els.main.querySelector("[data-export-run]").onclick({ stopPropagation() {}, preventDefault() {} });
  await new Promise(r => setTimeout(r, 60));
  ok("export tab: two rows arrive as one zip",
     downloads.length === 1 && /\.zip$/.test(downloads[0]), JSON.stringify(downloads));
  ok("export tab: both rows are in it",
     readZip(blobs[blobs.length - 1].parts[0]).length === 2,
     JSON.stringify(readZip(blobs[blobs.length - 1].parts[0]).map(e => e.name)));

  ui.S.exportRows = [Object.assign(ui.defaultExportRow(0), { format: "PNG", suffix: "" })];
  ui.renderBody();
  downloads.length = 0;
  els.main.querySelector("[data-export-run]").onclick({ stopPropagation() {}, preventDefault() {} });
  await new Promise(r => setTimeout(r, 60));
  ok("export tab: a single row stays a plain file",
     downloads.length === 1 && /\.png$/.test(downloads[0]), JSON.stringify(downloads));

  // --- Copy as SVG must reach the clipboard, never the download path ---
  ui.S.tab = "icons";
  ui.renderBody();
  downloads.length = 0; copied.length = 0;
  const c0 = els.main.querySelectorAll("[data-icon]")[0];
  c0.querySelector("[data-copysvg]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 60));
  ok("copy as svg downloads nothing", downloads.length === 0, JSON.stringify(downloads));
  ok("copy as svg puts markup on the clipboard",
     copied.length === 1 && /^<svg /.test(copied[0]), JSON.stringify(copied).slice(0, 70));

  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL BATCH EXPORT TESTS PASSED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
