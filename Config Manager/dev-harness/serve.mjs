// Tiny static server for previewing the plugin UI against a mock Figma host.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)); // decoded: the folder path has a space
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(join(root, path === '/' ? 'dev-harness/harness.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'text/html; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(5178, () => console.log('http://localhost:5178'));
