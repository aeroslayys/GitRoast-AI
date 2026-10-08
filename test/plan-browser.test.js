import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness() {
  const nodes=new Map(), listeners=new Map();
  class Element {
    constructor(tag='div') {
      this.tag=tag; this.children=[]; this.handlers=new Map();this.attrs={};
      this.textContent='';this.value=0;this.checked=false;this.href='';
    }
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(k,fn){this.handlers.set(k,fn);}
    get lastChild(){return this.children[this.children.length-1];}
  }
  const el=id=>{
    if(!nodes.has(id))nodes.set(id,new Element());
    return nodes.get(id);
  };
  const context={
    document:{getElementById:el,createElement:tag=>new Element(tag)},
    window:{addEventListener:(name,fn)=>listeners.set(name,fn)}
  };
  const code=readFileSync(new URL('../public/plan.js',import.meta.url),'utf8');
  runInNewContext(code,context,{filename:'public/plan.js'});
  return {el,listeners};
}
test('preview caps selected estimates within the available score category points',()=>{
  const {el,listeners}=harness();
  listeners.get('gitroast:report')({detail:{analysis:{
    score:80,
    categories:[{name:'Profile basics',score:10,max:20},{name:'Documentation',score:30,max:30}],
    actions:[
      {title:'Write a real GitHub bio',category:'Profile basics',impactEstimate:7},
      {title:'Add a portfolio or LinkedIn link',category:'Profile basics',impactEstimate:7}
    ],
    plan:{
      scan:[{time:'0–5s',title:'Identity',observation:'Bio missing'}],
      week:[{day:1,title:'Update profile',detail:'Write a bio',evidence:[]}],
      estimateDisclaimer:'Illustrative only'
    }
  }}});
  assert.equal(el('plan-score-current').textContent,'80 / 100');
  assert.equal(el('plan-score-preview').textContent,'80 / 100');
  const rows=el('plan-selection-list').children;
  rows[0].children[0].checked=true;
  rows[0].children[0].handlers.get('change')();
  assert.equal(el('plan-score-preview').textContent,'87 / 100');
  rows[1].children[0].checked=true;
  rows[1].children[0].handlers.get('change')();
  assert.equal(el('plan-score-preview').textContent,'90 / 100');
  assert.equal(el('plan-score-meter').value,90);
  assert.equal(el('recruiter-scan-list').children.length,1);
  assert.equal(el('plan-week-list').children.length,1);
  listeners.get('gitroast:reset')();
  assert.equal(el('plan-selection-list').children.length,0);
  assert.equal(el('plan-score-preview').textContent,'—');
});
test('source links only permit validated public GitHub destinations',()=>{
  const {el,listeners}=harness();
  listeners.get('gitroast:report')({detail:{analysis:{
    score:30,categories:[],actions:[],
    plan:{scan:[],estimateDisclaimer:'',week:[{
      day:1,title:'Check source',detail:'Proof',
      evidence:[
        {url:'https://github.com/student/project',label:'Project'},
        {url:'javascript:alert(1)',label:'Unsafe'}
      ]
    }]}
  }}});
  const row=el('plan-week-list').children[0];
  const evidence=row.children[1].children[2];
  assert.equal(evidence.children.length,2);
  assert.equal(evidence.children[1].href,'https://github.com/student/project');
});
