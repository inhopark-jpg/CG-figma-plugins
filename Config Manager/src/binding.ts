// PARKED: "Link selection" feature (bind component/instance properties to preset tokens).
// Removed from the UI for now and not imported anywhere, so it isn't bundled.
// To bring it back: import from code.ts, re-add the 'bindField' / 'createAndBind' message
// handlers and the selectionchange listener, and restore the tab in ui.html.

const PRESET_PREFIX = 'preset-';

async function getVariable(id: string): Promise<Variable> {
  const v = await figma.variables.getVariableByIdAsync(id);
  if (!v) throw new Error('Variable not found. It may have been deleted.');
  return v;
}

export type FieldKind = 'prop' | 'propDef' | 'visible' | 'characters' | 'fontFamily';
export type FieldRef = { nodeId: string; kind: FieldKind; prop?: string };
export type FieldInfo = FieldRef & {
  group: 'Component properties' | 'Layers';
  label: string;
  type: 'BOOLEAN' | 'STRING';
  value: string | boolean | null;
  boundId: string | null;
  boundName: string | null;
  boundPreset: string | null;
  locked: string | null;
  options?: string[];
};
export type SelectionInfo =
  | { ok: false; reason: string }
  | { ok: true; nodeId: string; nodeType: string; nodeName: string; presetName: string; fields: FieldInfo[]; truncated: boolean };

// ---------------------------------------------------------------------------
// Selection → bindable fields
// ---------------------------------------------------------------------------

const MAX_FIELDS = 150;

async function describeBound(id: string | null | undefined) {
  if (!id) return { boundId: null, boundName: null, boundPreset: null };
  const v = await figma.variables.getVariableByIdAsync(id);
  if (!v) return { boundId: id, boundName: 'unknown variable', boundPreset: null };
  const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
  return { boundId: id, boundName: v.name, boundPreset: c ? c.name : null };
}

function propLabel(name: string) {
  return name.replace(/#[^#]*$/, '');
}

export async function selectionInfo(): Promise<SelectionInfo> {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) return { ok: false, reason: 'Select a single component or instance to link its properties to preset tokens.' };
  if (sel.length > 1) return { ok: false, reason: 'Select only one component or instance.' };
  const node = sel[0];
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET' && node.type !== 'INSTANCE') {
    return { ok: false, reason: `"${node.name}" is a ${node.type.toLowerCase().replace('_', ' ')}. Select a component or instance.` };
  }

  const fields: FieldInfo[] = [];
  let presetName = PRESET_PREFIX + node.name;

  // Component properties
  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync();
    const owner = main && main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : main;
    if (owner) presetName = owner.name;
    presetName = PRESET_PREFIX + presetName;
    const defs = owner ? owner.componentPropertyDefinitions : {};
    for (const [prop, p] of Object.entries(node.componentProperties)) {
      if (p.type !== 'BOOLEAN' && p.type !== 'TEXT' && p.type !== 'VARIANT') continue;
      fields.push({
        nodeId: node.id,
        kind: 'prop',
        prop,
        group: 'Component properties',
        label: `${propLabel(prop)}${p.type === 'VARIANT' ? ' (variant)' : ''}`,
        type: p.type === 'BOOLEAN' ? 'BOOLEAN' : 'STRING',
        value: p.value,
        locked: null,
        options: p.type === 'VARIANT' ? defs[prop]?.variantOptions : undefined,
        ...(await describeBound(p.boundVariables?.value?.id)),
      });
    }
  } else {
    const owner = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET' ? node.parent : node;
    presetName = PRESET_PREFIX + owner.name;
    for (const [prop, d] of Object.entries(owner.componentPropertyDefinitions)) {
      if (d.type !== 'BOOLEAN' && d.type !== 'TEXT') continue;
      fields.push({
        nodeId: owner.id,
        kind: 'propDef',
        prop,
        group: 'Component properties',
        label: `${propLabel(prop)} (default)`,
        type: d.type === 'BOOLEAN' ? 'BOOLEAN' : 'STRING',
        value: d.defaultValue,
        locked: null,
        ...(await describeBound(d.boundVariables?.defaultValue?.id)),
      });
    }
  }

  // Layers (the node itself + descendants, without descending into nested instances or variants)
  let truncated = false;
  const visit = async (n: SceneNode, path: string, depth: number) => {
    if (fields.length >= MAX_FIELDS) {
      truncated = true;
      return;
    }
    const refs = 'componentPropertyReferences' in n ? n.componentPropertyReferences : null;
    const label = path || '(this layer)';
    if (n.type !== 'COMPONENT_SET') {
      fields.push({
        nodeId: n.id,
        kind: 'visible',
        group: 'Layers',
        label: `${label} · visible`,
        type: 'BOOLEAN',
        value: n.visible,
        locked: refs?.visible ? `Controlled by property "${propLabel(refs.visible)}"` : null,
        ...(await describeBound(n.boundVariables?.visible?.id)),
      });
    }
    if (n.type === 'TEXT') {
      fields.push({
        nodeId: n.id,
        kind: 'characters',
        group: 'Layers',
        label: `${label} · text`,
        type: 'STRING',
        value: n.characters,
        locked: refs?.characters ? `Controlled by property "${propLabel(refs.characters)}"` : null,
        ...(await describeBound(n.boundVariables?.characters?.id)),
      });
      if (n.characters.length) {
        const bound = n.getRangeBoundVariable(0, n.characters.length, 'fontFamily');
        const family = n.fontName === figma.mixed ? null : n.fontName.family;
        fields.push({
          nodeId: n.id,
          kind: 'fontFamily',
          group: 'Layers',
          label: `${label} · typeface`,
          type: 'STRING',
          value: family,
          locked: bound === figma.mixed ? 'Mixed typeface bindings' : null,
          ...(await describeBound(bound && bound !== figma.mixed ? bound.id : null)),
        });
      }
    }
    if (n.type === 'COMPONENT_SET') return; // variants are listed via component properties
    if (n !== node && n.type === 'INSTANCE') return;
    if ('children' in n && depth < 8) {
      for (const child of n.children) await visit(child, path ? `${path} / ${child.name}` : child.name, depth + 1);
    }
  };
  await visit(node, '', 0);

  return { ok: true, nodeId: node.id, nodeType: node.type, nodeName: node.name, presetName, fields, truncated };
}

async function loadTextFonts(text: TextNode) {
  if (!text.characters.length) {
    if (text.fontName !== figma.mixed) await figma.loadFontAsync(text.fontName);
    return;
  }
  await Promise.all(text.getRangeAllFontNames(0, text.characters.length).map((f) => figma.loadFontAsync(f)));
}

export async function bindField(ref: FieldRef, variableId: string | null) {
  const node = await figma.getNodeByIdAsync(ref.nodeId);
  if (!node) throw new Error('Layer not found.');
  const variable = variableId ? await getVariable(variableId) : null;

  switch (ref.kind) {
    case 'prop': {
      if (node.type !== 'INSTANCE' || !ref.prop) throw new Error('Expected an instance.');
      const current = node.componentProperties[ref.prop];
      if (!current) throw new Error('Property not found.');
      node.setProperties({ [ref.prop]: variable ? figma.variables.createVariableAlias(variable) : current.value });
      return;
    }
    case 'propDef': {
      if ((node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') || !ref.prop) throw new Error('Expected a component.');
      const def = node.componentPropertyDefinitions[ref.prop];
      if (!def) throw new Error('Property not found.');
      node.editComponentProperty(ref.prop, { defaultValue: variable ? figma.variables.createVariableAlias(variable) : def.defaultValue });
      return;
    }
    case 'visible': {
      if (!('setBoundVariable' in node)) throw new Error('Layer cannot be bound.');
      node.setBoundVariable('visible', variable);
      return;
    }
    case 'characters': {
      if (node.type !== 'TEXT') throw new Error('Expected a text layer.');
      await loadTextFonts(node);
      node.setBoundVariable('characters', variable);
      return;
    }
    case 'fontFamily': {
      if (node.type !== 'TEXT') throw new Error('Expected a text layer.');
      await loadTextFonts(node);
      const len = node.characters.length;
      if (variable) {
        // Fonts for every mode's family must be loadable; keep the current style where possible.
        const style = node.fontName === figma.mixed ? 'Regular' : node.fontName.style;
        const failed: string[] = [];
        for (const value of Object.values(variable.valuesByMode)) {
          if (typeof value !== 'string' || !value) continue;
          try {
            await figma.loadFontAsync({ family: value, style });
          } catch (_) {
            failed.push(`${value} ${style}`);
          }
        }
        node.setRangeBoundVariable(0, len, 'fontFamily', variable);
        if (failed.length) return { warning: `Font not available: ${failed.join(', ')}` };
      } else {
        node.setRangeBoundVariable(0, len, 'fontFamily', null);
      }
      return;
    }
  }
}

