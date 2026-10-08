import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('Review, Improve, Track switch without losing shared repo selection',()=>{
  const events=new Map(),elements=new Map();
  class Element {
    constructor(){
      this.value='';this.disabled=false;this.hidden=false;this.children=[];
      this.attrs={};this.handlers=new Map();this.tabIndex=0;
      this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};
    }
    addEventListener(type,callback){this.handlers.set(type,callback);}
    setAttribute(key,value){this.attrs[key]=value;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    dispatchEvent(event){this.handlers.get(event.type)?.(event);}
    focus(){this.focused=true;}
    scrollIntoView(){}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const context={
    document:{getElementById:el},
    window:{
      addEventListener:(event,callback)=>events.set(event,callback),
      location:{hash:''}
    },
    Option:class{constructor(text,value){this.text=text;this.value=value;}},
    Event:class{constructor(type){this.type=type;}},
    console
  };
  const code=readFileSync(new URL('../public/workspace.js',import.meta.url),'utf8');
  runInNewContext(code,context,{filename:'public/workspace.js'});
  assert.equal(el('audit-review').hidden,false);
  assert.equal(el('audit-improve').hidden,true);
  assert.equal(el('audit-track').hidden,true);
  const doctor=el('doctor-repo'),fixit=el('fixit-repo');
  doctor.disabled=false;fixit.disabled=false;
  doctor.value='documented';fixit.value='documented';
  events.get('gitroast:report')({detail:{username:'student',projects:[
    {name:'documented',description:'A sample',hasReadme:true},
    {name:'needs-readme',description:'',hasReadme:false}
  ]}});
  assert.equal(el('workshop-repo').value,'needs-readme');
  assert.equal(doctor.value,'needs-readme');
  assert.equal(fixit.value,'needs-readme');
  assert.equal(el('readme-doctor').hidden,false);
  assert.equal(el('fixit-studio').hidden,true);
  el('audit-tab-improve').handlers.get('click')();
  assert.equal(el('audit-improve').hidden,false);
  assert.equal(el('audit-review').hidden,true);
  assert.equal(el('audit-tab-improve').attrs['aria-selected'],'true');
  el('workshop-tab-write').handlers.get('click')();
  assert.equal(el('readme-doctor').hidden,true);
  assert.equal(el('fixit-studio').hidden,false);
  assert.equal(el('workshop-tab-write').attrs['aria-selected'],'true');
  el('workshop-repo').value='documented';
  el('workshop-repo').handlers.get('change')();
  assert.equal(doctor.value,'documented');
  assert.equal(fixit.value,'documented');
  el('audit-tab-track').handlers.get('click')();
  assert.equal(el('audit-track').hidden,false);
  assert.equal(el('audit-improve').hidden,true);
  el('audit-tab-improve').handlers.get('keydown')({
    key:'Home',preventDefault(){this.prevented=true;}
  });
  assert.equal(el('audit-review').hidden,false);
  events.get('gitroast:workshop-tool')({detail:{tool:'write'}});
  assert.equal(el('audit-improve').hidden,false);
  assert.equal(el('fixit-studio').hidden,false);
  events.get('gitroast:reset')();
  assert.equal(el('workshop-repo').disabled,true);
  assert.equal(el('audit-review').hidden,false);
  assert.equal(el('workshop-tab-check').disabled,true);
});

test('profiles without featured projects still offer bio writing',()=>{
  const events=new Map(),elements=new Map();
  class Element {
    constructor(){this.disabled=false;this.hidden=false;this.value='';this.handlers=new Map();
      this.attrs={};this.children=[];}
    addEventListener(n,cb){this.handlers.set(n,cb);}
    setAttribute(k,v){this.attrs[k]=v;}
    replaceChildren(...items){this.children=items;}
    append(item){this.children.push(item);}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const context={
    document:{getElementById:el},
    window:{addEventListener:(n,cb)=>events.set(n,cb),location:{hash:''}},
    Option:class{constructor(text,value){this.text=text;this.value=value;}},
    Event:class{constructor(type){this.type=type;}}
  };
  runInNewContext(readFileSync(new URL('../public/workspace.js',import.meta.url),'utf8'),context);
  events.get('gitroast:report')({detail:{username:'new-user',projects:[]}});
  assert.equal(el('workshop-repo').disabled,true);
  assert.equal(el('workshop-tab-check').disabled,true);
  assert.equal(el('fixit-studio').hidden,false);
  assert.equal(el('readme-doctor').hidden,true);
  el('audit-tab-improve').handlers.get('click')();
  assert.equal(el('audit-improve').hidden,false);
});
