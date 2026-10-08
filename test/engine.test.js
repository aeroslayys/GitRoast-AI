import test from 'node:test';
import assert from 'node:assert/strict';
import { validUsername, scoreProfile, fallbackFeedback, collectProfile } from '../engine.js';

const fixture = {
  user: { login: 'dev', name: 'Dev', bio: 'I make useful apps', blog: 'https://example.org' },
  repos: ['a', 'b', 'c'].map(name => ({ name, description: 'An interesting working application',
    topics: ['web'], homepage: 'https://example.org', pushedAt: '2026-09-15' })),
  projects: ['a', 'b', 'c'].map(name => ({ name, hasReadme: true, readmeLength: 600,
    sections: ['Installation', 'Usage'] }))
};

test('GitHub usernames are validated', () => {
  for (const valid of ['a', 'hello-world', 'aeroslayys']) assert.equal(validUsername(valid), true);
  for (const invalid of ['', '-bad', 'bad-', 'a--b', 'not/valid', 'not valid', 'a'.repeat(41)]) assert.equal(validUsername(invalid), false);
});

test('well-documented profile scores highly and scores add up', () => {
  const result = scoreProfile(fixture, new Date('2026-10-08'));
  assert.ok(result.score >= 90);
  assert.equal(result.score, result.categories.reduce((sum, x) => sum + x.score, 0));
  assert.equal(result.facts.readmes, 3);
});

test('empty portfolio gets honest, actionable feedback', () => {
  const empty = { user: { login: 'beginner', name: '', bio: '', blog: '' }, repos: [], projects: [] };
  const result = scoreProfile(empty, new Date('2026-10-08'));
  assert.equal(result.score, 0);
  assert.ok(result.actions.some(a => a.title.includes('Ship')));
  assert.match(fallbackFeedback(empty, result).roast, /ship/i);
});

test('unknown README state is not mislabeled missing', () => {
  const data = { ...fixture, projects: [{ name: 'a', hasReadme: null, readmeLength: 0, sections: [] }] };
  const result = scoreProfile(data, new Date('2026-10-08'));
  assert.equal(result.facts.inspected, 0);
  assert.equal(result.facts.readmes, 0);
  assert.ok(!result.actions.some(a => /Give your featured repo a README/.test(a.title)));
});

test('GitHub collection requests real data with mocked HTTP fetch', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).endsWith('/users/demo')) return { ok: true, json: async () => ({
      type: 'User', login: 'demo', name: 'Demo', bio: 'Hello', avatar_url: '', html_url: 'https://github.com/demo', public_repos: 1
    }) };
    if (String(url).includes('/repos?')) return { ok: true, json: async () => [{
      name: 'repo', full_name: 'demo/repo', owner: { login: 'demo' }, description: 'Demo project', html_url: 'https://github.com/demo/repo',
      stargazers_count: 2, topics: [], pushed_at: '2026-09-01', fork: false, archived: false
    }] };
    if (String(url).endsWith('/readme')) return { ok: true, json: async () => ({ content: Buffer.from('# Demo\n## Installation\nRun it').toString('base64') }) };
    throw new Error('Unexpected request: ' + url);
  };
  try {
    const data = await collectProfile('demo');
    assert.equal(data.repos.length, 1);
    assert.equal(data.projects[0].hasReadme, true);
    assert.deepEqual(data.projects[0].sections, ['Demo', 'Installation']);
    assert.equal(calls.length, 3);
  } finally { globalThis.fetch = original; }
});
