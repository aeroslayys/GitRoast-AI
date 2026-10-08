// Audits and uncached progress rechecks using the same scoring engine.
import { collectProfile, scoreProfile, aiFeedback, validUsername, ApiError } from '../engine.js';
import { json } from './response.js';
import { requestIdentity } from './request-identity.js';
import { createRateLimiter, createAsyncCache } from './request-controls.js';

const auditQuota=createRateLimiter({limit:30,maxKeys:5000});
const progressQuota=createRateLimiter({limit:6});
const auditCache=createAsyncCache({maxEntries:500,ttl:10*60*1000});

async function recheck(url,req,res){
  const username=(url.searchParams.get('username')||'').trim();
  if(!validUsername(username))return json(res,400,{error:'Enter a valid GitHub username.'});
  // Uncached by design: progress checks always read GitHub again, not Gemini.
  if(progressQuota(requestIdentity(req)))
    return json(res,429,{error:'Progress recheck limit reached. Please try again in an hour.'});
  try{
    const profile=await collectProfile(username);
    const analysis=scoreProfile(profile);
    return json(res,200,{
      username:profile.user.login,analyzedAt:profile.analyzedAt,
      analysis:{
        score:analysis.score,
        categories:analysis.categories.map(({name,score,max})=>({name,score,max})),
        facts:analysis.facts
      },scoreVersion:1,source:'github-public-data'
    });
  }catch(error){
    const status=error instanceof ApiError?error.status:500;
    console.warn('Progress recheck failed:',error.message);
    return json(res,status,{error:status===500?'Could not refresh profile metrics right now.':error.message});
  }
}

async function analyze(url,req,res){
  const username=(url.searchParams.get('username')||'').trim();
  if(!validUsername(username))return json(res,400,{error:'Enter a valid GitHub username.'});
  if(auditQuota(requestIdentity(req)))
    return json(res,429,{error:'Too many reports from this connection. Please retry later.'});
  try{
    const result=await auditCache.getOrCreate(username.toLowerCase(),async()=>{
      const data=await collectProfile(username);
      const analysis=scoreProfile(data);
      const feedback=await aiFeedback(data,analysis);
      return {user:data.user,projects:data.projects,analyzedAt:data.analyzedAt,
        scannedCount:data.scannedCount,capped:data.capped,analysis,feedback};
    });
    return json(res,200,result);
  }catch(error){
    const status=error instanceof ApiError?error.status:500;
    console.error('Analysis error:',error.message);
    return json(res,status,{error:status===500?'Something went wrong. Please retry.':error.message});
  }
}
export function handleProfileRoute(url,req,res){
  if(url.pathname==='/api/progress')return recheck(url,req,res);
  if(url.pathname==='/api/analyze')return analyze(url,req,res);
  return json(res,404,{error:'Page not found.'});
}
