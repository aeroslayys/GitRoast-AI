import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
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
