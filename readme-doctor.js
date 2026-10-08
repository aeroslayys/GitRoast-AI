// README Doctor inspects one public README, not the repository source code.
import { ApiError, validUsername } from './engine.js';

const tips = [
  { id:'overview', title:'What this project does', priority:'high',
    fix:'Explain what the project does, who it helps, and why it exists in two or three sentences.' },
  { id:'features', title:'Implemented features', priority:'medium',
    fix:'List only features that actually work, not features you hope to add later.' },
  { id:'setup', title:'Setup instructions', priority:'high',
    fix:'Give visitors tested prerequisites and exact steps to install and run the project.' },
  { id:'usage', title:'Usage example', priority:'high',
    fix:'Add a walkthrough or a real command/example demonstrating how the project is used.' },
  { id:'visuals', title:'Screenshot or demo', priority:'medium',
    fix:'Include a real screenshot or a working demo link that shows the project in action.' },
  { id:'status', title:'Current status', priority:'low',
    fix:'Say what works today, what is incomplete, and what you would build next.' },
  { id:'license', title:'License information', priority:'low',
    fix:'Mention the actual license, or clarify that you have not chosen one yet.' }
];
const meaningful = (s, min=35) => s.replace(/!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|[\W_]/g,' ').replace(/\s+/g,' ').trim().length >= min;
const hasTitle = (s, re) => re.test(s.title);

export function reviewReadme(markdown, options={}) {
  const state=options.status || 'found';
  if (!['found','missing','unavailable'].includes(state)) throw new TypeError('Invalid README status');
  const source=typeof markdown==='string'?markdown.slice(0,50000):'';
  const sectionParts=source.split(/^#{1,4}\s+/m).slice(1);
  const section=sectionParts.map(chunk=>{
    const n=chunk.indexOf('\n');
    return {title:(n<0?chunk:chunk.slice(0,n)).trim(),body:n<0?'':chunk.slice(n+1)};
  });
  const get=re=>section.find(s=>hasTitle(s,re));
  const overview=get(/^(about|overview|introduction|purpose|description|what is|what does|why)\b/i);
  const features=get(/^(features?|highlights?|capabilities)\b/i);
  const setup=get(/^(install|installation|setup|getting started|quick ?start|prerequisites?|requirements?)\b/i);
  const usage=get(/^(usage|how to use|examples?|running|tutorial|instructions?)\b/i);
  const statusSection=get(/^(project status|current status|development status|status|roadmap|todo|known issues?|limitations?|development|next steps?)\b/i);
  const license=get(/^(license|licensing|copyright)\b/i);
  const codeExample=/\x60{3}[\s\S]{6,}?\x60{3}/.test(source)||/^\s{4,}\S/m.test(source);
  const visuals=/!\[[^\]]*\]\([^)]+\)|<img\b[^>]*src=|<video\b/i.test(source);
  const demo=/(?:\[(?:live demo|demo|preview|try it|website)\]\(https?:\/\/[^)]+\))/i.test(source)
    || /^https?:\/\//i.test(options.homepage||'');
  const opening=source.split(/^#{1,4}\s+/m)[0]+(section[0]?.body||'');
  const presence=[
    [overview ? (meaningful(overview.body)?'found':'improve') : meaningful(opening,85)?'found':'missing',
      overview?'Overview heading checked.':'No explanatory overview detected.'],
    [features ? (meaningful(features.body,22)?'found':'improve') : 'missing',
      features?'Feature section checked.':'No feature section detected.'],
    [setup ? (codeExample?'found':'improve'):'missing',
      setup?(codeExample?'Setup heading and code block detected; commands are not verified.':'Setup heading found, but no code example detected.'):'No setup heading detected.'],
    [usage ? (codeExample || meaningful(usage.body,55)?'found':'improve'):'missing',
      usage?'Usage heading and supporting content checked.':'No usage heading detected.'],
    [visuals || demo ? 'found':'missing',
      visuals?'Embedded screenshot or visual detected.':demo?'Demo URL detected.':'No embedded visual or clearly labeled demo detected.'],
    [statusSection ? (meaningful(statusSection.body,20)?'found':'improve'):'missing',
      statusSection?'Project status heading checked.':'No status/roadmap section detected.'],
    [license ? (meaningful(license.body,8)?'found':'improve'):'missing',
      license?'License heading checked.':'No license heading detected in this README.']
  ];
  const checks=tips.map((info,index)=>{
    const [status,evidence]=presence[index];
    return {...info,
      state:state==='missing'?'missing':state==='unavailable'?'unknown':status==='missing'&&options.truncated?'unknown':status,
      evidence:state==='missing'?'No README was found.':state==='unavailable'?'Could not inspect README text.':evidence};
  });
  const found=checks.filter(x=>x.state==='found').length;
  const missing=checks.filter(x=>['missing','improve'].includes(x.state));
  return {
    status:state,truncated:Boolean(options.truncated),signalsFound:found,signalsTotal:checks.length,
    checks, nextFix:state==='missing'?'Create a README.md with an overview, setup steps, and usage instructions.':
      state==='unavailable'?'Retry when the README becomes available.':
      missing.find(x=>x.priority==='high')?.fix || missing[0]?.fix ||
      'Your README contains all seven sampled documentation signals. Verify that the content is accurate.',
    limitation:'Heuristic checks on public README content only. Headings and examples are not proof the project runs, and this is not a code-quality score.'
  };
}

async function readGithub(path,optional=false) {
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'GitRoast-AI'};
  if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  let response;
  try{response=await fetch('https://api.github.com'+path,{headers,signal:AbortSignal.timeout(10000)});}
  catch{throw new ApiError('Could not reach GitHub. Retry later.',502);}
  if(optional && response.status===404)return null;
  if(response.status===404)throw new ApiError('Public repository not found.',404);
  if([403,429].includes(response.status))throw new ApiError('GitHub API rate limit reached.',429);
  if(!response.ok)throw new ApiError('GitHub returned an error ('+response.status+').',502);
  return response.json();
}

export async function inspectPublicReadme(username,repository) {
  if(!validUsername(username)||typeof repository!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(repository))
    throw new ApiError('Choose a valid GitHub username and repository.',400);
  const path='/repos/'+encodeURIComponent(username)+'/'+encodeURIComponent(repository);
  const metadata=await readGithub(path);
  // Never allow optional backend GitHub credentials to expose a private repository.
  if(metadata.private!==false || metadata.owner?.login?.toLowerCase()!==username.toLowerCase())
    throw new ApiError('Only public repositories can be inspected.',404);
  const details={username,repository:metadata.name,repositoryUrl:metadata.html_url};
  let file;
  try{file=await readGithub(path+'/readme',true);}
  catch(error){if(error.status===429)throw error;
    return {...details,...reviewReadme('',{status:'unavailable'})};}
  if(!file)return {...details,...reviewReadme('',{status:'missing'})};
  if(file.encoding!=='base64'||typeof file.content!=='string')
    return {...details,...reviewReadme('',{status:'unavailable'})};
  const bytes=Buffer.from(file.content.replace(/\s/g,''),'base64');
  return {...details,...reviewReadme(bytes.subarray(0,50000).toString('utf8'),
    {status:'found',truncated:bytes.length>50000,homepage:metadata.homepage||''})};
}
