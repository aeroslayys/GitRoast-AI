import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRepositoryPaths, inspectRepositoryEvidence } from '../repo-evidence.js';
import { scoreProfile } from '../engine.js';
import { explainScore, SCORE_POLICY } from '../score-explain.js';
import { validateFeedback } from '../ai-guardrails.js';
import { createApp } from '../server.js';

const fixture={
  user:{login:'demo',name:'Demo',bio:'',blog:''},
  repos:[{name:'app',description:'',topics:[],homepage:'',pushedAt:'2026-10-01'}],
  projects:[{name:'app',hasReadme:null,sections:[],readmeLength:0}]
};
const fileList=[
  'README.md','src/components/Dashboard.jsx','server/routes/index.js',
  'test/main.test.js','.github/workflows/test.yml','Dockerfile','docs/architecture.md'
];
test('exact rubric explanation reproduces every category and does not reward popularity',()=>{
  const data={...fixture,user:{...fixture.user,followers:100000},
    projects:[{name:'app',hasReadme:true,readmeLength:500,sections:['Usage']}]};
  const result=scoreProfile(data,new Date('2026-10-08'));
  for(const category of result.categories){
    const description=result.scoreDetails.find(d=>d.name===category.name);
    assert.ok(description);
    assert.equal(description.signals.reduce((total,p)=>total+p.earned,0),category.score);
    assert.equal(description.signals.reduce((total,p)=>total+p.max,0),category.max);
  }
  assert.ok(SCORE_POLICY.some(s=>/followers/.test(s)));
  assert.equal(scoreProfile({...data,user:{...data.user,followers:0}},new Date('2026-10-08')).score,result.score);
  assert.equal(explainScore(data,result.categories,new Date('2026-10-08')).length,5);
});
test('unknown README remains unknown in detailed explanation',()=>{
  const result=scoreProfile(fixture,new Date('2026-10-08'));
  const doc=result.scoreDetails.find(c=>c.name==='Documentation');
  assert.match(doc.limitation,/unavailable/i);
  assert.match(doc.signals[0].evidence,/unknown/);
});
test('Gemini guardrails reject fabricated code checks and unverifiable hiring predictions',()=>{
  const good={headline:'Improve visibility',verdict:'Add setup steps to help reviewers.',
    roast:'The README needs more personality.',kind:'The projects are a strong starting point.',
    nextStep:'Describe what your project does.'};
  assert.equal(validateFeedback(good),true);
  assert.equal(validateFeedback({...good,verdict:'I ran your code and verified it passes.'}),false);
  assert.equal(validateFeedback({...good,verdict:'You will get hired next week.'}),false);
  assert.equal(validateFeedback({...good,headline:'x'.repeat(66)}),false);
  assert.equal(validateFeedback({...good,kind:''}),false);
  assert.equal(validateFeedback({...good,roast:'You are stupid.'}),false);
});
test('repository file evidence is path-only and never claims execution',()=>{
  const data=analyzeRepositoryPaths({truncated:false,tree:fileList.map(path=>({path,type:'blob'}))},'app','main');
  assert.equal(data.repository,'app');
  assert.equal(data.scannedPaths,fileList.length);
  assert.ok(data.findings.every(x=>x.status==='found'));
  assert.equal(data.roles.length,5);
  assert.ok(data.roles.every(r=>r.coverage===100));
  assert.match(data.limitation,/not.*executed/i);
  assert.ok(!JSON.stringify(data).includes('file contents'));
});
test('truncated listing preserves unknown when evidence is absent',()=>{
  const result=analyzeRepositoryPaths({truncated:true,tree:[{path:'README.md',type:'blob'}]},'app','main');
  assert.equal(result.findings.find(x=>x.id==='tests').status,'unknown');
  assert.equal(result.findings.find(x=>x.id==='readme').status,'found');
  const role=result.roles.find(x=>x.id==='frontend');
  assert.ok(role.coverage<100);
  assert.equal(role.confidence,'low');
});
test('private and owner-mismatched repositories cannot trigger tree inspection',async()=>{
  const old=globalThis.fetch;
  for(const meta of [
    {private:true,owner:{login:'demo'},name:'secret',default_branch:'main'},
    {private:false,owner:{login:'someone-else'},name:'secret',default_branch:'main'}
  ]){
    const calls=[];
    globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>meta};};
    try{await assert.rejects(()=>inspectRepositoryEvidence('demo','secret'),{status:404});
      assert.equal(calls.length,1);assert.ok(!calls[0].includes('/git/trees/'));}
    finally{globalThis.fetch=old;}
  }
});
test('public repository inspector fetches only metadata and file paths',async()=>{
  const old=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{
    const path=String(url);calls.push(path);
    if(path.endsWith('/repos/demo/app'))return {ok:true,json:async()=>({
      private:false,owner:{login:'demo'},name:'app',default_branch:'main'})};
    if(path.includes('/git/trees/main?recursive=1'))return {ok:true,json:async()=>({
      truncated:false,tree:fileList.map(p=>({type:'blob',path:p}))})};
    throw new Error('Unexpected request '+path);
  };
  try{
    const result=await inspectRepositoryEvidence('demo','app');
    assert.equal(result.repository,'app');assert.equal(result.findings[0].status,'found');
    assert.equal(calls.length,2);
    await assert.rejects(()=>inspectRepositoryEvidence('demo','../private'),{status:400});
  }finally{globalThis.fetch=old;}
});
test('public path inspector HTTP route is validated, read-only and JSON',async()=>{
  const old=globalThis.fetch,calls=[];
  globalThis.fetch=async (url,options)=>{
    const path=String(url);
    if(!path.startsWith('https://api.github.com'))return old(url,options);
    calls.push(path);
    if(path.endsWith('/repos/evidence-demo/open-project'))return {ok:true,json:async()=>({
      private:false,owner:{login:'evidence-demo'},name:'open-project',default_branch:'main'})};
    if(path.includes('/git/trees/main?recursive=1'))return {ok:true,json:async()=>({
      tree:[{path:'README.md',type:'blob'},{path:'Dockerfile',type:'blob'}],truncated:false})};
    throw new Error('Unexpected GitHub request');
  };
  const app=createApp();
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.address().port;
  try{
    const bad=await old(base+'/api/repo-evidence?username=../bad&repo=whatever');
    assert.equal(bad.status,400);
    const response=await old(base+'/api/repo-evidence?username=evidence-demo&repo=open-project');
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.repository,'open-project');assert.equal(body.findings.length,5);
    assert.ok(!JSON.stringify(body).includes('GITHUB_TOKEN'));
    const repeat=await old(base+'/api/repo-evidence?username=evidence-demo&repo=open-project');
    assert.equal(repeat.status,200);
    assert.equal(calls.length,2);
    for(const file of ['/evidence.js','/evidence.css']){
      const response=await old(base+file);assert.equal(response.status,200);
    }
  }finally{
    await new Promise(resolve=>app.close(resolve));globalThis.fetch=old;
  }
});
