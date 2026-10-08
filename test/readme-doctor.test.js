import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewReadme,inspectPublicReadme } from '../readme-doctor.js';

test('complete README reports seven documentation signals',()=>{
  const text='# App\n## Overview\nA useful app that helps people explore music collections and visualize sound over time.\n'+
  '## Features\n- Music player\n- Artist info\n## Installation\n'+'Command example:\n'+
  '\x60\x60\x60sh\nnpm install\nnpm start\n\x60\x60\x60\n'+
  '## Usage\nRun the app and select a folder to begin playing a track.\n'+
  '## Demo\n![Preview](screenshot.png)\n'+
  '## Project status\nThe app works locally; cloud sync is planned.\n'+
  '## License\nLicensed under MIT.\n';
  const result=reviewReadme(text);
  assert.equal(result.status,'found');
  assert.equal(result.signalsFound,7);
  assert.ok(result.checks.every(c=>c.state==='found'));
});
test('no README is missing rather than erroneously present',()=>{
  const result=reviewReadme('',{status:'missing'});
  assert.equal(result.signalsFound,0);
  assert.equal(result.checks.length,7);
  assert.ok(result.checks.every(c=>c.state==='missing'));
});
test('unknown README status is not falsely presented as missing',()=>{
  const result=reviewReadme('',{status:'unavailable'});
  assert.equal(result.signalsFound,0);
  assert.ok(result.checks.every(c=>c.state==='unknown'));
});
test('thin README gets concrete advice but not a fake hiring score',()=>{
  const result=reviewReadme('# App\nHello world');
  assert.ok(result.checks.some(c=>c.id==='setup'&&c.state==='missing'));
  assert.match(result.nextFix,/install|run|Explain/i);
  assert.match(result.limitation,/not a code-quality score/);
});
test('a heading alone does not count as complete setup',()=>{
  const result=reviewReadme('# App\n## Installation\nTODO\n');
  assert.equal(result.checks.find(c=>c.id==='setup').state,'improve');
});
test('truncated samples do not claim undetected sections are missing',()=>{
  const result=reviewReadme('# App',{truncated:true});
  assert.equal(result.checks.find(c=>c.id==='setup').state,'unknown');
});
test('READMEs in public repos fetched with real GitHub endpoint pattern',async()=>{
  const original=globalThis.fetch;
  const body='# Demo\n## Overview\nThis describes a genuine project clearly, with a real goal and intended audience.';
  const urls=[];
  globalThis.fetch=async url=>{
    urls.push(String(url));
    if(String(url).endsWith('/repos/student/music-app')) return {ok:true,json:async()=>({
      private:false,owner:{login:'student'},name:'music-app',html_url:'https://github.com/student/music-app'
    })};
    if(String(url).endsWith('/repos/student/music-app/readme'))return {ok:true,json:async()=>({
      encoding:'base64',content:Buffer.from(body).toString('base64')
    })};
    throw Error('Unexpected: '+url);
  };
  try {
    const x=await inspectPublicReadme('student','music-app');
    assert.equal(x.repository,'music-app');
    assert.equal(x.status,'found');
    assert.equal(urls.length,2);
  }finally{globalThis.fetch=original;}
});
test('private repo content is never fetched even with an available token',async()=>{
  const original=globalThis.fetch;const urls=[];
  globalThis.fetch=async url=>{urls.push(String(url));return {ok:true,json:async()=>({
    private:true,owner:{login:'student'},name:'private'
  })}};
  try{await assert.rejects(()=>inspectPublicReadme('student','private'),/Only public/);
    assert.equal(urls.length,1);}finally{globalThis.fetch=original;}
});
