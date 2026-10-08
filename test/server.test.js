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
