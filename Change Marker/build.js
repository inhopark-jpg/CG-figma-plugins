// Builds ui.html: Figma loads the plugin UI as a single HTML string, so
// linked stylesheets/scripts don't resolve. This inlines the shared design
// system (../doc/design-system, shared by every plugin in this folder) and the
// UI script into src/ui.html's placeholders.
//
//   node build.js          build once
//   node build.js --watch  rebuild on change

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const files = (list) => list.split(',').map((s) => s.trim());

function build() {
  const html = read('src/ui.html')
    .replace(/<!-- @inline-css: (.+?) -->/, (_, list) =>
      `<style>\n${files(list).map(read).join('\n')}\n</style>`)
    .replace(/<!-- @inline-js: (.+?) -->/, (_, list) =>
      `<script>\n${files(list).map(read).join('\n')}\n</script>`);
  fs.writeFileSync(path.join(root, 'ui.html'), html);
  console.log(`built ui.html (${(html.length / 1024).toFixed(1)} KB)`);
}

build();

if (process.argv.includes('--watch')) {
  for (const dir of ['src', '../doc/design-system']) {
    fs.watch(path.join(root, dir), () => {
      try { build(); } catch (e) { console.error(e.message); }
    });
  }
  console.log('watching src/ and ../doc/design-system/ …');
}
