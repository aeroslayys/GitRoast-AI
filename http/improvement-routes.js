// On-demand improvement API, independent budgets for each operation.
import { validUsername, ApiError } from '../engine.js';
import { generateFixes } from '../fixit.js';
import { inspectPublicReadme } from '../readme-doctor.js';
import { inspectRepositoryEvidence } from '../repo-evidence.js';
import { requestIdentity } from './request-identity.js';
import { json } from './response.js';
import { createRateLimiter, createAsyncCache } from './request-controls.js';

const evidenceQuota=createRateLimiter({limit:12});
const doctorQuota=createRateLimiter({limit:18,maxKeys:1500});
const fixQuota=createRateLimiter({limit:12});
const evidenceCache=createAsyncCache({maxEntries:200});
const doctorCache=createAsyncCache({maxEntries:200});
const fixCache=createAsyncCache({maxEntries:500});
const REPOSITORY=/^[A-Za-z0-9_.-]{1,100}$/;

function params(url){
  return {username:(url.searchParams.get('username')||'').trim(),repository:url.searchParams.get('repo')||''};
}
function repositoryIsValid(name){
  return REPOSITORY.test(name)&&name!=='.'&&name!=='..';
}
async function respond({url,req,res,quota,cache,operation,warning,unavailable,quotaMessage}){
  if(quota(requestIdentity(req)))return json(res,429,{error:quotaMessage});
  const {username,repository}=params(url);
  const key=username.toLowerCase()+'/'+repository.toLowerCase();
  try{return json(res,200,await cache.getOrCreate(key,()=>operation(username,repository)));}
  catch(error){
    const status=error instanceof ApiError?error.status:500;
    console.warn(warning,error.message);
    return json(res,status,{error:status===500?unavailable:error.message});
  }
}
export function handleImprovementRoute(url,req,res){
  const {username,repository}=params(url);
  if(url.pathname==='/api/repo-evidence'){
    if(!validUsername(username)||!repositoryIsValid(repository))
      return json(res,400,{error:'Choose a valid public GitHub repository.'});
    return respond({url,req,res,quota:evidenceQuota,cache:evidenceCache,
      operation:inspectRepositoryEvidence,warning:'Repository evidence unavailable:',
      unavailable:'Unable to inspect this repository right now.',
      quotaMessage:'Repository inspection limit reached. Please retry later.'});
  }
  if(url.pathname==='/api/readme-doctor'){
    if(!validUsername(username)||!REPOSITORY.test(repository))
      return json(res,400,{error:'Choose a valid username and repository.'});
    return respond({url,req,res,quota:doctorQuota,cache:doctorCache,
      operation:inspectPublicReadme,warning:'README Doctor error:',
      unavailable:'Could not check this README. Please retry.',
      quotaMessage:'README Doctor request limit reached. Retry later.'});
  }
  if(url.pathname==='/api/fixit'){
    if(!validUsername(username))return json(res,400,{error:'Enter a valid GitHub username.'});
    if(repository.length>100||(repository&&!REPOSITORY.test(repository)))
      return json(res,400,{error:'Choose a valid repository from the report.'});
    return respond({url,req,res,quota:fixQuota,cache:fixCache,
      operation:generateFixes,warning:'Fix-It Studio request failed:',
      unavailable:'Unable to generate suggestions right now.',
      quotaMessage:'Fix-It Studio limit reached. Please try again later.'});
  }
  return json(res,404,{error:'Page not found.'});
}
