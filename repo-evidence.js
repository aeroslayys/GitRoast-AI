// On-demand, read-only GitHub repository file-path inspection.
// Never download or execute repository code. A path is a signal, not proof.
import { ApiError, validUsername } from './engine.js';
const VALID_REPO=/^[A-Za-z0-9_.-]{1,100}$/;
const BASE='https://api.github.com';
const categories=[
  {id:'readme',label:'README',pattern:/(?:^|\/)readme(?:\.[a-z0-9]+)?$/i},
  {id:'tests',label:'Automated test files',pattern:/(?:^|\/)(?:test|tests|__tests__)\/|(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)pytest\.ini$/i},
  {id:'ci',label:'CI configuration',pattern:/^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.yml$|(?:^|\/)Jenkinsfile$/i},
  {id:'deployment',label:'Deployment configuration',pattern:/(?:^|\/)(?:Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|cloudbuild\.ya?ml|app\.yaml|vercel\.json|netlify\.toml|render\.yaml|Procfile)$|(?:^|\/)(?:terraform|k8s|kubernetes)\/[^/]+$/i},
  {id:'docs',label:'Additional documentation',pattern:/(?:^|\/)(?:CONTRIBUTING|CHANGELOG|LICENSE|SECURITY)(?:\.[a-z0-9-]+)?$|^docs?\/[^/]+\.(?:md|mdx|rst|txt)$/i}
];
const markers={
  frontend:/(?:^|\/)(?:src\/)?(?:components|pages|views)\/|(?:^|\/)(?:vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|angular\.json|index\.html|App\.[jt]sx)$/i,
  backend:/(?:^|\/)(?:server|api|routes|controllers)\/|(?:^|\/)(?:server\.[cm]?[jt]s|app\.py|main\.py|manage\.py|go\.mod)$/i,
  ai:/(?:^|\/)(?:train|training|inference|evaluate|evaluation|notebooks|models)\/|\.ipynb$|(?:^|\/)(?:train|predict|inference|eval)\.py$/i,
  devops:/(?:^|\/)(?:Dockerfile|terraform|k8s|kubernetes|cloudbuild\.ya?ml|ansible\.cfg)$|^\.github\/workflows\/[^/]+\.ya?ml$/i
};
const roles=[
  {id:'frontend',label:'Frontend developer',items:[['frontend',40],['tests',20],['ci',15],['readme',15],['deployment',10]]},
  {id:'backend',label:'Backend developer',items:[['backend',40],['tests',20],['ci',15],['readme',15],['deployment',10]]},
  {id:'fullstack',label:'Full-stack developer',items:[['frontend',25],['backend',25],['tests',15],['ci',10],['readme',15],['deployment',10]]},
  {id:'aiml',label:'AI / ML developer',items:[['ai',40],['tests',15],['readme',20],['docs',15],['ci',10]]},
  {id:'devops',label:'DevOps developer',items:[['devops',40],['ci',20],['deployment',20],['tests',10],['readme',10]]}
];
const ignore=/^(?:node_modules|vendor|dist|build|\.next|coverage|\.git)\//i;
export function analyzeRepositoryPaths(tree,repository,branch){
  if(!tree||!Array.isArray(tree.tree))throw new ApiError('Repository file listing is unavailable.',502);
  const truncated=Boolean(tree.truncated)||tree.tree.length>2000;
  const files=tree.tree.slice(0,2000).filter(f=>f.type==='blob'&&typeof f.path==='string'&&
    f.path.length<=260&&!ignore.test(f.path)&&!f.path.split('/').includes('..')).map(f=>f.path);
  const match=pattern=>files.filter(path=>pattern.test(path)).slice(0,4);
  const findings=categories.map(c=>{
    const paths=match(c.pattern);
    return {id:c.id,label:c.label,status:paths.length?'found':truncated?'unknown':'not_found',
      paths,confidence:paths.length?'medium':truncated?'low':'medium'};
  });
  const lookup=Object.fromEntries(findings.map(c=>[c.id,c]));
  for(const [id,pattern]of Object.entries(markers)){
    const paths=match(pattern);
    lookup[id]={id,label:id,paths,status:paths.length?'found':truncated?'unknown':'not_found'};
  }
  const roleResults=roles.map(role=>{
    let earned=0,assessable=0;
    const criteria=role.items.map(([id,weight])=>{
      const info=lookup[id];
      if(info.status!=='unknown')assessable+=weight;
      if(info.status==='found')earned+=weight;
      return {label:id,weight,status:info.status,paths:info.paths};
    });
    return {id:role.id,label:role.label,score:assessable?Math.round(earned/assessable*100):null,
      coverage:assessable,confidence:truncated?'low':'medium',criteria};
  });
  return {repository,branch,truncated,scannedPaths:files.length,findings,roles:roleResults,
    limitation:'Only public filenames were inspected (at most 2,000 paths). Files were not read or executed. A filename cannot prove functioning tests, CI, production deployment, technical skill or job fit. Missing paths are unknown if the GitHub tree was incomplete. Role scores are optional file-path heuristics, separate from the GitRoast portfolio score.'};
}
async function github(path){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'GitRoast-AI'};
  if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  let response;
  try{response=await fetch(BASE+path,{headers,signal:AbortSignal.timeout(10000)});}
  catch{throw new ApiError('Could not retrieve public repository evidence. Retry later.',502);}
  if(response.status===404)return null;
  if(response.status===403||response.status===429)throw new ApiError('GitHub API limit reached during inspection.',429);
  if(!response.ok)throw new ApiError('GitHub could not provide the requested repository evidence.',502);
  return response.json();
}
export async function inspectRepositoryEvidence(username,repo){
  if(!validUsername(username)||!VALID_REPO.test(repo)||repo==='.'||repo==='..')
    throw new ApiError('Choose a valid public repository.',400);
  const path='/repos/'+encodeURIComponent(username)+'/'+encodeURIComponent(repo);
  const meta=await github(path);
  if(!meta||meta.private!==false||meta.owner?.login?.toLowerCase()!==username.toLowerCase()||
    meta.name?.toLowerCase()!==repo.toLowerCase())
    throw new ApiError('Public repository not found.',404);
  if(!meta.default_branch||typeof meta.default_branch!=='string')throw new ApiError('No public default branch found.',502);
  const branch=meta.default_branch;
  const tree=await github(path+'/git/trees/'+encodeURIComponent(branch)+'?recursive=1');
  if(!tree)throw new ApiError('Public repository tree is not available.',502);
  return analyzeRepositoryPaths(tree,meta.name,branch);
}
