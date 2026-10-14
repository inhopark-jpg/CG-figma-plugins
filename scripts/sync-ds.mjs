// Copies the shared design system (doc/design-system/tokens.css + components.css)
// into every plugin UI that carries the @ds markers inside its <style> block:
//
//   /* @ds:begin … */  …generated…  /* @ds:end */
//
// Figma loads a plugin UI as one HTML string, so a <link> to a shared file
// can't work — the CSS has to live inside each ui.html. Change Marker is the
// exception: its build.js inlines the same files directly.
//
//   node scripts/sync-ds.mjs          write
//   node scripts/sync-ds.mjs --check  exit 1 if any plugin is out of date

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  'Dev Inspector/ui.html',
  'i18n/ui.html',
  'Arrow Connect/src/ui.html',
  'Config Manager/src/ui.html',
  'Organize Comp Variants/src/ui.html',
  'Organize Sections/src/ui.html',
];

const ds = (f) => readFileSync(join(root, 'doc/design-system', f), 'utf8').trim();
const block =
  '/* @ds:begin — generated from doc/design-system. Edit there, then run `node scripts/sync-ds.mjs`. */\n' +
  ds('tokens.css') + '\n\n' + ds('components.css') + '\n/* @ds:end */';
const MARKERS = /\/\* @ds:begin[\s\S]*?\/\* @ds:end \*\//;

const check = process.argv.includes('--check');
let stale = 0;
for (const rel of TARGETS) {
  const file = join(root, rel);
  const html = readFileSync(file, 'utf8');
  if (!MARKERS.test(html)) { console.error(`✗ ${rel}: no @ds markers`); stale++; continue; }
  const next = html.replace(MARKERS, () => block);
  if (next === html) { console.log(`✓ ${rel}`); continue; }
  if (check) { console.error(`✗ ${rel}: out of date`); stale++; continue; }
  writeFileSync(file, next);
  console.log(`↻ ${rel}`);
}
if (check && stale) process.exit(1);
