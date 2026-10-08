import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('README Doctor unlocks after report and resets with new audit',()=>{
  const events=new Map(),dom=new Map();
  class Element {
    constructor(){this.textContent='';this.value='';this.disabled=false;this.hidden=false;
      this.children=[];this.dataset={};this.attrs={};this.style={};this.handlers=new Map();}
    addEventListener(name,cb){this.handlers.set(name,cb);}
    replaceChildren(...children){this.children=children;}
    append(child){this.children.push(child);}
    setAttribute(key,value){this.attrs[key]=value;}
    scrollIntoView(){}
    dispatchEvent(evt){this.handlers.get(evt.type)?.(evt);}
  }
  const byId=id=>{if(!dom.has(id))dom.set(id,new Element());return dom.get(id);};
  const context={document:{getElementById:byId,createElement:()=>new Element()},
    window:{addEventListener:(name,cb)=>events.set(name,cb)},
    Option:class{constructor(text,value){this.text=text;this.value=value;}},
    Event:class{constructor(type){this.type=type;}},
    navigator:{clipboard:{writeText:async()=>{}}},
    console,URLSearchParams,AbortController,setTimeout,clearTimeout};
  const js=readFileSync(new URL('../public/doctor.js',import.meta.url),'utf8');
  runInNewContext(js,context,{filename:'public/doctor.js'});
  assert.equal(byId('doctor-check').disabled,true);
  events.get('gitroast:report')({detail:{username:'student',projects:[
    {name:'good-repo',hasReadme:true,readmeLength:1700},
    {name:'missing-readme',hasReadme:false,readmeLength:0}
  ]}});
  assert.equal(byId('doctor-check').disabled,false);
  assert.equal(byId('doctor-repo').value,'missing-readme');
  assert.equal(byId('doctor-repo').children.length,2);
  events.get('gitroast:reset')();
  assert.equal(byId('doctor-check').disabled,true);
  assert.equal(byId('doctor-results').hidden,true);
});
