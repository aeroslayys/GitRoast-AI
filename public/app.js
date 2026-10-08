'use strict';
const byId = id => document.getElementById(id);
const form = byId('analyze-form');
const input = byId('username');
const submitButton = byId('analyze-btn');
const errorBox = byId('form-error');
const loading = byId('loading');
const report = byId('report');
let current = null;
let tone = 'roast';
let ticker = null;
let toastTimer = null;

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}
function empty(element) { element.replaceChildren(); }
function safeGithubLink(url, text, className = '') {
  const anchor = node('a', className, text);
  const allowed = /^https:\/\/github\.com\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9_.-]+)?\/?$/;
  anchor.href = allowed.test(url || '') ? url : 'https://github.com';
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}
function formatNumber(value) { return Number(value || 0).toLocaleString('en-US'); }
function setText(id, text) { byId(id).textContent = text == null ? '' : String(text); }
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }
function showLoading() {
  loading.hidden = false;
  report.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Analyzing…';
  const steps = ['Fetching public GitHub data...', 'Examining featured README files...',
    'Calculating transparent portfolio signals...', 'Preparing recruiter feedback...'];
  let i = 0;
  setText('loading-message', steps[0]);
  clearInterval(ticker);
  ticker = setInterval(() => { i = (i + 1) % steps.length; setText('loading-message', steps[i]); }, 3200);
  loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function stopLoading() {
  clearInterval(ticker);
  loading.hidden = true;
  submitButton.disabled = false;
  submitButton.replaceChildren(document.createTextNode('Roast my GitHub '), node('span', '', '↗'));
}
function renderProfile(data) {
  const area = byId('profile-content'); empty(area);
  const header = node('div', 'profile-main');
  const photo = node('img', 'profile-avatar');
  photo.src = /^https:\/\/avatars\.githubusercontent\.com\//.test(data.user.avatar || '') ? data.user.avatar : '';
  photo.alt = 'GitHub avatar for ' + data.user.login;
  photo.width = 75; photo.height = 75;
  const identity = node('div');
  identity.append(node('h3', '', data.user.name || data.user.login),
    safeGithubLink(data.user.url, '@' + data.user.login + ' ↗'));
  header.append(photo, identity);
  const bio = node('p', 'profile-bio', data.user.bio || 'No bio yet. Your next one-liner could make a difference.');
  const stats = node('div', 'profile-stats');
  const points = [
    [data.analysis.facts.originalRepos, 'Original repos'],
    [data.user.followers, 'Followers'],
    [data.analysis.facts.recent365, 'Active this year']
  ];
  for (const [value, label] of points) {
    const block = node('div'); block.append(node('strong', '', formatNumber(value)), node('small', '', label)); stats.append(block);
  }
  area.append(header, bio, stats);
}
function renderScore(data) {
  const { score, label, categories } = data.analysis;
  setText('score-number', score);
  setText('score-label', label);
  setText('score-badge', score >= 80 ? 'LOOKING SHARP' : score >= 60 ? 'ON THE RIGHT TRACK' : score >= 40 ? 'KEEP IMPROVING' : 'START HERE');
  byId('score-gauge').style.setProperty('--progress', score + '%');
  const area = byId('breakdown-list'); empty(area);
  for (const category of categories) {
    const item = node('div', 'breakdown-item');
    const meta = node('div', 'breakdown-meta');
    meta.append(node('span', '', category.name), node('em', '', category.score + '/' + category.max));
    const track = node('div', 'breakdown-bar');
    const bar = node('span');
    bar.style.width = Math.max(0, Math.min(100, category.score / category.max * 100)) + '%';
    track.append(bar);
    item.append(meta, track, node('div', 'breakdown-note', category.note));
    area.append(item);
  }
}
function updateTone() {
  if (!current) return;
  setText('feedback-quote', '“' + current.feedback[tone] + '”');
  for (const option of ['roast', 'kind']) {
    const button = byId('tone-' + option);
    button.classList.toggle('active', option === tone);
    button.setAttribute('aria-pressed', String(option === tone));
  }
}
function showFeedbackSource(data) {
  const isGemini = data.feedback.source === 'gemini';
  byId('source-banner').dataset.mode = isGemini ? 'gemini' : 'rules';
  setText('source-icon', isGemini ? '✳' : '✓');
  setText('source-tag', isGemini ? '● GEMINI ACTIVE' : '◉ DATA-BASED MODE');
  setText('source-title', isGemini ? 'Gemini generated your review.' : 'This report uses rules-based feedback.');
  setText('source-description', isGemini
    ? 'The verdict, roast and coaching below were generated by Google Gemini from your public GitHub data. Your portfolio score is always calculated from transparent rules.'
    : 'Gemini did not generate this response. Your verdict and roast come from grounded, rules-based feedback instead. The GitHub audit and score still work normally.');
  const modelName = typeof data.feedback.model === 'string' ? data.feedback.model : '';
  setText('feedback-method', isGemini
    ? '✳ GENERATED BY GEMINI' + (modelName ? ' · ' + modelName : '') + '  /  SCORE: RULES-BASED'
    : '✓ NO GENERATIVE AI USED  /  SCORE: RULES-BASED');
  setText('ai-badge', isGemini ? '✳ GEMINI AI' : '✓ RULES ENGINE');
  byId('ai-badge').dataset.mode = isGemini ? 'gemini' : 'rules';
}
function renderFeedback(data) {
  setText('feedback-headline', data.feedback.headline);
  setText('feedback-verdict', data.feedback.verdict);
  setText('feedback-next', data.feedback.nextStep);
  showFeedbackSource(data);
  tone = 'roast'; updateTone();
}
function updateActionProgress() {
  const boxes = [...byId('action-list').querySelectorAll('.action-check')];
  const done = boxes.filter(box => box.checked).length;
  const percent = boxes.length ? Math.round(done / boxes.length * 100) : 0;
  setText('action-progress-label', done + ' / ' + boxes.length + ' fixed');
  byId('action-progress-fill').style.width = percent + '%';
  byId('action-progress').setAttribute('aria-valuenow', String(percent));
}
function renderActions(data) {
  const area = byId('action-list'); empty(area);
  const key = 'gitroast-checklist-' + data.user.login.toLowerCase();
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(saved)) saved = []; }
  catch { saved = []; }
  for (const [index, action] of data.analysis.actions.entries()) {
    const item = node('div', 'action-item');
    const check = node('input', 'action-check');
    check.type = 'checkbox';
    check.id = 'action-' + index;
    check.checked = saved.includes(action.title);
    item.classList.toggle('done', check.checked);
    check.setAttribute('aria-label', 'Mark complete: ' + action.title);
    check.addEventListener('change', () => {
      item.classList.toggle('done', check.checked);
      const checked = [...area.querySelectorAll('input:checked')].map(el => el.dataset.title);
      try { localStorage.setItem(key, JSON.stringify(checked)); } catch {}
      updateActionProgress();
    });
    check.dataset.title = action.title;
    const content = node('div', 'action-content');
    const heading = node('div', 'action-title');
    const label = node('label', '', action.title);
    label.htmlFor = check.id;
    heading.append(label, node('span', 'priority ' + action.priority, action.priority));
    content.append(heading, node('div', 'action-why', action.why), node('div', 'action-how', '↗ ' + action.how));
    if (action.repo) content.append(node('span', 'action-repo', 'REPO: ' + action.repo));
    item.append(check, content); area.append(item);
  }
  updateActionProgress();
}
function renderRepos(data) {
  const area = byId('repo-list'); empty(area);
  setText('repo-count', data.projects.length + ' SAMPLED');
  if (!data.projects.length) { area.append(node('p', 'empty-repos', 'No original public repositories to feature yet. Ship one and rerun your report.')); return; }
  for (const p of data.projects) {
    const item = node('div', 'repo-item');
    item.append(safeGithubLink(p.url, p.name + ' ↗', 'repo-name'));
    item.append(node('p', 'repo-description', p.description || 'No description provided.'));
    const tags = node('div', 'repo-tags');
    if (p.language) tags.append(node('span', 'repo-tag language', p.language));
    tags.append(node('span', 'repo-tag', '★ ' + formatNumber(p.stars)));
    const readmeStatus = p.hasReadme === null ? 'README unknown' : p.hasReadme ? '✓ README found' : '✕ No README';
    tags.append(node('span', 'repo-tag ' + (p.hasReadme === null ? '' : p.hasReadme ? 'readme-yes' : 'readme-no'), readmeStatus));
    if (p.homepage) {
      try { const target = new URL(p.homepage); if (target.protocol === 'https:' || target.protocol === 'http:') {
        const link = node('a', 'repo-tag readme-yes', '↗ Live demo');
        link.href = target.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; tags.append(link);
      }} catch {}
    }
    item.append(tags); area.append(item);
  }
}
function reportText(data) {
  const a = data.analysis;
  return [
    'GITROAST AI — GITHUB PROFILE AUDIT',
    'GitHub: https://github.com/' + data.user.login,
    'Audit: ' + data.analyzedAt,
    'Score: ' + a.score + '/100 (' + a.label + ')',
    'Feedback source: ' + (data.feedback.source === 'gemini' ? 'Gemini AI' + (data.feedback.model ? ' (' + data.feedback.model + ')' : '') : 'Rules-based fallback (no AI-generated text)'),
    '', 'RECRUITER VERDICT', data.feedback.verdict,
    '', 'THE ROAST', data.feedback.roast,
    '', 'SCORE BREAKDOWN', ...a.categories.map(c => '- ' + c.name + ': ' + c.score + '/' + c.max),
    '', 'YOUR ACTION PLAN', ...a.actions.map((action, i) => (i + 1) + '. [' + action.priority.toUpperCase() + '] ' + action.title + '\n   Why: ' + action.why + '\n   Fix: ' + action.how),
    '', a.disclaimer,
    'Made with GitRoast AI'
  ].join('\n');
}
function render(data) {
  current = data;
  renderProfile(data); renderScore(data); renderFeedback(data); renderActions(data); renderRepos(data);
  setText('report-subtitle', 'Reviewing @' + data.user.login + '  ·  ' + new Date(data.analyzedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
  setText('report-disclaimer', data.analysis.disclaimer + (data.capped ? ' Only the first 300 public repositories were scanned.' : '') +
    ' Audited on ' + new Date(data.analyzedAt).toLocaleDateString() + '.');
  report.hidden = false;
  window.dispatchEvent(new CustomEvent('gitroast:report', { detail: { username: data.user.login,
    analyzedAt: data.analyzedAt,
    scoreVersion: 1,
    analysis: {
      score: data.analysis.score,
      categories: data.analysis.categories.map(({name, score, max}) => ({name, score, max})),
      facts: data.analysis.facts
    },
    projects: data.projects.map(p => ({ name: p.name, description: p.description,
      hasReadme: p.hasReadme, readmeLength: p.readmeLength })) } }));
  report.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function analyze(username) {
  clearError();
  if (!/^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    showError('Please enter a valid GitHub username (letters, numbers and single hyphens).'); return;
  }
  showLoading();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let response;
    try { response = await fetch('/api/analyze?username=' + encodeURIComponent(username), { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not analyze that account.');
    render(body);
    history.replaceState(null, '', '?u=' + encodeURIComponent(body.user.login));
  } catch (error) {
    showError(error.name === 'AbortError' ? 'That took too long. Please try again.' : error.message || 'Something went wrong.');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally { stopLoading(); }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (submitButton.disabled) return;
  analyze(input.value.trim());
});
document.querySelectorAll('[data-user]').forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.user;
  analyze(input.value);
}));
byId('tone-roast').addEventListener('click', () => { tone = 'roast'; updateTone(); });
byId('tone-kind').addEventListener('click', () => { tone = 'kind'; updateTone(); });
byId('new-search').addEventListener('click', () => {
  report.hidden = true; current = null; clearError(); input.focus();
  window.dispatchEvent(new Event('gitroast:reset'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
byId('share-report').addEventListener('click', async () => {
  if (!current) return;
  const link = new URL('/', window.location.origin);
  link.searchParams.set('u', current.user.login);
  try {
    await navigator.clipboard.writeText(link.href);
    showToast('Share link copied to clipboard');
  } catch {
    showToast('Could not copy link. Try copying the address bar.');
  }
});
byId('copy-report').addEventListener('click', async () => {
  if (!current) return;
  const button = byId('copy-report');
  try { await navigator.clipboard.writeText(reportText(current)); button.textContent = '✓ Copied!'; showToast('Audit summary copied'); }
  catch { button.textContent = 'Copy unavailable'; }
  setTimeout(() => { button.textContent = '↗ Copy summary'; }, 2200);
});
byId('download-report').addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([reportText(current)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = node('a'); link.href = url; link.download = 'gitroast-' + current.user.login + '.txt';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Text report downloaded');
});
const sharedUsername = new URLSearchParams(location.search).get('u');
if (sharedUsername && /^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(sharedUsername)) {
  input.value = sharedUsername;
  analyze(sharedUsername);
}
