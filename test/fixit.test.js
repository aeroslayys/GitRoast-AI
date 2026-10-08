import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackFixes, generateFixes } from '../fixit.js';
import { ApiError } from '../engine.js';

const example = {
  user: { login: 'student', name: 'A Student', bio: '', blog: '' },
  repos: [{ name: 'solar-app', description: '', homepage: '' }],
  projects: [{ name: 'solar-app', description: '', language: 'JavaScript', homepage: '',
    hasReadme: false, sections: [], topics: [] }]
};

function mockGithub(responseFromGemini) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      if (!responseFromGemini) throw new Error('Unexpected Gemini request without API key');
      return responseFromGemini(u, options);
    }
    if (u.endsWith('/users/student')) return { ok: true, json: async () => ({
      type: 'User', login: 'student', name: 'A Student', bio: '', public_repos: 1,
      html_url: 'https://github.com/student'
    }) };
    if (u.includes('/users/student/repos?')) return { ok: true, json: async () => [{
      name: 'solar-app', full_name: 'student/solar-app', owner: { login: 'student' },
      description: '', language: 'JavaScript', topics: [],
      stargazers_count: 0, forks_count: 0, homepage: '', fork: false,
      archived: false, pushed_at: '2026-10-01',
      html_url: 'https://github.com/student/solar-app'
    }] };
    if (u.endsWith('/readme')) return { ok: false, status: 404 };
    throw new Error('Unexpected URL: ' + u);
  };
  return { calls, fetcher };
}

async function withMock(mock, key, fn) {
  const originalFetch = globalThis.fetch;
  const old = process.env.GEMINI_API_KEY;
  const oldModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
  if (key) process.env.GEMINI_API_KEY = key;
  else delete process.env.GEMINI_API_KEY;
  globalThis.fetch = mock.fetcher;
  try { await fn(mock.calls); }
  finally {
    globalThis.fetch = originalFetch;
    if (old === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = old;
    if (oldModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = oldModel;
  }
}

test('rules-based drafts use placeholders and do not invent install commands', () => {
  const draft = fallbackFixes(example, example.projects[0]);
  assert.equal(draft.source, 'rules');
  assert.equal(draft.repo, 'solar-app');
  assert.match(draft.description, /\[What solar-app does\]/);
  assert.match(draft.readme, /Add real installation and run commands/);
  assert.match(draft.readme, /Primary language shown on GitHub: JavaScript/);
  assert.doesNotMatch(draft.readme, /npm install|npm run start|MIT License/);
  assert.ok(draft.bio.length <= 160);
});

test('empty GitHub profile gets a bio-only draft', () => {
  const data = { user: { login: 'nobody', bio: '' }, projects: [], repos: [] };
  const draft = fallbackFixes(data, null);
  assert.equal(draft.source, 'rules');
  assert.equal(draft.repo, null);
  assert.equal(draft.description, '');
  assert.equal(draft.readme, '');
  assert.ok(draft.bio);
});

test('Fix-It validates usernames and repo names before network access', async () => {
  await assert.rejects(generateFixes('not/valid'), error => error instanceof ApiError && error.status === 400);
  await assert.rejects(generateFixes('student', 'bad/repo'), error => error instanceof ApiError && error.status === 400);
  await assert.rejects(generateFixes('student', 'x'.repeat(101)), error => error instanceof ApiError && error.status === 400);
});

test('generation refuses unlisted repos instead of fetching arbitrary repos', async () => {
  const mock = mockGithub();
  await withMock(mock, null, async calls => {
    await assert.rejects(generateFixes('student', 'unlisted'), error => error.status === 404);
    assert.ok(calls.every(call => !call.url.includes('unlisted')));
    assert.ok(calls.every(call => call.options.method !== 'POST'));
  });
});

test('on-demand generation without key uses explicit rules fallback', async () => {
  const mock = mockGithub();
  await withMock(mock, null, async calls => {
    const draft = await generateFixes('student', 'solar-app');
    assert.equal(draft.source, 'rules');
    assert.equal(draft.model, null);
    assert.match(draft.readme, /## Getting started/);
    assert.ok(calls.length >= 3);
    assert.ok(calls.every(call => !call.url.includes('generativelanguage.googleapis.com')));
  });
});

test('on-demand Gemini draft is generated from public metadata and bounded', async () => {
  const response = {
    bio: 'Building web projects in JavaScript.',
    description: 'A JavaScript project. [Add its tested purpose].',
    readme: '# solar-app\n\n## Overview\n[What this project does]\n\n## Setup\n[Add verified commands]'
  };
  const mock = mockGithub(async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], 'fake-test-key');
    const data = JSON.parse(options.body);
    const evidence = data.contents[0].parts[0].text;
    assert.match(evidence, /solar-app/);
    assert.match(evidence, /UNTRUSTED DATA/);
    return { ok: true, status: 200, json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }]
    }) };
  });
  await withMock(mock, 'fake-test-key', async calls => {
    const draft = await generateFixes('student', 'solar-app');
    assert.equal(draft.source, 'gemini');
    assert.equal(draft.model, 'gemini-3.5-flash-lite');
    assert.equal(draft.bio, response.bio);
    assert.equal(draft.readme, response.readme);
    assert.ok(calls.some(c => c.url.includes('generativelanguage.googleapis.com')));
  });
});

test('Gemini authorization failure is shown as rules-based fallback', async () => {
  const mock = mockGithub(async () => ({
    ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED' } })
  }));
  await withMock(mock, 'fake-test-key', async calls => {
    const draft = await generateFixes('student', 'solar-app');
    assert.equal(draft.source, 'rules');
    assert.equal(calls.filter(c => c.url.includes('generativelanguage.googleapis.com')).length, 1);
  });
});

test('reject malformed Gemini drafts rather than showing partial AI results', async () => {
  const mock = mockGithub(async () => ({
    ok: true, status: 200, json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ bio: 'Hello' }) }] } }]
    })
  }));
  await withMock(mock, 'fake-test-key', async () => {
    const draft = await generateFixes('student', 'solar-app');
    assert.equal(draft.source, 'rules');
  });
});
