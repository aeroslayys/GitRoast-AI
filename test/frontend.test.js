import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const aero = readFileSync(new URL('../public/aero.css', import.meta.url), 'utf8');
const vista = readFileSync(new URL('../public/vista.css', import.meta.url), 'utf8');
test('feedback provenance visible in report', () => {
  for (const id of ['source-banner','source-title','source-description','source-tag','feedback-method','ai-badge']) {
    assert.match(html, new RegExp('id="'+id+'"'));
  }
  assert.match(js, /data\.feedback\.source === 'gemini'/);
  assert.match(js, /rules-based feedback/i);
  assert.match(style, /\.source-banner\[data-mode="rules"\]/);
});
test('functional share and checklist progress controls', () => {
  for(const id of ['share-report','action-progress','action-progress-fill','action-progress-label','toast']) {
    assert.match(html, new RegExp('id="'+id+'"'));
  }
  assert.match(js, /share-report'\)\.addEventListener/);
  assert.match(js, /updateActionProgress\(\)/);
  assert.match(js, /Feedback source:/);
});

test('Frutiger Aero redesign is loaded and responsive', () => {
  assert.match(html, /href="\/aero\.css"/);
  assert.match(html, /Make your code/);
  assert.match(aero, /\.source-banner\[data-mode="gemini"\]/);
  assert.match(aero, /\.aero-bubble/);
  assert.match(aero, /@media\s*\(max-width:\s*640px\)/);
  assert.match(aero, /prefers-reduced-motion/);
});

test('soft mist theme remains Aero but uses subdued colors', () => {
  assert.match(aero, /Frutiger Aero • Soft Mist Edition/);
  assert.match(aero, /#b7d0d6/);
  assert.match(aero, /\.source-banner\[data-mode="rules"\]/);
});

test('Vista Aero styling has readable typography and clear glass UI', () => {
  assert.match(html, /href="\/vista\.css"/);
  assert.match(html, /vista-window-controls/);
  assert.match(vista, /Segoe UI/);
  assert.match(vista, /font-size:\s*16px/);
  assert.match(vista, /\.source-banner\[data-mode="gemini"\]/);
  assert.match(vista, /\.source-banner\[data-mode="rules"\]/);
  assert.match(vista, /@media\s*\(max-width:\s*640px\)/);
  assert.match(vista, /prefers-reduced-motion/);
});

test('process cards show compact Vista icons and readable text', () => {
  const icons = html.match(/class="feature-icon" aria-hidden="true"/g) || [];
  assert.equal(icons.length, 3);
  assert.match(vista, /Vista process card refinement/);
  assert.match(vista, /display:inline-grid/);
  assert.match(vista, /width:58px/);
  assert.match(vista, /\.feature-card p\s*\{[\s\S]*?font-size:16px/);
});
