import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Minimal browser DOM simulator, with no third-party dependencies.
test('Fix-It Studio unlocks when a GitHub audit is rendered', () => {
  const events = new Map();
  const controls = new Map();
  class FakeElement {
    constructor() {
      this.textContent = '';
      this.value = '';
      this.disabled = false;
      this.hidden = false;
      this.children = [];
      this.dataset = {};
      this.handlers = new Map();
    }
    replaceChildren(...nodes) { this.children = nodes; }
    append(node) { this.children.push(node); }
    addEventListener(name, callback) { this.handlers.set(name, callback); }
    scrollIntoView() {}
  }
  const byId = id => {
    if (!controls.has(id)) controls.set(id, new FakeElement());
    return controls.get(id);
  };
  const context = {
    window: { addEventListener: (name, callback) => events.set(name, callback) },
    document: { getElementById: byId, querySelectorAll: () => [] },
    Option: class { constructor(label, value) { this.text = label; this.value = value; } },
    navigator: { clipboard: { writeText: async () => {} } },
    console, setTimeout, clearTimeout, AbortController, URL, Blob
  };
  const script = readFileSync(new URL('../public/fixit.js', import.meta.url), 'utf8');
  runInNewContext(script, context, { filename: 'public/fixit.js' });
  assert.equal(byId('fixit-generate').disabled, true);
  assert.equal(byId('fixit-repo').children[0].text, 'Run a profile audit first');

  events.get('gitroast:report')({ detail: {
    username: 'student',
    projects: [
      { name: 'documented-app', description: 'A public web app', hasReadme: true },
      { name: 'needs-help', description: '', hasReadme: false }
    ]
  } });
  assert.equal(byId('fixit-repo').disabled, false);
  assert.equal(byId('fixit-generate').disabled, false);
  assert.deepEqual(byId('fixit-repo').children.map(item => item.value),
    ['documented-app', 'needs-help']);
  assert.equal(byId('fixit-repo').value, 'needs-help');

  events.get('gitroast:reset')();
  assert.equal(byId('fixit-generate').disabled, true);
  assert.equal(byId('fixit-repo').children[0].text, 'Run a profile audit first');

  events.get('gitroast:report')({ detail: { username: 'starter', projects: [] } });
  assert.equal(byId('fixit-repo').disabled, true);
  assert.equal(byId('fixit-generate').disabled, false); // Bio-only drafting remains possible.
});
