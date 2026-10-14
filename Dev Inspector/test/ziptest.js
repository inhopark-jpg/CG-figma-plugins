// Actually EXTRACT the zip, with the kind of names Figma layers really have.
// `unzip -t` only verifies CRCs — it says nothing about whether the files land
// anywhere a person can see them.
const fs = require("fs"), vm = require("vm"), os = require("os"), path = require("path"), cp = require("child_process");
const { el } = require("./domshim.js");
const M = require("./mock.js");
const DIR = require("path").resolve(__dirname, "..");

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

// Names taken from the user's own file conventions: leading dots, slashes,
// spaces, non-ASCII, and a duplicate.
const NAMES = [".sprout", "icon/bus-intercity", "information filled", "여기서 승차", ".sprout"];
const icons = NAMES.map((nm, i) => M.mk({
  type: "INSTANCE", name: "icon-frame", width: 24, height: 24,
  children: [M.mk({ type: "INSTANCE", name: nm, width: 16, height: 16,
    mainComp: { id: "mc" + i, name: nm, key: "k" + i, remote: true, parent: null } })],
  mainComp: { id: "mcf" + i, name: "icon-frame", key: "kf" + i, remote: false, parent: null },
}));
icons.forEach(f => {
  f.getMainComponentAsync = async () => f.mainComp;
  f.children[0].getMainComponentAsync = async () => f.children[0].mainComp;
});
const bar = M.mk({ type: "FRAME", name: "Toolbar", width: 200, height: 32, x: 0, y: 0,
  fills: [], strokes: [], effects: [], children: icons, clipsContent: false });
bar.parent = M.page; M.page.children.push(bar);
(function idx(n) { M.nodesById[n.id] = n; (n.children || []).forEach(idx); })(bar);

const els = {}, blobs = [], downloads = [];
const ui = vm.createContext({
  document: {
    getElementById: i => (els[i] = els[i] || el(i)),
    createElement: t => { const e = el(t); e.click = () => { if (e.download) downloads.push(e.download); }; return e; },
    body: { appendChild() {}, removeChild() {} }, addEventListener() {}, execCommand: () => true,
  },
  window: { addEventListener() {}, innerWidth: 460 },
  parent: { postMessage: m => M.figma.ui.onmessage(m.pluginMessage, {}) },
  console, Object, Array, Math, String, Number, JSON, RegExp, Date,
  Blob: function (parts) { this.parts = parts; blobs.push(this); },
  URL: { createObjectURL: () => "b", revokeObjectURL() {} },
  TextDecoder: function () { return { decode: () => "" }; },
  setTimeout: (fn) => setTimeout(fn, 0), clearTimeout,
});
vm.runInContext(fs.readFileSync(DIR + "/ui.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1], ui);
M.figma.ui.postMessage = m => ui.onmessage({ data: { pluginMessage: m } });

function extract(bytes, tool) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devinsp-"));
  const zip = path.join(dir, "a.zip");
  const out = path.join(dir, "out");
  fs.writeFileSync(zip, Buffer.from(bytes));
  fs.mkdirSync(out);
  try {
    cp.execSync(tool === "ditto" ? `ditto -x -k ${JSON.stringify(zip)} ${JSON.stringify(out)}`
                                 : `unzip -q -o ${JSON.stringify(zip)} -d ${JSON.stringify(out)}`,
                { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return { err: String(e.stderr || e.stdout || e.message).trim().slice(0, 200), files: [] };
  }
  const files = [];
  (function walk(d, pre) {
    fs.readdirSync(d).forEach(f => {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full, pre + f + "/");
      else files.push({ name: pre + f, size: fs.statSync(full).size, body: fs.readFileSync(full, "utf8") });
    });
  })(out, "");
  return { err: null, files };
}

(async () => {
  M.figma.currentPage.selection = [bar];
  ui.S.tab = "icons";
  ui.onmessage({ data: { pluginMessage: await M.ctx.buildState() } });
  const n = ui.S.node.icons.length;
  ok("all icons found", n === NAMES.length, n + " of " + NAMES.length + ": " +
     JSON.stringify(ui.S.node.icons.map(i => i.label)));

  blobs.length = 0;
  els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 60));
  const bytes = blobs[blobs.length - 1].parts[0];

  // ditto is what Finder's Archive Utility uses, so it is the path that decides
  // whether a person sees their files. macOS's /usr/bin/unzip is Info-ZIP 5.52
  // and cannot write non-ASCII names at all — checked separately below.
  for (const tool of ["ditto"]) {
    const r = extract(bytes, tool);
    console.log("  -- " + tool + " --");
    ok(tool + ": extracted without error", !r.err, r.err || "");
    ok(tool + ": produced " + n + " files", r.files.length === n,
       r.files.length + ": " + JSON.stringify(r.files.map(f => f.name)));
    ok(tool + ": nothing is empty", r.files.every(f => f.size > 0),
       JSON.stringify(r.files.map(f => f.name + "=" + f.size)));
    ok(tool + ": contents are the exported svg",
       r.files.every(f => /^<svg /.test(f.body)),
       JSON.stringify(r.files.map(f => f.body.slice(0, 20))));
    ok(tool + ": no file is hidden from Finder",
       r.files.every(f => !f.name.split("/").pop().startsWith(".")),
       JSON.stringify(r.files.map(f => f.name)));
    ok(tool + ": no nested directories", r.files.every(f => f.name.indexOf("/") < 0),
       JSON.stringify(r.files.map(f => f.name)));
  }

  // ASCII-only names must work everywhere, /usr/bin/unzip included.
  {
    const asciiOnly = ui.S.node.icons.filter(i => !/[^\x00-\x7F]/.test(i.label));
    ui.S.node.icons = asciiOnly;
    blobs.length = 0;
    els.main.querySelector("[data-export-all]").onclick({ stopPropagation() {} });
    await new Promise(r => setTimeout(r, 60));
    const r = extract(blobs[blobs.length - 1].parts[0], "unzip");
    console.log("  -- unzip, ascii names --");
    ok("unzip: ascii-named archive extracts cleanly", !r.err, r.err || "");
    ok("unzip: all files present", r.files.length === asciiOnly.length,
       r.files.length + "/" + asciiOnly.length + ": " + JSON.stringify(r.files.map(f => f.name)));
    ok("unzip: none hidden",
       r.files.every(f => !f.name.startsWith(".")), JSON.stringify(r.files.map(f => f.name)));
  }

  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL ZIP EXTRACTION TESTS PASSED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
