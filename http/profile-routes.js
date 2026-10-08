// Audits and fresh progress measurements. Both use the same scoring engine.
import { collectProfile, scoreProfile, aiFeedback, validUsername, ApiError } from '../engine.js';
import { json } from './response.js';
import { requestIdentity } from './request-identity.js';
const cache = new Map();
const requests = new Map();
const progressRequests = new Map();
const TTL = 10 * 60 * 1000;
function tooMany(ip) {
  const now = Date.now();
  if (requests.size > 5000) for (const [key, value] of requests) if (value.until < now) requests.delete(key);
  const entry = requests.get(ip);
  if (!entry || now > entry.until) { requests.set(ip, { count: 1, until: now + 3600000 }); return false; }
  entry.count++;
  return entry.count > 30;
}

export async function handleProfileRoute(url, req, res) {
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
  return json(res, 404, { error: 'Page not found.' });
}
