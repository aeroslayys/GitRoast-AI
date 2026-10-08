import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProfile, scoreProfile, aiFeedback, validUsername, ApiError } from './engine.js';

const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
const requests = new Map();
const TTL = 10 * 60 * 1000;
const pages = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function tooMany(ip) {
  const now = Date.now();
  if (requests.size > 5000) for (const [key, value] of requests) if (value.until < now) requests.delete(key);
  const entry = requests.get(ip);
  if (!entry || now > entry.until) { requests.set(ip, { count: 1, until: now + 3600000 }); return false; }
  entry.count++;
  return entry.count > 30;
}
export async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'");
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/api/analyze') {
    const username = (url.searchParams.get('username') || '').trim();
    if (!validUsername(username)) return json(res, 400, { error: 'Enter a valid GitHub username.' });
    if (tooMany(req.socket.remoteAddress || 'unknown')) return json(res, 429, { error: 'Too many reports from this connection. Please retry later.' });
    const key = username.toLowerCase();
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      try { return json(res, 200, await cached.promise); }
      catch { cache.delete(key); }
    }
    const promise = (async () => {
      const data = await collectProfile(username);
      const analysis = scoreProfile(data);
      const feedback = await aiFeedback(data, analysis);
      return { user: data.user, projects: data.projects, analyzedAt: data.analyzedAt,
        scannedCount: data.scannedCount, capped: data.capped, analysis, feedback };
    })();
    cache.set(key, { promise, expires: Date.now() + TTL });
    try { return json(res, 200, await promise); }
    catch (error) {
      cache.delete(key);
      const status = error instanceof ApiError ? error.status : 500;
      console.error('Analysis error:', error.message);
      return json(res, status, { error: status === 500 ? 'Something went wrong. Please retry.' : error.message });
    }
  }
  const file = pages[url.pathname];
  if (!file) return json(res, 404, { error: 'Page not found.' });
  try {
    const bytes = await readFile(join(root, 'public', file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'public, max-age=300' });
    res.end(bytes);
  } catch { json(res, 500, { error: 'Could not load the page.' }); }
}
export function createApp() {
  return http.createServer((req, res) => handle(req, res).catch(error => {
    console.error('Unhandled error:', error);
    if (!res.headersSent) json(res, 500, { error: 'Server error.' });
    else res.end();
  }));
}
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, '0.0.0.0', () => console.log('GitRoast AI listening on ' + port));
}
