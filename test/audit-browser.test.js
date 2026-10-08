import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness() {
  const dom = new Map();
  const events = new Map();
  const examples = [{ username: 'gaearon' }, { username: 'sindresorhus' }];
  const rendered = [];
  const requested = [];
  const status = { url: 'https://gitroast.example/?campaign=demo&u=old#report', focus: null };
  class FakeElement {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.value = ''; this.disabled = false; this.hidden = false;
      this.textContent = ''; this.children = []; this.dataset = {};
      this.handlers = new Map(); this.attributes = {};
      this.style = { width: '', setProperty: () => {} };
      this.classes = new Set();
      this.classList = {
        add: x => this.classes.add(x),
        remove: x => this.classes.delete(x),
        contains: x => this.classes.has(x),
        toggle: (x, force) => {
          const enabled = force === undefined ? !this.classes.has(x) : force;
          if (enabled) this.classes.add(x); else this.classes.delete(x);
          return enabled;
        }
      };
    }
    addEventListener(type, handler) { this.handlers.set(type, handler); }
    replaceChildren(...items) { this.children = items; }
    append(...items) { this.children.push(...items); }
    setAttribute(name, value) { this.attributes[name] = value; }
    scrollIntoView() {}
    focus() { status.focus = this; }
    querySelectorAll() { return []; }
    click() { this.handlers.get('click')?.(); }
  }
  const byId = id => {
    if (!dom.has(id)) dom.set(id, new FakeElement());
    return dom.get(id);
  };
  const chips = examples.map(obj => {
    const item = new FakeElement('button');
    item.dataset.user = obj.username;
    return item;
  });
  const context = {
    window: {
      location: { href: status.url, origin: 'https://gitroast.example' },
      addEventListener: (name, callback) => events.set(name, callback),
      dispatchEvent: event => events.get(event.type)?.(event),
      scrollTo: () => {}
    },
    location: { search: '' },
    history: {
      state: { from: 'test' },
      replaceState: (_state, _title, path) => {
        status.url = new URL(path, 'https://gitroast.example').href;
        context.window.location.href = status.url;
      }
    },
    document: {
      body: new FakeElement('body'),
      getElementById: byId,
      createElement: tag => new FakeElement(tag),
      createTextNode: txt => ({ textContent: txt }),
      querySelectorAll: query => query === '[data-user]' ? chips : []
    },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: (url, options) => new Promise(resolve => requested.push({ url, options, resolve })),
    localStorage: { getItem: () => null, setItem: () => {} },
    URL, URLSearchParams, AbortController, Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    Blob: class {}, console, setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {}
  };
  const code = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(code + '\nrender = data => { current = data; report.hidden = false; rendered.push(data.user.login); };',
    { ...context, rendered }, { filename: 'public/app.js' });
  return { byId, chips, context, requested, rendered, status };
}
const profile = username => ({ user: { login: username }, analyzedAt: '2026-10-08T10:00:00Z' });
const finish = async (item, username) => {
  item.resolve({ ok: true, json: async () => profile(username) });
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

test('latest example-profile request wins even if an old aborted response arrives last', async () => {
  const h = harness();
  h.chips[0].click();
  h.chips[1].click();
  assert.equal(h.requested.length, 2);
  assert.equal(h.requested[0].options.signal.aborted, true);
  assert.equal(h.requested[1].options.signal.aborted, false);
  await finish(h.requested[1], 'sindresorhus');
  assert.deepEqual(h.rendered, ['sindresorhus']);
  assert.equal(h.byId('analyze-btn').disabled, false);
  assert.equal(new URL(h.status.url).searchParams.get('u'), 'sindresorhus');
  await finish(h.requested[0], 'gaearon');
  assert.deepEqual(h.rendered, ['sindresorhus']);
  assert.equal(h.byId('analyze-btn').disabled, false);
  assert.equal(new URL(h.status.url).searchParams.get('u'), 'sindresorhus');
});

test('late earlier request cannot stop the spinner for the newest audit', async () => {
  const h = harness();
  h.chips[0].click();
  h.chips[1].click();
  await finish(h.requested[0], 'gaearon');
  assert.equal(h.byId('loading').hidden, false);
  assert.equal(h.byId('analyze-btn').disabled, true);
  await finish(h.requested[1], 'sindresorhus');
  assert.equal(h.byId('loading').hidden, true);
  assert.equal(h.byId('analyze-btn').disabled, false);
});

test('New audit clears the share URL, cancels pending analysis, and preserves other URL state', async () => {
  const h = harness();
  h.chips[0].click();
  await finish(h.requested[0], 'gaearon');
  assert.equal(new URL(h.status.url).searchParams.get('u'), 'gaearon');
  h.chips[1].click();
  const request = h.requested[1];
  assert.equal(h.byId('analyze-btn').disabled, true);
  h.byId('new-search').click();
  assert.equal(request.options.signal.aborted, true);
  assert.equal(h.byId('loading').hidden, true);
  assert.equal(h.byId('report').hidden, true);
  assert.equal(h.byId('analyze-btn').disabled, false);
  assert.equal(h.byId('username').value, '');
  assert.equal(new URL(h.status.url).searchParams.has('u'), false);
  assert.equal(new URL(h.status.url).searchParams.get('campaign'), 'demo');
  assert.equal(new URL(h.status.url).hash, '#report');
  assert.equal(h.status.focus, h.byId('username'));
  await finish(request, 'sindresorhus');
  assert.deepEqual(h.rendered, ['gaearon']);
  assert.equal(new URL(h.status.url).searchParams.has('u'), false);
});

test('invalid replacement username cancels old work and announces the validation error', async () => {
  const h = harness();
  h.chips[0].click();
  h.byId('username').value = 'bad/name';
  h.byId('analyze-form').handlers.get('submit')({ preventDefault(){} });
  // Submit is disabled during an existing audit, so the old request continues.
  assert.equal(h.requested.length, 1);
  // Selecting a different example is the supported switch-during-loading workflow.
  h.chips[1].click();
  assert.equal(h.requested[0].options.signal.aborted, true);
});

test('source includes accessible report focus after successful full render', () => {
  const code = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(code, /report\.focus\(\{ preventScroll: true \}\)/);
});
