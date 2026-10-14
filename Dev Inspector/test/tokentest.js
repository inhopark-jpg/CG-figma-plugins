// Token pills should read the way code addresses tokens, and copy what they show.
const { boot, state, ok, done } = require("./harness.js");

// Each pill as {copy, shown} so the two can be compared rather than assumed.
const tokens = html =>
  (html.match(/<span class="tok copy" data-copy="[^"]*" title="[^"]*">[^<]*<\/span>/g) || [])
    .map(m => ({
      copy: m.match(/data-copy="([^"]*)"/)[1],
      shown: m.match(/>([^<]*)<\/span>/)[1],
    }));
const pills = html => tokens(html).map(t => t.copy);
// The Inspect tab's own body; the structure pane above it has sections too.
const tabBody = html => html.slice(html.indexOf("<div class=\"tabbody\""));

{
  const { ctx, els, sent } = boot();
  ctx.S.tab = "inspect";
  const st = state("Card");
  ctx.onmessage({ data: { pluginMessage: st } });

  let html = els.main.innerHTML;
  ok("the control is offered", html.includes("data-tok-fmt"));
  ok("says what it is for, not how it works",
     html.includes("Show and copy token names as") && !html.includes("Change / to dot"),
     (html.match(/tok-opts-head">[^<]*/) || [])[0]);
  ok("both formats spelled out, so the choice is a comparison",
     html.includes(">group.sub-group.token</button>") &&
     html.includes(">group/sub-group/token</button>"),
     JSON.stringify((html.match(/data-tok-fmt="[^"]*">[^<]*/g) || [])));
  ok("the dotted option is the one selected",
     /class="seg-btn active" data-tok-fmt="dot"/.test(html),
     (html.match(/seg-btn[^"]*" data-tok-fmt="[^"]*"/g) || []).join(" | "));
  ok("the other option is not selected",
     /class="seg-btn" data-tok-fmt="slash"/.test(html));
  ok("an info affordance explains the rest", html.includes("tinfo"));
  ok("dots are the default", ctx.S.tokenDots === true, String(ctx.S.tokenDots));
  html = els.main.innerHTML;
  ok("it sits above the Inspect sections",
     tabBody(html).indexOf("data-tok-dots") < tabBody(html).indexOf("data-sec="),
     tabBody(html).slice(0, 90));

  const dotted = pills(html);
  ok("tokens rendered with dots", dotted.length > 0 && dotted.every(p => p.indexOf("/") < 0),
     JSON.stringify(dotted));
  ok("a real grouped path converted", dotted.some(p => /^spacing\.|^color\.|^radius\.|^size\./.test(p)),
     JSON.stringify(dotted));
  ok("every pill copies exactly what it shows",
     tokens(html).every(t => t.copy === t.shown),
     JSON.stringify(tokens(html).filter(t => t.copy !== t.shown)));
  ok("the Figma path survives in the tooltip",
     /title="[^"]*·[^"]*\//.test(html),
     (html.match(/title="[^"]*·[^"]*"/) || [])[0]);

  // covers every section that shows a token, not just colours
  ok("padding tokens converted too", dotted.some(p => p.indexOf("spacing.") === 0),
     JSON.stringify(dotted));

  // pick the other format
  els.main.querySelectorAll("[data-tok-fmt]")
    .filter(b => b.getAttribute("data-tok-fmt") === "slash")[0]
    .onclick({ stopPropagation() {} });
  ok("state flipped", ctx.S.tokenDots === false);
  html = els.main.innerHTML;
  const slashed = pills(html);
  ok("slashes come back", slashed.some(p => p.indexOf("/") >= 0), JSON.stringify(slashed));
  ok("same tokens, just written differently",
     slashed.map(p => p.replace(/\//g, ".")).join(",") === dotted.join(","),
     JSON.stringify(slashed));
  ok("still copies exactly what it shows",
     tokens(html).every(t => t.copy === t.shown && t.copy.indexOf("/") >= 0),
     JSON.stringify(tokens(html).slice(0, 3)));
  ok("no stray separator in the tooltip when unchanged",
     !/title="[^"]*·/.test(html));
  ok("selection moved to the slashed option",
     /class="seg-btn active" data-tok-fmt="slash"/.test(html),
     (html.match(/seg-btn[^"]*" data-tok-fmt="[^"]*"/g) || []).join(" | "));
  ok("only one option is ever selected",
     (html.match(/seg-btn active/g) || []).length === 1);
  ok("the buttons are generated, not hard-coded: they match the formatter",
     (html.match(/data-tok-fmt="dot">([^<]*)/) || [])[1] === ctx.tokenFormat("group/sub-group/token", true) &&
     (html.match(/data-tok-fmt="slash">([^<]*)/) || [])[1] === ctx.tokenFormat("group/sub-group/token", false));
  ok("clicking the already-selected option is harmless",
     (function () {
       els.main.querySelectorAll("[data-tok-fmt]")
         .filter(b => b.getAttribute("data-tok-fmt") === "slash")[0]
         .onclick({ stopPropagation() {} });
       return ctx.S.tokenDots === false;
     })());

  // remembered across sessions
  const prefs = sent.filter(m => m.type === "set-prefs").slice(-1)[0].prefs;
  ok("preference persisted", prefs.tokenDots === false, JSON.stringify(prefs.tokenDots));
}

{
  const b = boot();
  b.ctx.S.tab = "inspect";
  b.ctx.onmessage({ data: { pluginMessage: Object.assign({}, state("Card"), {
    prefs: { tokenDots: false, heights: {}, thumbs: {} } }) } });
  ok("restored from prefs next session", b.ctx.S.tokenDots === false);
  ok("and applied to the pills",
     pills(b.els.main.innerHTML).some(p => p.indexOf("/") >= 0),
     JSON.stringify(pills(b.els.main.innerHTML)));
}

{
  // a name with no slash must be left exactly alone
  const b = boot();
  b.ctx.S.tab = "inspect";
  b.ctx.S.tokenDots = true;
  b.ctx.onmessage({ data: { pluginMessage: state("Card") } });
  ok("flat names untouched",
     b.ctx.tokenName("radius-lg") === "radius-lg", b.ctx.tokenName("radius-lg"));
  ok("every slash converted, not just the first",
     b.ctx.tokenName("a/b/c/d") === "a.b.c.d", b.ctx.tokenName("a/b/c/d"));
}

done("TOKEN NAME TESTS");
