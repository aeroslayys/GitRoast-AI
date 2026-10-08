'use strict';
// Evidence-linked planning and an optional projection. This never edits the audited score.
(() => {
  const byId = id => document.getElementById(id);
  const element = (tag, className, content) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  const safeLink = (source, label) => {
    const a = element('a', 'plan-evidence-link', label);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}(?:\/[A-Za-z0-9_.-]{1,100})?\/?$/.test(source || '')) return null;
    a.href = source;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };
  function showEvidence(container, entries) {
    if (!Array.isArray(entries) || !entries.length) return;
    const line = element('div', 'plan-evidence');
    line.append(element('span', '', 'Evidence: '));
    for (const source of entries) {
      const link = safeLink(source.url, source.label + ' ↗');
      if (link) line.append(link);
    }
    container.append(line);
  }
  function showScan(scan) {
    const list = byId('recruiter-scan-list');
    list.replaceChildren();
    for (const item of scan) {
      const row = element('li', 'scan-step');
      row.append(element('strong', 'scan-time', item.time), element('div', 'scan-details'));
      row.lastChild.append(element('strong', '', item.title), element('p', '', item.observation));
      list.append(row);
    }
  }
  function showWeek(week) {
    const list = byId('plan-week-list');
    list.replaceChildren();
    for (const item of week) {
      const row = element('li', 'week-step');
      const copy = element('div', 'week-copy');
      copy.append(element('strong', '', item.title), element('p', '', item.detail));
      showEvidence(copy, item.evidence);
      row.append(element('span', 'week-day', String(item.day).padStart(2, '0')), copy);
      list.append(row);
    }
  }
  function showProjection(analysis) {
    const list = byId('plan-selection-list');
    list.replaceChildren();
    const categories = Array.isArray(analysis.categories) ? analysis.categories : [];
    const actions = Array.isArray(analysis.actions) ? analysis.actions : [];
    const selected = new Set();
    const score = Number(analysis.score) || 0;
    const categoryGaps = new Map(categories.map(c => [c.name, Math.max(0, c.max - c.score)]));
    function update() {
      const totals = new Map();
      for (const index of selected) {
        const action = actions[index];
        totals.set(action.category, (totals.get(action.category) || 0) + action.impactEstimate);
      }
      let gain = 0;
      for (const [category, points] of totals)
        gain += Math.min(points, categoryGaps.get(category) || 0);
      gain = Math.max(0, Math.min(100 - score, Math.round(gain)));
      byId('plan-score-current').textContent = score + ' / 100';
      byId('plan-score-preview').textContent = (score + gain) + ' / 100';
      byId('plan-score-delta').textContent = '+' + gain + ' illustrative points';
      byId('plan-score-meter').value = score + gain;
      byId('plan-score-note').textContent = selected.size
        ? selected.size + ' planned fix(es). The preview assumes each selected fix is fully completed and verified on GitHub.'
        : 'Select a fix to preview its potential score impact. No GitHub changes are made.';
    }
    actions.forEach((action, index) => {
      const row = element('label', 'plan-selection');
      const input = element('input');
      input.type = 'checkbox';
      input.setAttribute('aria-label', 'Preview score impact: ' + action.title);
      input.addEventListener('change', () => {
        if (input.checked) selected.add(index);
        else selected.delete(index);
        update();
      });
      const copy = element('span', 'plan-selection-copy');
      copy.append(element('strong', '', action.title),
        element('small', '', (action.impactEstimate ? 'Up to +' + action.impactEstimate : '+0') + ' points · ' + action.category));
      row.append(input, copy);
      list.append(row);
    });
    if (!actions.length) list.append(element('p', '', 'No outstanding suggestions.'));
    update();
  }
  window.addEventListener('gitroast:report', event => {
    const analysis = event.detail?.analysis;
    const plan = analysis?.plan;
    if (!plan) return;
    showScan(plan.scan || []);
    showWeek(plan.week || []);
    showProjection(analysis);
    byId('plan-disclaimer').textContent = plan.estimateDisclaimer;
  });
  window.addEventListener('gitroast:reset', () => {
    for (const id of ['recruiter-scan-list', 'plan-week-list', 'plan-selection-list'])
      byId(id).replaceChildren();
    byId('plan-score-current').textContent = '—';
    byId('plan-score-preview').textContent = '—';
    byId('plan-score-delta').textContent = '';
    byId('plan-score-meter').value = 0;
    byId('plan-score-note').textContent = 'Run an audit to create a personalized plan.';
  });
})();
