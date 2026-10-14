"use strict";
// Sync Icon Colors
//
// Re-syncs fills/strokes inside "icon-frame" subtrees from a source main
// component (or component set) onto every instance of it across the file.
//
// Why this exists: when a designer instance-swaps the icon nested inside an
// "icon-frame", that one node stops tracking the main component's colour
// overrides. Name-matching is reliable at every level except that single
// swapped node, so unmatched siblings are paired positionally as a fallback.
const EXEMPT_KEY = "colorSyncExempt";
const BATCH_SIZE = 30;
// The icon container layer used to be a single component always named
// exactly "icon-frame". It has since been split into per-context components
// ("icon-frame-standalone", "icon-frame-body", "icon-frame-display",
// "icon-frame-magazine", "icon-frame-headline", ...), so the container layer
// itself now carries that suffix too. Match either form: the bare legacy
// name, or "icon-frame-" followed by any context.
const ICON_FRAME_NAME_RE = /^icon-frame(-.+)?$/;
function isIconFrameName(name) {
    return ICON_FRAME_NAME_RE.test(name);
}
// ---------------------------------------------------------------------------
// Paint helpers
// ---------------------------------------------------------------------------
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
// Deterministic serialisation so paint comparison does not depend on key order.
function stableStringify(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return "[" + value.map(stableStringify).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}
// A paint bound to a colour variable carries both the binding and a resolved
// colour. Comparing the resolved colour would produce false positives (and
// false negatives), so normalise a bound colour down to its variable id.
function normalizePaint(paint) {
    const copy = deepClone(paint);
    const bound = copy.boundVariables;
    if (bound && bound.color && bound.color.id) {
        copy.color = { __boundVariable: bound.color.id };
        delete copy.boundVariables;
        copy.__boundColorVariable = bound.color.id;
    }
    return copy;
}
function paintsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (stableStringify(normalizePaint(a[i])) !== stableStringify(normalizePaint(b[i]))) {
            return false;
        }
    }
    return true;
}
// Produce a paint suitable for assigning onto the target node: a clone of the
// source paint, with any colour-variable binding re-established explicitly.
async function materializePaint(paint) {
    const clone = deepClone(paint);
    const bound = paint.boundVariables;
    if (bound && bound.color && bound.color.id) {
        const variable = await figma.variables.getVariableByIdAsync(bound.color.id);
        if (variable) {
            return figma.variables.setBoundVariableForPaint(clone, "color", variable);
        }
        // Variable no longer resolvable: drop the stale binding, keep the raw colour.
        delete clone.boundVariables;
    }
    return clone;
}
async function materializePaints(paints) {
    const out = [];
    for (const paint of paints)
        out.push(await materializePaint(paint));
    return out;
}
function pairChildren(aList, bList) {
    // multi-map: name -> queue of nodes, to correctly handle duplicate sibling
    // names in order
    const bByName = new Map();
    for (const n of bList) {
        if (!bByName.has(n.name))
            bByName.set(n.name, []);
        bByName.get(n.name).push(n);
    }
    const pairs = [];
    const unmatchedA = [];
    for (const a of aList) {
        const queue = bByName.get(a.name);
        if (queue && queue.length) {
            pairs.push([a, queue.shift()]);
        }
        else {
            unmatchedA.push(a);
        }
    }
    const unmatchedB = [];
    bByName.forEach((arr) => {
        for (const n of arr)
            unmatchedB.push(n);
    });
    // Positional fallback for whatever name-matching could not place.
    const len = Math.min(unmatchedA.length, unmatchedB.length);
    for (let i = 0; i < len; i++)
        pairs.push([unmatchedA[i], unmatchedB[i]]);
    return {
        pairs: pairs,
        fallbackCount: unmatchedA.length > 0 || unmatchedB.length > 0 ? len : 0
    };
}
function isExempt(node) {
    try {
        return node.getPluginData(EXEMPT_KEY) === "true";
    }
    catch (e) {
        return false;
    }
}
async function syncPaintProperty(a, b, prop, ctx) {
    if (!(prop in a) || !(prop in b))
        return;
    const aPaints = a[prop];
    const bPaints = b[prop];
    // figma.mixed (per-character text fills, mixed vector fills) - nothing safe
    // to diff or assign, leave it alone.
    if (aPaints === figma.mixed || bPaints === figma.mixed)
        return;
    if (!Array.isArray(aPaints) || !Array.isArray(bPaints))
        return;
    if (paintsEqual(aPaints, bPaints))
        return;
    // Figma requires reassigning the whole array; never mutate in place.
    a[prop] = await materializePaints(bPaints);
    ctx.updates++;
}
async function recurse(a, b, ctx) {
    if (isExempt(a) || isExempt(b)) {
        ctx.exemptSkips++;
        return;
    }
    await syncPaintProperty(a, b, "fills", ctx);
    await syncPaintProperty(a, b, "strokes", ctx);
    if ("children" in a && "children" in b) {
        const result = pairChildren(a.children, b.children);
        if (result.fallbackCount > 0)
            ctx.fallbackNodes += result.fallbackCount;
        for (const pair of result.pairs) {
            await recurse(pair[0], pair[1], ctx);
        }
    }
}
// ---------------------------------------------------------------------------
// Per-instance sync
// ---------------------------------------------------------------------------
function findIconFrames(root) {
    if (isIconFrameName(root.name)) {
        // The root itself can be (or contain) icon-frames.
        const nested = "findAll" in root
            ? root.findAll((n) => isIconFrameName(n.name))
            : [];
        return [root].concat(nested);
    }
    if (!("findAll" in root))
        return [];
    return root.findAll((n) => isIconFrameName(n.name));
}
async function syncInstance(instance, source, stats) {
    if (isExempt(instance)) {
        stats.exempt++;
        console.log(`[sync-icon-colors] "${instance.name}" is exempt - skipped`);
        return;
    }
    const instanceFrames = findIconFrames(instance);
    const sourceFrames = findIconFrames(source);
    console.log(`[sync-icon-colors] "${instance.name}": ${instanceFrames.length} icon-frame(s) on instance, ` +
        `${sourceFrames.length} on source "${source.name}"`);
    if (instanceFrames.length !== sourceFrames.length) {
        console.warn(`[sync-icon-colors] icon-frame count mismatch on "${instance.name}": ` +
            `instance=${instanceFrames.length}, source=${sourceFrames.length}. ` +
            `Pairing the first ${Math.min(instanceFrames.length, sourceFrames.length)} by index, skipping extras.`);
    }
    const pairCount = Math.min(instanceFrames.length, sourceFrames.length);
    if (pairCount === 0)
        return;
    const ctx = { updates: 0, exemptSkips: 0, fallbackNodes: 0 };
    for (let i = 0; i < pairCount; i++) {
        const before = ctx.fallbackNodes;
        await recurse(instanceFrames[i], sourceFrames[i], ctx);
        const fallbacksHere = ctx.fallbackNodes - before;
        console.log(`[sync-icon-colors]   pair ${i + 1}/${pairCount} on "${instance.name}": ` +
            (fallbacksHere > 0
                ? `positional fallback used for ${fallbacksHere} node(s) (swap boundary detected)`
                : `name-matched cleanly (no swap detected)`));
    }
    if (ctx.updates > 0) {
        stats.updated++;
        console.log(`[sync-icon-colors] "${instance.name}": ${ctx.updates} paint property/properties updated`);
    }
    else if (ctx.exemptSkips > 0) {
        stats.exempt++;
    }
    else {
        stats.alreadyMatching++;
    }
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    figma.skipInvisibleInstanceChildren = true;
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
        figma.notify("Sync Icon Colors: main component(COMPONENT) 또는 component set(COMPONENT_SET)를 하나만 선택하세요.");
        figma.closePlugin();
        return;
    }
    const selected = selection[0];
    if (selected.type !== "COMPONENT" && selected.type !== "COMPONENT_SET") {
        figma.notify(`Sync Icon Colors: 선택한 layer는 ${selected.type}입니다. main component나 component set를 선택하세요.`);
        figma.closePlugin();
        return;
    }
    // Resolve the source set.
    const sources = selected.type === "COMPONENT_SET"
        ? selected.children.filter((c) => c.type === "COMPONENT")
        : [selected];
    if (sources.length === 0) {
        figma.notify("Sync Icon Colors: 이 component set에는 variant가 없습니다.");
        figma.closePlugin();
        return;
    }
    const sourceById = new Map();
    for (const c of sources)
        sourceById.set(c.id, c);
    console.log(`[sync-icon-colors] source set: ${sources.length} component(s) from "${selected.name}" (${selected.type})`);
    const stats = {
        pages: 0,
        scanned: 0,
        updated: 0,
        alreadyMatching: 0,
        exempt: 0,
        errors: 0
    };
    for (const page of figma.root.children) {
        try {
            await page.loadAsync();
            const instances = page.findAllWithCriteria({ types: ["INSTANCE"] });
            // Resolve main components first so batching operates on real work only.
            const matched = [];
            for (const instance of instances) {
                try {
                    const main = await instance.getMainComponentAsync();
                    if (!main)
                        continue;
                    const source = sourceById.get(main.id);
                    if (!source)
                        continue;
                    matched.push({ instance: instance, source: source });
                }
                catch (e) {
                    stats.errors++;
                    console.error(`[sync-icon-colors] failed to resolve main component of "${instance.name}"`, e);
                }
            }
            const pageBefore = {
                updated: stats.updated,
                alreadyMatching: stats.alreadyMatching,
                exempt: stats.exempt,
                errors: stats.errors
            };
            for (let i = 0; i < matched.length; i += BATCH_SIZE) {
                const batch = matched.slice(i, i + BATCH_SIZE);
                for (const entry of batch) {
                    stats.scanned++;
                    try {
                        await syncInstance(entry.instance, entry.source, stats);
                    }
                    catch (e) {
                        stats.errors++;
                        console.error(`[sync-icon-colors] error syncing instance "${entry.instance.name}"`, e);
                    }
                }
                // Yield to the main thread between batches.
                await new Promise((r) => setTimeout(r, 0));
            }
            stats.pages++;
            console.log(`[sync-icon-colors] page "${page.name}": ${matched.length} matched instance(s) - ` +
                `${stats.updated - pageBefore.updated} updated, ` +
                `${stats.alreadyMatching - pageBefore.alreadyMatching} already matching, ` +
                `${stats.exempt - pageBefore.exempt} exempt, ` +
                `${stats.errors - pageBefore.errors} error(s)`);
        }
        catch (e) {
            stats.errors++;
            console.error(`[sync-icon-colors] error processing page "${page.name}"`, e);
        }
    }
    // Toasts are Korean only (this plugin has no UI to pick a language);
    // console lines stay English for debugging.
    const summary = `Synced ${stats.updated} of ${stats.scanned} instances across ${stats.pages} pages ` +
        `(${stats.alreadyMatching} matched, ${stats.exempt} exempt, ${stats.errors} errors)`;
    console.log(`[sync-icon-colors] ${summary}`);
    figma.notify(`${stats.pages}개 페이지의 instance ${stats.scanned}개 중 ${stats.updated}개 동기화 ` +
        `(이미 일치 ${stats.alreadyMatching}, 제외 ${stats.exempt}, 오류 ${stats.errors})`);
    figma.closePlugin();
}
main().catch((e) => {
    console.error("[sync-icon-colors] fatal error", e);
    figma.notify("Sync Icon Colors: 예기치 않은 오류가 발생했습니다. 콘솔을 확인하세요.");
    figma.closePlugin();
});
