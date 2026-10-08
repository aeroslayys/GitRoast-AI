import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImprovementPlan } from '../improvement-plan.js';
import { scoreProfile } from '../engine.js';

function sample() {
  return {
    user:{login:'student',name:'',bio:'',blog:'',url:'https://github.com/student'},
    repos:[
      {name:'needs-description',description:'',topics:[],homepage:'',pushedAt:'2025-01-01'},
      {name:'needs-demo',description:'A complete working application',topics:[],homepage:'',pushedAt:'2025-02-01'}
    ],
    projects:[
      {name:'needs-description',url:'https://github.com/student/needs-description',hasReadme:false,readmeLength:0,sections:[],pushedAt:'2025-01-01'},
      {name:'needs-demo',url:'https://github.com/student/needs-demo',hasReadme:null,readmeLength:0,sections:[],pushedAt:'2025-02-01'}
    ]
  };
}
test('coaching evidence is limited to public GitHub links and observed signals', () => {
  const analysis=scoreProfile(sample(),new Date('2026-10-08'));
  const desc=analysis.actions.find(a=>/Explain your projects/.test(a.title));
  assert.ok(desc);
  assert.equal(desc.category,'Project clarity');
  assert.equal(desc.evidence[0].url,'https://github.com/student/needs-description');
  assert.match(desc.evidence[0].detail,/lack helpful descriptions/);
  const missing=analysis.actions.find(a=>/Give your featured repo a README/.test(a.title));
  assert.ok(missing);
  assert.equal(missing.evidence[0].label,'needs-description');
  assert.ok(missing.evidence.every(e=>e.url.startsWith('https://github.com/')));
});
test('unknown README states do not become missing-README actions', () => {
  const data=sample();data.projects=data.projects.map(p=>({...p,hasReadme:null}));
  const analysis=scoreProfile(data,new Date('2026-10-08'));
  assert.ok(!analysis.actions.some(a=>/Give your featured repo a README/.test(a.title)));
  assert.match(analysis.plan.scan[2].observation,/unknown/i);
});
test('seven-day roadmap has evidence-led suggestions followed by verification and recheck', () => {
  const analysis=scoreProfile(sample(),new Date('2026-10-08'));
  assert.equal(analysis.plan.week.length,7);
  assert.deepEqual(analysis.plan.week.map(p=>p.day),[1,2,3,4,5,6,7]);
  assert.match(analysis.plan.week[6].detail,/Track/);
  assert.equal(analysis.plan.scan.length,5);
});
test('planning projections never modify the existing audit score', () => {
  const data=sample();
  const analysis=scoreProfile(data,new Date('2026-10-08'));
  assert.equal(analysis.score,analysis.categories.reduce((sum,x)=>sum+x.score,0));
  assert.ok(analysis.actions.every(a=>Number.isFinite(a.impactEstimate)&&a.impactEstimate>=0));
  assert.ok(analysis.actions.every(a=>a.impactEstimate<=analysis.categories.find(c=>c.name===a.category).max));
});
test('invalid repository labels never produce external evidence URLs', () => {
  const plan=buildImprovementPlan({
    user:{login:'valid'},repos:[{name:'unsafe/../../evil',description:''}],projects:[],
    categories:[{name:'Project clarity',max:25,score:5}],
    facts:{originalRepos:1,inspected:0,demos:0,recent180:0},
    actions:[{priority:'high',title:'Explain your projects in one sentence',why:'Unclear description',how:'Improve it',repo:'unsafe/../../evil'}]
  });
  assert.equal(plan.actions[0].evidence[0].url,'https://github.com/valid');
});
