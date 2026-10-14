const fs = require("fs"), vm = require("vm"), cp = require("child_process");
const { el } = require("./domshim.js");
const DIR = require("path").resolve(__dirname, "..");

function boot() {
  const els = {}, sent = [];
  const document = {
    getElementById: i => (els[i] = els[i] || el(i)),
    createElement: t => el(t),
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
  };
  const ctx = vm.createContext({
    document, window: { addEventListener() {}, innerWidth: 460 },
    parent: { postMessage: m => sent.push(m.pluginMessage) },
    console, Object, Array, Math, String, Number, JSON, RegExp, Date,
    Blob: function () {}, URL: { createObjectURL() {}, revokeObjectURL() {} },
    TextDecoder: function () { return { decode: () => "" }; },
    setTimeout, clearTimeout,
  });
  vm.runInContext(fs.readFileSync(DIR + "/ui.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1], ctx);
  return { ctx, els, sent };
}

// The plugin defaults to Korean; the suites assert English copy, as if the
// user had picked EN (they switch to KO explicitly where they test it).
function state(sel) {
  const st = JSON.parse(cp.execSync(`SEL=${sel} node ${JSON.stringify(__dirname + "/mock.js")} ${JSON.stringify(DIR + "/code.js")}`, { encoding: "utf8" }));
  st.lang = "en";
  return st;
}

let fails = 0;
function ok(label, cond, extra) {
  if (!cond) fails++;
  console.log((cond ? "  ok " : "  FAIL ") + label + (extra !== undefined ? "   " + extra : ""));
}
function done(name) {
  console.log(fails ? "\n" + fails + " FAILURE(S) in " + name : "\nALL " + name + " PASSED");
  process.exit(fails ? 1 : 0);
}
module.exports = { boot, state, ok, done };
