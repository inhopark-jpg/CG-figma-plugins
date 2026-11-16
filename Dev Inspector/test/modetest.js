const h = require("./harness.js");
const { boot, state, ok, done } = h;

/* Variable modes: shown at the top of the Properties tab, for the layer itself, the nearest
   parent that sets one, and children that set one — with a jump to the others. */
console.log("variable modes");
{
  const st = state("Card");
  const m = st.node.modes || [];
  ok("own mode listed", m.some(r => r.rel === "self" && r.k === "theme" && r.v === "dark"), JSON.stringify(m));
  ok("child's mode listed with its layer", m.some(r => r.rel === "child" && r.v === "light" && r.srcName === "Button/Primary"));

  const { ctx, els } = boot();
  ctx.S.tab = "info";
  ctx.onmessage({ data: { pluginMessage: st } });
  ok("not on other tabs", !els.main.innerHTML.includes("mode-bar"));
  ctx.S.tab = "inspect";
  ctx.onmessage({ data: { pluginMessage: st } });
  const html = els.main.innerHTML;
  ok("under its own section header", html.includes('data-sec="modes"') && html.includes("Applied mode"));
  ok("first section of the Properties tab, under the token format", html.indexOf("mode-bar") >= 0 &&
     html.indexOf("tok-opts") < html.indexOf("mode-bar") && html.indexOf("mode-bar") < html.indexOf('data-sec="scroll"'));
  ok("no jump for the layer itself, one for the child",
     (html.match(/Go to layer/g) || []).length === 1);
  ok("jump targets the child", html.includes('data-nav="' + m.find(r => r.rel === "child").srcId + '">Go to layer'));
  ctx.setLang("ko");
  ok("Korean wording", els.main.innerHTML.includes("Layer로 이동") && els.main.innerHTML.includes("이 layer에 적용됨"));
}
{
  const st = state("Scrim");
  const m = st.node.modes || [];
  ok("inherited from parent", m.length === 1 && m[0].rel === "parent" && m[0].srcName === "Card", JSON.stringify(m));
}
{
  const st = state("Button");
  const m = st.node.modes || [];
  ok("own mode overrides the parent's", m.length === 1 && m[0].rel === "self" && m[0].v === "light", JSON.stringify(m));
}
{
  const { ctx, els } = boot();
  const st = state("Variant");
  ctx.S.tab = "inspect";
  ctx.onmessage({ data: { pluginMessage: st } });
  ok("no modes, no bar", !st.node.modes && !els.main.innerHTML.includes("mode-bar"));
}
done("VARIABLE MODE TESTS");
