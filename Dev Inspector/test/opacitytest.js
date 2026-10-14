// Layers parked at 0% opacity must not reach the exported SVG.
const fs = require("fs"), vm = require("vm"), path = require("path");
const DIR = path.resolve(__dirname, "..");

let fails = 0;
const ok = (l, c, x) => { if (!c) fails++; console.log((c ? "  ok " : "  FAIL ") + l + (x !== undefined ? "   " + x : "")); };

// Run code.js in isolation: patchSvg and stripInvisible are pure string work.
const figma = { showUI() {}, on() {}, ui: { postMessage() {} },
  clientStorage: { getAsync: async () => null, setAsync: async () => {} },
  currentPage: { selection: [], id: "p" }, variables: {} };
const ctx = vm.createContext({ figma, __html__: "", console, Map, Symbol, Object, Array,
  Math, String, Number, JSON, Infinity, Promise, Uint8Array, RegExp, parseFloat, parseInt });
vm.runInContext(fs.readFileSync(path.join(DIR, "code.js"), "utf8"), ctx);

const mk = o => Object.assign({ name: "n", visible: true, children: [], strokes: [], opacity: 1 }, o);

/* Three layers, the convention in use: white-outlined switched off at 0%. */
const icon = mk({ name: "icon", children: [
  mk({ name: "white-outlined", opacity: 0, strokes: [{}], strokeWeight: 1, children: [
    mk({ name: "wo-vec", strokes: [{}], strokeWeight: 1 }),
  ] }),
  mk({ name: "black-no-outline", opacity: 1 }),
  mk({ name: "black-outlined", opacity: 1, strokes: [{}], strokeWeight: 0.2 }),
] });

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<g id="white-outlined" opacity="0"><path d="M0 0" fill="white"/><path d="M0 0" stroke="white"/></g>' +
  '<path id="black-no-outline" d="M1 1" fill="black"/>' +
  '<path id="black-outlined" d="M2 2" fill="black" stroke="black" stroke-width="0.2"/>' +
  "</svg>";

{
  const out = ctx.patchSvg(svg, icon, { dropInvisible: true, labelParts: true, patchStroke: true });
  ok("the 0% group is gone", !out.includes("white-outlined"), out);
  ok("its children went with it", !out.includes('fill="white"') && !out.includes('stroke="white"'));
  ok("visible layers kept", out.includes("black-no-outline") && out.includes("black-outlined"));
  ok("markup still balanced",
     (out.match(/<g/g) || []).length === (out.match(/<\/g>/g) || []).length,
     out);
  ok("still labelled", out.includes('class="fill stroke"'), out);
}

/* Off by choice: the toggle has to actually turn it off. */
{
  const out = ctx.patchSvg(svg, icon, { dropInvisible: false, labelParts: true, patchStroke: true });
  ok("kept when the option is off", out.includes("white-outlined"));
}

/* No opacity attribute in the markup — only the Figma node says 0%. */
{
  const bare =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<path id="white-outlined" d="M0 0" fill="white"/>' +
    '<path id="black-outlined" d="M2 2" fill="black" stroke="black"/></svg>';
  const out = ctx.patchSvg(bare, icon, { dropInvisible: true, labelParts: true, patchStroke: true });
  ok("dropped on the node's opacity alone", !out.includes("white-outlined"), out);
  ok("the other one survives", out.includes("black-outlined"));
}

/* Per-property zeroing counts as invisible too. */
{
  const perProp =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<path id="a" d="M0 0" fill="black" fill-opacity="0"/>' +
    '<path id="b" d="M1 1" fill="black" fill-opacity="0" stroke="black" stroke-opacity="0"/>' +
    '<path id="c" d="M2 2" fill="black" fill-opacity="0" stroke="black"/>' +
    '<path id="d" d="M3 3" fill="black" fill-opacity="0.5"/></svg>';
  const out = ctx.patchSvg(perProp, mk({ name: "icon" }), { dropInvisible: true });
  ok("fill-opacity 0 with no stroke is dropped", !out.includes('id="a"'), out);
  ok("both paints zeroed is dropped", !out.includes('id="b"'));
  ok("a live stroke keeps the element", out.includes('id="c"'));
  ok("partial transparency is kept", out.includes('id="d"'));
}

/* defs are referenced machinery — never cut, however transparent. */
{
  const withDefs =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<defs><clipPath id="clip0"><rect width="24" height="24" fill="white" opacity="0"/></clipPath></defs>' +
    '<g clip-path="url(#clip0)"><path id="keep" d="M0 0" fill="black"/></g></svg>';
  const out = ctx.patchSvg(withDefs, mk({ name: "icon" }), { dropInvisible: true });
  ok("clipPath contents left alone", out.includes("clip0") && out.includes("<rect"), out);
  ok("the clipped artwork survives", out.includes('id="keep"'));
}

/* Nested groups: the outer one going takes the inner with it. */
{
  const nested =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<g id="outer" opacity="0"><g id="inner"><path d="M0 0" fill="red"/></g></g>' +
    '<path id="after" d="M9 9" fill="black"/></svg>';
  const out = ctx.patchSvg(nested, mk({ name: "icon" }), { dropInvisible: true });
  ok("nested subtree removed whole", !out.includes("outer") && !out.includes("inner") && !out.includes("red"), out);
  ok("siblings after it are untouched", out.includes('id="after"'));
  ok("balanced after a nested cut",
     (out.match(/<g/g) || []).length === (out.match(/<\/g>/g) || []).length, out);
}

/* The real convention: the layer is switched off with a zero-alpha FILL, not
   with layer opacity. Figma writes that as fill-opacity="0" on each vector, so
   the group around them survives the cut and reopens as an empty named layer
   unless it is pruned too. */
{
  const grouped = mk({ name: ".warning-filled", children: [
    mk({ name: "negative", opacity: 1, children: [mk({ name: "Vector" }), mk({ name: "Vector" })] }),
    mk({ name: "positive", opacity: 1 }),
  ] });
  const svg2 =
    '<svg xmlns="http://www.w3.org/2000/svg"><g id=".warning-filled">' +
    '<g id="negative"><path d="M0 0" fill="white" fill-opacity="0"/>' +
    '<path d="M1 1" fill="white" fill-opacity="0"/></g>' +
    '<path id="positive" d="M2 2" fill="black"/></g></svg>';
  const out = ctx.patchSvg(svg2, grouped, { dropInvisible: true, labelParts: true, patchStroke: true });
  ok("transparent-fill vectors removed", !out.includes("fill-opacity"), out);
  ok("and the group left holding nothing goes too", !out.includes("negative"), out);
  ok("the group that still has artwork stays", out.includes('id=".warning-filled"'));
  ok("its live sibling survives", out.includes('id="positive"'));
}

/* Emptying an inner group can empty its parent; both must go. */
{
  const out = ctx.patchSvg(
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<g id="outer"><g id="middle"><g id="inner">' +
    '<path d="M0 0" fill="white" fill-opacity="0"/></g></g></g>' +
    '<path id="keep" d="M9 9" fill="black"/></svg>',
    mk({ name: "icon" }), { dropInvisible: true });
  ok("emptied wrappers collapse all the way up",
     !out.includes("outer") && !out.includes("middle") && !out.includes("inner"), out);
  ok("live artwork outside them is untouched", out.includes('id="keep"'));
}

/* A group that was already empty in Figma's own output is dead weight too. */
{
  const out = ctx.patchSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="stray"></g>' +
    '<path id="keep" d="M0 0" fill="black"/></svg>',
    mk({ name: "icon" }), { dropInvisible: true });
  ok("pre-existing empty group removed", !out.includes("stray"), out);
}

/* An empty group inside defs is still referenced by id — leave it. */
{
  const out = ctx.patchSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><mask id="m0"><g id="mg"></g></mask></defs>' +
    '<path id="keep" d="M0 0" fill="black" mask="url(#m0)"/></svg>',
    mk({ name: "icon" }), { dropInvisible: true });
  ok("empty group inside defs kept", out.includes('id="mg"'), out);
}

/* The real favorite.svg: a clip path that is exactly the canvas. It crops
   nothing, but reopening the file turns it into a "Clip path group" and a
   stray Mask layer. */
{
  const real =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n' +
    '<g id=".favorite" clip-path="url(#clip0_107_4659)">\n' +
    '<path id="positive" d="M11.2249 3Z" fill="black" class="fill"/>\n</g>\n' +
    '<defs>\n<clipPath id="clip0_107_4659">\n<rect width="16" height="16" fill="white"/>\n' +
    '</clipPath>\n</defs>\n</svg>\n';
  const out = ctx.patchSvg(real, mk({ name: ".favorite" }), { cleanClip: true, dropInvisible: true });
  ok("clip-path reference removed", !out.includes("clip-path"), out);
  ok("the clipPath itself removed", !out.includes("clipPath"));
  ok("the emptied defs went with it", !out.includes("<defs>"));
  ok("the artwork is untouched", out.includes('id="positive"'));
  ok("the named group survives", out.includes('id=".favorite"'), out);
  ok("kept when the option is off",
     ctx.patchSvg(real, mk({ name: ".favorite" }), { cleanClip: false }).includes("clip-path"));
}

/* A clip that could actually crop must never be touched. */
{
  const cropping =
    '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">' +
    '<g id="a" clip-path="url(#c1)"><path d="M0 0" fill="black"/></g>' +
    '<defs><clipPath id="c1"><rect width="8" height="16" fill="white"/></clipPath></defs></svg>';
  const out = ctx.patchSvg(cropping, mk({ name: "a" }), { cleanClip: true });
  ok("a half-canvas clip is kept", out.includes("clip-path") && out.includes("c1"), out);
}
{
  const rounded =
    '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">' +
    '<g id="a" clip-path="url(#c2)"><path d="M0 0" fill="black"/></g>' +
    '<defs><clipPath id="c2"><rect width="16" height="16" rx="4" fill="white"/></clipPath></defs></svg>';
  ok("a rounded clip is kept",
     ctx.patchSvg(rounded, mk({ name: "a" }), { cleanClip: true }).includes("clip-path"));
}
{
  const offset =
    '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">' +
    '<g id="a" clip-path="url(#c3)"><path d="M0 0" fill="black"/></g>' +
    '<defs><clipPath id="c3"><rect x="2" y="2" width="16" height="16" fill="white"/></clipPath></defs></svg>';
  ok("an offset clip is kept",
     ctx.patchSvg(offset, mk({ name: "a" }), { cleanClip: true }).includes("clip-path"));
}
/* A defs holding something else must survive losing one entry. */
{
  const mixed =
    '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">' +
    '<g id="a" clip-path="url(#c4)"><path d="M0 0" fill="url(#g1)"/></g>' +
    '<defs><clipPath id="c4"><rect width="16" height="16"/></clipPath>' +
    '<linearGradient id="g1"><stop offset="0"/></linearGradient></defs></svg>';
  const out = ctx.patchSvg(mixed, mk({ name: "a" }), { cleanClip: true });
  ok("the redundant clip goes", !out.includes("c4"), out);
  ok("but the gradient it shared defs with stays",
     out.includes("<defs>") && out.includes("g1"), out);
}

console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL OPACITY TESTS PASSED");
process.exit(fails ? 1 : 0);
