import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProfile, scoreProfile, aiFeedback, validUsername, ApiError } from './engine.js';
import { chooseProject, generateFixes } from './fixer.js';
import { generateFixes } from './fixit.js';

const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
const studioCache = new Map();
const requests = new Map();
const fixCache = new Map();
const fixRequests = new Map();
const TTL = 10 * 60 * 1000;
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
  '/fixit.css': ['fixit.css', 'text/css; charset=utf-8']
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
  if (url.pathname === '/api/fix') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST to generate fixes.' });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      return json(res, 415, { error: 'Send JSON to generate fixes.' });
    }
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk.toString('utf8');
        if (Buffer.byteLength(raw, 'utf8') > 2048) return json(res, 413, { error: 'Request is too large.' });
      }
    } catch { return json(res, 400, { error: 'Unable to read request.' }); }
    let input;
    try { input = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid JSON.' }); }
    const username = typeof input?.username === 'string' ? input.username.trim() : '';
    const repository = input?.repository === undefined ? '' : input.repository;
    if (!validUsername(username)) return json(res, 400, { error: 'Enter a valid GitHub username.' });
    if (typeof repository !== 'string' || repository.length > 100 ||
        (repository && !/^[a-zA-Z0-9_.-]+$/.test(repository))) {
      return json(res, 400, { error: 'Choose a valid repository.' });
    }
    if (tooMany(req.socket.remoteAddress || 'unknown')) {
      return json(res, 429, { error: 'Too many requests. Please retry later.' });
    }
    // Explicitly generated on demand; cache for 10 minutes to avoid duplicate Gemini charges.
    const key = username.toLowerCase() + '/' + repository.toLowerCase();
    const existing = studioCache.get(key);
    if (existing && existing.expires > Date.now()) {
      try { return json(res, 200, await existing.promise); }
      catch { studioCache.delete(key); }
    }
    if (studioCache.size >= 200) {
      for (const [k, v] of studioCache) if (v.expires < Date.now()) studioCache.delete(k);
      if (studioCache.size >= 200) studioCache.delete(studioCache.keys().next().value);
    }
    const promise = (async () => {
      const profile = await collectProfile(username);
      const project = chooseProject(profile, repository);
      const fix = await generateFixes(profile, project);
      return { username: profile.user.login, ...fix };
    })();
    studioCache.set(key, { promise, expires: Date.now() + TTL });
    try { return json(res, 200, await promise); }
    catch (error) {
      studioCache.delete(key);
      const status = error instanceof ApiError ? error.status : 500;
      console.error('Fix-It Studio error:', error.message);
      return json(res, status, { error: status === 500 ? 'Could not generate fixes. Please retry.' : error.message });
    }
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (url.pathname === '/api/fixit') {
    const username = (url.searchParams.get('username') || '').trim();
    const repoName = url.searchParams.get('repo') || '';
    if (!validUsername(username)) return json(res, 400, { error: 'Enter a valid GitHub username.' });
    if (repoName.length > 100 || (repoName && !/^[a-zA-Z0-9_.-]+$/.test(repoName))) {
      return json(res, 400, { error: 'Choose a valid repository from the report.' });
    }
    // On-demand only; separate rate limit keeps Gemini costs under control.
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const limit = fixRequests.get(ip);
    if (!limit || limit.until < now) fixRequests.set(ip, { count: 1, until: now + 3600000 });
    else if (++limit.count > 12) return json(res, 429, { error: 'Fix-It Studio limit reached. Please try again later.' });
    if (fixRequests.size > 1000) for (const [k,v] of fixRequests) if (v.until < now) fixRequests.delete(k);
    const key = username.toLowerCase() + '/' + repoName.toLowerCase();
    const existing = fixCache.get(key);
    if (existing && existing.expires > now) {
      try { return json(res, 200, await existing.promise); }
      catch { fixCache.delete(key); }
    }
    if (fixCache.size > 500) for (const [k,v] of fixCache) if (v.expires <= now) fixCache.delete(k);
    const promise = generateFixes(username, repoName);
    fixCache.set(key, { promise, expires: now + TTL });
    try { return json(res, 200, await promise); }
    catch (error) {
      fixCache.delete(key);
      const status = error instanceof ApiError ? error.status : 500;
      console.error('Fix-It Studio request failed:', error.message);
      return json(res, status, { error: status === 500 ? 'Unable to generate suggestions right now.' : error.message });
    }
  }
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
