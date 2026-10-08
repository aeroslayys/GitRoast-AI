'use strict';
// Fix-It Studio: optional, on-demand drafting. All text is inserted as values, never HTML.
(() => {
  const byId = id => document.getElementById(id);
  const picker = byId('fixit-repo');
  const generate = byId('fixit-generate');
  const message = byId('fixit-message');
  const result = byId('fixit-result');
  const fields = { bio: byId('fixit-bio'), description: byId('fixit-description'), readme: byId('fixit-readme') };
  const limits = { bio: 160, description: 350, readme: 3800 };
  let profile = null;
  let requestId = 0;
  let loading = false;

  function notice(text, state = 'info') {
    message.textContent = text;
    message.dataset.state = state;
  }
  function setBusy(busy) {
    loading = busy;
    generate.disabled = busy || !profile;
    generate.textContent = busy ? '✳ Generating drafts…' : '✦ Generate my fixes';
  }
  function count(name) {
    byId('fixit-' + name + '-count').textContent = fields[name].value.length + ' / ' + limits[name];
  }
  function clearDrafts() {
    result.hidden = true;
    for (const name of Object.keys(fields)) {
      fields[name].value = '';
      count(name);
    }
  }
  function reset() {
    requestId++;
    profile = null;
    picker.replaceChildren();
    picker.append(new Option('Run a profile audit first', ''));
    picker.disabled = true;
    setBusy(false);
    clearDrafts();
    notice('Run a profile audit to unlock Fix-It Studio.');
  }

  window.addEventListener('gitroast:report', event => {
    requestId++;
    profile = {
      username: event.detail.username,
      projects: Array.isArray(event.detail.projects) ? event.detail.projects : []
    };
    picker.replaceChildren();
    picker.disabled = profile.projects.length === 0;
    if (!profile.projects.length) {
      picker.append(new Option('No public originals — bio only', ''));
      notice('No featured repositories yet. You can still draft a GitHub bio.');
    } else {
      for (const repo of profile.projects) {
        const option = new Option(repo.name, repo.name);
        picker.append(option);
      }
      const priority = profile.projects.find(p => !p.description?.trim() || p.hasReadme === false);
      picker.value = priority?.name || profile.projects[0].name;
      notice('Select a project and generate three editable suggestions.');
    }
    setBusy(false);
    clearDrafts();
  });

  window.addEventListener('gitroast:reset', reset);
  picker.addEventListener('change', () => {
    requestId++;
    clearDrafts();
    setBusy(false);
    notice('Project changed. Generate a new set of drafts for this repository.');
  });

  generate.addEventListener('click', async () => {
    if (!profile || loading) return;
    const sequence = ++requestId;
    const username = profile.username;
    const repo = picker.disabled ? '' : picker.value;
    clearDrafts();
    setBusy(true);
    notice('Building editable drafts from public GitHub metadata…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      const params = new URLSearchParams({ username });
      if (repo) params.set('repo', repo);
      const response = await fetch('/api/fixit?' + params.toString(), { signal: controller.signal });
      const data = await response.json();
      if (sequence !== requestId) return;
      if (!response.ok) throw new Error(data.error || 'Could not generate suggestions.');
      if (!data || !['rules', 'gemini'].includes(data.source) ||
          typeof data.bio !== 'string' || typeof data.description !== 'string' ||
          typeof data.readme !== 'string') throw new Error('Unexpected draft response. Please retry.');
      fields.bio.value = data.bio.slice(0, limits.bio);
      fields.description.value = data.description.slice(0, limits.description);
      fields.readme.value = data.readme.slice(0, limits.readme);
      for (const name of Object.keys(fields)) count(name);
      const hasRepo = Boolean(data.repo);
      byId('fixit-description-card').hidden = !hasRepo;
      byId('fixit-readme-card').hidden = !hasRepo;
      const ai = data.source === 'gemini';
      byId('fixit-result-banner').dataset.source = data.source;
      byId('fixit-source').textContent = ai ? '✳ GEMINI-GENERATED DRAFTS' : '✓ RULES-BASED TEMPLATES · NO AI USED';
      byId('fixit-subtitle').textContent = ai ?
        'Generated using ' + (data.model || 'Gemini') + '. Edit and verify all project claims.' :
        'Gemini was unavailable or not configured. These are transparent, metadata-based starting templates.';
      result.hidden = false;
      notice(hasRepo ? 'Drafts are ready. Edit them here, then copy into GitHub.' :
        'Bio draft is ready. Add a public repository to unlock the description and README tools.', 'success');
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (sequence === requestId) {
        notice(error.name === 'AbortError' ? 'Generation timed out. Please try again.' :
          error.message || 'Draft generation failed. Try again.', 'error');
      }
    } finally {
      clearTimeout(timer);
      if (sequence === requestId) setBusy(false);
    }
  });

  for (const [name, field] of Object.entries(fields)) {
    field.addEventListener('input', () => count(name));
  }
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const name = button.dataset.copy;
      if (result.hidden || !fields[name] || !fields[name].value.trim()) return;
      try {
        await navigator.clipboard.writeText(fields[name].value);
        notice(name === 'readme' ? 'Markdown copied. Review placeholders before publishing.' :
          'Edited ' + (name === 'bio' ? 'bio' : 'description') + ' copied to clipboard.', 'success');
      } catch {
        notice('Copy unavailable. Select the text and use Ctrl+C instead.', 'error');
        fields[name].focus();
        fields[name].select();
      }
    });
  });
  byId('fixit-download').addEventListener('click', () => {
    if (!profile || result.hidden || !fields.readme.value.trim()) return;
    const safe = (picker.value || 'project').replace(/[^a-zA-Z0-9_.-]/g, '-');
    const file = new Blob([fields.readme.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = safe + '-README-outline.md';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Markdown outline downloaded. Verify all placeholders before using it.', 'success');
  });
  reset();
})();
