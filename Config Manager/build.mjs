import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, watch } from 'node:fs';

const isWatch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });

const copyUi = () => copyFileSync('src/ui.html', 'dist/ui.html');

const options = {
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2017',
  logLevel: 'info',
};

copyUi();
if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  watch('src/ui.html', copyUi);
  console.log('Watching for changes…');
} else {
  await esbuild.build(options);
}
