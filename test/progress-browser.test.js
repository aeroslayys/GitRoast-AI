import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const makeAudit=(username,score,time='2026-10-08T08:00:00.000Z')=>({
  username,analyzedAt:time,scoreVersion:1,
  analysis:{
    score,
    categories:[
      {name:'Profile basics',score:score>=20?20:0,max:20},
      {name:'Project clarity',score:10,max:25},
      {name:'Documentation',score:10,max:30},
      {name:'Recent work',score:5,max:15},
      {name:'Discoverability',score:5,max:10}
    ],
    facts:{
      originalRepos:2,described:score>=20?2:1,tagged:1,
      demos:0,readmes:1,thoroughReadmes:0,recent365:1
    }
  }
});

test('progress history saves baseline, rechecks fresh data and keeps usernames separate',async()=>{
  const events=new Map(),dom=new Map(),store=new Map(),requests=[];
  let confirmAnswer=false;
  class Element{
    constructor(){this.disabled=false;this.hidden=false;this.value='';this.textContent='';
      this.children=[];this.dataset={};this.style={};this.attrs={};this.handlers=new Map();}
    addEventListener(n,cb){this.handlers.set(n,cb);}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    setAttribute(k,v){this.attrs[k]=v;}
  }
  const byId=id=>{if(!dom.has(id))dom.set(id,new Element());return dom.get(id);};
  const baseline=makeAudit('student',30);
  const updated=makeAudit('student',40,'2026-10-15T08:00:00.000Z');
  const context={
    window:{addEventListener:(k,fn)=>events.set(k,fn),confirm:()=>confirmAnswer},
    document:{getElementById:byId,createElement:()=>new Element()},
    localStorage:{
      getItem:key=>store.get(key)??null,
      setItem:(key,v)=>store.set(key,v),
      removeItem:key=>store.delete(key)
    },
    navigator:{clipboard:{writeText:async()=>{}}},
    fetch:async url=>{
      requests.push(String(url));
      return {ok:true,json:async()=>updated};
    },
    AbortController,URLSearchParams,Date,Math,Number,JSON,Object,Map,String,Array,
    setTimeout,clearTimeout,console
  };
  const js=readFileSync(new URL('../public/progress.js',import.meta.url),'utf8');
  runInNewContext(js,context,{filename:'public/progress.js'});
  assert.equal(byId('progress-save').disabled,true);
  events.get('gitroast:report')({detail:baseline});
  assert.equal(byId('progress-save').disabled,false);
  assert.equal(byId('progress-refresh').disabled,true);
  byId('progress-save').handlers.get('click')();
  assert.equal(byId('progress-refresh').disabled,false);
  assert.equal(byId('progress-before-score').textContent,'30 / 100');
  assert.equal(byId('progress-comparison').hidden,true);
  assert.ok(store.has('gitroast-progress-v1-student'));
  const saved=store.get('gitroast-progress-v1-student');
  await byId('progress-refresh').handlers.get('click')();
  assert.equal(byId('progress-after-score').textContent,'40 / 100');
  assert.equal(byId('progress-delta').textContent,'+10 pts');
  assert.equal(byId('progress-comparison').hidden,false);
  assert.equal(byId('progress-category-list').children.length,5);
  assert.equal(byId('progress-facts').children.length,7);
  assert.deepEqual(requests,['/api/progress?username=student']);
  // Re-running the original cached audit must not destroy the saved baseline/last recheck.
  events.get('gitroast:report')({detail:baseline});
  assert.equal(byId('progress-after-score').textContent,'40 / 100');
  assert.notEqual(store.get('gitroast-progress-v1-student'),saved);
  // Replacing a baseline requires confirmation.
  byId('progress-save').handlers.get('click')();
  assert.equal(byId('progress-after-score').textContent,'40 / 100');
  events.get('gitroast:report')({detail:makeAudit('different-user',30)});
  assert.equal(byId('progress-refresh').disabled,true);
  assert.equal(byId('progress-results').hidden,true);
  events.get('gitroast:report')({detail:baseline});
  assert.equal(byId('progress-after-score').textContent,'40 / 100');
  events.get('gitroast:reset')();
  assert.equal(byId('progress-save').disabled,true);
});
