import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseProject, templateFixes, generateFixes } from '../fixer.js';

const fixture = {
  user: { login: 'student', name: 'Student Developer', bio: '' },
  projects: [{
    name: 'music-app', url: 'https://github.com/student/music-app',
    description: '', language: 'JavaScript', homepage: '',
    hasReadme: false, sections: [], topics: ['javascript']
  }]
};
const key = 'test-key-that-is-not-real';

test('template drafts use evidence, placeholders and fit GitHub limits', () => {
  const result = templateFixes(fixture, fixture.projects[0]);
  assert.equal(result.source, 'rules');
  assert.ok(result.suggestions.bio.length <= 160);
  assert.ok(result.suggestions.description.length <= 350);
  assert.match(result.suggestions.description, /\[What/);
  assert.match(result.suggestions.readme, /## Getting started/);
  assert.match(result.suggestions.readme, /Do not invent commands/);
  assert.match(result.suggestions.readme, /JavaScript/);
});
test('empty portfolios still get a generic template without false specifics', () => {
  const result = templateFixes({ user: { login: 'newbie' }, projects: [] });
  assert.equal(result.repository, null);
  assert.match(result.suggestions.readme, /Your next project/);
  assert.match(result.suggestions.description, /\[Project name\]/);
});
test('repo selection only accepts featured projects', () => {
  assert.equal(chooseProject(fixture, 'music-app').name, 'music-app');
  assert.equal(chooseProject(fixture, ''), fixture.projects[0]);
  assert.throws(() => chooseProject(fixture, '../secrets'), /valid repository/);
  assert.throws(() => chooseProject(fixture, 'other'), /featured repository/);
});
async function mockGemini(run, callback) {
  const fetchOriginal = globalThis.fetch;
  const old = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL,
    backup: process.env.GEMINI_BACKUP_MODEL };
  process.env.GEMINI_API_KEY = key;
  process.env.GEMINI_MODEL = 'primary-test-model';
  process.env.GEMINI_BACKUP_MODEL = 'backup-test-model';
  globalThis.fetch = callback;
  try { await run(); }
  finally {
    globalThis.fetch = fetchOriginal;
    for (const [env, value] of [['GEMINI_API_KEY', old.key], ['GEMINI_MODEL', old.model],
      ['GEMINI_BACKUP_MODEL', old.backup]]) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
  }
}
const good = { bio: 'Exploring public projects', description: 'An editable public project description',
  readme: '# Music App\n\n## Features\n[Describe real features]\n\n## Installation\n[Commands]\n\n## Usage\n[Usage]' };
const ok = () => ({ ok: true, json: async () => ({ candidates: [{ content: {
  parts: [{ text: JSON.stringify(good) }] } }] }) });
const bad = status => ({ ok: false, status });
test('Gemini mode returns source and model only on a valid complete draft', async () => {
  await mockGemini(async () => {
    const result = await generateFixes(fixture, fixture.projects[0]);
    assert.equal(result.source, 'gemini');
    assert.equal(result.model, 'primary-test-model');
    assert.equal(result.suggestions.bio, good.bio);
  }, async () => ok());
});
test('503 errors retry then switch to backup Gemini model', async () => {
  const calls = [];
  await mockGemini(async () => {
    const result = await generateFixes(fixture, fixture.projects[0]);
    assert.equal(result.source, 'gemini');
    assert.equal(result.model, 'backup-test-model');
    assert.equal(calls.length, 3);
  }, async url => {
    calls.push(String(url));
    return calls.length <= 2 ? bad(503) : ok();
  });
});
test('403 and malformed model output do not masquerade as AI', async () => {
  await mockGemini(async () => {
    const result = await generateFixes(fixture, fixture.projects[0]);
    assert.equal(result.source, 'rules');
  }, async () => bad(403));
  await mockGemini(async () => {
    const result = await generateFixes(fixture, fixture.projects[0]);
    assert.equal(result.source, 'rules');
  }, async () => ({ ok: true, json: async () => ({ candidates: [{ content: {
    parts: [{ text: JSON.stringify({ bio: 'Only one field' }) }] } }] }) }));
});
