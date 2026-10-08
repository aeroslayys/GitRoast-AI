import test from 'node:test';
import assert from 'node:assert/strict';
import { aiFeedback, scoreProfile } from '../engine.js';

const fixture = {
  user: { login: 'demo', bio: 'Making useful projects', name: 'Demo', blog: '' },
  repos: [{ name: 'app', description: 'A working interactive app', pushedAt: '2026-10-01', topics: [], homepage: '' }],
  projects: [{ name: 'app', description: 'A working interactive app', hasReadme: true,
    readmeLength: 500, sections: ['Usage'], language: 'JavaScript' }]
};
const good = {
  headline: 'A promising portfolio',
  verdict: 'Your GitHub projects show potential.',
  roast: 'Your README is wearing an invisibility cloak.',
  kind: 'Keep documenting your progress.',
  nextStep: 'Add screenshots to the README.'
};
const mockResponse = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body
});
const ok = () => mockResponse(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] });
const error = status => mockResponse(status, { error: { status: status === 503 ? 'UNAVAILABLE' : 'PERMISSION_DENIED' } });

async function mockGemini(callback, fn) {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  const oldModel = process.env.GEMINI_MODEL;
  const oldBackup = process.env.GEMINI_BACKUP_MODEL;
  process.env.GEMINI_API_KEY = 'test-dummy-key-never-real';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
  process.env.GEMINI_BACKUP_MODEL = 'gemini-3.1-flash-lite';
  globalThis.fetch = callback;
  try { return await fn(); } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries({
      GEMINI_API_KEY: oldKey, GEMINI_MODEL: oldModel, GEMINI_BACKUP_MODEL: oldBackup
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Gemini success sets source to gemini and uses configured primary model', async () => {
  const calls = [];
  await mockGemini(async url => { calls.push(String(url)); return ok(); }, async () => {
    const report = await aiFeedback(fixture, scoreProfile(fixture));
    assert.equal(report.source, 'gemini');
    assert.equal(report.headline, good.headline);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /gemini-3\.5-flash-lite/);
  });
});

test('transient 503 retries then uses backup model', async () => {
  const calls = [];
  await mockGemini(async url => {
    calls.push(String(url));
    return calls.length <= 2 ? error(503) : ok();
  }, async () => {
    const report = await aiFeedback(fixture, scoreProfile(fixture));
    assert.equal(report.source, 'gemini');
    assert.equal(calls.length, 3);
    assert.match(calls[0], /gemini-3\.5-flash-lite/);
    assert.match(calls[1], /gemini-3\.5-flash-lite/);
    assert.match(calls[2], /gemini-3\.1-flash-lite/);
  });
});

test('invalid credentials do not retry or use backup', async () => {
  const calls = [];
  await mockGemini(async url => { calls.push(String(url)); return error(403); }, async () => {
    const report = await aiFeedback(fixture, scoreProfile(fixture));
    assert.equal(report.source, 'rules');
    assert.equal(calls.length, 1);
  });
});

test('same primary and backup model is still attempted', async () => {
  await mockGemini(async () => ok(), async () => {
    process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
    const report = await aiFeedback(fixture, scoreProfile(fixture));
    assert.equal(report.source, 'gemini');
  });
});
