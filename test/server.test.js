import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../server.js');

test('serves health check, homepage, stylesheet and rejects malformed names', async () => {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    const health = await fetch(url + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /GitRoast AI/);
    const fixCSS = await fetch(url + '/fixit.css');
    assert.equal(fixCSS.status, 200);
    assert.match(await fixCSS.text(), /Fix-It Studio/);
    const fixJS = await fetch(url + '/fixit.js');
    assert.equal(fixJS.status, 200);
    assert.match(await fixJS.text(), /gitroast:report/);
    const noName = await fetch(url + '/api/fixit');
    assert.equal(noName.status, 400);
    const badRepo = await fetch(url + '/api/fixit?username=student&repo=bad%2Frepo');
    assert.equal(badRepo.status, 400);
    const vista = await fetch(url + '/vista.css');
    assert.equal(vista.status, 200);
    assert.match(vista.headers.get('content-type'), /text\/css/);
    assert.match(await vista.text(), /Windows Vista Aero/);
    const aero = await fetch(url + '/aero.css');
    assert.equal(aero.status, 200);
    assert.match(await aero.text(), /Frutiger Aero/);
    const scene = await fetch(url + '/aero-landscape.svg');
    assert.equal(scene.status, 200);
    assert.match(scene.headers.get('content-type'), /image\/svg\+xml/);
    const css = await fetch(url + '/style.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    const bad = await fetch(url + '/api/analyze?username=bad%2Fname');
    assert.equal(bad.status, 400);
    const missing = await fetch(url + '/secret-path');
    assert.equal(missing.status, 404);
    const post = await fetch(url + '/api/analyze', { method: 'POST' });
    assert.equal(post.status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('complete report endpoint returns real audit structure from mocked GitHub responses', async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  globalThis.fetch = (url, options) => {
    if (!String(url).startsWith('https://api.github.com')) return originalFetch(url, options);
    const address = String(url);
    if (address.endsWith('/users/tester')) return Promise.resolve({ ok: true, json: async () => ({
      type: 'User', login: 'tester', name: 'Tester', bio: 'Learning web development', avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/tester', blog: '', followers: 3, public_repos: 1
    }) });
    if (address.includes('/users/tester/repos?')) return Promise.resolve({ ok: true, json: async () => [{
      owner: { login: 'tester' }, name: 'starter', full_name: 'tester/starter',
      html_url: 'https://github.com/tester/starter', description: 'My working small web app',
      language: 'JavaScript', stargazers_count: 1, forks_count: 0, topics: ['javascript'],
      pushed_at: '2026-09-01', homepage: '', fork: false, archived: false
    }] });
    if (address.endsWith('/readme')) return Promise.resolve({ status: 404, ok: false });
    throw new Error('Unexpected URL: ' + address);
  };
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await originalFetch('http://127.0.0.1:' + server.address().port + '/api/analyze?username=tester');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.login, 'tester');
    assert.equal(body.projects[0].hasReadme, false);
    assert.ok(body.analysis.score >= 0 && body.analysis.score <= 100);
    assert.equal(body.feedback.source, 'rules');
    assert.ok(body.analysis.actions.length > 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  }
});


test('README Doctor HTTP route returns public evidence without exposing private repositories', async () => {
  const original = globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (address,options)=>{
    const url=String(address);
    if(!url.startsWith('https://api.github.com'))return original(address,options);
    calls.push(url);
    if(url.endsWith('/repos/public-student/sample'))return {ok:true,json:async()=>({
      private:false,owner:{login:'public-student'},name:'sample',
      html_url:'https://github.com/public-student/sample',homepage:''
    })};
    if(url.endsWith('/repos/public-student/sample/readme'))return {ok:true,json:async()=>({
      encoding:'base64',content:Buffer.from('# Sample\n## Setup\nInstall as documented').toString('base64')
    })};
    if(url.endsWith('/repos/public-student/private-repo'))return {ok:true,json:async()=>({
      private:true,owner:{login:'public-student'},name:'private-repo'
    })};
    throw Error('Unexpected endpoint '+url);
  };
  const app=createApp();
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.address().port;
  try{
    const ui=await original(base+'/doctor.js');
    assert.equal(ui.status,200);
    assert.match(ui.headers.get('content-type'),/javascript/);
    assert.match(await ui.text(),/README Doctor/);
    const css=await original(base+'/doctor.css');
    assert.equal(css.status,200);
    assert.match(css.headers.get('content-type'),/css/);
    const invalid=await original(base+'/api/readme-doctor?username=bad/name&repo=sample');
    assert.equal(invalid.status,400);
    const reviewed=await original(base+'/api/readme-doctor?username=public-student&repo=sample');
    assert.equal(reviewed.status,200);
    const body=await reviewed.json();
    assert.equal(body.status,'found');
    assert.equal(body.checks.length,7);
    assert.equal(body.repository,'sample');
    const cached=await original(base+'/api/readme-doctor?username=public-student&repo=sample');
    assert.equal(cached.status,200);
    assert.equal(calls.filter(u=>u.endsWith('/repos/public-student/sample/readme')).length,1);
    const rejected=await original(base+'/api/readme-doctor?username=public-student&repo=private-repo');
    assert.equal(rejected.status,404);
    assert.equal(calls.filter(u=>u.includes('private-repo/readme')).length,0);
  }finally{
    await new Promise(resolve=>app.close(resolve));
    globalThis.fetch=original;
  }
});

test('progress recheck reads fresh public metrics and never calls Gemini',async()=>{
  const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-key-not-real';
  let counter=0;
  const calls=[];
  globalThis.fetch=async (address,options)=>{
    const url=String(address);
    if(!url.startsWith('https://api.github.com'))return original(address,options);
    calls.push(url);
    if(url.endsWith('/users/fresh-student'))return {ok:true,json:async()=>({
      type:'User',login:'fresh-student',name:'Fresh',bio:counter++?'Updated bio':'',
      avatar_url:'',html_url:'https://github.com/fresh-student',followers:0,public_repos:0
    })};
    if(url.includes('/users/fresh-student/repos?'))return {ok:true,json:async()=>[]};
    throw Error('Unexpected external request '+url);
  };
  const app=createApp();
  await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;
  try{
    const bad=await original(base+'/api/progress?username=bad%2Fuser');
    assert.equal(bad.status,400);
    const first=await original(base+'/api/progress?username=fresh-student');
    const second=await original(base+'/api/progress?username=fresh-student');
    assert.equal(first.status,200);assert.equal(second.status,200);
    const before=await first.json(),after=await second.json();
    assert.equal(before.source,'github-public-data');
    assert.equal(before.scoreVersion,1);
    assert.equal(after.scoreVersion,1);
    assert.ok(after.analysis.score>before.analysis.score);
    assert.deepEqual(after.analysis.categories.map(x=>x.name),before.analysis.categories.map(x=>x.name));
    assert.equal(calls.length,4);
    assert.ok(calls.every(u=>u.startsWith('https://api.github.com/')));
    assert.ok(!JSON.stringify(after).includes('GEMINI'));
  }finally{
    await new Promise(r=>app.close(r));
    globalThis.fetch=original;
    if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;
  }
});


test('serves every local CSS and JavaScript declared by the homepage', async () => {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    const home = await fetch(url + '/');
    assert.equal(home.status, 200);
    const html = await home.text();
    const assets = [
      ...[...html.matchAll(/<link[^>]+href="(\/[^"]+\.(?:css))"/g)].map(match => match[1]),
      ...[...html.matchAll(/<script[^>]+src="(\/[^"]+\.(?:js))"/g)].map(match => match[1])
    ];
    assert.ok(assets.includes('/workspace.css'), 'workflow styles must be loaded');
    assert.ok(assets.includes('/workspace.js'), 'workflow interactions must be loaded');
    for (const asset of assets) {
      const response = await fetch(url + asset);
      assert.equal(response.status, 200, asset + ' must be served; missing JS breaks interactive tabs');
      const contentType = response.headers.get('content-type');
      assert.match(contentType, asset.endsWith('.css') ? /text\/css/ : /(?:text|application)\/javascript/, asset);
      const content = await response.text();
      assert.ok(content.trim().length > 100, asset + ' must not return an empty page');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
