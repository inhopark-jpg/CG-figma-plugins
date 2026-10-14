// Config Manager — main thread.
//
// Data model (everything lives in Figma's native variables so it is the SSOT):
//   preset        = a local variable collection prefixed "preset-"
//   preset mode   = a mode of that collection
//   preset token  = a variable in that collection (token ID = variable name)
//   config        = a variable collection prefixed "config-"
//   config row    = a STRING variable named after a preset; its value per config mode
//                   is the name of the preset mode that should be active.
//   key component = the component (or set) a preset belongs to; each token is bound to one of its
//                   BOOLEAN / TEXT / VARIANT properties (see "Key components").

const CONFIG_PREFIX = 'config-';
const PRESET_PREFIX = 'preset-';
const PD_PRESET_ID = 'cm-preset-id'; // on config variables: id of the linked preset collection
const PD_TABLE_ID = 'cm-table-id'; // on collections: id of the showcase table component
const PD_TABLE_SIG = 'cm-table-sig'; // on collections: signature of the data the table was rendered from
const PD_TABLE_FOR = 'cm-table-for'; // on table components: id of the collection they showcase
const PD_TABLE_PAGE = 'cm-table-page'; // on collections: id of the page the table component sits on
const PD_ROLE = 'cm-role'; // on table parts: 'title' | 'location' | 'grid'
const PD_MANAGED_CONFIG = 'cm-config'; // on configs made (or filled) by the plugin: '1' — they stay configs under any name
const PD_MANAGED = 'cm-preset'; // on presets made or adopted by the plugin: '1' — they stay presets under any name
const PD_ISSUES = 'cm-issues'; // on presets: JSON { n, missing } from the last time the component was checked
const PD_COMPONENT = 'cm-component'; // on presets: id of the key component (or component set) the preset belongs to
const PD_COMPONENT_NAME = 'cm-component-name'; // on presets: last seen name of that component (shown when it's gone)
const PD_COMPONENT_PAGE = 'cm-component-page'; // on presets: id of the page the component was last seen on
const PD_PROP = 'cm-prop'; // on preset tokens: the component property they're bound to (see propRef)
const PD_VARIANT_BOUND = 'cm-vb'; // on instances: JSON list of variant token ids the plugin bound there

figma.showUI(__html__, { width: 760, height: 680, themeColors: true });

// ---------------------------------------------------------------------------
// i18n — messages shown to the user (toasts, figma.notify, warnings). The UI
// has its own dictionary in ui.html. Text written onto the canvas (table
// labels, component property names, descriptions) is document data and stays
// as is: renaming component properties would break placed instances.
// ---------------------------------------------------------------------------

type Lang = 'ko' | 'en';
let lang: Lang = 'ko';
const MSG = {
  ko: {
    nameEmpty: '이름을 입력하세요.',
    collectionGone: 'Collection을 찾을 수 없습니다. 삭제되었을 수 있습니다.',
    variableGone: '변수를 찾을 수 없습니다. 삭제되었을 수 있습니다.',
    collectionExists: (n: string) => `"${n}" collection이 이미 있습니다.`,
    nameExistsIn: (n: string, c: string) => `"${n}"(이)가 ${c}에 이미 있습니다.`,
    couldNotAddMode: (m: string, e: string) => `"${m}" mode를 추가하지 못했습니다: ${e}`,
    modeNameEmpty: 'Mode 이름을 입력하세요.',
    modeExists: (n: string) => `"${n}" mode가 이미 있습니다.`,
    modeGone: 'Mode를 찾을 수 없습니다.',
    enterNumber: '숫자를 입력하세요.',
    alreadyInConfig: (p: string, c: string) => `${p}은(는) 이미 ${c}에 포함되어 있습니다.`,
    rowsMustBeString: 'Config 행은 STRING 변수여야 합니다.',
    page: (n: string) => `"${n}" 페이지`,
    configGone: 'Config를 찾을 수 없습니다.',
    presetGone: (r: string) => `${r}: preset을 찾을 수 없음`,
    modeGoneIn: (r: string, m: string) => `${r}: "${m}" mode를 찾을 수 없음`,
    applied: (c: string, m: string, n: number, t: string) => `${t}에 ${c} → ${m} 적용 (collection ${n}개).`,
    reset: (c: string, t: string) => `${t}에서 ${c}을(를) 되돌렸습니다.`,
    unapplied: (c: string, t: string) => `${t}에서 ${c} 적용을 해제했습니다.`,
    notApplied: (c: string, t: string) => `${c}은(는) ${t}에 적용되어 있지 않습니다.`,
    tableGone: '표 component를 찾을 수 없습니다. 다시 만들어 주세요.',
    presetCreated: (n: string) => `Preset "${n}"을(를) 만들었습니다.`,
    presetDeleted: 'Preset을 삭제했습니다.',
    tokenCreated: (n: string) => `Token "${n}"을(를) 만들었습니다.`,
    configCreated: (n: string) => `Config "${n}"을(를) 만들었습니다.`,
    configDeleted: 'Config를 삭제했습니다.',
    tableCreated: '이 페이지에 표 component를 만들었습니다.',
    tableUpdated: '표를 업데이트했습니다.',
    tableRemoved: '캔버스에서 표를 제거했습니다.',
    unknownAction: (t: string) => `알 수 없는 동작: ${t}`,
    needOneMode: 'Collection에는 mode가 하나 이상 있어야 합니다.',
    noNestedConfig: 'Config 안에 다른 config를 넣을 수 없습니다.',
    notAComponent: 'Component를 찾을 수 없습니다. Component나 instance를 선택하세요.',
    libraryComponent: '라이브러리 component의 속성은 이 파일에서 바꿀 수 없습니다.',
    componentHasPreset: (n: string) => `이 component에는 이미 ${n}이(가) 연결되어 있습니다.`,
    componentGone: '이 preset의 component를 찾을 수 없습니다.',
    propGone: 'Component 속성을 찾을 수 없습니다. 삭제되었을 수 있습니다.',
    propHasToken: (p: string) => `"${p}" 속성에는 이미 token이 있습니다.`,
    notAnOption: (v: string, p: string) => `"${v}"은(는) "${p}" 속성의 variant 옵션이 아닙니다.`,
    couldNotBind: (n: string, e: string) => `"${n}" token을 연결하지 못했습니다: ${e}`,
    presetLinked: (p: string, c: string, n: number) => `${p}을(를) ${c}에 연결했습니다${n ? ` (token ${n}개 연결)` : ''}.`,
    templatesMissing: '표 템플릿 component가 삭제되었습니다. 템플릿을 다시 만든 뒤 시도하세요.',
    templatesRestored: '표 템플릿을 다시 만들었습니다.',
    nDeleted: (n: number) => `${n}개를 삭제했습니다.`,
    cleanupDone: (found: number, elsewhere: number) =>
      `Preset 정리: ${found ? `정리할 preset ${found}개` : '이 페이지에서 정리할 항목 없음'}${elsewhere ? ` · 다른 페이지 component ${elsewhere}개는 검사하지 않음` : ''}`,
  },
  en: {
    nameEmpty: 'Name cannot be empty.',
    collectionGone: 'Collection not found. It may have been deleted.',
    variableGone: 'Variable not found. It may have been deleted.',
    collectionExists: (n: string) => `A collection named "${n}" already exists.`,
    nameExistsIn: (n: string, c: string) => `"${n}" already exists in ${c}.`,
    couldNotAddMode: (m: string, e: string) => `Could not add mode "${m}": ${e}`,
    modeNameEmpty: 'Mode name cannot be empty.',
    modeExists: (n: string) => `Mode "${n}" already exists.`,
    modeGone: 'Mode not found.',
    enterNumber: 'Please enter a number.',
    alreadyInConfig: (p: string, c: string) => `${p} is already part of ${c}.`,
    rowsMustBeString: 'Config rows must be STRING variables.',
    page: (n: string) => `page "${n}"`,
    configGone: 'Config not found.',
    presetGone: (r: string) => `${r}: preset not found`,
    modeGoneIn: (r: string, m: string) => `${r}: mode "${m}" not found`,
    applied: (c: string, m: string, n: number, t: string) => `Applied ${c} → ${m} (${n} collection${n === 1 ? '' : 's'}) to ${t}.`,
    reset: (c: string, t: string) => `Reset ${c} on ${t}.`,
    unapplied: (c: string, t: string) => `Un-applied ${c} from ${t}.`,
    notApplied: (c: string, t: string) => `${c} wasn't applied to ${t}.`,
    tableGone: 'Table component not found — create it again.',
    presetCreated: (n: string) => `Created preset "${n}".`,
    presetDeleted: 'Preset deleted.',
    tokenCreated: (n: string) => `Created token "${n}".`,
    configCreated: (n: string) => `Created config "${n}".`,
    configDeleted: 'Config deleted.',
    tableCreated: 'Table component created on this page.',
    tableUpdated: 'Table updated.',
    tableRemoved: 'Table removed from the canvas.',
    unknownAction: (t: string) => `Unknown action: ${t}`,
    needOneMode: 'A collection needs at least one mode.',
    noNestedConfig: 'A config cannot contain another config.',
    notAComponent: 'Component not found. Select a component or an instance.',
    libraryComponent: "A library component's properties can't be changed from this file.",
    componentHasPreset: (n: string) => `This component is already linked to ${n}.`,
    componentGone: "This preset's component can't be found.",
    propGone: 'Component property not found. It may have been deleted.',
    propHasToken: (p: string) => `The "${p}" property already has a token.`,
    notAnOption: (v: string, p: string) => `"${v}" is not a variant option of "${p}".`,
    couldNotBind: (n: string, e: string) => `Could not bind token "${n}": ${e}`,
    presetLinked: (p: string, c: string, n: number) => `Linked ${p} to ${c}${n ? ` (${n} token${n === 1 ? '' : 's'} bound)` : ''}.`,
    templatesMissing: 'A table template component was deleted. Restore the templates, then try again.',
    templatesRestored: 'Table templates restored.',
    nDeleted: (n: number) => `Deleted ${n}.`,
    cleanupDone: (found: number, elsewhere: number) =>
      `Preset cleanup: ${found ? `${found} preset${found === 1 ? '' : 's'} to clean up` : 'nothing to clean up on this page'}${elsewhere ? ` · ${elsewhere} component${elsewhere === 1 ? '' : 's'} on other pages not checked` : ''}`,
  },
};
const M = () => MSG[lang];
const LANG_KEY = 'lang';
const langReady = figma.clientStorage
  .getAsync(LANG_KEY)
  .then((l) => { lang = l === 'en' ? 'en' : 'ko'; })
  .catch(() => undefined);
figma.clientStorage
  .getAsync('cm-size')
  .then((size) => size && figma.ui.resize(size.w, size.h))
  .catch(() => undefined);

// ---------------------------------------------------------------------------
// Types shared with the UI
// ---------------------------------------------------------------------------

type ModeInfo = { id: string; name: string };
type RGBAValue = { r: number; g: number; b: number; a: number };
type CellValue =
  | { kind: 'value'; value: boolean | string | number | RGBAValue }
  | { kind: 'alias'; id: string; name: string };
type TokenInfo = {
  id: string;
  name: string;
  type: VariableResolvedDataType;
  values: { [modeId: string]: CellValue };
  /** The component property this token is bound to (presets linked to a component). */
  propRef: string | null;
};
type PropKind = 'BOOLEAN' | 'TEXT' | 'VARIANT';
/** A bindable property of a preset's key component. */
type PropInfo = {
  ref: string;
  name: string;
  kind: PropKind;
  options?: string[];
  defaultValue: string | boolean;
  tokenId: string | null;
  /** ok: the default value is bound to the token. none/other: unbound, or bound to another variable.
   *  instances: variant properties have no default to bind, so the plugin binds instances instead. */
  binding: 'ok' | 'none' | 'other' | 'instances';
  otherName?: string;
};
/** What the variable table knows about a preset's component (plugin data only — no node is read). */
type ComponentRef = { id: string; name: string; pageId: string };
type PresetIssue = {
  kind: 'unbound' | 'other' | 'renamed' | 'orphan' | 'invalid';
  tokenId: string;
  tokenName: string;
  propName?: string;
  otherName?: string;
  value?: string;
};
/** The component itself, read live — only for the preset open in the plugin, and during cleanup. */
type ComponentDetail = {
  presetId: string;
  id: string;
  name: string;
  status: 'ok' | 'missing';
  onCurrentPage: boolean;
  props: PropInfo[];
  issues: PresetIssue[];
};
/** Any non-config collection. Only `isPreset` ones (prefixed "preset-") appear in the Presets tab,
 *  but configs may reference any of them. */
type PresetInfo = {
  id: string;
  name: string;
  displayName: string;
  isPreset: boolean;
  modes: ModeInfo[];
  tokens: TokenInfo[];
  tableId: string | null;
  /** The key component of a preset. null when the preset isn't linked to one (made before, or renamed in Figma). */
  component: ComponentRef | null;
  /** From the last component check (cleanup, or the preset being open) — not re-checked by polling. */
  issueCount: number;
  componentMissing: boolean;
};
type ConfigRow = {
  variableId: string;
  name: string;
  presetId: string | null;
  validType: boolean;
  values: { [configModeId: string]: string };
};
type ConfigInfo = {
  id: string;
  name: string;
  displayName: string;
  modes: ModeInfo[];
  rows: ConfigRow[];
  tableId: string | null;
};
type State = { presets: PresetInfo[]; configs: ConfigInfo[]; templatesMissing: boolean };
/** Per config: which config mode is applied to the current page. */
type AppliedInfo = {
  target: string;
  pageName: string;
  configs: { [configId: string]: { modeId: string | null; partial: boolean; viaPlugin: boolean } };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isConfigName = (name: string) => name.startsWith(CONFIG_PREFIX);
const isPresetName = (name: string) => name.startsWith(PRESET_PREFIX);
/**
 * Presets made (or adopted) by the plugin keep being presets when renamed in the variables table, prefix or not.
 * A collection made in the variables table is picked up only when its name starts with "preset-".
 */
const isManagedPreset = (c: VariableCollection) => c.getPluginData(PD_MANAGED) === '1' || !!c.getPluginData(PD_COMPONENT);
const isPresetCollection = (c: VariableCollection) => !isManagedConfig(c) && (isManagedPreset(c) || isPresetName(c.name));
/** Same rule for configs: made by the plugin → a config under any name; otherwise only with the "config-" prefix. */
const isManagedConfig = (c: VariableCollection) => c.getPluginData(PD_MANAGED_CONFIG) === '1';
const isConfigCollection = (c: VariableCollection) => isManagedConfig(c) || (isConfigName(c.name) && !isManagedPreset(c));

/** Default name for a new mode: "mode 1", "mode 2", … (the first free one). */
function nextModeName(collection: VariableCollection) {
  const taken = new Set(collection.modes.map((m) => m.name));
  let n = collection.modes.length + 1;
  while (taken.has(`mode ${n}`)) n++;
  return `mode ${n}`;
}

/** "language" → "preset-language" (an existing prefix is kept). */
function prefixed(prefix: string, name: string) {
  name = name.trim();
  const full = name.startsWith(prefix) ? name : prefix + name;
  if (full === prefix) throw new Error(M().nameEmpty);
  return full;
}

/** Variable names cannot contain ".", "{" or "}". */
const toVariableName = (name: string) => name.replace(/[.{}]/g, '-').trim();

async function getCollection(id: string): Promise<VariableCollection> {
  const c = await figma.variables.getVariableCollectionByIdAsync(id);
  if (!c) throw new Error(M().collectionGone);
  return c;
}

async function getVariable(id: string): Promise<Variable> {
  const v = await figma.variables.getVariableByIdAsync(id);
  if (!v) throw new Error(M().variableGone);
  return v;
}

async function localCollections() {
  return (await figma.variables.getLocalVariableCollectionsAsync()).filter((c) => !c.remote);
}

async function assertUniqueCollectionName(name: string, exceptId?: string) {
  if (!name.trim()) throw new Error(M().nameEmpty);
  const clash = (await localCollections()).find((c) => c.name === name && c.id !== exceptId);
  if (clash) throw new Error(M().collectionExists(name));
}

function assertUniqueVariableName(collection: VariableCollection, all: Variable[], name: string, exceptId?: string) {
  if (!name) throw new Error(M().nameEmpty);
  const clash = all.find((v) => v.variableCollectionId === collection.id && v.name === name && v.id !== exceptId);
  if (clash) throw new Error(M().nameExistsIn(name, collection.name));
}

function toCellValue(raw: VariableValue | undefined, varNames: Map<string, string>): CellValue {
  if (raw === undefined) return { kind: 'value', value: '' };
  if (typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'VARIABLE_ALIAS') {
    return { kind: 'alias', id: raw.id, name: varNames.get(raw.id) || 'linked variable' };
  }
  if (typeof raw === 'object' && raw !== null && 'r' in raw) {
    const c = raw as RGB | RGBA;
    return { kind: 'value', value: { r: c.r, g: c.g, b: c.b, a: 'a' in c ? c.a : 1 } };
  }
  return { kind: 'value', value: raw as boolean | string | number };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** The stored table id, or null when that component was deleted from the canvas. */
/**
 * Tables are checked page by page: one on another page is assumed present (and is not loaded,
 * which would pull its page in on every poll). It is verified — and redrawn if stale — once its
 * page is opened.
 */
function tableOnOtherPage(c: VariableCollection): boolean {
  const pageId = c.getPluginData(PD_TABLE_PAGE);
  return !!pageId && pageId !== figma.currentPage.id;
}

async function existingTableId(c: VariableCollection): Promise<string | null> {
  const id = c.getPluginData(PD_TABLE_ID);
  if (!id) return null;
  if (tableOnOtherPage(c)) return id;
  return (await findTable(c))?.id ?? null;
}

/**
 * A deleted main component that still has instances stays reachable by id (so the instances keep
 * working) but is detached from every page. Only a node that sits on a page counts as present.
 */
function isOnCanvas(node: BaseNode): boolean {
  if ('removed' in node && node.removed) return false;
  let p: BaseNode | null = node.parent;
  while (p && p.type !== 'PAGE') p = p.parent;
  return !!p && p.parent?.type === 'DOCUMENT';
}

async function computeState(): Promise<State> {
  const collections = await localCollections();
  const variables = await figma.variables.getLocalVariablesAsync();
  const varNames = new Map(variables.map((v) => [v.id, v.name]));
  const byCollection = new Map<string, Variable[]>();
  for (const v of variables) {
    const list = byCollection.get(v.variableCollectionId) || [];
    list.push(v);
    byCollection.set(v.variableCollectionId, list);
  }
  const ordered = (c: VariableCollection) => {
    const vars = byCollection.get(c.id) || [];
    const index = new Map(c.variableIds.map((id, i) => [id, i]));
    return vars.sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  };

  const presets: PresetInfo[] = [];
  const configs: ConfigInfo[] = [];
  variantTargets = [];
  const presetIds = new Set(collections.filter((c) => !isConfigCollection(c)).map((c) => c.id));

  for (const c of collections) {
    const modes = c.modes.map((m) => ({ id: m.modeId, name: m.name }));
    const tableId = await existingTableId(c);
    if (isConfigCollection(c)) {
      // Configs from before the marker existed: rows the plugin added (linked by id) show it made this one.
      if (!isManagedConfig(c) && ordered(c).some((v) => v.getPluginData(PD_PRESET_ID))) c.setPluginData(PD_MANAGED_CONFIG, '1');
      configs.push({
        id: c.id,
        name: c.name,
        displayName: isConfigName(c.name) ? c.name.slice(CONFIG_PREFIX.length) : c.name,
        modes,
        tableId,
        rows: ordered(c).map((v) => {
          const linked = v.getPluginData(PD_PRESET_ID);
          const values: { [id: string]: string } = {};
          for (const m of c.modes) {
            const raw = v.valuesByMode[m.modeId];
            values[m.modeId] = typeof raw === 'string' ? raw : '';
          }
          return {
            variableId: v.id,
            name: v.name,
            presetId: linked && presetIds.has(linked) ? linked : null,
            validType: v.resolvedType === 'STRING',
            values,
          };
        }),
      });
    } else {
      const vars = ordered(c);
      const isPreset = isPresetCollection(c);
      const componentId = isPreset ? c.getPluginData(PD_COMPONENT) : '';
      const component = componentId
        ? { id: componentId, name: c.getPluginData(PD_COMPONENT_NAME), pageId: c.getPluginData(PD_COMPONENT_PAGE) }
        : null;
      if (component) {
        for (const v of vars) {
          const ref = v.getPluginData(PD_PROP);
          if (ref.startsWith('variant:')) variantTargets.push({ setId: component.id, name: ref.slice('variant:'.length), variableId: v.id });
        }
      }
      presets.push({
        id: c.id,
        name: c.name,
        displayName: isPresetName(c.name) ? c.name.slice(PRESET_PREFIX.length) : c.name,
        ...issueSummary(c),
        isPreset,
        modes,
        tableId,
        component,
        tokens: vars.map((v) => {
          const values: { [id: string]: CellValue } = {};
          for (const m of c.modes) values[m.modeId] = toCellValue(v.valuesByMode[m.modeId], varNames);
          return { id: v.id, name: v.name, type: v.resolvedType, values, propRef: v.getPluginData(PD_PROP) || null };
        }),
      });
    }
  }

  // Resolve config rows that are not linked by id (e.g. typed in Figma's variable table) by name.
  for (const cfg of configs) {
    for (const row of cfg.rows) {
      if (row.presetId) continue;
      const match = presets.find((p) => toVariableName(p.name) === row.name);
      if (match) row.presetId = match.id;
    }
  }
  return { presets, configs, templatesMissing };
}

let lastStateJson = '';

async function pushState(force = false) {
  const state = await computeState();
  const json = JSON.stringify(state);
  if (force || json !== lastStateJson) {
    lastStateJson = json;
    figma.ui.postMessage({ type: 'state', state });
    await syncTables(state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

async function renamePreset(id: string, name: string) {
  const collection = await getCollection(id);
  // Only presets the plugin doesn't manage need the prefix to stay visible.
  name = isManagedPreset(collection) ? name.trim() : prefixed(PRESET_PREFIX, name);
  if (collection.name === name) return;
  await assertUniqueCollectionName(name, id);
  const oldVarName = toVariableName(collection.name);
  collection.name = name;
  // Keep config rows pointing at this preset in sync.
  for (const row of await configRowsForPreset(id, oldVarName)) row.name = toVariableName(name);
}

/** Config variables that reference a preset (by stored id, or by name for rows created in Figma's table). */
async function configRowsForPreset(presetId: string, presetVarName: string): Promise<Variable[]> {
  const configIds = new Set((await localCollections()).filter(isConfigCollection).map((c) => c.id));
  const vars = await figma.variables.getLocalVariablesAsync();
  return vars.filter((v) => {
    if (!configIds.has(v.variableCollectionId)) return false;
    const linked = v.getPluginData(PD_PRESET_ID);
    return linked ? linked === presetId : v.name === presetVarName;
  });
}

async function deletePreset(id: string) {
  const collection = await getCollection(id);
  await unbindPresetTokens(collection);
  for (const row of await configRowsForPreset(id, toVariableName(collection.name))) row.remove();
  collection.remove();
}

async function addMode(collectionId: string, name?: string) {
  const collection = await getCollection(collectionId);
  if (name === undefined) name = nextModeName(collection); // presets: "mode 2", "mode 3"… renamed in place
  if (!name.trim()) throw new Error(M().modeNameEmpty);
  if (collection.modes.some((m) => m.name === name.trim())) throw new Error(M().modeExists(name));
  const modeId = collection.addMode(name.trim());
  // New config modes start out as a copy of the first mode, which is more useful than empty strings.
  if (isConfigCollection(collection)) {
    const first = collection.modes[0].modeId;
    for (const vid of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(vid);
      if (v) v.setValueForMode(modeId, v.valuesByMode[first]);
    }
  }
}

async function renameMode(collectionId: string, modeId: string, name: string) {
  name = name.trim();
  const collection = await getCollection(collectionId);
  const mode = collection.modes.find((m) => m.modeId === modeId);
  if (!mode) throw new Error(M().modeGone);
  if (mode.name === name) return;
  if (!name) throw new Error(M().modeNameEmpty);
  if (collection.modes.some((m) => m.name === name)) throw new Error(M().modeExists(name));
  const oldName = mode.name;
  collection.renameMode(modeId, name);
  if (!isConfigCollection(collection)) {
    // Configs reference preset modes by name, so follow the rename.
    for (const row of await configRowsForPreset(collection.id, toVariableName(collection.name))) {
      for (const [mid, value] of Object.entries(row.valuesByMode)) {
        if (value === oldName) row.setValueForMode(mid, name);
      }
    }
  }
}

async function removeMode(collectionId: string, modeId: string) {
  const collection = await getCollection(collectionId);
  if (collection.modes.length <= 1) throw new Error(M().needOneMode);
  collection.removeMode(modeId);
}


// ---------------------------------------------------------------------------
// Key components — every preset the plugin makes belongs to one component (or component set), the way
// an i18n token belongs to its key layer. Its tokens map 1:1 to the component's BOOLEAN / TEXT / VARIANT
// properties and are always bound to them:
//   BOOLEAN / TEXT → the property's default value (instances follow unless they override it)
//   VARIANT        → instances on the current page (a variant property has no bindable default)
// The plugin never re-binds what the user unbound by hand; it reports it so they can choose.
// ---------------------------------------------------------------------------

type KeyComponent = ComponentNode | ComponentSetNode;
type VariantTarget = { setId: string; name: string; variableId: string };
/** Variant tokens of all linked presets, refreshed by computeState. */
let variantTargets: VariantTarget[] = [];

const isPropKind = (k: string): k is PropKind => k === 'BOOLEAN' || k === 'TEXT' || k === 'VARIANT';
const propName = (key: string) => key.replace(/#[^#]*$/, '');
/** TEXT/BOOLEAN keys end in "#id", which survives renames. Variant properties are keyed by their name. */
const propRef = (key: string, kind: string) => (kind === 'VARIANT' ? `variant:${key}` : key.slice(key.lastIndexOf('#')));
const tokenTypeFor = (kind: PropKind): VariableResolvedDataType => (kind === 'BOOLEAN' ? 'BOOLEAN' : 'STRING');

function propKeyOf(comp: KeyComponent, ref: string): string | null {
  for (const [key, def] of Object.entries(comp.componentPropertyDefinitions)) {
    if (isPropKind(def.type) && propRef(key, def.type) === ref) return key;
  }
  return null;
}

/** The node that owns the properties: a variant resolves to its component set. */
function keyComponentOf(node: BaseNode | null): KeyComponent | null {
  if (!node) return null;
  if (node.type === 'COMPONENT_SET') return node;
  if (node.type === 'COMPONENT') return node.parent && node.parent.type === 'COMPONENT_SET' ? node.parent : node;
  return null;
}

async function presetComponent(c: VariableCollection): Promise<KeyComponent | null> {
  const id = c.getPluginData(PD_COMPONENT);
  if (!id) return null;
  const node = keyComponentOf(await figma.getNodeByIdAsync(id));
  return node && isOnCanvas(node) ? node : null;
}

/**
 * Read a preset's component live: its bindable properties, how each is bound, and what needs cleaning up.
 * This touches the node (and may load its page), so polling only does it for the preset open in the plugin;
 * the cleanup does it for components on the current page.
 */
async function componentDetail(c: VariableCollection, vars: Variable[], varNames: Map<string, string>): Promise<ComponentDetail | null> {
  const id = c.getPluginData(PD_COMPONENT);
  if (!id) return null;
  const comp = await presetComponent(c);
  if (!comp) {
    saveIssueSummary(c, 0, true);
    return { presetId: c.id, id, name: c.getPluginData(PD_COMPONENT_NAME), status: 'missing', onCurrentPage: c.getPluginData(PD_COMPONENT_PAGE) === figma.currentPage.id, props: [], issues: [] };
  }
  const page = pageOf(comp);
  if (page && c.getPluginData(PD_COMPONENT_PAGE) !== page.id) c.setPluginData(PD_COMPONENT_PAGE, page.id);
  if (c.getPluginData(PD_COMPONENT_NAME) !== comp.name) c.setPluginData(PD_COMPONENT_NAME, comp.name);

  const byRef = new Map<string, Variable>();
  for (const v of vars) {
    const ref = v.getPluginData(PD_PROP);
    if (ref && !byRef.has(ref)) byRef.set(ref, v);
  }
  const props: PropInfo[] = [];
  for (const [key, def] of Object.entries(comp.componentPropertyDefinitions)) {
    if (!isPropKind(def.type)) continue; // instance swap / slot properties can't hold a variable
    const ref = propRef(key, def.type);
    const token = byRef.get(ref) || null;
    let binding: PropInfo['binding'] = 'instances';
    let otherName: string | undefined;
    if (def.type !== 'VARIANT') {
      const bound = def.boundVariables?.defaultValue?.id;
      binding = bound && token && bound === token.id ? 'ok' : bound ? 'other' : 'none';
      if (binding === 'other' && bound) otherName = varNames.get(bound) || '?';
    }
    props.push({ ref, name: propName(key), kind: def.type, options: def.variantOptions, defaultValue: def.defaultValue, tokenId: token ? token.id : null, binding, otherName });
  }

  // Cleanup findings. Nothing here is fixed automatically: the user decides.
  const issues: PresetIssue[] = [];
  const collection = c;
  for (const v of vars) {
    const pr = props.find((x) => x.tokenId === v.id);
    const base = { tokenId: v.id, tokenName: v.name };
    if (!pr) {
      issues.push({ kind: 'orphan', ...base });
      continue;
    }
    if (pr.binding === 'none') issues.push({ kind: 'unbound', ...base });
    if (pr.binding === 'other') issues.push({ kind: 'other', ...base, otherName: pr.otherName });
    if (toVariableName(pr.name) !== v.name) issues.push({ kind: 'renamed', ...base, propName: pr.name });
    if (pr.kind === 'VARIANT') {
      for (const m of collection.modes) {
        const raw = v.valuesByMode[m.modeId];
        if (typeof raw === 'string' && !(pr.options || []).includes(raw)) issues.push({ kind: 'invalid', ...base, value: raw });
      }
    }
  }
  saveIssueSummary(c, issues.length, false);
  return { presetId: c.id, id: comp.id, name: comp.name, status: 'ok', onCurrentPage: page === figma.currentPage, props, issues };
}

/** Remember the result of a component check, so lists (and configs using the preset) can flag it without re-reading nodes. */
function saveIssueSummary(c: VariableCollection, n: number, missing: boolean) {
  const json = n || missing ? JSON.stringify({ n, missing }) : '';
  if (c.getPluginData(PD_ISSUES) !== json) c.setPluginData(PD_ISSUES, json);
}

function issueSummary(c: VariableCollection): { issueCount: number; componentMissing: boolean } {
  try {
    const s = JSON.parse(c.getPluginData(PD_ISSUES) || '{}');
    return { issueCount: s.n || 0, componentMissing: !!s.missing };
  } catch (_) {
    return { issueCount: 0, componentMissing: false };
  }
}

function pageOf(node: BaseNode): PageNode | null {
  let p: BaseNode | null = node;
  while (p && p.type !== 'PAGE') p = p.parent;
  return p && p.type === 'PAGE' ? p : null;
}

const varsOf = async (c: VariableCollection) => {
  const index = new Map(c.variableIds.map((id, i) => [id, i]));
  return (await figma.variables.getLocalVariablesAsync())
    .filter((v) => v.variableCollectionId === c.id)
    .sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
};
const localVarNames = async () => new Map((await figma.variables.getLocalVariablesAsync()).map((v) => [v.id, v.name]));

/** The preset open in the plugin; its component is re-read on every state push (one node, not all of them). */
let watchedPresetId: string | null = null;
let lastDetailJson = '';
async function pushComponentDetail(force = false) {
  let detail: ComponentDetail | null = null;
  if (watchedPresetId) {
    const c = await figma.variables.getVariableCollectionByIdAsync(watchedPresetId);
    if (c) detail = await componentDetail(c, await varsOf(c), await localVarNames());
  }
  const json = JSON.stringify(detail);
  if (!force && json === lastDetailJson) return;
  lastDetailJson = json;
  figma.ui.postMessage({ type: 'componentDetail', presetId: watchedPresetId, detail });
}

async function assertComponentFree(componentId: string, exceptId?: string) {
  const owner = (await localCollections()).find((c) => c.id !== exceptId && c.getPluginData(PD_COMPONENT) === componentId);
  if (owner) throw new Error(M().componentHasPreset(owner.name));
}

async function keyComponentById(id: string): Promise<KeyComponent> {
  const comp = keyComponentOf(await figma.getNodeByIdAsync(id));
  if (!comp || !isOnCanvas(comp)) throw new Error(M().notAComponent);
  if (comp.remote) throw new Error(M().libraryComponent);
  return comp;
}

function linkComponent(collection: VariableCollection, comp: KeyComponent) {
  collection.setPluginData(PD_MANAGED, '1');
  collection.setPluginData(PD_COMPONENT, comp.id);
  collection.setPluginData(PD_COMPONENT_NAME, comp.name);
  collection.setPluginData(PD_ISSUES, '');
  const page = pageOf(comp);
  if (page) collection.setPluginData(PD_COMPONENT_PAGE, page.id);
}

/** A new preset for a component: "preset-<component name>", no tokens yet — they're added per property. */
async function createPresetForComponent(componentId: string) {
  const comp = await keyComponentById(componentId);
  await assertComponentFree(comp.id);
  const name = prefixed(PRESET_PREFIX, comp.name);
  await assertUniqueCollectionName(name);
  const collection = figma.variables.createVariableCollection(name);
  collection.renameMode(collection.modes[0].modeId, 'mode 1');
  linkComponent(collection, comp);
  return collection;
}

/**
 * Link an existing preset (one made before this rule, or whose component was deleted) to a component.
 * Tokens whose name and type match a property are adopted and bound; the rest are reported as having
 * no property until they're deleted.
 */
async function linkPreset(presetId: string, componentId: string) {
  const collection = await getCollection(presetId);
  const comp = await keyComponentById(componentId);
  await assertComponentFree(comp.id, presetId);
  const previous = await presetComponent(collection);
  const vars = (await figma.variables.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
  for (const v of vars) {
    if (previous && previous.id !== comp.id) await unbindToken(v, previous);
    if (!previous || previous.id !== comp.id) v.setPluginData(PD_PROP, '');
  }
  linkComponent(collection, comp);
  const warnings: string[] = [];
  let adopted = 0;
  for (const [key, def] of Object.entries(comp.componentPropertyDefinitions)) {
    if (!isPropKind(def.type)) continue;
    const ref = propRef(key, def.type);
    if (vars.some((v) => v.getPluginData(PD_PROP) === ref)) continue;
    const v = vars.find((x) => !x.getPluginData(PD_PROP) && x.name === toVariableName(propName(key)) && x.resolvedType === tokenTypeFor(def.type as PropKind));
    if (!v) continue;
    v.setPluginData(PD_PROP, ref);
    try {
      await bindToken(v, comp, key, true);
      adopted++;
    } catch (e) {
      warnings.push(M().couldNotBind(v.name, errorMessage(e)));
    }
  }
  return { message: M().presetLinked(collection.name, comp.name, adopted), warnings };
}

/** Fonts of the text layers a TEXT property drives must be loaded before its default can change. */
async function loadPropFonts(comp: KeyComponent, key: string) {
  const texts = comp.findAll((n) => n.type === 'TEXT' && n.componentPropertyReferences?.characters === key) as TextNode[];
  const fonts = new Map<string, FontName>();
  for (const tx of texts) {
    const names = tx.characters.length ? tx.getRangeAllFontNames(0, tx.characters.length) : tx.fontName === figma.mixed ? [] : [tx.fontName];
    for (const f of names) fonts.set(`${f.family}|${f.style}`, f);
  }
  await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
}

/** Bind a token to its property. `force` also re-binds variant instances the user unbound by hand. */
async function bindToken(v: Variable, comp: KeyComponent, key: string, force = false) {
  const def = comp.componentPropertyDefinitions[key];
  if (def.type === 'VARIANT') {
    await bindVariantInstances([{ setId: comp.id, name: key, variableId: v.id }], undefined, force);
    return;
  }
  if (def.type === 'TEXT') await loadPropFonts(comp, key);
  comp.editComponentProperty(key, { defaultValue: figma.variables.createVariableAlias(v) });
}

/** Undo bindToken, leaving the property at the token's value in the default mode. */
async function unbindToken(v: Variable, comp: KeyComponent | null) {
  const ref = v.getPluginData(PD_PROP);
  const key = comp && ref ? propKeyOf(comp, ref) : null;
  if (!comp || !key) return;
  const def = comp.componentPropertyDefinitions[key];
  if (def.type === 'VARIANT') {
    await unbindVariantInstances(comp.id, key, v.id);
    return;
  }
  if (def.boundVariables?.defaultValue?.id !== v.id) return;
  const collection = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
  const raw = collection ? v.valuesByMode[collection.defaultModeId] : undefined;
  const literal = typeof raw === 'string' || typeof raw === 'boolean' ? raw : def.defaultValue;
  if (def.type === 'TEXT') await loadPropFonts(comp, key);
  comp.editComponentProperty(key, { defaultValue: literal });
}

async function unbindPresetTokens(collection: VariableCollection) {
  const comp = await presetComponent(collection);
  if (!comp) return;
  for (const v of await figma.variables.getLocalVariablesAsync()) {
    if (v.variableCollectionId === collection.id) await unbindToken(v, comp);
  }
}

function insideInstance(n: BaseNode) {
  for (let p = n.parent; p && p.type !== 'PAGE'; p = p.parent) if (p.type === 'INSTANCE') return true;
  return false;
}

async function setOf(inst: InstanceNode): Promise<string | null> {
  const main = await inst.getMainComponentAsync();
  return main && main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.id : null;
}

const readMarks = (inst: InstanceNode): string[] => {
  try {
    return JSON.parse(inst.getPluginData(PD_VARIANT_BOUND) || '[]');
  } catch (_) {
    return [];
  }
};

/**
 * Bind variant tokens on instances — `instances` (e.g. the selection), or every instance on the current
 * page. Instances nested in other instances follow their main component and are skipped. An instance the
 * plugin bound before and the user since unbound (or bound to something else) is left alone unless `force`.
 */
async function bindVariantInstances(targets: VariantTarget[], instances?: readonly SceneNode[], force = false) {
  if (!targets.length) return 0;
  const bySet = new Map<string, VariantTarget[]>();
  for (const tg of targets) bySet.set(tg.setId, [...(bySet.get(tg.setId) || []), tg]);
  const list = (instances || figma.currentPage.findAllWithCriteria({ types: ['INSTANCE'] })).filter(
    (n): n is InstanceNode => n.type === 'INSTANCE' && !insideInstance(n),
  );
  const variables = new Map<string, Variable | null>();
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    if (i % 200 === 199) await breathe();
    const setId = await setOf(inst);
    const forSet = setId ? bySet.get(setId) : undefined;
    if (!forSet) continue;
    const marks = readMarks(inst);
    const props = inst.componentProperties;
    const patch: { [name: string]: VariableAlias } = {};
    for (const tg of forSet) {
      const cp = props[tg.name];
      if (!cp || cp.type !== 'VARIANT') continue;
      const bound = cp.boundVariables?.value?.id;
      if (bound === tg.variableId) continue;
      if (!force && (bound || marks.includes(tg.variableId))) continue;
      if (!variables.has(tg.variableId)) variables.set(tg.variableId, await figma.variables.getVariableByIdAsync(tg.variableId));
      const v = variables.get(tg.variableId);
      if (!v) continue;
      patch[tg.name] = figma.variables.createVariableAlias(v);
      if (!marks.includes(tg.variableId)) marks.push(tg.variableId);
    }
    if (!Object.keys(patch).length) continue;
    try {
      inst.setProperties(patch);
      inst.setPluginData(PD_VARIANT_BOUND, JSON.stringify(marks));
      count++;
    } catch (e) {
      console.warn('Could not bind variant property', e);
    }
  }
  return count;
}

/** Let Figma breathe during long page scans (thousands of instances), so the editor doesn't freeze. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

async function unbindVariantInstances(setId: string, name: string, variableId: string) {
  const list = figma.currentPage.findAllWithCriteria({ types: ['INSTANCE'] });
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    if (i % 200 === 199) await breathe();
    if (insideInstance(inst) || (await setOf(inst)) !== setId) continue;
    const cp = inst.componentProperties[name];
    try {
      if (cp && cp.boundVariables?.value?.id === variableId) inst.setProperties({ [name]: cp.value as string });
      const marks = readMarks(inst);
      if (marks.includes(variableId)) inst.setPluginData(PD_VARIANT_BOUND, JSON.stringify(marks.filter((id) => id !== variableId)));
    } catch (e) {
      console.warn('Could not unbind variant property', e);
    }
  }
}

/** First value for a property token: `value` in the chosen mode, the component's default elsewhere. */
async function addPropToken(presetId: string, ref: string, modeId: string, value: string | boolean) {
  const collection = await getCollection(presetId);
  const comp = await presetComponent(collection);
  if (!comp) throw new Error(M().componentGone);
  const key = propKeyOf(comp, ref);
  if (!key) throw new Error(M().propGone);
  const def = comp.componentPropertyDefinitions[key];
  const kind = def.type as PropKind;
  const mine = (await figma.variables.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
  if (mine.some((v) => v.getPluginData(PD_PROP) === ref)) throw new Error(M().propHasToken(propName(key)));
  value = kind === 'BOOLEAN' ? value === true : String(value);
  if (kind === 'VARIANT' && !(def.variantOptions || []).includes(value as string)) throw new Error(M().notAnOption(String(value), propName(key)));
  const base = toVariableName(propName(key)) || 'token';
  let name = base;
  for (let i = 2; mine.some((v) => v.name === name); i++) name = `${base}-${i}`;
  const variable = figma.variables.createVariable(name, collection, tokenTypeFor(kind));
  try {
    for (const m of collection.modes) variable.setValueForMode(m.modeId, m.modeId === modeId ? value : def.defaultValue);
    variable.setPluginData(PD_PROP, ref);
    await bindToken(variable, comp, key);
  } catch (e) {
    variable.remove(); // a token must always be bound to its property
    throw e;
  }
  return variable;
}

/** Variant tokens may only hold one of the property's options. */
async function assertVariantOption(variable: Variable, value: VariableValue) {
  const ref = variable.getPluginData(PD_PROP);
  if (!ref.startsWith('variant:')) return;
  const comp = await presetComponent(await getCollection(variable.variableCollectionId));
  const key = comp && propKeyOf(comp, ref);
  if (!comp || !key) return;
  const options = comp.componentPropertyDefinitions[key].variantOptions || [];
  if (!options.includes(value as string)) throw new Error(M().notAnOption(String(value), propName(key)));
}

/** Re-bind a token whose property was unbound or bound to something else (by hand, in Figma). */
async function rebindToken(variableId: string) {
  const v = await getVariable(variableId);
  const comp = await presetComponent(await getCollection(v.variableCollectionId));
  if (!comp) throw new Error(M().componentGone);
  const key = propKeyOf(comp, v.getPluginData(PD_PROP));
  if (!key) throw new Error(M().propGone);
  await bindToken(v, comp, key, true);
}

/** Give a token its property's (new) name. */
async function renameTokenToProp(variableId: string) {
  const v = await getVariable(variableId);
  const comp = await presetComponent(await getCollection(v.variableCollectionId));
  const key = comp && propKeyOf(comp, v.getPluginData(PD_PROP));
  if (!key) throw new Error(M().propGone);
  await renameToken(variableId, propName(key));
}

async function deleteToken(variableId: string) {
  const v = await getVariable(variableId);
  await unbindToken(v, await presetComponent(await getCollection(v.variableCollectionId)));
  v.remove();
}

async function locateComponent(presetId: string) {
  const comp = await presetComponent(await getCollection(presetId));
  if (!comp) throw new Error(M().componentGone);
  const page = pageOf(comp);
  if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  figma.currentPage.selection = [comp];
  figma.viewport.scrollAndZoomIntoView([comp]);
}

type SelectedComponent =
  | { id: string; name: string; presetName: string; presetId: string | null; fromInstance: boolean }
  | { library: true; name: string };

/** The component (via an instance, if that's what is selected) the preset panel offers to work with. */
async function selectedComponent(): Promise<SelectedComponent | null> {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return null;
  let node: BaseNode = sel[0];
  const fromInstance = node.type === 'INSTANCE';
  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync();
    if (!main) return null;
    node = main;
  }
  const comp = keyComponentOf(node);
  if (!comp) return null;
  if (comp.remote) return { library: true, name: comp.name };
  const owner = (await localCollections()).find((c) => c.getPluginData(PD_COMPONENT) === comp.id);
  return { id: comp.id, name: comp.name, presetName: PRESET_PREFIX + comp.name.trim(), presetId: owner ? owner.id : null, fromInstance };
}

let lastSelectionJson = '';
async function pushSelection(force = false) {
  const component = await selectedComponent();
  const json = JSON.stringify(component);
  if (!force && json === lastSelectionJson) return;
  lastSelectionJson = json;
  figma.ui.postMessage({ type: 'selection', component });
}


// ---------------------------------------------------------------------------
// Preset cleanup — like i18n's token cleanup. Run on demand, and bounded like the table sync:
//   • the variable table, for every preset (plugin data only, no nodes): presets without a component
//   • the current page: components recorded on this page are read and checked; a component recorded
//     on another page is listed, not inspected (open that page and run the cleanup there)
//   • variant tokens are bound on this page's instances
// ---------------------------------------------------------------------------

type CleanupEntry = { presetId: string; presetName: string; componentName: string; pageName?: string; issues?: PresetIssue[] };
type CleanupReport = {
  pageName: string;
  unlinked: CleanupEntry[];
  missing: CleanupEntry[];
  issues: CleanupEntry[];
  elsewhere: CleanupEntry[];
  checked: number;
  bound: number;
};

async function cleanupPresets(): Promise<CleanupReport> {
  const page = figma.currentPage;
  const pageNames = new Map(figma.root.children.map((p) => [p.id, p.name]));
  const all = await figma.variables.getLocalVariablesAsync();
  const varNames = new Map(all.map((v) => [v.id, v.name]));
  const report: CleanupReport = { pageName: page.name, unlinked: [], missing: [], issues: [], elsewhere: [], checked: 0, bound: 0 };
  const collections = (await localCollections()).filter(isPresetCollection);
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    if (i % 20 === 19) await breathe();
    const entry: CleanupEntry = { presetId: c.id, presetName: c.name, componentName: c.getPluginData(PD_COMPONENT_NAME) };
    if (!c.getPluginData(PD_COMPONENT)) {
      report.unlinked.push(entry);
      continue;
    }
    const recorded = c.getPluginData(PD_COMPONENT_PAGE);
    if (recorded && recorded !== page.id && pageNames.has(recorded)) {
      report.elsewhere.push({ ...entry, pageName: pageNames.get(recorded) });
      continue;
    }
    // Recorded on this page (or not yet known): read it. A component moved to another page is re-homed there.
    const index = new Map(c.variableIds.map((id, n) => [id, n]));
    const vars = all.filter((v) => v.variableCollectionId === c.id).sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
    const detail = await componentDetail(c, vars, varNames);
    if (!detail) continue;
    if (detail.status === 'missing') {
      report.missing.push(entry);
    } else if (!detail.onCurrentPage) {
      report.elsewhere.push({ ...entry, componentName: detail.name, pageName: pageNames.get(c.getPluginData(PD_COMPONENT_PAGE)) });
    } else {
      report.checked++;
      if (detail.issues.length) report.issues.push({ ...entry, componentName: detail.name, issues: detail.issues });
    }
  }
  report.bound = await bindVariantInstances(variantTargets);
  return report;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

async function renameToken(variableId: string, name: string) {
  const variable = await getVariable(variableId);
  name = toVariableName(name);
  if (variable.name === name) return;
  const collection = await getCollection(variable.variableCollectionId);
  assertUniqueVariableName(collection, await figma.variables.getLocalVariablesAsync(), name, variableId);
  variable.name = name;
}

async function setTokenValue(variableId: string, modeId: string, value: VariableValue) {
  const variable = await getVariable(variableId);
  await assertVariantOption(variable, value);
  if (variable.resolvedType === 'FLOAT' && typeof value !== 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(M().enterNumber);
    value = n;
  }
  variable.setValueForMode(modeId, value);
}

// ---------------------------------------------------------------------------
// Configs
// ---------------------------------------------------------------------------

function configCollectionName(name: string) {
  return prefixed(CONFIG_PREFIX, name);
}

async function createConfig(name: string, modeNames: string[]) {
  const full = configCollectionName(name);
  await assertUniqueCollectionName(full);
  const collection = figma.variables.createVariableCollection(full);
  collection.setPluginData(PD_MANAGED_CONFIG, '1');
  const modes = modeNames.map((m) => m.trim()).filter(Boolean);
  if (!modes.length) modes.push('Default');
  collection.renameMode(collection.modes[0].modeId, modes[0]);
  const warnings: string[] = [];
  for (const m of modes.slice(1)) {
    try {
      collection.addMode(m);
    } catch (e) {
      warnings.push(M().couldNotAddMode(m, errorMessage(e)));
    }
  }
  return { collection, warnings };
}

async function renameConfig(id: string, name: string) {
  const collection = await getCollection(id);
  // Configs the plugin manages keep whatever name is typed; others need the prefix to stay visible.
  const full = isManagedConfig(collection) ? name.trim() : configCollectionName(name);
  if (!full) throw new Error(M().nameEmpty);
  if (full === collection.name) return;
  await assertUniqueCollectionName(full, id);
  collection.name = full;
}

async function addPresetToConfig(configId: string, presetId: string) {
  const config = await getCollection(configId);
  const preset = await getCollection(presetId);
  if (isConfigCollection(preset)) throw new Error(M().noNestedConfig);
  const name = toVariableName(preset.name);
  const vars = await figma.variables.getLocalVariablesAsync();
  const existing = vars.find(
    (v) =>
      v.variableCollectionId === config.id &&
      (v.getPluginData(PD_PRESET_ID) === presetId || v.name === name),
  );
  if (existing) throw new Error(M().alreadyInConfig(preset.name, config.name));
  const variable = figma.variables.createVariable(name, config, 'STRING');
  variable.setPluginData(PD_PRESET_ID, presetId);
  config.setPluginData(PD_MANAGED_CONFIG, '1');
  variable.description = `Preset mode for "${preset.name}" (managed by Config Manager)`;
  try {
    variable.scopes = []; // keep config values out of property pickers
  } catch (_) {
    /* older files may not allow empty scopes */
  }
  const firstMode = preset.modes[0].name;
  for (const m of config.modes) variable.setValueForMode(m.modeId, firstMode);
}

async function setConfigValue(variableId: string, modeId: string, presetModeName: string) {
  const variable = await getVariable(variableId);
  if (variable.resolvedType !== 'STRING') throw new Error(M().rowsMustBeString);
  variable.setValueForMode(modeId, presetModeName);
}

/** Configs are applied to the current page as a whole. */
function applyTargets(): PageNode[] {
  return [figma.currentPage];
}

function targetLabel() {
  return M().page(figma.currentPage.name);
}

/**
 * What the page looked like before the plugin first applied a config, so Reset can put it back.
 * Keyed by page + config; kept in memory for the session (cleared on reset or when the plugin closes).
 */
type ModeSnapshot = { before: { [collectionId: string]: string | null }; appliedModeId: string };
const snapshots = new Map<string, ModeSnapshot>();
const snapKey = (configId: string) => `${figma.currentPage.id}|${configId}`;

async function applyConfigMode(configId: string, configModeId: string) {
  const state = await computeState();
  const cfg = state.configs.find((c) => c.id === configId);
  if (!cfg) throw new Error(M().configGone);
  const targets = applyTargets();
  const existing = snapshots.get(snapKey(configId));
  const before: ModeSnapshot['before'] = existing ? existing.before : {};
  if (!existing) {
    for (const row of cfg.rows) {
      if (row.presetId) before[row.presetId] = figma.currentPage.explicitVariableModes[row.presetId] || null;
    }
  }
  snapshots.set(snapKey(configId), { before, appliedModeId: configModeId });
  let applied = 0;
  const problems: string[] = [];
  for (const row of cfg.rows) {
    const preset = state.presets.find((p) => p.id === row.presetId);
    if (!preset) {
      problems.push(M().presetGone(row.name));
      continue;
    }
    const mode = preset.modes.find((m) => m.name === row.values[configModeId]);
    if (!mode) {
      problems.push(M().modeGoneIn(row.name, row.values[configModeId]));
      continue;
    }
    const collection = await getCollection(preset.id);
    for (const node of targets) node.setExplicitVariableModeForCollection(collection, mode.id);
    applied++;
  }
  const modeName = cfg.modes.find((m) => m.id === configModeId)?.name ?? '';
  return { message: M().applied(cfg.name, modeName, applied, targetLabel()), problems };
}

/**
 * Undo what the plugin applied: restore the modes the page had before (or clear them when the config
 * wasn't applied through the plugin this session). With `onlyIfUnchanged`, a page whose modes were
 * changed by hand since (e.g. in Figma's panel) is left alone.
 */
async function resetConfig(configId: string, onlyIfUnchanged = false) {
  const key = snapKey(configId);
  const snap = snapshots.get(key);
  const state = await computeState();
  const cfg = state.configs.find((c) => c.id === configId);
  if (!cfg) throw new Error(M().configGone);
  if (onlyIfUnchanged) {
    if (!snap || appliedInfo(state).configs[configId]?.modeId !== snap.appliedModeId) {
      snapshots.delete(key);
      return {};
    }
  }
  if (!snap) return unapplyConfig(configId);
  const page = figma.currentPage;
  for (const [collectionId, modeId] of Object.entries(snap.before)) {
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    if (!collection) continue;
    if (modeId && collection.modes.some((m) => m.modeId === modeId)) page.setExplicitVariableModeForCollection(collection, modeId);
    else if (page.explicitVariableModes[collectionId]) page.clearExplicitVariableModeForCollection(collection);
  }
  snapshots.delete(key);
  return { message: M().reset(cfg.name, targetLabel()) };
}

/** Removes the explicit modes a config sets, so the target inherits them again. */
async function unapplyConfig(configId: string) {
  const state = await computeState();
  const cfg = state.configs.find((c) => c.id === configId);
  if (!cfg) throw new Error(M().configGone);
  let cleared = 0;
  for (const row of cfg.rows) {
    if (!row.presetId) continue;
    const collection = await figma.variables.getVariableCollectionByIdAsync(row.presetId);
    if (!collection) continue;
    for (const node of applyTargets()) {
      if (node.explicitVariableModes[collection.id]) {
        node.clearExplicitVariableModeForCollection(collection);
        cleared++;
      }
    }
  }
  return { message: cleared ? M().unapplied(cfg.name, targetLabel()) : M().notApplied(cfg.name, targetLabel()) };
}

/** Which config mode (if any) the current target matches exactly. */
function appliedInfo(state: State): AppliedInfo {
  const targets = applyTargets();
  const configs: AppliedInfo['configs'] = {};
  for (const cfg of state.configs) {
    const rows = cfg.rows
      .map((r) => {
        const preset = state.presets.find((p) => p.id === r.presetId);
        return preset ? { row: r, preset } : null;
      })
      .filter((x): x is { row: ConfigRow; preset: PresetInfo } => !!x);
    // Explicit modes per preset, if all targets agree; undefined when they differ.
    const explicit = rows.map(({ preset }) => {
      const ids = new Set(targets.map((t) => t.explicitVariableModes[preset.id] || ''));
      return ids.size === 1 ? [...ids][0] : undefined;
    });
    const partial = explicit.some((id) => id !== '');
    const match = cfg.modes.find((m) =>
      rows.length > 0 &&
      rows.every(({ row, preset }, i) => {
        const wanted = preset.modes.find((pm) => pm.name === row.values[m.id]);
        return !!wanted && explicit[i] === wanted.id;
      }),
    );
    configs[cfg.id] = {
      modeId: match ? match.id : null,
      partial: partial && !match,
      viaPlugin: snapshots.has(snapKey(cfg.id)),
    };
  }
  return { target: targetLabel(), pageName: figma.currentPage.name, configs };
}

// ---------------------------------------------------------------------------
// Showcase tables
// ---------------------------------------------------------------------------
// Like i18n's tables, values are not text the plugin writes: every cell is an instance of a template
// component bound to its variable, with the column's mode set explicitly on the cell. Figma updates the
// values by itself, so the plugin only rebuilds when the *structure* changes (tokens or modes added,
// removed, renamed or reordered) — never for a value edit.
//
// Templates (shared by every table in the file, restyle them freely):
//   config-manager-table-title          TEXT property "value"     title bar (also the "location" label)
//   config-manager-table-header         TEXT property "value"     header cell (token ID / preset / mode names)
//   config-manager-table-label          TEXT property "value"     row label (token / preset name)
//   config-manager-table-value-text     TEXT property "value"     ← STRING variable
//   config-manager-table-value-number   text layer named "value"  ← FLOAT variable (bound on the layer: a TEXT property can't hold a number)
//   config-manager-table-value-boolean  BOOLEAN property "value"  ← BOOLEAN variable; shows the "true" layer over the "false" one
//   config-manager-table-value-color    layer named "swatch"      ← COLOR variable (its fill)
//
// Each collection's table is still its own component ("preset-table/…", "config-table/…") that people place
// instances of: it nests template instances — title, optional location row (its own slot), and the grid.
// ---------------------------------------------------------------------------

type TableRow = { id: string; label: string; type: VariableResolvedDataType };
type TableData = { title: string; withLocation: boolean; labelHeader: string; modes: ModeInfo[]; rows: TableRow[] };

const C = {
  title: { r: 0.46, g: 0.46, b: 0.46 },
  header: { r: 0.961, g: 0.961, b: 0.961 },
  border: { r: 0.85, g: 0.85, b: 0.85 },
  white: { r: 1, g: 1, b: 1 },
  text: { r: 0.2, g: 0.2, b: 0.2 },
  muted: { r: 0.6, g: 0.6, b: 0.6 },
  track: { r: 0.8, g: 0.8, b: 0.8 },
  on: { r: 0.05, g: 0.6, b: 1 },
};
const FONT = {
  regular: { family: 'Inter', style: 'Regular' },
  semibold: { family: 'Inter', style: 'Semi Bold' },
};
const LABEL_W = 350;
const COL_W = 280;
const LOCATION_LABEL_W = 120;
const ROW_H = 44;
const SHOW_LOCATION_PROP = 'Show location';
const LOCATION_SLOT_PROP = 'Location';
const PD_TEMPLATES = 'cm-templates'; // on figma.root: JSON { [TplKey]: component id }
const PD_ROW = 'cm-row'; // on grid rows: id of the variable the row shows

type TplKey = 'title' | 'header' | 'label' | 'text' | 'number' | 'boolean' | 'color';
const TPL_NAMES: { [k in TplKey]: string } = {
  title: 'config-manager-table-title',
  header: 'config-manager-table-header',
  label: 'config-manager-table-label',
  text: 'config-manager-table-value-text',
  number: 'config-manager-table-value-number',
  boolean: 'config-manager-table-value-boolean',
  color: 'config-manager-table-value-color',
};
/** Names templates had before (renamed to TPL_NAMES when found unchanged). */
const OLD_TPL_NAMES: { [k in TplKey]: string } = {
  title: 'cm-table/title',
  header: 'cm-table/header',
  label: 'cm-table/label',
  text: 'cm-table/value-text',
  number: 'cm-table/value-number',
  boolean: 'cm-table/value-boolean',
  color: 'cm-table/value-color',
};
const TPL_KEYS = Object.keys(TPL_NAMES) as TplKey[];
type Templates = { [k in TplKey]: ComponentNode };

/** Set when a sync needed a template that was deleted; the UI then offers to restore them. */
let templatesMissing = false;

function presetTableData(p: PresetInfo): TableData {
  return {
    title: p.name,
    withLocation: true,
    labelHeader: 'token ID',
    modes: p.modes,
    rows: p.tokens.map((tk) => ({ id: tk.id, label: tk.name, type: tk.type })),
  };
}

function configTableData(c: ConfigInfo, presets: PresetInfo[]): TableData {
  return {
    title: c.name,
    withLocation: false,
    labelHeader: 'preset',
    modes: c.modes,
    rows: c.rows.map((r) => {
      const preset = presets.find((p) => p.id === r.presetId);
      return { id: r.variableId, label: preset ? preset.name : r.name, type: 'STRING' as VariableResolvedDataType };
    }),
  };
}

// ---- templates -------------------------------------------------------------

const textProp = (comp: ComponentNode, name: string, type: 'TEXT' | 'BOOLEAN') =>
  Object.keys(comp.componentPropertyDefinitions).find((k) => comp.componentPropertyDefinitions[k].type === type && propName(k) === name) || null;

/** What the plugin needs from each template; a restyled template only has to keep this. */
function validTemplate(key: TplKey, n: BaseNode | null): n is ComponentNode {
  if (!n || n.type !== 'COMPONENT' || !isOnCanvas(n)) return false;
  switch (key) {
    case 'number': return !!n.findOne((x) => x.type === 'TEXT' && x.name === 'value');
    case 'boolean': return !!textProp(n, 'value', 'BOOLEAN');
    case 'color': return !!n.findOne((x) => x.name === 'swatch' && 'fills' in x);
    default: return !!textProp(n, 'value', 'TEXT');
  }
}

const storedTemplateIds = (): { [k: string]: string } => {
  try {
    return JSON.parse(figma.root.getPluginData(PD_TEMPLATES) || '{}');
  } catch (_) {
    return {};
  }
};

/** Find the templates (by stored id, then by name on this page). `missing` lists the ones that are gone. */
async function findTemplates(): Promise<{ found: Partial<Templates>; missing: TplKey[]; neverMade: boolean }> {
  const ids = storedTemplateIds();
  const found: Partial<Templates> = {};
  const missing: TplKey[] = [];
  let byName: ComponentNode[] | null = null;
  for (const key of TPL_KEYS) {
    let node: BaseNode | null = ids[key] ? await figma.getNodeByIdAsync(ids[key]) : null;
    if (!validTemplate(key, node)) {
      byName = byName || figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] });
      node = byName.find((c) => (c.name === TPL_NAMES[key] || c.name === OLD_TPL_NAMES[key]) && validTemplate(key, c)) || null;
    }
    if (validTemplate(key, node)) {
      if (node.name === OLD_TPL_NAMES[key]) node.name = TPL_NAMES[key];
      found[key] = node;
    }
    else missing.push(key);
  }
  return { found, missing, neverMade: !Object.keys(ids).length };
}

function saveTemplateIds(tpls: Partial<Templates>) {
  const ids: { [k: string]: string } = {};
  for (const key of TPL_KEYS) if (tpls[key]) ids[key] = tpls[key]!.id;
  figma.root.setPluginData(PD_TEMPLATES, JSON.stringify(ids));
}

function cellComponent(name: string, fill: RGB, width: number, align: 'MIN' | 'CENTER' = 'MIN') {
  const c = figma.createComponent();
  c.name = name;
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisAlignItems = align;
  c.counterAxisAlignItems = 'CENTER';
  c.itemSpacing = 8;
  c.paddingLeft = c.paddingRight = 12;
  c.paddingTop = c.paddingBottom = 10;
  c.fills = [{ type: 'SOLID', color: fill }];
  c.strokes = [{ type: 'SOLID', color: C.border }];
  c.strokeAlign = 'INSIDE';
  c.strokeTopWeight = 0;
  c.strokeLeftWeight = 0;
  c.strokeRightWeight = 1;
  c.strokeBottomWeight = 1;
  c.resize(width, ROW_H);
  c.primaryAxisSizingMode = 'FIXED';
  c.counterAxisSizingMode = 'AUTO';
  c.minHeight = ROW_H;
  return c;
}

function addText(parent: FrameNode | ComponentNode, chars: string, font: FontName, size: number, color: RGB, name = 'text', align: 'LEFT' | 'CENTER' = 'LEFT') {
  const t = figma.createText();
  t.name = name;
  t.fontName = font;
  t.fontSize = size;
  t.characters = chars;
  t.fills = [{ type: 'SOLID', color }];
  t.textAlignHorizontal = align;
  parent.appendChild(t);
  t.textAutoResize = 'HEIGHT';
  t.layoutSizingHorizontal = 'FILL';
  return t;
}

function textTemplate(name: string, fill: RGB, width: number, font: FontName, size: number, color: RGB, sample: string, align: 'LEFT' | 'CENTER') {
  const c = cellComponent(name, fill, width, align === 'CENTER' ? 'CENTER' : 'MIN');
  const t = addText(c, sample, font, size, color, 'text', align);
  t.componentPropertyReferences = { characters: c.addComponentProperty('value', 'TEXT', sample) };
  return c;
}

/** A switch + label; the "true" layer sits on top of the "false" one and is shown by the BOOLEAN property. */
function booleanTemplate() {
  const c = cellComponent(TPL_NAMES.boolean, C.white, COL_W);
  const state = figma.createFrame();
  state.name = 'state';
  state.fills = [];
  state.resize(120, 24);
  c.appendChild(state);
  const face = (on: boolean) => {
    const f = figma.createFrame();
    f.name = on ? 'true' : 'false';
    f.layoutMode = 'HORIZONTAL';
    f.counterAxisAlignItems = 'CENTER';
    f.itemSpacing = 8;
    f.fills = [{ type: 'SOLID', color: C.white }]; // covers the other face
    const sw = figma.createFrame();
    sw.name = 'switch';
    sw.fills = [];
    sw.resize(28, 16);
    const track = figma.createRectangle();
    track.resize(28, 16);
    track.cornerRadius = 8;
    track.fills = [{ type: 'SOLID', color: on ? C.on : C.track }];
    const knob = figma.createEllipse();
    knob.resize(12, 12);
    knob.x = on ? 14 : 2;
    knob.y = 2;
    knob.fills = [{ type: 'SOLID', color: C.white }];
    sw.appendChild(track);
    sw.appendChild(knob);
    f.appendChild(sw);
    const t = figma.createText();
    t.fontName = FONT.regular;
    t.fontSize = 16;
    t.characters = on ? 'true' : 'false';
    t.fills = [{ type: 'SOLID', color: on ? C.text : C.muted }];
    f.appendChild(t);
    state.appendChild(f);
    f.primaryAxisSizingMode = 'FIXED';
    f.counterAxisSizingMode = 'FIXED';
    f.resize(120, 24);
    f.x = 0;
    f.y = 0;
    return f;
  };
  face(false);
  const on = face(true);
  on.componentPropertyReferences = { visible: c.addComponentProperty('value', 'BOOLEAN', true) };
  return c;
}

function colorTemplate() {
  const c = cellComponent(TPL_NAMES.color, C.white, COL_W);
  const s = figma.createRectangle();
  s.name = 'swatch';
  s.resize(20, 20);
  s.cornerRadius = 4;
  s.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  s.strokes = [{ type: 'SOLID', color: C.border }];
  c.appendChild(s);
  return c;
}

function buildTemplate(key: TplKey): ComponentNode {
  switch (key) {
    case 'title': return textTemplate(TPL_NAMES.title, C.title, LABEL_W + COL_W, FONT.semibold, 18, C.white, 'title', 'CENTER');
    case 'header': return textTemplate(TPL_NAMES.header, C.header, COL_W, FONT.semibold, 18, C.text, 'header', 'CENTER');
    case 'label': return textTemplate(TPL_NAMES.label, C.white, LABEL_W, FONT.regular, 16, C.text, 'label', 'LEFT');
    case 'text': return textTemplate(TPL_NAMES.text, C.white, COL_W, FONT.regular, 16, C.text, 'value', 'LEFT');
    case 'number': {
      const c = cellComponent(TPL_NAMES.number, C.white, COL_W);
      addText(c, '0', FONT.regular, 16, C.text, 'value');
      return c;
    }
    case 'boolean': return booleanTemplate();
    case 'color': return colorTemplate();
  }
}

/** Build the missing templates on the current page, stacked in a column to the right of everything else. */
async function buildTemplates(missing: TplKey[], found: Partial<Templates>): Promise<Templates> {
  await Promise.all(Object.values(FONT).map((f) => figma.loadFontAsync(f)));
  const page = figma.currentPage;
  const right = Math.max(0, ...page.children.map((n) => n.x + n.width));
  const tpls = { ...found } as Templates;
  let y = 0;
  for (const key of missing) {
    const comp = buildTemplate(key);
    page.appendChild(comp);
    comp.x = Math.round(right + 400);
    comp.y = y;
    y += comp.height + 40;
    comp.description = 'Config Manager table template. Restyle freely — keep the "value" property / layer the plugin binds.';
    tpls[key] = comp;
  }
  saveTemplateIds(tpls);
  templatesMissing = false;
  return tpls;
}

/**
 * Templates for a user action. Made on first use; when some were deleted later, `restore` rebuilds them
 * (otherwise the action fails and the UI offers to restore — like i18n).
 */
async function templatesFor(restore: boolean): Promise<Templates> {
  const { found, missing, neverMade } = await findTemplates();
  if (!missing.length) {
    saveTemplateIds(found);
    templatesMissing = false;
    return found as Templates;
  }
  if (neverMade || restore) return buildTemplates(missing, found);
  templatesMissing = true;
  throw new Error(M().templatesMissing);
}

const loadedFonts = new Set<string>();
async function loadTemplateFonts(tpls: Templates) {
  for (const key of TPL_KEYS) {
    for (const t of tpls[key].findAllWithCriteria({ types: ['TEXT'] })) {
      const fonts = t.characters.length ? t.getRangeAllFontNames(0, t.characters.length) : t.fontName === figma.mixed ? [] : [t.fontName];
      for (const f of fonts) {
        const id = `${f.family}|${f.style}`;
        if (loadedFonts.has(id)) continue;
        await figma.loadFontAsync(f);
        loadedFonts.add(id);
      }
    }
  }
}

// ---- cells -----------------------------------------------------------------

type CellKeys = { title: string; header: string; label: string; text: string; boolean: string };
function cellKeys(tpls: Templates): CellKeys {
  return {
    title: textProp(tpls.title, 'value', 'TEXT')!,
    header: textProp(tpls.header, 'value', 'TEXT')!,
    label: textProp(tpls.label, 'value', 'TEXT')!,
    text: textProp(tpls.text, 'value', 'TEXT')!,
    boolean: textProp(tpls.boolean, 'value', 'BOOLEAN')!,
  };
}

function textCell(tpl: ComponentNode, key: string, text: string, row: FrameNode | null, width: number) {
  const inst = tpl.createInstance();
  if (row) row.appendChild(inst);
  inst.setProperties({ [key]: text || ' ' });
  inst.resize(width, inst.height);
  return inst;
}

const valueKind = (type: VariableResolvedDataType): TplKey =>
  type === 'BOOLEAN' ? 'boolean' : type === 'COLOR' ? 'color' : type === 'FLOAT' ? 'number' : 'text';

/** A value cell: the template for the variable's type, in the column's mode, bound to the variable. */
function valueCell(tpls: Templates, keys: CellKeys, row: FrameNode, variable: Variable, collection: VariableCollection, modeId: string) {
  const kind = valueKind(variable.resolvedType);
  const inst = tpls[kind].createInstance();
  row.appendChild(inst);
  inst.resize(COL_W, inst.height);
  inst.setExplicitVariableModeForCollection(collection, modeId);
  const alias = figma.variables.createVariableAlias(variable);
  if (kind === 'text') inst.setProperties({ [keys.text]: alias });
  else if (kind === 'boolean') inst.setProperties({ [keys.boolean]: alias });
  else if (kind === 'number') {
    const tx = inst.findOne((n) => n.type === 'TEXT' && n.name === 'value') as TextNode | null;
    if (tx) tx.setBoundVariable('characters', variable);
  } else {
    const sw = inst.findOne((n) => n.name === 'swatch' && 'fills' in n) as (SceneNode & MinimalFillsMixin) | null;
    if (sw) sw.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', variable)];
  }
  return inst;
}

function gridRow(name: string) {
  const row = figma.createFrame();
  row.name = name;
  row.layoutMode = 'HORIZONTAL';
  row.primaryAxisSizingMode = 'AUTO';
  row.counterAxisSizingMode = 'AUTO';
  row.itemSpacing = 0;
  row.fills = [];
  row.clipsContent = false;
  return row;
}

function headerRow(tpls: Templates, keys: CellKeys, data: TableData) {
  const row = gridRow('header');
  row.setPluginData(PD_ROLE, 'header');
  textCell(tpls.header, keys.header, data.labelHeader, row, LABEL_W);
  for (const m of data.modes) textCell(tpls.header, keys.header, m.name, row, COL_W);
  return row;
}

function dataRow(tpls: Templates, keys: CellKeys, r: TableRow, variable: Variable | null, collection: VariableCollection, modes: ModeInfo[]) {
  const row = gridRow(`row/${r.label}`);
  row.setPluginData(PD_ROW, r.id);
  textCell(tpls.label, keys.label, r.label, row, LABEL_W);
  for (const m of modes) {
    if (variable) valueCell(tpls, keys, row, variable, collection, m.id);
    else textCell(tpls.text, keys.text, '—', row, COL_W);
  }
  return row;
}

function emptyRow(tpls: Templates, keys: CellKeys, modes: ModeInfo[]) {
  const row = gridRow('empty');
  row.setPluginData(PD_ROLE, 'empty');
  textCell(tpls.label, keys.label, 'No entries yet', row, LABEL_W + COL_W * Math.max(1, modes.length));
  return row;
}

// ---- table component -----------------------------------------------------

const byRole = (comp: ComponentNode | FrameNode, role: string) =>
  comp.children.find((c) => c.getPluginData(PD_ROLE) === role) as SceneNode | undefined;

async function isInstanceOf(node: SceneNode | undefined, tpl: ComponentNode) {
  if (!node || node.type !== 'INSTANCE') return false;
  const main = await node.getMainComponentAsync();
  return !!main && main.id === tpl.id;
}

function styleSlot(f: SlotNode | FrameNode) {
  f.layoutMode = 'HORIZONTAL';
  f.counterAxisAlignItems = 'CENTER';
  f.itemSpacing = 8;
  f.paddingLeft = f.paddingRight = 12;
  f.fills = [{ type: 'SOLID', color: C.white }];
  f.strokes = [{ type: 'SOLID', color: C.border }];
  f.strokeAlign = 'INSIDE';
  f.strokeTopWeight = f.strokeLeftWeight = f.strokeRightWeight = 0;
  f.strokeBottomWeight = 1;
}

/**
 * The table component's persistent parts:
 *   title    – config-manager-table-title instance with the collection name
 *   location – preset tables: "location" label + a slot instances fill (e.g. with a link), toggled by "Show location"
 *   grid     – header row + one row per variable; the only part rebuilt
 * Slot content and property values set on placed instances survive updates.
 */
async function ensureTableSkeleton(comp: ComponentNode, data: TableData, tpls: Templates, keys: CellKeys) {
  let title = byRole(comp, 'title');
  let location = byRole(comp, 'location') as FrameNode | undefined;
  let grid = byRole(comp, 'grid') as FrameNode | undefined;
  if (!title || !grid || !!location !== data.withLocation) {
    // First render, or a different kind of table: start over.
    for (const child of [...comp.children]) child.remove();
    for (const [key, def] of Object.entries(comp.componentPropertyDefinitions)) {
      if (def.type !== 'BOOLEAN' && def.type !== 'SLOT') continue;
      try {
        comp.deleteComponentProperty(key);
      } catch (_) {
        /* already gone together with its layer */
      }
    }
    title = grid = location = undefined;
  }
  comp.layoutMode = 'VERTICAL';
  comp.primaryAxisSizingMode = 'AUTO';
  comp.counterAxisSizingMode = 'AUTO';
  comp.itemSpacing = 0;
  comp.paddingLeft = comp.paddingRight = comp.paddingTop = comp.paddingBottom = 0;
  comp.fills = [];
  comp.strokes = [{ type: 'SOLID', color: C.border }];
  comp.strokeWeight = 1;
  comp.strokeAlign = 'OUTSIDE';
  comp.clipsContent = true;

  // Title: a template instance (tables made before templates had a plain frame — replaced in place).
  if (!(await isInstanceOf(title, tpls.title))) {
    const inst = tpls.title.createInstance();
    comp.insertChild(title ? comp.children.indexOf(title) : 0, inst);
    title?.remove();
    inst.setPluginData(PD_ROLE, 'title');
    inst.layoutSizingHorizontal = 'FILL';
    title = inst;
  }
  (title as InstanceNode).setProperties({ [keys.title]: data.title || ' ' });

  if (data.withLocation) {
    if (!location) {
      location = gridRow('location');
      comp.insertChild(1, location);
      location.setPluginData(PD_ROLE, 'location');
      location.layoutSizingHorizontal = 'FILL';
      const before = new Set(Object.keys(comp.componentPropertyDefinitions));
      let slot: SlotNode | FrameNode;
      try {
        slot = comp.createSlot();
      } catch (e) {
        // Slots aren't available in every Figma version; fall back to a plain frame people can edit in instances.
        console.warn('createSlot unavailable, using a frame', e);
        slot = figma.createFrame();
      }
      slot.name = 'location-slot';
      location.appendChild(slot);
      styleSlot(slot);
      slot.layoutSizingHorizontal = 'FILL';
      slot.layoutSizingVertical = 'FILL';
      const slotProp = Object.keys(comp.componentPropertyDefinitions).find(
        (k) => !before.has(k) && comp.componentPropertyDefinitions[k].type === 'SLOT',
      );
      if (slotProp) {
        try {
          comp.editComponentProperty(slotProp, { name: LOCATION_SLOT_PROP, description: 'Drop a link to where this UI lives.' });
        } catch (e) {
          console.warn('Could not rename slot property', e);
        }
      }
      location.componentPropertyReferences = { visible: comp.addComponentProperty(SHOW_LOCATION_PROP, 'BOOLEAN', true) };
    }
    const label = location.children[0];
    if (!(await isInstanceOf(label, tpls.title))) {
      const inst = textCell(tpls.title, keys.title, 'location', null, LOCATION_LABEL_W);
      location.insertChild(0, inst);
      if (label && label.type !== 'SLOT') label.remove();
    }
  }

  if (!grid) {
    grid = figma.createFrame();
    comp.appendChild(grid);
    grid.setPluginData(PD_ROLE, 'grid');
  }
  grid.name = 'grid';
  grid.layoutMode = 'VERTICAL';
  grid.primaryAxisSizingMode = 'AUTO';
  grid.counterAxisSizingMode = 'AUTO';
  grid.itemSpacing = 0;
  grid.fills = [];
  grid.clipsContent = false;
  return grid;
}

/** Bump when the table layout code changes so existing tables are rebuilt once. */
const TABLE_RENDER_VERSION = 4;

/** Two fingerprints: `layout` (columns, templates) needs a full rebuild; `rows` only a row reconcile. Values are in neither. */
function tableSigs(data: TableData) {
  return {
    layout: JSON.stringify({ v: TABLE_RENDER_VERSION, t: storedTemplateIds(), title: data.title, loc: data.withLocation, h: data.labelHeader, m: data.modes }),
    rows: JSON.stringify(data.rows),
  };
}
type TableSigs = ReturnType<typeof tableSigs>;
const readSigs = (c: VariableCollection): TableSigs | null => {
  try {
    const s = JSON.parse(c.getPluginData(PD_TABLE_SIG) || 'null');
    return s && typeof s.layout === 'string' ? s : null;
  } catch (_) {
    return null;
  }
};

async function rowVariables(data: TableData) {
  const vars = new Map<string, Variable | null>();
  for (const r of data.rows) vars.set(r.id, await figma.variables.getVariableByIdAsync(r.id));
  return vars;
}

/**
 * Full build: a fresh grid is filled off-canvas with auto layout off (no relayout per row — i18n measured
 * that rows appended into a growing auto-layout frame slow down quadratically), then swapped in.
 */
async function rebuildGrid(comp: ComponentNode, grid: FrameNode, data: TableData, tpls: Templates, keys: CellKeys, collection: VariableCollection) {
  const vars = await rowVariables(data);
  const fresh = figma.createFrame();
  fresh.name = 'grid';
  fresh.fills = [];
  fresh.clipsContent = false;
  figma.currentPage.appendChild(fresh);
  fresh.appendChild(headerRow(tpls, keys, data));
  if (!data.rows.length) fresh.appendChild(emptyRow(tpls, keys, data.modes));
  for (let i = 0; i < data.rows.length; i++) {
    fresh.appendChild(dataRow(tpls, keys, data.rows[i], vars.get(data.rows[i].id) || null, collection, data.modes));
    if (i % 100 === 99) await breathe();
  }
  fresh.layoutMode = 'VERTICAL';
  fresh.primaryAxisSizingMode = 'AUTO';
  fresh.counterAxisSizingMode = 'AUTO';
  fresh.itemSpacing = 0;
  fresh.setPluginData(PD_ROLE, 'grid');
  comp.insertChild(comp.children.indexOf(grid), fresh);
  grid.remove();
}

/** Same columns: keep existing rows, add/remove/reorder by variable id, relabel renamed ones. */
async function reconcileRows(grid: FrameNode, data: TableData, tpls: Templates, keys: CellKeys, collection: VariableCollection) {
  const kids = [...grid.children]; // read once — reading children in a loop is quadratic on big tables
  const byVar = new Map<string, FrameNode>();
  for (const k of kids) {
    const id = k.getPluginData(PD_ROW);
    if (id && k.type === 'FRAME') byVar.set(id, k);
    else if (k.getPluginData(PD_ROLE) === 'empty') k.remove();
  }
  const order = kids.filter((k) => !k.removed);
  const vars = await rowVariables(data);
  let pos = 1; // after the header row
  for (const r of data.rows) {
    let row = byVar.get(r.id);
    byVar.delete(r.id);
    if (!row) {
      row = dataRow(tpls, keys, r, vars.get(r.id) || null, collection, data.modes);
      grid.appendChild(row);
      order.push(row);
    } else {
      const label = row.children[0];
      if (label && label.type === 'INSTANCE' && label.componentProperties[keys.label]?.value !== r.label) {
        label.setProperties({ [keys.label]: r.label || ' ' });
        row.name = `row/${r.label}`;
      }
    }
    if (order[pos] !== row) {
      grid.insertChild(pos, row);
      order.splice(order.indexOf(row), 1);
      order.splice(pos, 0, row);
    }
    pos++;
  }
  for (const row of byVar.values()) row.remove();
  if (!data.rows.length) grid.appendChild(emptyRow(tpls, keys, data.modes));
}

async function renderTable(comp: ComponentNode, collection: VariableCollection, data: TableData, tpls: Templates) {
  await loadTemplateFonts(tpls);
  const keys = cellKeys(tpls);
  const grid = await ensureTableSkeleton(comp, data, tpls, keys);
  const sigs = tableSigs(data);
  const prev = readSigs(collection);
  const header = grid.children[0];
  if (!prev || prev.layout !== sigs.layout || !header || header.getPluginData(PD_ROLE) !== 'header') {
    await rebuildGrid(comp, grid, data, tpls, keys, collection);
  } else if (prev.rows !== sigs.rows) {
    await reconcileRows(grid, data, tpls, keys, collection);
  }
  collection.setPluginData(PD_TABLE_SIG, JSON.stringify(sigs));
}

async function findTable(collection: VariableCollection): Promise<ComponentNode | null> {
  const id = collection.getPluginData(PD_TABLE_ID);
  if (!id) return null;
  const node = await figma.getNodeByIdAsync(id);
  if (!node || node.type !== 'COMPONENT' || !isOnCanvas(node)) return null;
  // Remember (or update, if the table was moved) which page it sits on.
  let page: BaseNode | null = node.parent;
  while (page && page.type !== 'PAGE') page = page.parent;
  if (page && collection.getPluginData(PD_TABLE_PAGE) !== page.id) collection.setPluginData(PD_TABLE_PAGE, page.id);
  return node;
}

/** Create the table, or redraw it from scratch (`table` action). Templates are made on first use. */
async function createOrUpdateTable(collectionId: string) {
  const collection = await getCollection(collectionId);
  const state = await computeState();
  const data = tableDataFor(collectionId, state);
  if (!data) throw new Error(M().collectionGone);
  const tpls = await templatesFor(false);
  let comp = await findTable(collection);
  const created = !comp;
  if (!comp) {
    comp = figma.createComponent();
    comp.setPluginData(PD_TABLE_FOR, collectionId);
    const center = figma.viewport.center;
    figma.currentPage.appendChild(comp);
    comp.x = Math.round(center.x - 300);
    comp.y = Math.round(center.y - 100);
    collection.setPluginData(PD_TABLE_ID, comp.id);
    collection.setPluginData(PD_TABLE_PAGE, figma.currentPage.id);
  }
  comp.name = `${isConfigCollection(collection) ? 'config-table' : 'preset-table'}/${collection.name}`;
  comp.description = `Live showcase of the "${collection.name}" variable collection. Managed by the Config Manager plugin — edits made here will be overwritten.`;
  collection.setPluginData(PD_TABLE_SIG, ''); // full rebuild
  await renderTable(comp, collection, data, tpls);
  if (created) {
    figma.currentPage.selection = [comp];
    figma.viewport.scrollAndZoomIntoView([comp]);
  }
  return { created, comp };
}

function tableDataFor(collectionId: string, state: State): TableData | null {
  const preset = state.presets.find((p) => p.id === collectionId);
  if (preset) return presetTableData(preset);
  const config = state.configs.find((c) => c.id === collectionId);
  if (config) return configTableData(config, state.presets);
  return null;
}

/**
 * Re-render any showcase table whose source data changed (including edits made directly in Figma's
 * variables table) — only tables on the current page. Redrawing a table elsewhere would load its
 * page and push the change through every instance on every poll; those catch up when their page
 * is opened (see the currentpagechange handler).
 */
async function syncTables(state: State) {
  const all = [...state.presets, ...state.configs].filter((c) => c.tableId);
  let tpls: Templates | null = null;
  for (const item of all) {
    const data = tableDataFor(item.id, state);
    if (!data) continue;
    const collection = await figma.variables.getVariableCollectionByIdAsync(item.id);
    if (!collection || tableOnOtherPage(collection)) continue;
    // Value edits don't change the fingerprints (cells are bound), so most polls stop here.
    const sigs = tableSigs(data);
    const prev = readSigs(collection);
    if (prev && prev.layout === sigs.layout && prev.rows === sigs.rows) continue;
    const comp = await findTable(collection);
    if (!comp) continue; // table was deleted; the UI offers to create it again
    if (!tpls) {
      const { found, missing } = await findTemplates();
      if (missing.length) {
        templatesMissing = true; // a deleted template is never rebuilt behind the user's back
        return;
      }
      tpls = found as Templates;
      templatesMissing = false;
    }
    try {
      comp.name = `${isConfigCollection(collection) ? 'config-table' : 'preset-table'}/${collection.name}`;
      await renderTable(comp, collection, data, tpls);
    } catch (e) {
      console.error('Failed to sync table', e);
    }
  }
}

/** Rebuild deleted templates; every table then redraws with them (their ids are part of the fingerprint). */
async function restoreTemplates() {
  await templatesFor(true);
}

async function removeTable(collectionId: string) {
  const collection = await getCollection(collectionId);
  const comp = await findTable(collection);
  if (comp) comp.remove();
  collection.setPluginData(PD_TABLE_ID, '');
  collection.setPluginData(PD_TABLE_SIG, '');
  collection.setPluginData(PD_TABLE_PAGE, '');
}

/** The collection whose table contains this layer (the component, an instance of it, or any layer inside either). */
async function tableOwnerOf(node: BaseNode | null): Promise<string | null> {
  for (let n = node, depth = 0; n && n.type !== 'PAGE' && n.type !== 'DOCUMENT' && depth < 16; n = n.parent, depth++) {
    if (n.type === 'COMPONENT') {
      const id = n.getPluginData(PD_TABLE_FOR);
      if (id) return id;
    } else if (n.type === 'INSTANCE') {
      const main = await n.getMainComponentAsync();
      const id = main && !main.remote ? main.getPluginData(PD_TABLE_FOR) : '';
      if (id) return id;
    }
  }
  return null;
}

/** Selecting a table on the canvas opens its config or preset in the plugin. */
let lastRevealed: string | null = null;
async function revealSelectedTable() {
  const sel = figma.currentPage.selection;
  const owner = sel.length === 1 ? await tableOwnerOf(sel[0]) : null;
  // Always report it, so the plugin can show "Table selected" instead of "View table".
  figma.ui.postMessage({ type: 'selectedTable', collectionId: owner });
  if (owner && owner !== lastRevealed && (await figma.variables.getVariableCollectionByIdAsync(owner))) {
    figma.ui.postMessage({ type: 'reveal', collectionId: owner });
  }
  lastRevealed = owner;
}

async function locateTable(collectionId: string) {
  const comp = await findTable(await getCollection(collectionId));
  if (!comp) throw new Error(M().tableGone);
  let page: BaseNode | null = comp;
  while (page && page.type !== 'PAGE') page = page.parent;
  if (page && page.type === 'PAGE' && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  figma.currentPage.selection = [comp];
  figma.viewport.scrollAndZoomIntoView([comp]);
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialize all document work so polling never interleaves with a user action. */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

let lastAppliedJson = '';
async function pushApplied(state?: State, onlyIfChanged = false) {
  const applied = appliedInfo(state || (await computeState()));
  const json = JSON.stringify(applied);
  if (onlyIfChanged && json === lastAppliedJson) return;
  lastAppliedJson = json;
  figma.ui.postMessage({ type: 'applied', applied });
}

type Msg = { type: string; requestId?: number; [key: string]: any };

async function handle(msg: Msg): Promise<{ message?: string; warnings?: string[]; data?: unknown } | void> {
  switch (msg.type) {
    case 'ready':
      await langReady;
      figma.ui.postMessage({ type: 'lang', lang });
      figma.ui.postMessage({ type: 'colWidths', widths: (await figma.clientStorage.getAsync('cm-col-widths').catch(() => null)) || {} });
      await pushApplied(await pushState(true));
      await revealSelectedTable();
      await pushSelection(true);
      await bindVariantInstances(variantTargets);
      return;
    case 'watchPreset':
      watchedPresetId = msg.id || null;
      await pushComponentDetail(true);
      return;
    case 'refresh':
      await pushApplied(await pushState(true));
      return;

    // presets
    case 'createPresetForComponent': {
      const collection = await createPresetForComponent(msg.componentId);
      return { message: M().presetCreated(collection.name), data: { id: collection.id } };
    }
    case 'linkPreset':
      return await linkPreset(msg.presetId, msg.componentId);
    case 'locateComponent':
      await locateComponent(msg.id);
      return;
    case 'cleanupPresets': {
      const report = await cleanupPresets();
      const found = report.unlinked.length + report.missing.length + report.issues.length;
      return { message: M().cleanupDone(found, report.elsewhere.length), data: report };
    }
    case 'renamePreset':
      await renamePreset(msg.id, msg.name);
      return;
    case 'deletePreset':
      await deletePreset(msg.id);
      return { message: M().presetDeleted };
    case 'deletePresets':
      for (const id of msg.ids as string[]) await deletePreset(id);
      return { message: M().nDeleted(msg.ids.length) };
    case 'deleteConfigs':
      for (const id of msg.ids as string[]) (await getCollection(id)).remove();
      return { message: M().nDeleted(msg.ids.length) };

    // modes (presets and configs)
    case 'addMode':
      await addMode(msg.collectionId, msg.name);
      return;
    case 'renameMode':
      await renameMode(msg.collectionId, msg.modeId, msg.name);
      return;
    case 'removeMode':
      await removeMode(msg.collectionId, msg.modeId);
      return;

    // tokens
    case 'addPropToken': {
      const v = await addPropToken(msg.presetId, msg.ref, msg.modeId, msg.value);
      return { message: M().tokenCreated(v.name), data: { id: v.id } };
    }
    case 'rebindToken':
      await rebindToken(msg.id);
      return;
    case 'renameTokenToProp':
      await renameTokenToProp(msg.id);
      return;
    case 'renameToken':
      await renameToken(msg.id, msg.name);
      return;
    case 'deleteToken':
      await deleteToken(msg.id);
      return;
    case 'setTokenValue':
      await setTokenValue(msg.id, msg.modeId, msg.value);
      return;

    // configs
    case 'createConfig': {
      const { collection, warnings } = await createConfig(msg.name, msg.modes);
      return { message: M().configCreated(collection.name), warnings, data: { id: collection.id } };
    }
    case 'renameConfig':
      await renameConfig(msg.id, msg.name);
      return;
    case 'deleteConfig':
      (await getCollection(msg.id)).remove();
      return { message: M().configDeleted };
    case 'addPresetToConfig':
      await addPresetToConfig(msg.configId, msg.presetId);
      return;
    case 'removeConfigRow':
      (await getVariable(msg.id)).remove();
      return;
    case 'setConfigValue':
      await setConfigValue(msg.id, msg.modeId, msg.value);
      return;
    case 'applyConfigMode': {
      const { message, problems } = await applyConfigMode(msg.configId, msg.modeId);
      return { message, warnings: problems };
    }
    case 'resetConfig':
      return await resetConfig(msg.configId, !!msg.onlyIfUnchanged);
    case 'unapplyConfig':
      return await unapplyConfig(msg.configId);

    // tables
    case 'table': {
      const { created } = await createOrUpdateTable(msg.id);
      return { message: created ? M().tableCreated : M().tableUpdated };
    }
    case 'removeTable':
      await removeTable(msg.id);
      return { message: M().tableRemoved };
    case 'locateTable':
      await locateTable(msg.id);
      return;
    case 'restoreTemplates':
      await restoreTemplates();
      return { message: M().templatesRestored };

  }
  throw new Error(M().unknownAction(msg.type));
}

const READ_ONLY = new Set(['ready', 'refresh', 'watchPreset']);

figma.ui.onmessage = (msg: Msg) => {
  if (msg.type === 'resize') {
    const w = Math.max(420, Math.min(1600, Math.round(msg.w)));
    const h = Math.max(360, Math.min(1200, Math.round(msg.h)));
    figma.ui.resize(w, h);
    if (msg.done) figma.clientStorage.setAsync('cm-size', { w, h }).catch(() => undefined);
    return;
  }
  if (msg.type === 'setLang') {
    lang = msg.lang === 'en' ? 'en' : 'ko';
    figma.clientStorage.setAsync(LANG_KEY, lang).catch(() => undefined);
    return;
  }
  if (msg.type === 'saveColWidths') {
    figma.clientStorage.setAsync('cm-col-widths', msg.widths).catch(() => undefined);
    return;
  }
  return enqueue(async () => {
    try {
      const result = (await handle(msg)) || {};
      if (!READ_ONLY.has(msg.type)) {
        figma.commitUndo();
        await pushApplied(await pushState());
        await pushSelection();
        await pushComponentDetail();
      }
      figma.ui.postMessage({ type: 'result', requestId: msg.requestId, ok: true, ...result });
      if (result.message) figma.notify(result.message, { timeout: 2500 });
    } catch (e) {
      const error = errorMessage(e);
      figma.ui.postMessage({ type: 'result', requestId: msg.requestId, ok: false, error });
      figma.notify(error, { error: true, timeout: 4000 });
      await pushState(true).catch(() => undefined);
    }
  });
};

// A newly opened page may hold tables that went stale while their page was closed.
// Instances on it are bound to their presets' variant tokens here (not in the poll, which stays cheap).
figma.on('currentpagechange', () =>
  enqueue(async () => {
    await pushApplied(await pushState(true));
    await bindVariantInstances(variantTargets);
    await pushSelection(true);
    await pushComponentDetail(true);
  }).catch(() => undefined),
);
// A just-placed instance is selected, so binding the selection catches instances added while the plugin is open.
figma.on('selectionchange', () =>
  enqueue(async () => {
    await revealSelectedTable();
    await pushSelection();
    await bindVariantInstances(variantTargets, figma.currentPage.selection);
  }).catch(() => undefined),
);

// Variables edited directly in Figma's variables table do not emit document events,
// so poll for changes and keep the UI + showcase tables in sync while the plugin is open.
// Self-scheduling rather than setInterval: in a file with thousands of variables one pass can take
// a while, and a fixed timer would stack passes up. The gap is at least 1.5s, or 5x the last pass,
// capped at 30s.
const POLL_MIN_MS = 1500;
const POLL_MAX_MS = 30000;
function schedulePoll(delay: number) {
  setTimeout(async () => {
    const started = Date.now();
    await enqueue(async () => {
      await pushApplied(await pushState(), true);
      await pushComponentDetail(); // the open preset's component only
    }).catch((e) => console.error(e));
    schedulePoll(Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, (Date.now() - started) * 5)));
  }, delay);
}
schedulePoll(POLL_MIN_MS);
