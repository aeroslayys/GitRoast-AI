import http from 'node:http';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProfile, scoreProfile, aiFeedback, validUsername, ApiError } from './engine.js';
import { generateFixes } from './fixit.js';
import { inspectPublicReadme } from './readme-doctor.js';

const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
const requests = new Map();
const fixCache = new Map();
const doctorCache = new Map();
const doctorRequests = new Map();
const progressRequests = new Map();
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
  '/fixit.css': ['fixit.css', 'text/css; charset=utf-8'],
  '/doctor.js': ['doctor.js', 'text/javascript; charset=utf-8'],
  '/doctor.css': ['doctor.css', 'text/css; charset=utf-8'],
  '/progress.js': ['progress.js', 'text/javascript; charset=utf-8'],
  '/progress.css': ['progress.css', 'text/css; charset=utf-8'],
  '/workspace.js': ['workspace.js', 'text/javascript; charset=utf-8'],
  '/workspace.css': ['workspace.css', 'text/css; charset=utf-8']
};
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
// Honor forwarded IPs only when the deployment operator knows how many trusted
// proxy hops appended addresses. Never trust the leftmost user-supplied XFF value.
export function requestIdentity(req) {
  const socketIP = req.socket?.remoteAddress || 'unknown';
  const hops = Number(process.env.TRUSTED_PROXY_HOPS || 0);
  if (!Number.isSafeInteger(hops) || hops < 1 || hops > 5) return socketIP;
  const header = req.headers?.['x-forwarded-for'];
  if (typeof header !== 'string' || header.length > 512) return socketIP;
  const chain = header.split(',').map(part => part.trim());
  if (chain.length < hops || chain.length > 20) return socketIP;
  const candidate = chain[chain.length - hops];
  return isIP(candidate) ? candidate : socketIP;
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
  if (url.pathname === '/api/progress') {
    const username=(url.searchParams.get('username')||'').trim();
    if (!validUsername(username)) return json(res,400,{error:'Enter a valid GitHub username.'});
    // A deliberate, uncached refresh of public metrics only. No Gemini request is made.
    const ip=requestIdentity(req),now=Date.now();
    if(progressRequests.size>1000)for(const [k,v] of progressRequests)if(v.until<=now)progressRequests.delete(k);
    const existing=progressRequests.get(ip);
    if(!existing||existing.until<=now)progressRequests.set(ip,{count:1,until:now+3600000});
    else if(++existing.count>6)return json(res,429,{
      error:'Progress recheck limit reached. Please try again in an hour.'
    });
    try {
      const profile=await collectProfile(username);
      const analysis=scoreProfile(profile);
      return json(res,200,{
        username:profile.user.login,
        analyzedAt:profile.analyzedAt,
        analysis:{
          score:analysis.score,
          categories:analysis.categories.map(({name,score,max})=>({name,score,max})),
          facts:analysis.facts
        },
        scoreVersion:1,
        source:'github-public-data'
      });
    } catch(error) {
      const status=error instanceof ApiError?error.status:500;
      console.warn('Progress recheck failed:',error.message);
      return json(res,status,{error:status===500?'Could not refresh profile metrics right now.':error.message});
    }
  }
  if (url.pathname === '/api/readme-doctor') {
    const username=(url.searchParams.get('username')||'').trim();
    const repository=url.searchParams.get('repo')||'';
    if(!validUsername(username)||!/^[a-zA-Z0-9_.-]{1,100}$/.test(repository))
      return json(res,400,{error:'Choose a valid username and repository.'});
    const ip=requestIdentity(req),now=Date.now();
    if(doctorRequests.size>1500)for(const [k,v] of doctorRequests)if(v.until<=now)doctorRequests.delete(k);
    const previous=doctorRequests.get(ip);
    if(!previous||previous.until<=now)doctorRequests.set(ip,{count:1,until:now+3600000});
    else if(++previous.count>18)return json(res,429,{error:'README Doctor request limit reached. Retry later.'});
    const key=username.toLowerCase()+'/'+repository.toLowerCase();
    const cached=doctorCache.get(key);
    if(cached&&cached.expires>now) {
      try{return json(res,200,await cached.promise);}catch{doctorCache.delete(key);}
    }
    if(doctorCache.size>=200){
      for(const [k,v] of doctorCache)if(v.expires<=now)doctorCache.delete(k);
      if(doctorCache.size>=200)doctorCache.delete(doctorCache.keys().next().value);
    }
    const promise=inspectPublicReadme(username,repository);
    doctorCache.set(key,{promise,expires:now+TTL});
    try{return json(res,200,await promise);}
    catch(error){
      doctorCache.delete(key);
      const status=error instanceof ApiError?error.status:500;
      console.warn('README Doctor error:',error.message);
      return json(res,status,{error:status===500?'Could not check this README. Please retry.':error.message});
    }
  }
  if (url.pathname === '/api/fixit') {
    const username = (url.searchParams.get('username') || '').trim();
    const repoName = url.searchParams.get('repo') || '';
    if (!validUsername(username)) return json(res, 400, { error: 'Enter a valid GitHub username.' });
    if (repoName.length > 100 || (repoName && !/^[a-zA-Z0-9_.-]+$/.test(repoName))) {
      return json(res, 400, { error: 'Choose a valid repository from the report.' });
    }
    // On-demand only; separate rate limit keeps Gemini costs under control.
    const ip = requestIdentity(req);
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
    if (tooMany(requestIdentity(req))) return json(res, 429, { error: 'Too many reports from this connection. Please retry later.' });
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
