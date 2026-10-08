import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('evidence tool is mounted under Improve and keeps score untouched',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/evidence.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/evidence.css',import.meta.url),'utf8');
 for(const id of ['repo-evidence','evidence-inspect','evidence-results','evidence-role',
   'evidence-findings','evidence-limitation','score-policy-list']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/src="\/evidence\.js"/);
 assert.match(html,/href="\/evidence\.css"/);
 assert.match(js,/gitroast:report/);
 assert.match(js,/gitroast:reset/);
 assert.match(js,/\/api\/repo-evidence/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
 assert.doesNotMatch(js,/(?:score-number|score-gauge)\s*\)/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check','public/evidence.js'],
   {cwd:new URL('..',import.meta.url),stdio:'pipe'}));
});
