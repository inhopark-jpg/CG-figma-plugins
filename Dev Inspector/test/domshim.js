// A DOM shim that can look *inside* a matched element, and that returns the
// SAME object for the same element every time. Both matter: the panel wires
// each icon card by querying within it, and a test that fires a handler has to
// reach the object wire() bound, not a fresh copy of it.
//
// Identity is the element's byte offset in the root markup, so the cache clears
// exactly when innerHTML is replaced.
function attrsOf(openTag) {
  const attrs = {}, ar = /([\w-]+)(?:="([^"]*)")?/g;
  let a;
  while ((a = ar.exec(openTag))) if (a[1]) attrs[a[1]] = a[2] !== undefined ? a[2] : "";
  return attrs;
}

function scan(html, sel, store, base) {
  const attr = (sel.match(/^\[([\w-]+)\]$/) || [])[1];
  const cls = (sel.match(/^\.([\w-]+)$/) || [])[1];
  const re = attr
    ? new RegExp('<([a-z]+)([^>]*\\s' + attr + '(?=[\\s=>/])(?:="[^"]*")?[^>]*)>', 'g')
    : cls
      ? new RegExp('<([a-z]+)([^>]*\\sclass="[^"]*\\b' + cls + '\\b[^"]*"[^>]*)>', 'g')
      : new RegExp('<(' + sel + ')((?:\\s[^>]*)?)>', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(html))) hits.push({ tag: m[1], open: m[2], start: m.index, after: re.lastIndex });
  return hits.map((h, i) => {
    const key = base + h.start;
    if (store[key]) return store[key];
    // Scope: up to the next sibling match, or the end of the markup.
    const inner = html.slice(h.after, i + 1 < hits.length ? hits[i + 1].start : html.length);
    return (store[key] = mk(h.tag, attrsOf(h.open), inner, store, base + h.after));
  });
}

function mk(tag, attrs, inner, store, base) {
  // A live class list: pickLayer() patches classes directly on the DOM rather
  // than re-rendering, so a stub that swallows add/remove hides real bugs.
  let cls = (attrs.class || "").split(/\s+/).filter(Boolean);
  const sync = () => { attrs.class = cls.join(" "); };
  const e = {
    tagName: tag.toUpperCase(), style: {}, parentNode: { style: {} },
    disabled: false, scrollTop: 0, offsetWidth: 120, offsetHeight: 40,
    onclick: null, oninput: null, onchange: null,
    getAttribute: n => (attrs[n] !== undefined ? attrs[n] : null),
    hasAttribute: n => attrs[n] !== undefined,
    classList: {
      contains: c => cls.indexOf(c) >= 0,
      add(c) { if (cls.indexOf(c) < 0) { cls.push(c); sync(); } },
      remove(c) { cls = cls.filter(x => x !== c); sync(); },
      toggle(c, on) { const has = cls.indexOf(c) >= 0; const want = on === undefined ? !has : !!on;
                      if (want && !has) this.add(c); else if (!want && has) this.remove(c); },
    },
    addEventListener() {}, focus() {}, select() {},
    getBoundingClientRect: () => ({ left: 10, top: 40, right: 60, bottom: 52 }),
    querySelectorAll: sel => scan(inner, sel, store, base),
    querySelector: sel => { const r = scan(inner, sel, store, base); return r.length ? r[0] : null; },
    _html: inner,
  };
  // A <select> reports its selected <option>, the way a browser does.
  const selOpt = /<option value="([^"]*)"[^>]*\sselected/.exec(inner);
  e.value = selOpt ? selOpt[1]
    : (attrs.value !== undefined ? attrs.value : (/<option value="([^"]*)"/.exec(inner) || [])[1]);
  return e;
}

function el(id) {
  let html = "", store = {};
  const e = mk("div", { id }, "", store, 0);
  e.id = id; e.textContent = "";
  e.querySelectorAll = sel => scan(html, sel, store, 0);
  e.querySelector = sel => { const r = scan(html, sel, store, 0); return r.length ? r[0] : null; };
  Object.defineProperty(e, "innerHTML", {
    get: () => html,
    set(v) { html = v; store = {}; e.querySelectorAll = sel => scan(html, sel, store, 0);
             e.querySelector = sel => { const r = scan(html, sel, store, 0); return r.length ? r[0] : null; }; },
  });
  return e;
}
module.exports = { el };
