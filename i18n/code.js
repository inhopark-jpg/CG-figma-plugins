// i18n — main thread (Figma sandbox)
// Manages STRING variables inside the "language" collection only.
// Grouping mirrors the canvas Page > Section > Section hierarchy.

var COLLECTION_NAME = "language";
var RECENT_KEY = "language_vars_recent";
var LANG_KEY = "language_vars_lang";
var MAX_RECENT = 20;
var WARN = "⚠️";
var MISSING = "--"; // placeholder for an untranslated / missing mode value
// Reserved CSV column header (lowercased) for the variable description. A mode
// named "Description" would collide with it, so the name is treated as reserved.
var DESC_HEADER_KEY = "description";
var currentLang = "ko"; // cached UI language; updated from clientStorage / set-lang

// Height fits the edit view (description + two modes + the key-layer actions)
// without scrolling; more modes than that still scroll, which is expected.
figma.showUI(__html__, { width: 380, height: 660, themeColors: true });

// ---------------------------------------------------------------------------
// Naming rule
// ---------------------------------------------------------------------------
// Keep only letters/digits of real scripts and dashes; replace everything else
// (spaces, ASCII punctuation, arrows like "↳", box-drawing, emoji, etc.) with
// "-", collapse runs, and trim. This is an ALLOWLIST so decorative symbols are
// dropped while genuine language text is preserved. Allowed ranges:
//   0-9 A-Z a-z  and  -
//   À-ɏ Latin extended   Ͱ-Ͽ Greek     Ѐ-ӿ Cyrillic
//   ؀-ۿ Arabic           ฀-๿ Thai
//   ᄀ-ᇿ Hangul Jamo      ぀-ヿ Kana       ㄰-㆏ Hangul Compat
//   㐀-䶿 CJK Ext A        一-鿿 CJK        가-힯 Hangul Syllables
//   豈-﫿 CJK Compat
// (Plain \uXXXX ranges only — no \p{} / u-flag, which this sandbox lacks.)
function dashClean(value) {
  return String(value == null ? "" : value)
    .replace(/[^0-9A-Za-z\-À-ɏͰ-ϿЀ-ӿ؀-ۿ฀-๿ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitName(fullName) {
  var i = fullName.lastIndexOf("/");
  if (i < 0) return { group: "", leaf: fullName };
  return { group: fullName.slice(0, i), leaf: fullName.slice(i + 1) };
}

// Build a group segment tagged "section-" or "layer-" so the two are easy to
// tell apart in the variables table.  An empty cleaned name collapses to just
// the tag (no trailing dash).
function buildSegment(kind, name) {
  return (kind + "-" + dashClean(name)).replace(/-+$/g, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Variable identity (ID-based naming)
// ---------------------------------------------------------------------------
// Each variable's leaf is a stable 6-char lowercase alphanumeric ID that acts
// as its permanent identifier — independent of its value or location. This is
// what CSV export/import matches on, so a variable can move groups or change
// text without breaking the round-trip.

// Remove a leading ⚠️ flag (added to the leaf when a key layer is missing) so
// the underlying ID can be read.
function stripWarn(leaf) {
  return leaf.indexOf(WARN) === 0 ? leaf.replace(/^⚠️\s*/, "") : leaf;
}

var ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function genId(used) {
  var id;
  do {
    id = "";
    for (var i = 0; i < 6; i++) id += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  } while (used[id]);
  used[id] = true;
  return id;
}

// A mode value counts as "missing" when it is empty, whitespace, or only
// dashes ("-", "--", …). Non-string values (aliases) are not flagged.
function isMissingValue(val) {
  if (typeof val !== "string") return false;
  var t = val.trim();
  return t === "" || /^-+$/.test(t);
}

// ---------------------------------------------------------------------------
// Localized toast strings (figma.notify). Values may be strings or functions.
// ---------------------------------------------------------------------------
var STRINGS = {
  en: {
    tableNotTopLevel: "Select one layer that sits directly on the page or in a section.",
    tableNoVars: "No token in this layer has its key layer here.",
    tplMissing: "The table template components were deleted. Restore them first.",
    tplCreated: "Created the i18n-table and i18n-row templates and the table.",
    tableCreated: function (n) { return "Created a translation table (" + n + " row" + (n === 1 ? "" : "s") + ")."; },
    tableUpdated: function (n) { return "Updated the translation table (" + n + " row" + (n === 1 ? "" : "s") + ")."; },
    tableGone: "That table no longer exists.",
    tableSourceGone: "The layer this table was made from no longer exists.",
    tplRestored: "Template components restored. Tables on this page are relinked; other pages follow when opened.",
    tplBroken: "The i18n-table template has no i18n-slot.",
    tableBuilding: "Building a large translation table…",
    importing: function (n) { return "Importing " + n + " rows…"; },
    noCollection: 'No "language" collection found.',
    noLinkedVar: "No linked token to edit.",
    varGone: "Token no longer exists.",
    saved: "Saved.",
    selectFirst: "Select a text layer first.",
    varNotFound: "Token not found.",
    assigned: "Token assigned.",
    assignedN: function (n) { return "Assigned to " + n + " layer" + (n === 1 ? "" : "s") + "."; },
    defaultRequired: "The default mode value is required.",
    created: "Token created and assigned.",
    scanning: "Scanning layers…",
    layerNotFound: "Layer not found — it may have been deleted.",
    noBinding: "No token binding found on this layer.",
    unlinked: "Token unlinked.",
    deleted: "Token deleted.",
    notUsedOnPage: "No layer on this page uses this token.",
    searchingPages: "Not used on this page — searching the other pages…",
    deletedUnlinked: function (n) { return "Token deleted and unlinked from " + n + " layer" + (n === 1 ? "" : "s") + " on this page."; },
    relocated: "Key layer set.",
    couldNotAddMode: function (name, err) { return 'Could not add mode "' + name + '": ' + err; },
    errorPrefix: function (msg) { return "Error: " + msg; },
    cleanupSummary: function (p) {
      var s = 'Page "' + p.page + '": cleaned up ' + p.renamed + " token" + (p.renamed === 1 ? "" : "s") + ".";
      if (p.migrated) s += " " + p.migrated + " given IDs.";
      if (p.regrouped) s += " " + p.regrouped + " regrouped.";
      if (p.flagged) s += " " + p.flagged + " missing key layer.";
      if (p.broken) s += " " + p.broken + " broken link" + (p.broken === 1 ? "" : "s") + ".";
      if (p.missing) s += " " + p.missing + " without translation.";
      if (p.failed) s += " " + p.failed + " failed.";
      return s;
    },
    importSummary: function (p) {
      var s = "Imported: " + p.updated + " token" + (p.updated === 1 ? "" : "s") + " updated.";
      if (p.newModes) s += " " + p.newModes + " new mode" + (p.newModes === 1 ? "" : "s") + ".";
      if (p.unmatched) s += " " + p.unmatched + " unmatched.";
      return s;
    },
  },
  ko: {
    tableNotTopLevel: "페이지나 섹션 바로 아래에 있는 레이어 하나를 선택하세요.",
    tableNoVars: "해당 레이어 안에 key 레이어가 있는 토큰이 없습니다.",
    tplMissing: "테이블 템플릿 컴포넌트가 삭제되었습니다. 먼저 템플릿을 복구하세요.",
    tplCreated: "i18n-table, i18n-row 템플릿과 테이블을 만들었습니다.",
    tableCreated: function (n) { return "번역 테이블을 만들었습니다 (" + n + "행)."; },
    tableUpdated: function (n) { return "번역 테이블을 업데이트했습니다 (" + n + "행)."; },
    tableGone: "테이블이 더 이상 존재하지 않습니다.",
    tableSourceGone: "이 테이블의 원본 레이어가 더 이상 존재하지 않습니다.",
    tplRestored: "템플릿 컴포넌트를 복구했습니다. 이 페이지의 테이블은 다시 연결했고, 다른 페이지는 열 때 연결됩니다.",
    tplBroken: "i18n-table 템플릿에 i18n-slot이 없습니다.",
    tableBuilding: "큰 번역 테이블을 만드는 중입니다…",
    importing: function (n) { return n + "개 행을 가져오는 중…"; },
    noCollection: '"language" 컬렉션을 찾을 수 없습니다.',
    noLinkedVar: "편집할 연결된 토큰이 없습니다.",
    varGone: "토큰이 더 이상 존재하지 않습니다.",
    saved: "저장되었습니다.",
    selectFirst: "먼저 텍스트 레이어를 선택하세요.",
    varNotFound: "토큰을 찾을 수 없습니다.",
    assigned: "토큰이 적용되었습니다.",
    assignedN: function (n) { return "레이어 " + n + "개에 적용되었습니다."; },
    defaultRequired: "기본 모드 값을 입력해야 합니다.",
    created: "토큰이 생성되고 적용되었습니다.",
    scanning: "레이어를 검색하는 중…",
    layerNotFound: "레이어를 찾을 수 없습니다 — 삭제되었을 수 있습니다.",
    noBinding: "해당 레이어에 연결된 토큰이 없습니다.",
    unlinked: "토큰 연결이 해제되었습니다.",
    deleted: "토큰이 삭제되었습니다.",
    notUsedOnPage: "이 페이지에서 이 토큰을 사용하는 레이어가 없습니다.",
    searchingPages: "이 페이지에서 사용되지 않아 다른 페이지에서 찾는 중…",
    deletedUnlinked: function (n) { return "토큰을 삭제하고 이 페이지의 레이어 " + n + "개에서 연결을 해제했습니다."; },
    relocated: "key 레이어가 지정되었습니다.",
    couldNotAddMode: function (name, err) { return '"' + name + '" 모드를 추가할 수 없습니다: ' + err; },
    errorPrefix: function (msg) { return "오류: " + msg; },
    cleanupSummary: function (p) {
      var s = '"' + p.page + '" 페이지: 토큰 ' + p.renamed + "개를 정리했습니다.";
      if (p.migrated) s += " " + p.migrated + "개에 ID 부여.";
      if (p.regrouped) s += " " + p.regrouped + "개 그룹 변경.";
      if (p.flagged) s += " key 레이어 없음 " + p.flagged + "개.";
      if (p.broken) s += " 연결 끊김 " + p.broken + "개.";
      if (p.missing) s += " 번역 누락 " + p.missing + "개.";
      if (p.failed) s += " 실패 " + p.failed + "개.";
      return s;
    },
    importSummary: function (p) {
      var s = "가져오기 완료: 토큰 " + p.updated + "개 업데이트됨.";
      if (p.newModes) s += " 새 모드 " + p.newModes + "개.";
      if (p.unmatched) s += " 일치하지 않음 " + p.unmatched + "개.";
      return s;
    },
  },
};

function L(key) {
  var v = (STRINGS[currentLang] || STRINGS.en)[key];
  if (v == null) v = STRINGS.en[key];
  return v == null ? key : v;
}

async function getLang() {
  try {
    var l = await figma.clientStorage.getAsync(LANG_KEY);
    return l === "en" ? "en" : "ko";
  } catch (e) { return "ko"; }
}

// ---------------------------------------------------------------------------
// Recency tracking (persisted per client via clientStorage)
// ---------------------------------------------------------------------------
async function getRecentIds() {
  try { return (await figma.clientStorage.getAsync(RECENT_KEY)) || []; }
  catch (e) { return []; }
}

async function addRecentId(id) {
  var list = await getRecentIds();
  list = list.filter(function(x) { return x !== id; });
  list.unshift(id);
  if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
  try { await figma.clientStorage.setAsync(RECENT_KEY, list); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Collection context
// ---------------------------------------------------------------------------
async function getContext() {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var ci = 0; ci < collections.length; ci++) {
    if (collections[ci].name === COLLECTION_NAME) { collection = collections[ci]; break; }
  }
  if (!collection) return { collection: null };

  var all = await figma.variables.getLocalVariablesAsync("STRING");
  var stringVars = all.filter(function(v) { return v.variableCollectionId === collection.id; });
  var modes = collection.modes.map(function(m) {
    return { modeId: m.modeId, name: m.name, isDefault: m.modeId === collection.defaultModeId };
  });
  return { collection: collection, stringVars: stringVars, modes: modes, defaultModeId: collection.defaultModeId };
}

function serializeVar(v) {
  var parts = splitName(v.name);
  var valuesByMode = {};
  for (var mid in v.valuesByMode) {
    var val = v.valuesByMode[mid];
    valuesByMode[mid] = typeof val === "string" ? val : null;
  }
  var desc = "";
  try { desc = v.description || ""; } catch (e) { desc = ""; }
  var keyNodeId = ""; // lets the home search jump to a token's key layer
  try { keyNodeId = v.getPluginData("keyNodeId") || ""; } catch (e) { keyNodeId = ""; }
  return {
    id: v.id, name: v.name, group: parts.group, leaf: parts.leaf,
    varId: stripWarn(parts.leaf), description: desc, valuesByMode: valuesByMode, keyNodeId: keyNodeId,
  };
}

// ---------------------------------------------------------------------------
// Section grouping for a node.
// Rule: 1st section / 2nd section / 3rd section / top-most-layer
// The page is NOT included.  "Top-most layer" = the first non-SECTION ancestor
// of the text node when traversed top-to-bottom (the frame/instance directly
// under the deepest tracked section, or directly under the page).  Sections
// beyond the 3rd are skipped but we keep walking to find that layer.  Each
// segment is tagged: sections start with "section-", the layer with "layer-".
// ---------------------------------------------------------------------------
function getGroupPath(node) {
  // Build ancestor chain top-to-bottom (not including PAGE itself).
  var ancestors = [];
  var cur = node.parent;
  while (cur && cur.type !== "PAGE") {
    ancestors.unshift(cur);
    cur = cur.parent;
  }

  var sections = [];
  var topLayerName = node.name; // fallback: text node itself has no containing frame

  for (var i = 0; i < ancestors.length; i++) {
    if (ancestors[i].type === "SECTION") {
      if (sections.length < 3) sections.push(ancestors[i].name);
      // Sections beyond 3 are silently skipped; keep iterating.
    } else {
      // First non-SECTION node encountered top-to-bottom is the top-most layer.
      topLayerName = ancestors[i].name;
      break;
    }
  }

  var parts = [];
  for (var s = 0; s < sections.length; s++) parts.push(buildSegment("section", sections[s]));
  parts.push(buildSegment("layer", topLayerName));
  return parts.join("/");
}

// The "master section" of a group path = its top-most segment (the section that
// wraps everything). Used to scope the assign/swap list: variables under the
// same master section are grouped together regardless of the specific layer
// within it. When there is no wrapping section the whole path (the layer) is used.
function masterKey(groupPath) {
  if (!groupPath) return "";
  return groupPath.split("/")[0];
}

// ---------------------------------------------------------------------------
// Resolve where a string variable is bound for the selected node.
// ---------------------------------------------------------------------------
function findInstanceForProp(node, propRef) {
  var cur = node.parent;
  var firstInstance = null;
  while (cur && cur.type !== "PAGE") {
    if (cur.type === "INSTANCE") {
      if (!firstInstance) firstInstance = cur;
      if (cur.componentProperties && propRef in cur.componentProperties) return cur;
    }
    cur = cur.parent;
  }
  return firstInstance;
}

function resolveBinding(node) {
  if (!node) return null;

  // Reading componentProperties / componentPropertyReferences can THROW when a
  // node belongs to a component set that has errors ("Component set for node has
  // existing errors"). Wrap everything so one bad node never aborts a scan.
  try {
    if (node.type === "TEXT") {
      var propRef = node.componentPropertyReferences && node.componentPropertyReferences.characters;
      if (propRef) {
        var inst = findInstanceForProp(node, propRef);
        if (inst) {
          var cp = inst.componentProperties[propRef];
          var alias = cp && cp.boundVariables && cp.boundVariables.value;
          return { kind: "property", instance: inst, propName: propRef, variableId: alias ? alias.id : null };
        }
      }
      var bv = node.boundVariables && node.boundVariables.characters;
      return { kind: "text", node: node, variableId: bv ? bv.id : null };
    }

    if (node.type === "INSTANCE") {
      for (var key in node.componentProperties) {
        var cp2 = node.componentProperties[key];
        if (cp2.type === "TEXT") {
          var alias2 = cp2.boundVariables && cp2.boundVariables.value;
          return { kind: "property", instance: node, propName: key, variableId: alias2 ? alias2.id : null };
        }
      }
    }
  } catch (e) {
    return null; // broken component set etc. — treat as no resolvable binding
  }

  return null;
}

function applyBinding(binding, variable) {
  if (binding.kind === "text") {
    binding.node.setBoundVariable("characters", variable);
  } else if (binding.kind === "property") {
    var props = {};
    props[binding.propName] = figma.variables.createVariableAlias(variable);
    binding.instance.setProperties(props);
  }
}

// ---------------------------------------------------------------------------
// Push the full state for the current selection to the UI.
// ---------------------------------------------------------------------------
async function pushState() {
  currentLang = await getLang();
  var ctx = await getContext();
  if (!ctx.collection) {
    figma.ui.postMessage({ type: "state", selection: "no-collection", lang: currentLang });
    return;
  }

  var sel = figma.currentPage.selection;
  var recentIds = await getRecentIds();
  var allVarsSerialized = ctx.stringVars.map(serializeVar);
  // allVars included in every branch so Export CSV works regardless of selection.
  var common = { modes: ctx.modes, defaultModeId: ctx.defaultModeId, allVars: allVarsSerialized, recentIds: recentIds, lang: currentLang };

  if (sel.length === 0) {
    figma.ui.postMessage(Object.assign({ type: "state", selection: "none" }, common));
    return;
  }

  if (sel.length > 1) {
    // Check whether every selected node has a resolvable binding.
    var allValid = true;
    for (var si = 0; si < sel.length; si++) {
      if (!resolveBinding(sel[si])) { allValid = false; break; }
    }
    if (!allValid) {
      // Mixed selection — some nodes can't be bound; fall back to the error message.
      figma.ui.postMessage(Object.assign({ type: "state", selection: "multiple" }, common));
      return;
    }
    figma.ui.postMessage(Object.assign({ type: "state", selection: "multi-node" }, common, {
      count: sel.length,
      allVars: allVarsSerialized,
      recentIds: recentIds,
    }));
    return;
  }

  var node = sel[0];
  var binding = resolveBinding(node);
  if (!binding) {
    var tinfo = null;
    try { tinfo = await tableInfoFor(node, ctx); } catch (e) { tinfo = null; }
    if (tinfo) {
      figma.ui.postMessage(Object.assign({ type: "state", selection: "table-" + tinfo.kind }, common, { table: tinfo }));
      return;
    }
    figma.ui.postMessage(Object.assign({ type: "state", selection: "unsupported" }, common));
    return;
  }

  var groupPath = getGroupPath(node);
  var nodeMaster = masterKey(groupPath);
  var groupVars = ctx.stringVars
    .filter(function(v) { return masterKey(splitName(v.name).group) === nodeMaster; })
    .map(serializeVar);

  var variable = null;
  var varMissing = false;
  if (binding.variableId) {
    // Cross-reference against the live variable list rather than getVariableByIdAsync,
    // which returns stale cached data for variables that have already been deleted.
    var found = null;
    for (var vi2 = 0; vi2 < ctx.stringVars.length; vi2++) {
      if (ctx.stringVars[vi2].id === binding.variableId) { found = ctx.stringVars[vi2]; break; }
    }
    if (found) {
      variable = serializeVar(found);
      // Check the recorded key layer up front, so a deleted or re-linked key
      // shows as missing right away (not only after "go to key layer").
      var ks = await keyLayerStatus(found, node, binding);
      variable.keyNodeId = ks.keyNodeId;
      variable.keyStatus = ks.status;
    }
    else { varMissing = true; }
  }

  // What the layer shows right now — pre-fills the default value when a token
  // is created for hard-coded text.
  var nodeText = "";
  try {
    if (binding.kind === "text") nodeText = binding.node.characters;
    else if (binding.kind === "property") nodeText = String(binding.instance.componentProperties[binding.propName].value || "");
  } catch (e) { nodeText = ""; }

  figma.ui.postMessage(Object.assign({ type: "state", selection: "node" }, common, {
    nodeText: nodeText,
    bindingKind: binding.kind,
    hasVar: !!variable,
    varMissing: varMissing,
    variable: variable,
    groupPath: groupPath,
    masterGroup: nodeMaster,
    groupVars: groupVars,
    allVars: allVarsSerialized,
    recentIds: recentIds,
    nodeId: node.id,
    nodeName: node.name,
  }));
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------
// `description` is optional — only written when the UI sends it (undefined
// means "leave the existing description alone").
async function handleSave(values, description) {
  var node = figma.currentPage.selection[0];
  var binding = resolveBinding(node);
  if (!binding || !binding.variableId) return notify(L("noLinkedVar"));
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));
  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === binding.variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) return notify(L("varGone"));

  for (var modeId in values) {
    variable.setValueForMode(modeId, values[modeId]);
  }
  if (typeof description === "string") {
    try { variable.description = description; } catch (e) {}
  }
  notify(L("saved"));
  await pushState();
}

// Save mode values for a specific variable by id (used by the in-report
// "missing values" editor, which is selection-independent). Keeps the cleanup
// report open and reports back which modes are still missing.
async function handleSaveMissing(variableId, values, description) {
  function done(ok, entry) {
    figma.ui.postMessage({ type: "save-missing-result", ok: ok, variableId: variableId, entry: entry });
  }
  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return done(false); }
  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) { notify(L("varGone")); return done(false); }

  for (var modeId in values) {
    var vv = values[modeId];
    if (vv == null || !String(vv).trim()) vv = MISSING;
    variable.setValueForMode(modeId, vv);
  }
  if (typeof description === "string") { try { variable.description = description; } catch (e) {} }

  // Recompute remaining missing modes + fresh values so the report can update in place.
  var missModes = [];
  var mvals = {};
  for (var mm = 0; mm < ctx.modes.length; mm++) {
    var raw = variable.valuesByMode[ctx.modes[mm].modeId];
    mvals[ctx.modes[mm].modeId] = typeof raw === "string" ? raw : null;
    if (isMissingValue(raw)) missModes.push(ctx.modes[mm].name);
  }
  notify(L("saved"));
  done(true, { modes: missModes, valuesByMode: mvals });
}

async function handleSwap(variableId) {
  var node = figma.currentPage.selection[0];
  var binding = resolveBinding(node);
  if (!binding) return notify(L("selectFirst"));
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));
  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) return notify(L("varNotFound"));

  applyBinding(binding, variable);
  await addRecentId(variableId);
  notify(L("assigned"));
  await pushState();
}

async function handleMultiSwap(variableId) {
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));
  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) return notify(L("varNotFound"));

  var sel = figma.currentPage.selection;
  var applied = 0;
  for (var si = 0; si < sel.length; si++) {
    var b = resolveBinding(sel[si]);
    if (b) { applyBinding(b, variable); applied++; }
  }
  await addRecentId(variableId);
  notify(L("assignedN")(applied));
  await pushState();
}

async function handleCreate(values) {
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));

  var node = figma.currentPage.selection[0];
  var binding = resolveBinding(node);
  if (!binding) return notify(L("selectFirst"));

  var defaultVal = values[ctx.defaultModeId];
  if (!defaultVal || !defaultVal.trim()) {
    return notify(L("defaultRequired"));
  }

  var groupPath = getGroupPath(node);

  // Leaf is a unique 6-char ID — independent of value/location.
  var existingIds = {};
  for (var ei = 0; ei < ctx.stringVars.length; ei++) {
    existingIds[stripWarn(splitName(ctx.stringVars[ei].name).leaf)] = true;
  }
  var id = genId(existingIds);
  var fullName = groupPath ? groupPath + "/" + id : id;

  var variable = figma.variables.createVariable(fullName, ctx.collection, "STRING");
  for (var mi = 0; mi < ctx.modes.length; mi++) {
    var m = ctx.modes[mi];
    var val = values[m.modeId];
    if (m.isDefault) val = defaultVal;
    else if (!val || !val.trim()) val = MISSING;
    variable.setValueForMode(m.modeId, val);
  }

  applyBinding(binding, variable);
  // Mark as ID-assigned so cleanup keeps this leaf rather than re-generating.
  try { variable.setPluginData("idAssigned", "1"); } catch (e) {}
  // Record this variable's "key" node and the page it lives on. Cleanup is
  // page-scoped: it follows the key on its home page and only flags it as
  // missing there, so a key moved to another page is re-detected when cleanup
  // runs on that page.
  try { variable.setPluginData("keyNodeId", node.id); } catch (e) {}
  try { variable.setPluginData("keyPageId", figma.currentPage.id); } catch (e) {}
  await addRecentId(variable.id);
  notify(L("created"));
  await pushState();
}

var BROKEN_CAP = 200; // max broken-node entries kept for the report

// Scan ONLY the current page's TEXT/INSTANCE nodes. Scoping to one page avoids
// loadAllPagesAsync() and the full-document node array — the two things that
// exhaust the plugin sandbox on large files. Cross-page key moves reconcile by
// running cleanup on each page (see handleCleanup).
// Inputs:
//   keyNodeToVar      — { nodeId: varId } from each variable's stored keyNodeId
//   recordedGroupByVar — { varId: group } parsed from each variable's name
// Returns:
//   keyFoundGroup  — { varId: group } stored key node located on THIS page
//   usageByVar     — { varId: { nodeId, nodeName, group } } FIRST node bound to
//                    the variable in document order on THIS page
//   usageCountByVar — { varId: n } how many nodes on this page use it
//   brokenNodes    — [{ nodeId, nodeName, groupPath }] (capped) on this page
//   brokenTotal    — full count of broken nodes on this page
async function scanCurrentPage(ctx, allVarIds, keyNodeToVar, recordedGroupByVar) {
  // Skip descending into invisible instance sub-trees — a big perf win in
  // component-heavy files.
  figma.skipInvisibleInstanceChildren = true;

  var langIds = {};
  for (var i = 0; i < ctx.stringVars.length; i++) langIds[ctx.stringVars[i].id] = true;

  var keyFoundGroup = {};
  var usageByVar = {};
  var usageCountByVar = {};
  var brokenNodes = [];
  var brokenTotal = 0;
  var existsCache = {}; // variableId -> bool; resolve each distinct id at most once

  var nodes = figma.currentPage.findAllWithCriteria({ types: ["TEXT", "INSTANCE"] });
  // Rows of translation tables are copies of the real usages — leave them out.
  var tableIds = tableIdsOnPage(figma.currentPage.id);
  var hasTables = false;
  for (var tk in tableIds) { hasTables = true; break; }
  for (var n = 0; n < nodes.length; n++) {
    var node = nodes[n];
    if (hasTables) {
      var top = topLevelAncestor(node);
      if (top && tableIds[top.id]) continue;
    }
    // Wrap the whole per-node body: a node in a broken component set can throw
    // from resolveBinding, node.name, or getGroupPath. One bad node must not
    // abort the entire cleanup.
    try {
      var b = resolveBinding(node);
      if (!b || !b.variableId) continue;

      if (langIds[b.variableId]) {
        var varId = b.variableId;
        var isKey = keyNodeToVar[node.id] === varId && keyFoundGroup[varId] === undefined;
        var firstUse = usageByVar[varId] === undefined;
        usageCountByVar[varId] = (usageCountByVar[varId] || 0) + 1;
        // Only compute the (relatively cheap) group path when it can matter.
        if (isKey || firstUse) {
          var gp = getGroupPath(node);
          if (isKey) keyFoundGroup[varId] = gp;
          // First bound node in document order — lets the cleanup report jump
          // to a flagged variable's real usage even when no key layer remains.
          if (firstUse) usageByVar[varId] = { nodeId: node.id, nodeName: node.name, group: gp };
        }
      } else {
        // Bound to a non-language variable. Determining "broken" is tricky
        // because getVariableByIdAsync returns STALE (non-null) data for a
        // just-deleted variable. Reliable rule:
        //   • in the live local set (allVarIds) → valid (any local collection)
        //   • else resolves to a REMOTE variable → valid (library)
        //   • else (null, or a local "ghost" not in the live set) → broken
        var vid = b.variableId;
        var exists = existsCache[vid];
        if (exists === undefined) {
          if (allVarIds[vid]) {
            exists = true;
          } else {
            var lv = null;
            try { lv = await figma.variables.getVariableByIdAsync(vid); } catch (e) { lv = null; }
            exists = !!(lv && lv.remote);
          }
          existsCache[vid] = exists;
        }
        if (!exists) {
          brokenTotal++;
          if (brokenNodes.length < BROKEN_CAP) {
            brokenNodes.push({ nodeId: node.id, nodeName: node.name, groupPath: getGroupPath(node) });
          }
        }
      }
    } catch (e) {
      // Skip this node (e.g. broken component set) and keep going.
    }
  }
  return {
    keyFoundGroup: keyFoundGroup,
    usageByVar: usageByVar, usageCountByVar: usageCountByVar,
    brokenNodes: brokenNodes, brokenTotal: brokenTotal,
  };
}

async function handleCleanup() {
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));

  notify(L("scanning"));

  var currentPageId = figma.currentPage.id;

  // Every LOCAL variable ID (all collections/types) — fast path so local
  // variables in other collections are never mistaken for broken links.
  var allLocalVars = await figma.variables.getLocalVariablesAsync();
  var allVarIds = {};
  for (var ai = 0; ai < allLocalVars.length; ai++) allVarIds[allLocalVars[ai].id] = true;

  // Precompute per-variable lookups. keyPageById is each variable's recorded
  // "home" page for its key node (empty for legacy variables never confirmed).
  var recordedGroupByVar = {};
  var keyNodeToVar = {};
  var keyPageById = {};
  for (var q = 0; q < ctx.stringVars.length; q++) {
    var qv = ctx.stringVars[q];
    recordedGroupByVar[qv.id] = splitName(qv.name).group;
    var kn = "";
    try { kn = qv.getPluginData("keyNodeId"); } catch (e) {}
    if (kn) keyNodeToVar[kn] = qv.id;
    try { keyPageById[qv.id] = qv.getPluginData("keyPageId"); } catch (e) { keyPageById[qv.id] = ""; }
  }

  var scanResult = await scanCurrentPage(ctx, allVarIds, keyNodeToVar, recordedGroupByVar);
  var keyFoundGroup = scanResult.keyFoundGroup;
  var usageByVar = scanResult.usageByVar;
  var usageCountByVar = scanResult.usageCountByVar;
  var brokenNodes = scanResult.brokenNodes;
  var brokenTotal = scanResult.brokenTotal;

  // Seed the used-ID set with every already-assigned variable's ID so that
  // newly migrated variables can't collide with them.
  var usedIds = {};
  for (var s2 = 0; s2 < ctx.stringVars.length; s2++) {
    var sv = ctx.stringVars[s2];
    var assigned = "";
    try { assigned = sv.getPluginData("idAssigned"); } catch (e) {}
    if (assigned === "1") usedIds[stripWarn(splitName(sv.name).leaf)] = true;
  }

  var CAP = 200; // max flagged / missing entries kept for the report
  var renamed = 0;
  var regrouped = 0;
  var migrated = 0;
  var failed = 0;
  var flagged = [];       // [{ id, group, leaf }] — variables with no key layer
  var flaggedTotal = 0;
  var missingValues = []; // [{ id, group, modes:[names] }] — untranslated values
  var missingTotal = 0;

  for (var vi = 0; vi < ctx.stringVars.length; vi++) {
    var v = ctx.stringVars[vi];

    var rawName = v.name;
    var parts = splitName(rawName);
    var recordedGroup = parts.group;

    // ---- Determine this variable's group, scoped to the CURRENT page ----
    //   1. Stored key node found on this page → follow it (handles moves within
    //      the page, and a key dragged onto this page keeps its id). Re-home it.
    //   2. Not found, and the key's home page IS this page → the key is gone →
    //      flag it. The cleanup never picks a new key layer by itself — another
    //      layer using the token may not be the one the user wants; the report
    //      lists it so the user relocates (or deletes) deliberately.
    //   3. Otherwise the key lives on another page (or was never set) → leave alone.
    var keyMissing = false;
    var group = recordedGroup;

    if (keyFoundGroup[v.id] !== undefined) {
      group = keyFoundGroup[v.id];
      try { v.setPluginData("keyPageId", currentPageId); } catch (e) {}
    } else if (keyPageById[v.id] === currentPageId) {
      keyMissing = true;
    }

    // ---- Resolve the ID (migrating old text-based leaves on first run) ----
    var idAssigned = "";
    try { idAssigned = v.getPluginData("idAssigned"); } catch (e) {}
    var id;
    if (idAssigned === "1") {
      id = stripWarn(parts.leaf);
    } else {
      id = genId(usedIds);
      try { v.setPluginData("idAssigned", "1"); } catch (e) {}
      migrated++;
    }
    usedIds[id] = true;

    // ---- Scan for missing (untranslated) mode values ----
    var missModes = [];
    for (var mm = 0; mm < ctx.modes.length; mm++) {
      if (isMissingValue(v.valuesByMode[ctx.modes[mm].modeId])) missModes.push(ctx.modes[mm].name);
    }
    if (missModes.length) {
      missingTotal++;
      if (missingValues.length < CAP) {
        var mvals = {};
        for (var mvi = 0; mvi < ctx.modes.length; mvi++) {
          var rawv = v.valuesByMode[ctx.modes[mvi].modeId];
          mvals[ctx.modes[mvi].modeId] = typeof rawv === "string" ? rawv : null;
        }
        var mdesc = "";
        try { mdesc = v.description || ""; } catch (e) {}
        missingValues.push({
          id: id, group: group, modes: missModes, varId: v.id, valuesByMode: mvals,
          usageCount: usageCountByVar[v.id] || 0, description: mdesc,
        });
      }
    }

    // ---- Build the final name (⚠️ flag on the leaf only) ----
    var flaggedLeaf = (keyMissing ? WARN + " " : "") + id;
    var finalName = (group ? group + "/" : "") + flaggedLeaf;

    if (keyMissing) {
      flaggedTotal++;
      if (flagged.length < CAP) {
        var defVal = v.valuesByMode[ctx.defaultModeId];
        // A flagged variable may still be bound to nodes on this page — just
        // not at its recorded group (a node there would have been adopted as
        // the key above). Ship the first such node so the report can jump to it.
        var use = usageByVar[v.id];
        flagged.push({
          id: v.id, group: group, leaf: id,
          value: typeof defVal === "string" ? defVal : "",
          usageNodeId: use ? use.nodeId : "",
          usageNodeName: use ? use.nodeName : "",
          usageGroup: use ? use.group : "",
          usageCount: usageCountByVar[v.id] || 0,
        });
      }
    }

    if (finalName !== rawName) {
      var groupChanged = group !== recordedGroup;
      try {
        v.name = finalName;
        renamed++;
        if (groupChanged && !keyMissing) regrouped++;
      } catch (e) { failed++; }
    }
  }

  notify(L("cleanupSummary")({
    page: figma.currentPage.name,
    renamed: renamed, migrated: migrated, regrouped: regrouped,
    flagged: flaggedTotal, broken: brokenTotal, missing: missingTotal, failed: failed,
  }));

  if (flaggedTotal || brokenTotal || missingTotal) {
    // Keep the report on screen until the user dismisses it (don't pushState).
    figma.ui.postMessage({
      type: "cleanup-result",
      pageName: figma.currentPage.name,
      renamed: renamed, regrouped: regrouped, migrated: migrated,
      flagged: flagged, brokenNodes: brokenNodes, missingValues: missingValues,
      flaggedTotal: flaggedTotal, brokenTotal: brokenTotal, missingTotal: missingTotal,
      // Fresh variable list (post-rename) so the in-report assign picker is current.
      allVars: ctx.stringVars.map(serializeVar),
      modes: ctx.modes,
      defaultModeId: ctx.defaultModeId,
    });
  } else {
    await pushState();
  }
}

// Where a variable's key layer stands relative to the selection:
//   "current"   — the selected layer is the key layer
//   "elsewhere" — the key layer exists and is still linked to this variable
//   "missing"   — recorded, but deleted or no longer linked to this variable
//   "none"      — never recorded
async function keyLayerStatus(variable, selected, binding) {
  var keyNodeId = "";
  try { keyNodeId = variable.getPluginData("keyNodeId") || ""; } catch (e) {}
  if (!keyNodeId) return { status: "none", keyNodeId: "" };
  if (selected && (selected.id === keyNodeId || (binding && binding.instance && binding.instance.id === keyNodeId))) {
    return { status: "current", keyNodeId: keyNodeId };
  }
  var key = null;
  try { key = await figma.getNodeByIdAsync(keyNodeId); } catch (e) { key = null; }
  if (!key || key.removed || !isOnCanvas(key)) return { status: "missing", keyNodeId: keyNodeId };
  var kb = null;
  try { kb = resolveBinding(key); } catch (e) { kb = null; }
  if (!kb || kb.variableId !== variable.id) return { status: "missing", keyNodeId: keyNodeId };
  return { status: "elsewhere", keyNodeId: keyNodeId };
}

// Remove a binding but keep what the layer currently shows.
async function unlinkBinding(b) {
  if (b.kind === "text") {
    await loadFontsOf(b.node);
    b.node.setBoundVariable("characters", null);
  } else if (b.kind === "property") {
    var shown = "";
    try { shown = String(b.instance.componentProperties[b.propName].value || ""); } catch (e) {}
    var texts = b.instance.findAllWithCriteria({ types: ["TEXT"] });
    for (var i = 0; i < texts.length; i++) {
      var refs = texts[i].componentPropertyReferences;
      if (refs && refs.characters === b.propName) await loadFontsOf(texts[i]);
    }
    var props = {};
    props[b.propName] = shown;
    b.instance.setProperties(props);
  }
}

// Unlink every layer on the current page that uses this variable (translation
// table rows excluded — the table drops the row by itself). Returns the count.
async function unlinkUsagesOnPage(variableId) {
  figma.skipInvisibleInstanceChildren = true;
  var tableIds = tableIdsOnPage(figma.currentPage.id);
  var hasTables = false;
  for (var tk in tableIds) { hasTables = true; break; }
  var nodes = figma.currentPage.findAllWithCriteria({ types: ["TEXT", "INSTANCE"] });
  var done = {}, count = 0;
  for (var i = 0; i < nodes.length; i++) {
    if (i && i % 500 === 0) await yieldToFigma();
    if (hasTables) {
      var top = topLevelAncestor(nodes[i]);
      if (top && tableIds[top.id]) continue;
    }
    var b = null;
    try { b = resolveBinding(nodes[i]); } catch (e) { b = null; }
    if (!b || b.variableId !== variableId) continue;
    var key = b.kind === "text" ? b.node.id : b.instance.id + "|" + b.propName;
    if (done[key]) continue; // a text inside an instance and the instance resolve to the same property
    done[key] = true;
    try { await unlinkBinding(b); count++; } catch (e) { console.error("[i18n] unlink failed", e); }
  }
  return count;
}

// Report shortcut: show a token on the canvas — its key layer when it is on
// this page, otherwise the layer using it that is nearest to the middle of the
// current view (table rows excluded).
async function handleNavigateToUsage(variableId) {
  var ok = await selectTokenUsage(variableId);
  figma.ui.postMessage({ type: "navigate-usage-result", ok: ok, variableId: variableId });
  // Selecting the node that is already selected fires no selectionchange —
  // push the state explicitly so the edit view always follows.
  if (ok) await pushState();
}

async function selectTokenUsage(variableId) {
  var keyId = "";
  var all = await figma.variables.getLocalVariablesAsync("STRING");
  var variable = null;
  for (var i = 0; i < all.length; i++) if (all[i].id === variableId) { variable = all[i]; break; }
  if (!variable) { notify(L("varNotFound")); return false; }
  try { keyId = variable.getPluginData("keyNodeId") || ""; } catch (e) {}
  if (keyId) {
    var key = await figma.getNodeByIdAsync(keyId);
    var kb = null;
    if (key && !key.removed && isOnCanvas(key)) { try { kb = resolveBinding(key); } catch (e) {} }
    if (kb && kb.variableId === variableId) {
      var kp = pageOf(key);
      if (kp && kp !== figma.currentPage) await figma.setCurrentPageAsync(kp);
      figma.currentPage.selection = [key];
      figma.viewport.scrollAndZoomIntoView([key]);
      return true;
    }
  }
  figma.skipInvisibleInstanceChildren = true;
  var tableIds = tableIdsOnPage(figma.currentPage.id);
  var c = figma.viewport.center;
  var best = null, bestD = Infinity;
  var nodes = figma.currentPage.findAllWithCriteria({ types: ["TEXT", "INSTANCE"] });
  for (var n = 0; n < nodes.length; n++) {
    var b = null;
    try { b = resolveBinding(nodes[n]); } catch (e) { b = null; }
    if (!b || b.variableId !== variableId) continue;
    var top = topLevelAncestor(nodes[n]);
    if (top && tableIds[top.id]) continue;
    var box = nodes[n].absoluteBoundingBox;
    if (!box) continue;
    var dx = box.x + box.width / 2 - c.x, dy = box.y + box.height / 2 - c.y;
    var d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = nodes[n]; }
  }
  if (best) {
    figma.currentPage.selection = [best];
    figma.viewport.scrollAndZoomIntoView([best]);
    return true;
  }
  // Not used on this page: look through the other pages (an explicit click,
  // so loading pages is acceptable), the key layer's recorded page first.
  return await selectUsageOnOtherPage(variable);
}

async function selectUsageOnOtherPage(variable) {
  var homeId = "";
  try { homeId = variable.getPluginData("keyPageId") || ""; } catch (e) {}
  var pages = [];
  for (var p = 0; p < figma.root.children.length; p++) {
    var pg = figma.root.children[p];
    if (pg === figma.currentPage) continue;
    if (pg.id === homeId) pages.unshift(pg); else pages.push(pg);
  }
  if (!pages.length) return false;
  figma.notify(L("searchingPages"));
  for (var i = 0; i < pages.length; i++) {
    var page = pages[i];
    await page.loadAsync();
    var tableIds = tableIdsOnPage(page.id);
    var nodes = page.findAllWithCriteria({ types: ["TEXT", "INSTANCE"] });
    for (var n = 0; n < nodes.length; n++) {
      var b = null;
      try { b = resolveBinding(nodes[n]); } catch (e) { b = null; }
      if (!b || b.variableId !== variable.id) continue;
      var top = topLevelAncestor(nodes[n]);
      if (top && tableIds[top.id]) continue;
      await figma.setCurrentPageAsync(page);
      figma.currentPage.selection = [nodes[n]];
      figma.viewport.scrollAndZoomIntoView([nodes[n]]);
      return true;
    }
    if (i % 3 === 2) await yieldToFigma();
  }
  return false;
}

async function handleNavigateToNode(nodeId) {
  // Fetch the single node directly (loads its page on demand) — no full-document load.
  var node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.removed) return notify(L("layerNotFound"));
  // Switch to the page that contains this node before selecting.
  var cur = node.parent;
  while (cur && cur.type !== "PAGE") cur = cur.parent;
  if (cur && cur.type === "PAGE" && cur !== figma.currentPage) {
    await figma.setCurrentPageAsync(cur);
  }
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

async function handleUnlinkNode(nodeId) {
  var node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.removed) return notify(L("layerNotFound"));
  var b = resolveBinding(node);
  if (!b || !b.variableId) return notify(L("noBinding"));
  await unlinkBinding(b);
  // Don't push state here — from the report the UI stays put (Done refreshes);
  // the edit view asks for a refresh itself.
  notify(L("unlinked"));
}

// Assign the currently-selected text layer as a variable's key layer. Binds the
// variable to that layer, records it as the key (node + page), and renames the
// variable to that layer's group (dropping any ⚠️ flag). Resolves the flag
// immediately. Reports ok/failure so the UI can return to the report list.
async function handleRelocateKey(variableId) {
  function done(ok) { figma.ui.postMessage({ type: "relocate-result", ok: ok, variableId: variableId }); }

  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return done(false); }

  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) { notify(L("varNotFound")); return done(false); }

  var node = figma.currentPage.selection[0];
  var binding = node ? resolveBinding(node) : null;
  if (!binding) { notify(L("selectFirst")); return done(false); }

  applyBinding(binding, variable);
  try { variable.setPluginData("keyNodeId", node.id); } catch (e) {}
  try { variable.setPluginData("keyPageId", figma.currentPage.id); } catch (e) {}
  try { variable.setPluginData("idAssigned", "1"); } catch (e) {}

  // Rename to the new key's group, dropping any ⚠️ flag (leaf stays the ID).
  var id = stripWarn(splitName(variable.name).leaf);
  var group = getGroupPath(node);
  try { variable.name = (group ? group + "/" : "") + id; } catch (e) {}

  notify(L("relocated"));
  done(true);
}

// Create a new variable and assign it to a specific node (used by the in-report
// assign picker so creation works without changing the canvas selection).
async function handleCreateForBroken(values, nodeId) {
  function done(ok, newVarId) { figma.ui.postMessage({ type: "assign-broken-result", ok: ok, nodeId: nodeId, newVarId: newVarId }); }

  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return done(false); }

  var node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.removed) { notify(L("layerNotFound")); return done(false); }
  var binding = resolveBinding(node);
  if (!binding) { notify(L("noBinding")); return done(false); }

  var defaultVal = values[ctx.defaultModeId];
  if (!defaultVal || !defaultVal.trim()) { notify(L("defaultRequired")); return done(false); }

  var groupPath = getGroupPath(node);
  var existingIds = {};
  for (var ei = 0; ei < ctx.stringVars.length; ei++) {
    existingIds[stripWarn(splitName(ctx.stringVars[ei].name).leaf)] = true;
  }
  var id = genId(existingIds);
  var fullName = groupPath ? groupPath + "/" + id : id;

  var variable = figma.variables.createVariable(fullName, ctx.collection, "STRING");
  for (var mi = 0; mi < ctx.modes.length; mi++) {
    var m = ctx.modes[mi];
    var val = values[m.modeId];
    if (m.isDefault) val = defaultVal;
    else if (!val || !val.trim()) val = MISSING;
    variable.setValueForMode(m.modeId, val);
  }

  applyBinding(binding, variable);
  try { variable.setPluginData("idAssigned", "1"); } catch (e) {}
  try { variable.setPluginData("keyNodeId", node.id); } catch (e) {}
  try { variable.setPluginData("keyPageId", figma.currentPage.id); } catch (e) {}
  await addRecentId(variable.id);
  notify(L("created"));
  done(true, variable.id);
}

// Bind a specific variable to a specific node (used by the in-report picker for
// broken-link layers). Works by node id, independent of the current selection.
async function handleAssignToBroken(nodeId, variableId) {
  function done(ok) { figma.ui.postMessage({ type: "assign-broken-result", ok: ok, nodeId: nodeId }); }

  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return done(false); }

  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) { notify(L("varNotFound")); return done(false); }

  var node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.removed) { notify(L("layerNotFound")); return done(false); }
  var binding = resolveBinding(node);
  if (!binding) { notify(L("noBinding")); return done(false); }

  applyBinding(binding, variable);
  await addRecentId(variableId);
  notify(L("assigned"));
  done(true);
}

// Import CSV: match each row to a variable by its ID (column 5), then overwrite
// that variable's mode values from the mode columns. New mode columns are added
// to the collection. Rows with no matching variable are reported, not created.
async function handleImportCsv(headers, rows) {
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));

  // Map existing mode names → modeId (case-insensitive).
  var nameToModeId = {};
  for (var mi = 0; mi < ctx.modes.length; mi++) {
    nameToModeId[ctx.modes[mi].name.trim().toLowerCase()] = ctx.modes[mi].modeId;
  }

  // Column layout: 0-3 group path, 4 variable id, then an optional
  // "Description" column followed by one column per mode. The description
  // column is located by header name rather than index so CSVs exported
  // before that column existed still import cleanly (descriptions untouched).
  var descCol = -1;
  var modeCols = [];      // [{ colIndex, modeId }]
  var newModeNames = [];
  var newModeIds = {};
  for (var c = 5; c < headers.length; c++) {
    var hname = String(headers[c] == null ? "" : headers[c]).trim();
    if (!hname) continue;
    var key = hname.toLowerCase();
    if (key === DESC_HEADER_KEY && descCol === -1) { descCol = c; continue; }
    var modeId = nameToModeId[key];
    if (!modeId) {
      try {
        modeId = ctx.collection.addMode(hname);
      } catch (e) {
        notify(L("couldNotAddMode")(hname, (e && e.message ? e.message : String(e))));
        continue;
      }
      nameToModeId[key] = modeId;
      newModeIds[modeId] = true;
      newModeNames.push(hname);
    }
    modeCols.push({ colIndex: c, modeId: modeId });
  }

  // Re-fetch (addMode mutates the collection) and index variables by their ID.
  var freshAll = await figma.variables.getLocalVariablesAsync("STRING");
  var vars = freshAll.filter(function(v) { return v.variableCollectionId === ctx.collection.id; });
  var byId = {};
  for (var i = 0; i < vars.length; i++) {
    byId[stripWarn(splitName(vars[i].name).leaf)] = vars[i];
  }

  var csvIds = {};
  var updated = 0;
  var unmatched = [];
  // Every value change is pushed into each text bound to it (source layers
  // and translation tables), so a 1000-row CSV can take ~10 s. Yield now and
  // then so Figma stays responsive, and say that something is happening.
  if (rows.length > 200) figma.notify(L("importing")(rows.length));

  for (var r = 0; r < rows.length; r++) {
    if (r && r % 100 === 0) await yieldToFigma();
    var row = rows[r];
    if (!row || row.length === 0) continue;
    var vname = String(row[4] == null ? "" : row[4]).trim();
    if (!vname) continue;
    csvIds[vname] = true;

    var variable = byId[vname];
    if (!variable) {
      unmatched.push({
        variableName: vname,
        section1: row[0] || "", section2: row[1] || "", section3: row[2] || "", layer: row[3] || "",
      });
      continue;
    }
    for (var k = 0; k < modeCols.length; k++) {
      var cell = row[modeCols[k].colIndex];
      var val = String(cell == null ? "" : cell);
      if (val.trim() === "") val = MISSING;
      variable.setValueForMode(modeCols[k].modeId, val);
    }
    // An empty cell in a present Description column clears the description;
    // an absent column leaves it as-is (handled by the descCol < 0 guard).
    if (descCol >= 0) {
      var dcell = row[descCol];
      try { variable.description = String(dcell == null ? "" : dcell); } catch (e) {}
    }
    updated++;
  }

  // For each newly added mode, fill "--" on variables the CSV didn't cover.
  if (newModeNames.length) {
    for (var j = 0; j < vars.length; j++) {
      var vid = stripWarn(splitName(vars[j].name).leaf);
      if (csvIds[vid]) continue; // already set from its CSV row
      for (var nm in newModeIds) vars[j].setValueForMode(nm, MISSING);
    }
  }

  notify(L("importSummary")({
    updated: updated, newModes: newModeNames.length, unmatched: unmatched.length,
  }));

  figma.ui.postMessage({ type: "import-result", updated: updated, newModes: newModeNames, unmatched: unmatched });
}

async function handleExportCsv() {
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));
  figma.ui.postMessage({
    type: "export-data",
    vars: ctx.stringVars.map(serializeVar),
    modes: ctx.modes,
  });
}

async function handleDeleteVar(variableId) {
  var ctx = await getContext();
  if (!ctx.collection) return notify(L("noCollection"));
  var variable = null;
  for (var i = 0; i < ctx.stringVars.length; i++) {
    if (ctx.stringVars[i].id === variableId) { variable = ctx.stringVars[i]; break; }
  }
  if (!variable) return notify(L("varNotFound"));
  // Unlink the layers that still use it on this page first, so they don't
  // turn into broken links that only the next cleanup would find.
  var unlinked = await unlinkUsagesOnPage(variable.id);
  variable.remove();
  // Don't push state here — from the report the UI stays put (Done refreshes).
  notify(unlinked ? L("deletedUnlinked")(unlinked) : L("deleted"));
}

// ---------------------------------------------------------------------------
// Translation tables
// ---------------------------------------------------------------------------
// Select a top-level layer (directly under the page or a section) and the
// plugin lays out every "language" variable used inside it as a table on the
// canvas: an instance of the i18n-table component whose i18n-slot holds one
// i18n-row instance per variable. Both components are templates shared by
// every table in the file — they are found by name, or created on first use.
//
// • Columns: one per language mode, kept in step on BOTH templates (header
//   label = mode name). Each row column carries an explicit variable mode, so
//   a row's text shows that column's language.
// • Values: each row's "value" text property is bound to its variable and
//   every column's text shows that property, so Figma updates the values by
//   itself, and a new column needs no per-row work. The plugin only reconciles
//   rows (variables added to / removed from the source layer) and columns.
// • Performance (measured with 1000 variables): inserting rows straight into
//   a slot slows down as it fills (~45 ms/row and growing), so rows live in an
//   "i18n-rows" frame inside the slot. Big batches are built off-canvas with
//   auto layout off and moved in as one node (1000 rows ≈ 5 s).
// • Load: syncing is per page. A registry on figma.root records which page
//   each table lives on; only tables on the current page are touched, and the
//   others catch up when their page is opened.

var TPL_TABLE_NAME = "i18n-table";
var TPL_ROW_NAME = "i18n-row";
var TPL_SLOT_NAME = "i18n-slot";
var PD_TPL_TABLE = "i18nTplTable"; // root: id of the i18n-table template
var PD_TPL_ROW = "i18nTplRow";     // root: id of the i18n-row template
var PD_TPL_SIG = "i18nTplSig";     // root: modes the template columns were built for
var PD_TABLES = "i18nTables";      // root: JSON { tableInstanceId: { p: pageId, s: sourceId } }
var PD_TABLE_SIG = "i18nSig";      // table instance: what its rows were built from
var TABLE_RENDER_VERSION = 4;      // bump when row/column building changes (2: rows in i18n-rows, value property; 3: fixed table width; 4: 1500)
var TABLE_GAP = 100;               // px between the source layer and its table
var TPL_CACHE_MS = 10000;
var LANG_COL_RE = /^language-\d+$/;
var ROW_PROP_NAME = "value";       // TEXT property on i18n-row that every column's text shows
var ROWS_FRAME_NAME = "i18n-rows"; // wrapper inside i18n-slot that holds the rows
var TABLE_WIDTH = 1500;            // every table is exactly this wide; the columns share it equally
var TABLE_MAX_COLUMNS = 3;         // tables show at most this many language columns (the first modes of the collection)
var REBUILD_THRESHOLD = 100;       // more new rows than this: build a fresh wrapper off-canvas

var GREY_STROKE = { r: 0.667, g: 0.667, b: 0.667 };

function isOnCanvas(node) {
  if (!node || node.removed) return false;
  var p = node.parent;
  while (p && p.type !== "PAGE") p = p.parent;
  return !!p && !!p.parent && p.parent.type === "DOCUMENT";
}

function pageOf(node) {
  var p = node;
  while (p && p.type !== "PAGE") p = p.parent;
  return p;
}

// Directly under the page, or directly under a section (at any depth of sections).
function isTopLevel(node) {
  if (!node || node.type === "SECTION" || node.type === "PAGE") return false;
  var p = node.parent;
  return !!p && (p.type === "PAGE" || p.type === "SECTION");
}

function topLevelAncestor(node) {
  var n = node;
  while (n && n.parent && n.parent.type !== "PAGE" && n.parent.type !== "SECTION") n = n.parent;
  return n;
}

function readRegistry() {
  try { return JSON.parse(figma.root.getPluginData(PD_TABLES) || "{}") || {}; }
  catch (e) { return {}; }
}
function writeRegistry(reg) { figma.root.setPluginData(PD_TABLES, JSON.stringify(reg)); }

function tableIdForSource(reg, sourceId) {
  for (var id in reg) if (reg[id] && reg[id].s === sourceId) return id;
  return null;
}

// Ids of the tables registered on the given page (used to keep table rows out
// of the cleanup scan — they are copies, not usages).
function tableIdsOnPage(pageId) {
  var reg = readRegistry(), out = {};
  for (var id in reg) if (reg[id] && reg[id].p === pageId) out[id] = true;
  return out;
}

// ---- template structure (works for user-made and generated templates) ----
function langCols(frame) {
  var out = [];
  if (!frame || !("children" in frame)) return out;
  for (var i = 0; i < frame.children.length; i++) {
    if (LANG_COL_RE.test(frame.children[i].name)) out.push(frame.children[i]);
  }
  return out;
}

function tableParts(node) {
  var parts = { title: null, header: null, slot: null };
  if (!node || !("children" in node)) return parts;
  for (var i = 0; i < node.children.length; i++) {
    var c = node.children[i];
    if (c.type === "SLOT") parts.slot = c;
    else if (!parts.header && langCols(c).length) parts.header = c;
    else if (!parts.title && c.type === "FRAME") parts.title = c;
  }
  return parts;
}

function validTableTpl(n) {
  if (!n || n.type !== "COMPONENT" || !isOnCanvas(n)) return false;
  var p = tableParts(n);
  return !!(p.header && p.slot);
}
function validRowTpl(n) {
  return !!n && n.type === "COMPONENT" && isOnCanvas(n) && langCols(n).length > 0;
}

function findComponentNamed(scope, name) {
  var list = scope.findAllWithCriteria({ types: ["COMPONENT"] });
  for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
  return null;
}

var tplCache = null; // { table, row, status, at }

// status: "ok" | "missing" (were set up, then deleted) | "none" (never set up)
// searchFile: look through every page by name (explicit user actions only —
// loading all pages is expensive).
async function getTemplates(searchFile) {
  if (!searchFile && tplCache && Date.now() - tplCache.at < TPL_CACHE_MS) return tplCache;
  var tId = figma.root.getPluginData(PD_TPL_TABLE);
  var rId = figma.root.getPluginData(PD_TPL_ROW);
  var table = tId ? await figma.getNodeByIdAsync(tId) : null;
  var row = rId ? await figma.getNodeByIdAsync(rId) : null;
  if (!validTableTpl(table)) table = null;
  if (!validRowTpl(row)) row = null;
  var hadStored = !!(tId || rId);

  if (!table || !row) {
    if (!table) { var t1 = findComponentNamed(figma.currentPage, TPL_TABLE_NAME); if (validTableTpl(t1)) table = t1; }
    if (!row) { var r1 = findComponentNamed(figma.currentPage, TPL_ROW_NAME); if (validRowTpl(r1)) row = r1; }
  }
  if ((!table || !row) && searchFile) {
    await figma.loadAllPagesAsync();
    if (!table) { var t2 = findComponentNamed(figma.root, TPL_TABLE_NAME); if (validTableTpl(t2)) table = t2; }
    if (!row) { var r2 = findComponentNamed(figma.root, TPL_ROW_NAME); if (validRowTpl(r2)) row = r2; }
  }
  if (table) figma.root.setPluginData(PD_TPL_TABLE, table.id);
  if (row) figma.root.setPluginData(PD_TPL_ROW, row.id);
  var status = table && row ? "ok" : (hadStored ? "missing" : "none");
  tplCache = { table: table, row: row, status: status, at: Date.now() };
  return tplCache;
}

// Fonts already loaded this session — a 1000-row table would otherwise await
// the same font thousands of times.
var loadedFonts = {};
async function loadFontsOf(textNode) {
  var fonts = textNode.getRangeAllFontNames(0, Math.max(1, textNode.characters.length));
  for (var i = 0; i < fonts.length; i++) {
    var key = fonts[i].family + "|" + fonts[i].style;
    if (loadedFonts[key]) continue;
    await figma.loadFontAsync(fonts[i]);
    loadedFonts[key] = true;
  }
}

// Short, stable fingerprint (djb2) — the full row list of a large table would
// be tens of KB, too much to keep in plugin data.
function hashString(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + str.length;
}

// Give Figma a moment to breathe during long loops so the canvas stays responsive.
function yieldToFigma() { return new Promise(function(resolve) { setTimeout(resolve, 0); }); }
var ROWS_PER_YIELD = 50;

function solid(c) { return [{ type: "SOLID", color: c }]; }

function makeText(chars, font, size, lineHeightPct, color, align) {
  var t = figma.createText();
  t.fontName = font;
  t.fontSize = size;
  t.lineHeight = { unit: "PERCENT", value: lineHeightPct };
  t.fills = solid(color);
  t.textAlignHorizontal = align;
  t.characters = chars;
  return t;
}

// The two templates, matching the reference design (Rider-App › Utility).
async function buildTemplates(anchor) {
  var bold = { family: "Inter", style: "Bold" };
  var regular = { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(bold);
  await figma.loadFontAsync(regular);

  // i18n-row: one column per language, text bound per instance.
  var row = figma.createComponent();
  row.name = TPL_ROW_NAME;
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "AUTO";
  row.counterAxisSizingMode = "AUTO";
  row.counterAxisAlignItems = "CENTER";
  row.fills = [];
  var rc = figma.createFrame();
  rc.name = "language-1";
  rc.layoutMode = "VERTICAL";
  rc.paddingTop = rc.paddingRight = rc.paddingBottom = rc.paddingLeft = 10;
  rc.fills = solid({ r: 1, g: 1, b: 1 });
  rc.strokes = solid(GREY_STROKE);
  rc.strokeWeight = 1;
  rc.strokeAlign = "CENTER";
  rc.clipsContent = true;
  row.appendChild(rc);
  rc.resize(400, 44);
  rc.layoutSizingHorizontal = "FIXED";
  rc.layoutSizingVertical = "FILL";
  var rt = makeText("텍스트", regular, 16, 150, { r: 0.29, g: 0.29, b: 0.29 }, "LEFT");
  rc.appendChild(rt);
  rt.textAutoResize = "HEIGHT";
  rt.layoutSizingHorizontal = "FILL";
  await ensureRowProperty(row);

  // i18n-table: title, header (mode names), slot of rows.
  var table = figma.createComponent();
  table.name = TPL_TABLE_NAME;
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO";
  table.counterAxisSizingMode = "AUTO";
  table.fills = [];

  var title = figma.createFrame();
  title.name = ".";
  title.layoutMode = "HORIZONTAL";
  title.primaryAxisAlignItems = "CENTER";
  title.counterAxisAlignItems = "CENTER";
  title.itemSpacing = 10;
  title.paddingTop = title.paddingBottom = 12;
  title.paddingLeft = title.paddingRight = 5;
  title.fills = solid({ r: 0.4718, g: 0.4718, b: 0.4718 });
  title.strokes = solid(GREY_STROKE);
  title.strokeWeight = 1;
  title.strokeAlign = "CENTER";
  title.clipsContent = true;
  table.appendChild(title);
  title.layoutSizingHorizontal = "FILL";
  title.layoutSizingVertical = "HUG";
  var tt = makeText("번역", bold, 20, 100, { r: 1, g: 1, b: 1 }, "CENTER");
  title.appendChild(tt);
  tt.textAutoResize = "HEIGHT";
  tt.layoutSizingHorizontal = "FILL";

  var header = figma.createFrame();
  header.name = ".";
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "AUTO";
  header.counterAxisSizingMode = "AUTO";
  header.counterAxisAlignItems = "CENTER";
  header.fills = [];
  table.appendChild(header);
  var hc = figma.createFrame();
  hc.name = "language-1";
  hc.layoutMode = "HORIZONTAL";
  hc.primaryAxisAlignItems = "CENTER";
  hc.counterAxisAlignItems = "CENTER";
  hc.itemSpacing = 10;
  hc.paddingTop = hc.paddingBottom = 12;
  hc.paddingLeft = hc.paddingRight = 5;
  hc.fills = solid({ r: 0.9667, g: 0.9667, b: 0.9667 });
  hc.strokes = solid(GREY_STROKE);
  hc.strokeWeight = 1;
  hc.strokeAlign = "CENTER";
  hc.clipsContent = true;
  header.appendChild(hc);
  hc.resize(400, 44);
  hc.layoutSizingHorizontal = "FIXED";
  hc.layoutSizingVertical = "HUG";
  var ht = makeText("language 1", bold, 20, 100, { r: 0, g: 0, b: 0 }, "CENTER");
  hc.appendChild(ht);
  ht.textAutoResize = "HEIGHT";
  ht.layoutSizingHorizontal = "FILL";

  var slot = table.createSlot();
  slot.name = TPL_SLOT_NAME;
  slot.layoutMode = "VERTICAL";
  slot.primaryAxisSizingMode = "AUTO";
  slot.counterAxisSizingMode = "AUTO";
  slot.fills = [];
  slot.appendChild(row.createInstance()); // default content, replaced in each table

  // Park the templates to the right of everything on the page.
  var right = 0, top = anchor ? anchor.y : 0;
  var kids = figma.currentPage.children;
  for (var i = 0; i < kids.length; i++) {
    if (kids[i] === table || kids[i] === row) continue;
    right = Math.max(right, kids[i].x + kids[i].width);
  }
  table.x = Math.round(right + 400); table.y = Math.round(top);
  row.x = table.x; row.y = Math.round(table.y + table.height + 120);
  table.description = "Template for translation tables. Managed by the i18n plugin: columns follow the modes of the \"language\" collection.";
  row.description = "One row of an i18n-table. Managed by the i18n plugin.";

  figma.root.setPluginData(PD_TPL_TABLE, table.id);
  figma.root.setPluginData(PD_TPL_ROW, row.id);
  figma.root.setPluginData(PD_TPL_SIG, "");
  tplCache = { table: table, row: row, status: "ok", at: Date.now() };
  return tplCache;
}

// Make `frame` have exactly n language columns (clone the last one to grow).
function setColumnCount(frame, n) {
  var cols = langCols(frame);
  while (cols.length < n) {
    var last = cols[cols.length - 1];
    var copy = last.clone();
    frame.insertChild(frame.children.indexOf(last) + 1, copy);
    try { copy.layoutSizingHorizontal = last.layoutSizingHorizontal; } catch (e) {}
    try { copy.layoutSizingVertical = last.layoutSizingVertical; } catch (e) {}
    // Neighbouring cells share a border: only the first column draws its left edge.
    try { copy.strokeLeftWeight = 0; } catch (e) {}
    cols.push(copy);
  }
  while (cols.length > n && cols.length > 1) cols.pop().remove();
  for (var i = 0; i < cols.length; i++) cols[i].name = "language-" + (i + 1);
  return cols;
}

function firstText(node) {
  if (!node) return null;
  if (node.type === "TEXT") return node;
  if (!("findOne" in node)) return null;
  return node.findOne(function(n) { return n.type === "TEXT"; });
}

// The row template's TEXT property that every column's text references.
// Added to a user-made template that lacks it. Returns the property key.
async function ensureRowProperty(row) {
  var defs = row.componentPropertyDefinitions;
  var key = null;
  for (var k in defs) {
    if (defs[k].type === "TEXT" && k.split("#")[0] === ROW_PROP_NAME) { key = k; break; }
  }
  if (!key) key = row.addComponentProperty(ROW_PROP_NAME, "TEXT", "텍스트");
  var cols = langCols(row);
  for (var i = 0; i < cols.length; i++) {
    var t = firstText(cols[i]);
    if (!t) continue;
    var refs = t.componentPropertyReferences;
    if (!refs || refs.characters !== key) {
      await loadFontsOf(t);
      t.componentPropertyReferences = { characters: key };
    }
  }
  return key;
}

// Column widths that together make exactly TABLE_WIDTH (remainder pixels go to the first columns).
function columnWidth(index, count) {
  var base = Math.floor(TABLE_WIDTH / count);
  return base + (index < TABLE_WIDTH - base * count ? 1 : 0);
}

// Fixed-width columns: resize each to its share, keeping its vertical sizing.
function applyColumnWidths(cols) {
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    var sv = c.layoutSizingVertical;
    c.resize(columnWidth(i, cols.length), c.height);
    try { c.layoutSizingHorizontal = "FIXED"; } catch (e) {}
    try { c.layoutSizingVertical = sv; } catch (e) {}
  }
}

// The modes a table shows as columns: the first TABLE_MAX_COLUMNS of the collection.
function tableModes(ctx) { return ctx.modes.slice(0, TABLE_MAX_COLUMNS); }

// Keep both templates' columns in step with the collection's modes
// (at most TABLE_MAX_COLUMNS of them).
async function syncTemplateColumns(tpls, ctx) {
  var modes = tableModes(ctx);
  var sig = JSON.stringify({ w: TABLE_WIDTH, m: modes.map(function(m) { return [m.modeId, m.name]; }) });
  var header = tableParts(tpls.table).header;
  var headCols = langCols(header), rowCols = langCols(tpls.row);
  if (figma.root.getPluginData(PD_TPL_SIG) === sig &&
      headCols.length === modes.length && rowCols.length === modes.length) {
    if (!tpls.propKey) tpls.propKey = await ensureRowProperty(tpls.row);
    return false;
  }

  headCols = setColumnCount(header, modes.length);
  for (var i = 0; i < headCols.length; i++) {
    var ht = firstText(headCols[i]);
    if (ht && ht.characters !== modes[i].name) { await loadFontsOf(ht); ht.characters = modes[i].name; }
  }
  applyColumnWidths(headCols);
  rowCols = setColumnCount(tpls.row, modes.length);
  applyColumnWidths(rowCols);
  for (var j = 0; j < rowCols.length; j++) {
    rowCols[j].setExplicitVariableModeForCollection(ctx.collection, modes[j].modeId);
  }
  // A cloned column's text loses its property reference — re-attach it.
  tpls.propKey = await ensureRowProperty(tpls.row);
  figma.root.setPluginData(PD_TPL_SIG, sig);
  return true;
}

// Tokens whose KEY layer is inside `source` (the source itself included), in
// document order, without duplicates. Tokens merely used there — whose key
// layer lives elsewhere — are left out: a table lists the tokens a screen owns.
function collectSourceVars(source, langIds) {
  figma.skipInvisibleInstanceChildren = true;
  var ids = [], seen = {};
  var nodes = [];
  if (source.type === "TEXT" || source.type === "INSTANCE") nodes.push(source);
  if ("findAllWithCriteria" in source) {
    var found = source.findAllWithCriteria({ types: ["TEXT", "INSTANCE"] });
    for (var k = 0; k < found.length; k++) nodes.push(found[k]);
  }
  var keyOf = {}; // variableId -> recorded key node id (read once per token)
  for (var i = 0; i < nodes.length; i++) {
    var b = null;
    try { b = resolveBinding(nodes[i]); } catch (e) { b = null; }
    if (!b || !b.variableId || !langIds[b.variableId] || seen[b.variableId]) continue;
    var vid = b.variableId;
    if (keyOf[vid] === undefined) {
      try { keyOf[vid] = langIds[vid].getPluginData("keyNodeId") || ""; } catch (e) { keyOf[vid] = ""; }
    }
    var isKey = keyOf[vid] === nodes[i].id || (b.instance && keyOf[vid] === b.instance.id);
    if (!isKey) continue;
    seen[vid] = true;
    ids.push(vid);
  }
  return ids;
}

function langIdMap(ctx) {
  var m = {};
  for (var i = 0; i < ctx.stringVars.length; i++) m[ctx.stringVars[i].id] = ctx.stringVars[i];
  return m;
}

// The variable a row shows: its "value" property's binding. Rows from older
// versions (texts bound directly) read as null, so they get rebuilt.
function rowVarId(row, propKey) {
  try {
    var p = row.componentProperties[propKey];
    var alias = p && p.boundVariables && p.boundVariables.value;
    return alias ? alias.id : null;
  } catch (e) { return null; }
}

function bindRow(row, variable, propKey) {
  if (rowVarId(row, propKey) === variable.id) return;
  var props = {};
  props[propKey] = figma.variables.createVariableAlias(variable);
  row.setProperties(props);
}

// Rows are built here with auto layout off (no relayout per append), then
// switched on once — see the performance note at the top of this section.
async function buildRowsFrame(tpls, vars, varIds) {
  var wrap = figma.createFrame();
  wrap.name = ROWS_FRAME_NAME;
  wrap.fills = [];
  wrap.clipsContent = false;
  for (var i = 0; i < varIds.length; i++) {
    var r = tpls.row.createInstance();
    wrap.appendChild(r);
    bindRow(r, vars[varIds[i]], tpls.propKey);
    if (i && i % 200 === 0) await yieldToFigma();
  }
  wrap.layoutMode = "VERTICAL";
  wrap.primaryAxisSizingMode = "AUTO";
  wrap.counterAxisSizingMode = "AUTO";
  wrap.itemSpacing = 0;
  return wrap;
}

// Rebuild one table's rows from its source layer when anything they depend on changed.
async function syncTable(inst, ctx, tpls, force) {
  var reg = readRegistry();
  var entry = reg[inst.id];
  var source = entry && entry.s ? await figma.getNodeByIdAsync(entry.s) : null;
  if (!source || source.removed) return { orphan: true };

  var main = await inst.getMainComponentAsync();
  var swapped = false;
  if (!main || main.id !== tpls.table.id) { inst.swapComponent(tpls.table); force = true; swapped = true; }

  var vars = ctx.varMap || langIdMap(ctx);
  var varIds = collectSourceVars(source, vars);
  var sig = hashString(JSON.stringify({
    v: TABLE_RENDER_VERSION, t: tpls.table.id, r: tpls.row.id,
    m: tableModes(ctx).map(function(m) { return m.modeId; }), vars: varIds,
  }));
  if (!force && inst.getPluginData(PD_TABLE_SIG) === sig) return { changed: false };

  var slot = tableParts(inst).slot;
  if (!slot) throw new Error(L("tplBroken"));
  if (!tpls.propKey) tpls.propKey = await ensureRowProperty(tpls.row);
  var propKey = tpls.propKey;

  // The rows wrapper; anything else in the slot (template default rows,
  // rows from older versions) is cleared.
  var wrap = null;
  var slotKids = slot.children.slice();
  for (var s1 = 0; s1 < slotKids.length; s1++) {
    if (!wrap && slotKids[s1].type === "FRAME" && slotKids[s1].name === ROWS_FRAME_NAME) wrap = slotKids[s1];
    else slotKids[s1].remove();
  }

  // Keep rows that still belong, drop the rest. Checking each row's main
  // component costs one await per row, so it is only done on explicit
  // updates and after a template swap.
  var verifyRows = force || swapped;
  var byVar = {};
  if (wrap) {
    var kids = wrap.children.slice();
    for (var i = 0; i < kids.length; i++) {
      var vid = kids[i].type === "INSTANCE" ? rowVarId(kids[i], propKey) : null;
      var keep = !!(vid && vars[vid] && !byVar[vid]);
      if (keep && verifyRows) {
        var rm = await kids[i].getMainComponentAsync();
        keep = !!rm && rm.id === tpls.row.id;
      }
      if (keep) byVar[vid] = kids[i];
      else kids[i].remove();
    }
  }
  var missing = 0;
  for (var m = 0; m < varIds.length; m++) if (!byVar[varIds[m]]) missing++;

  if (!wrap || missing > REBUILD_THRESHOLD) {
    // Many new rows: build a whole new wrapper off-canvas, swap it in.
    var fresh = await buildRowsFrame(tpls, vars, varIds);
    if (wrap) wrap.remove();
    slot.appendChild(fresh);
  } else {
    // `children` builds a fresh array on every read — reading it per row is
    // O(n²) on a 1000-row table (measured: 39 s to drop 3 rows). Read it once,
    // and again only after an actual insert.
    var current = wrap.children;
    for (var j = 0; j < varIds.length; j++) {
      var r = byVar[varIds[j]];
      var isNew = !r;
      if (r) delete byVar[varIds[j]];
      else r = tpls.row.createInstance();
      if (current[j] !== r) { wrap.insertChild(j, r); current = wrap.children; } // moving a node is not free
      if (isNew) bindRow(r, vars[varIds[j]], propKey); // kept rows were matched by this very binding
      if (j && j % ROWS_PER_YIELD === 0) await yieldToFigma();
    }
    for (var left in byVar) byVar[left].remove();
  }

  inst.setPluginData(PD_TABLE_SIG, sig);
  return { changed: true, rows: varIds.length };
}

// Tables on the current page only — see the note at the top of this section.
// One job at a time. User actions that touch tables or many variables
// (create / update / restore tables, CSV import, cleanup) wait their turn in a
// queue; the poll never queues — it skips a round while anything is running.
// `inner` is a queued action calling the page sync itself.
var jobQueue = Promise.resolve();
var jobsPending = 0;
function withTableLock(fn) {
  jobsPending++;
  var run = jobQueue.then(fn);
  jobQueue = run.then(function() { jobsPending--; }, function() { jobsPending--; });
  return run;
}

async function syncCurrentPageTables(force, inner) {
  if (!inner) {
    if (jobsPending) return; // something is running or waiting — skip this round
    return withTableLock(function() { return syncCurrentPageTables(force, true); });
  }
  var pageId = figma.currentPage.id;
  var reg = readRegistry();
  var ids = [];
  for (var id in reg) if (reg[id] && reg[id].p === pageId) ids.push(id);
  if (!ids.length) return;
  var ctx = await getContext();
  if (!ctx.collection) return;
  ctx.varMap = langIdMap(ctx);
  var tpls = await getTemplates(false);
  if (tpls.status !== "ok") return;
  await syncTemplateColumns(tpls, ctx);
  var changed = false;
  for (var i = 0; i < ids.length; i++) {
    var inst = await figma.getNodeByIdAsync(ids[i]);
    if (!inst || inst.removed || inst.type !== "INSTANCE" || !isOnCanvas(inst)) {
      delete reg[ids[i]]; changed = true; continue;
    }
    var pg = pageOf(inst);
    if (pg && pg.id !== pageId) { reg[ids[i]].p = pg.id; changed = true; continue; } // moved: synced on its page
    try { await syncTable(inst, ctx, tpls, force); }
    catch (e) { console.error("[i18n] table sync failed", e); }
  }
  if (changed) writeRegistry(reg);
}

// Selection info for the UI: a table, or a top-level layer that can get one.
async function tableInfoFor(node, ctx) {
  var reg = readRegistry();
  var tpls = await getTemplates(false);
  if (tpls.table && node.id === tpls.table.id) return null;
  if (tpls.row && node.id === tpls.row.id) return null;
  if (reg[node.id] && node.type === "INSTANCE") {
    var src = reg[node.id].s ? await figma.getNodeByIdAsync(reg[node.id].s) : null;
    var alive = !!src && isOnCanvas(src);
    return {
      kind: "table", tableId: node.id, sourceId: alive ? src.id : "", sourceName: alive ? src.name : "",
      tplStatus: tpls.status,
    };
  }
  if (!isTopLevel(node)) return null;
  var tableId = tableIdForSource(reg, node.id);
  if (tableId) {
    var t = await figma.getNodeByIdAsync(tableId);
    if (!t || !isOnCanvas(t)) tableId = null;
  }
  return {
    kind: "source", sourceId: node.id, sourceName: node.name, tableId: tableId || "",
    varCount: collectSourceVars(node, langIdMap(ctx)).length, tplStatus: tpls.status,
  };
}

async function handleCreateTable() {
  var sel = figma.currentPage.selection;
  if (sel.length !== 1 || !isTopLevel(sel[0])) { notify(L("tableNotTopLevel")); return; }
  var source = sel[0];
  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return; }
  var vars = langIdMap(ctx);
  if (!collectSourceVars(source, vars).length) { notify(L("tableNoVars")); return; }

  var tpls = await getTemplates(true);
  if (tpls.status === "missing") { notify(L("tplMissing")); await pushState(); return; }
  var createdTpl = false;
  if (tpls.status === "none") { tpls = await buildTemplates(source); createdTpl = true; }
  await syncTemplateColumns(tpls, ctx);

  var reg = readRegistry();
  var existingId = tableIdForSource(reg, source.id);
  var inst = existingId ? await figma.getNodeByIdAsync(existingId) : null;
  var created = false;
  if (!inst || inst.type !== "INSTANCE" || !isOnCanvas(inst)) {
    if (existingId) delete reg[existingId];
    inst = tpls.table.createInstance();
    source.parent.appendChild(inst);
    inst.x = Math.round(source.x + source.width + TABLE_GAP);
    inst.y = Math.round(source.y);
    created = true;
  }
  inst.name = TPL_TABLE_NAME + " / " + source.name;
  reg[inst.id] = { p: figma.currentPage.id, s: source.id };
  writeRegistry(reg);
  if (collectSourceVars(source, vars).length > 200) figma.notify(L("tableBuilding"));
  var res = await syncTable(inst, ctx, tpls, true);

  figma.currentPage.selection = [inst];
  figma.viewport.scrollAndZoomIntoView([source, inst]);
  notify(createdTpl ? L("tplCreated") : created ? L("tableCreated")(res.rows || 0) : L("tableUpdated")(res.rows || 0));
}

async function handleUpdateTable(tableId) {
  var inst = await figma.getNodeByIdAsync(tableId);
  if (!inst || inst.type !== "INSTANCE") { notify(L("tableGone")); return; }
  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return; }
  var tpls = await getTemplates(true);
  if (tpls.status !== "ok") { notify(L("tplMissing")); await pushState(); return; }
  await syncTemplateColumns(tpls, ctx);
  var res = await syncTable(inst, ctx, tpls, true);
  if (res.orphan) { notify(L("tableSourceGone")); return; }
  notify(L("tableUpdated")(res.rows || 0));
}

// Templates were deleted: rebuild them here and relink this page's tables.
// Tables on other pages are relinked when their page is opened.
async function handleRestoreTemplates() {
  var ctx = await getContext();
  if (!ctx.collection) { notify(L("noCollection")); return; }
  var tpls = await getTemplates(true);
  if (tpls.status !== "ok") {
    var keepTable = tpls.table, keepRow = tpls.row;
    if (keepTable && keepRow) { /* both found by name */ }
    else {
      var anchor = figma.currentPage.selection[0] || null;
      if (keepTable || keepRow) {
        // One survived: rebuild the pair so their structures match.
        figma.root.setPluginData(PD_TPL_TABLE, "");
        figma.root.setPluginData(PD_TPL_ROW, "");
      }
      tpls = await buildTemplates(anchor);
    }
  }
  await syncTemplateColumns(tpls, ctx);
  await syncCurrentPageTables(true, true);
  figma.viewport.scrollAndZoomIntoView([tpls.table, tpls.row]);
  notify(L("tplRestored"));
}

function notify(message) {
  figma.notify(message);
  figma.ui.postMessage({ type: "notify", message: message });
}

figma.ui.onmessage = async function(msg) {
  try {
    if (msg.type === "ready")   { await pushState(); }
    else if (msg.type === "set-lang") {
      currentLang = msg.lang === "en" ? "en" : "ko";
      try { await figma.clientStorage.setAsync(LANG_KEY, currentLang); } catch (e) {}
    }
    else if (msg.type === "notify")  { figma.notify(msg.message); }
    else if (msg.type === "export-csv") { await handleExportCsv(); }
    else if (msg.type === "import-csv") { await withTableLock(function() { return handleImportCsv(msg.headers, msg.rows); }); }
    else if (msg.type === "save")    { await handleSave(msg.values, msg.description); }
    else if (msg.type === "save-missing") { await handleSaveMissing(msg.variableId, msg.values, msg.description); }
    else if (msg.type === "swap")       { await handleSwap(msg.variableId); }
    else if (msg.type === "multi-swap") { await handleMultiSwap(msg.variableId); }
    else if (msg.type === "create")  { await handleCreate(msg.values); }
    else if (msg.type === "cleanup")      { await withTableLock(handleCleanup); }
    else if (msg.type === "delete-var")  {
      await withTableLock(function() { return handleDeleteVar(msg.variableId); });
      if (msg.refresh) await pushState();
    }
    else if (msg.type === "relocate-key") { await handleRelocateKey(msg.variableId); }
    else if (msg.type === "assign-to-broken") { await handleAssignToBroken(msg.nodeId, msg.variableId); }
    else if (msg.type === "create-for-broken") { await handleCreateForBroken(msg.values, msg.nodeId); }
    else if (msg.type === "navigate-to-node") { await handleNavigateToNode(msg.nodeId); }
    else if (msg.type === "navigate-to-usage") { await handleNavigateToUsage(msg.variableId); }
    else if (msg.type === "unlink-node")      { await handleUnlinkNode(msg.nodeId); if (msg.refresh) await pushState(); }
    else if (msg.type === "table-create")  { await withTableLock(handleCreateTable); await pushState(); }
    else if (msg.type === "table-update")  { await withTableLock(function() { return handleUpdateTable(msg.tableId); }); await pushState(); }
    else if (msg.type === "table-restore") { await withTableLock(handleRestoreTemplates); await pushState(); }
    else if (msg.type === "refresh")     { await pushState(); }
  } catch (e) {
    notify(L("errorPrefix")(e && e.message ? e.message : String(e)));
  }
};

function safePushState() {
  pushState().catch(function(e) { notify(L("errorPrefix")(e && e.message ? e.message : String(e))); });
}

figma.on("selectionchange", safePushState);
figma.on("currentpagechange", function() {
  safePushState();
  syncCurrentPageTables(false).catch(function(e) { console.error("[i18n] table sync failed", e); });
});

// Variable edits made in Figma's own variables table fire no event, and values
// already follow through the text bindings. Polling only catches structural
// changes (modes, and variables added to / removed from a source layer) — for
// tables on the current page only, and it exits at once when there are none.
// Self-scheduling rather than setInterval, so a slow pass (huge tables, 1000s
// of variables) never overlaps the next one, and the gap grows with the cost:
// at least 2s, or 5x the last pass, capped at 30s.
var POLL_MIN_MS = 2000, POLL_MAX_MS = 30000;
function schedulePoll(delay) {
  setTimeout(async function() {
    var started = Date.now();
    try { await syncCurrentPageTables(false); }
    catch (e) { console.error("[i18n] table sync failed", e); }
    var spent = Date.now() - started;
    schedulePoll(Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, spent * 5)));
  }, delay);
}
schedulePoll(0);
