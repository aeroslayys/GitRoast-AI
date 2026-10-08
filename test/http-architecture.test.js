import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, requestIdentity } from '../server.js';
import { requestIdentity as trustedIdentity } from '../http/request-identity.js';
import { handleProfileRoute } from '../http/profile-routes.js';
import { handleImprovementRoute } from '../http/improvement-routes.js';

test('server retains the same public interface after route extraction', () => {
  assert.equal(requestIdentity, trustedIdentity);
  assert.equal(typeof createApp, 'function');
  assert.equal(typeof handleProfileRoute, 'function');
  assert.equal(typeof handleImprovementRoute, 'function');
});

test('unknown API paths stay 404 and methods other than GET stay 405', async () => {
  const server=createApp();
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const missing=await fetch(base+'/api/unknown');
    assert.equal(missing.status,404);
    assert.match(missing.headers.get('content-type'),/json/);
    assert.equal((await missing.json()).error,'Page not found.');
    const post=await fetch(base+'/api/analyze',{method:'POST'});
    assert.equal(post.status,405);
    assert.match(post.headers.get('content-security-policy'),/script-src 'self'/);
    const homepage=await fetch(base+'/');
    assert.equal(homepage.status,200);
    assert.match(homepage.headers.get('content-type'),/html/);
  }finally {
    await new Promise(done=>server.close(done));
  }
});
