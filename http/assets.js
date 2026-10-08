// Explicit allowlist: incoming paths never become filesystem paths.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { json } from './response.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pages = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/aero.css': ['aero.css', 'text/css; charset=utf-8'],
  '/vista.css': ['vista.css', 'text/css; charset=utf-8'],
  '/aero-landscape.svg': ['aero-landscape.svg', 'image/svg+xml'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/fixit.js': ['fixit.js', 'text/javascript; charset=utf-8'],
  '/fixit.css': ['fixit.css', 'text/css; charset=utf-8'],
  '/doctor.js': ['doctor.js', 'text/javascript; charset=utf-8'],
  '/doctor.css': ['doctor.css', 'text/css; charset=utf-8'],
  '/progress.js': ['progress.js', 'text/javascript; charset=utf-8'],
  '/progress.css': ['progress.css', 'text/css; charset=utf-8'],
  '/workspace.js': ['workspace.js', 'text/javascript; charset=utf-8'],
  '/workspace.css': ['workspace.css', 'text/css; charset=utf-8'],
  '/plan.css': ['plan.css', 'text/css; charset=utf-8'],
  '/plan.js': ['plan.js', 'text/javascript; charset=utf-8'],
  '/evidence.js': ['evidence.js', 'text/javascript; charset=utf-8'],
  '/evidence.css': ['evidence.css', 'text/css; charset=utf-8']
};

export async function serveAsset(pathname, res) {
  const file = pages[url.pathname];
  if (!file) return json(res, 404, { error: 'Page not found.' });
  try {
    const bytes = await readFile(join(root, 'public', file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'public, max-age=300' });
    res.end(bytes);
  } catch { json(res, 500, { error: 'Could not load the page.' }); }
}

