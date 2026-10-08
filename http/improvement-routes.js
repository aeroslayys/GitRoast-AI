// On-demand improvement endpoints, separate from core audits.
import { validUsername, ApiError } from '../engine.js';
import { generateFixes } from '../fixit.js';
import { inspectPublicReadme } from '../readme-doctor.js';
import { inspectRepositoryEvidence } from '../repo-evidence.js';
import { json } from './response.js';
import { requestIdentity } from './request-identity.js';
const fixCache = new Map();
const doctorCache = new Map();
const doctorRequests = new Map();
const evidenceRequests = new Map();
const evidenceCache = new Map();
const fixRequests = new Map();
const TTL = 10 * 60 * 1000;
export async function handleImprovementRoute(url, req, res) {
  if (url.pathname === '/api/repo-evidence') {
    const username=(url.searchParams.get('username')||'').trim();
    const repository=url.searchParams.get('repo')||'';
    if(!validUsername(username)||!/^[A-Za-z0-9_.-]{1,100}$/.test(repository)||
      repository==='.'||repository==='..')
      return json(res,400,{error:'Choose a valid public GitHub repository.'});
    const ip=requestIdentity(req),now=Date.now();
    if(evidenceRequests.size>1000)for(const [k,v]of evidenceRequests)if(v.until<now)evidenceRequests.delete(k);
    const used=evidenceRequests.get(ip);
    if(!used||used.until<now)evidenceRequests.set(ip,{count:1,until:now+3600000});
    else if(++used.count>12)return json(res,429,{error:'Repository inspection limit reached. Please retry later.'});
    const key=username.toLowerCase()+'/'+repository.toLowerCase();
    const cached=evidenceCache.get(key);
    if(cached&&cached.expires>now){try{return json(res,200,await cached.promise);}catch{evidenceCache.delete(key);}}
    if(evidenceCache.size>=200){
      for(const [k,v]of evidenceCache)if(v.expires<now)evidenceCache.delete(k);
      if(evidenceCache.size>=200)evidenceCache.delete(evidenceCache.keys().next().value);
    }
    const promise=inspectRepositoryEvidence(username,repository);
    evidenceCache.set(key,{promise,expires:now+TTL});
    try{return json(res,200,await promise);}
    catch(error){
      evidenceCache.delete(key);
      const status=error instanceof ApiError?error.status:500;
      console.warn('Repository evidence unavailable:',error.message);
      return json(res,status,{error:status===500?'Unable to inspect this repository right now.':error.message});
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
  return json(res, 404, { error: 'Page not found.' });
}
