// Evidence-backed coaching built from the existing deterministic score.
// This module never fetches data and never changes the audited score.
const PRIORITY_POINTS = Object.freeze({high: 6, medium: 4, low: 2});
const REPO_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const USERNAME = /^[A-Za-z0-9-]{1,39}$/;

function githubUrl(login, repo = '') {
  if (!USERNAME.test(login || '') || (repo && !REPO_NAME.test(repo))) return '';
  return 'https://github.com/' + login + (repo ? '/' + repo : '');
}
function categoryFor(title) {
  if (/bio|portfolio or LinkedIn/i.test(title)) return 'Profile basics';
  if (/project|Ship a finished/i.test(title) && !/flagship project memorable/i.test(title)) return 'Project clarity';
  if (/README/i.test(title)) return 'Documentation';
  if (/recent update/i.test(title)) return 'Recent work';
  return 'Discoverability';
}
function sourceProjects(action, repos, projects) {
  if (/Explain your projects/i.test(action.title))
    return repos.filter(r => (r.description || '').trim().length < 15);
  if (/Give your featured repo a README/i.test(action.title))
    return projects.filter(r => r.hasReadme === false);
  if (/Upgrade a thin README/i.test(action.title))
    return projects.filter(r => r.hasReadme === true && r.name === action.repo);
  if (/working demo/i.test(action.title))
    return projects.filter(r => !r.homepage);
  if (/repository topics/i.test(action.title))
    return repos.filter(r => !r.topics?.length);
  if (/recent update/i.test(action.title))
    return projects.filter(r => r.pushedAt).slice(0, 1);
  if (/flagship project memorable/i.test(action.title))
    return projects.slice(0, 1);
  if (action.repo) return [...projects, ...repos].filter(r => r.name === action.repo);
  return [];
}
function evidenceFor(action, user, repos, projects) {
  const sources = sourceProjects(action, repos, projects);
  const evidence = sources.slice(0, 3)
    .map(p => ({ label: p.name, url: githubUrl(user.login, p.name), detail: action.why }))
    .filter(e => e.url);
  if (evidence.length) return evidence;
  const url = githubUrl(user.login);
  return url ? [{ label: '@' + user.login, url, detail: action.why }] : [];
}
function estimate(action, categories, counts) {
  const category = categories.find(c => c.name === action.category);
  const gap = category ? Math.max(0, category.max - category.score) : 0;
  if (!gap) return 0;
  const title = action.title;
  let ceiling = PRIORITY_POINTS[action.priority] || 2;
  if (/Write a real GitHub bio/i.test(title)) ceiling = 10;
  else if (/portfolio or LinkedIn/i.test(title)) ceiling = 5;
  else if (/Explain your projects/i.test(title))
    ceiling = Math.max(1, Math.round(12 / Math.max(counts.repos, 1)));
  else if (/Give your featured repo a README/i.test(title))
    ceiling = Math.max(1, Math.round(18 / Math.max(counts.inspected, 1)));
  else if (/Upgrade a thin README/i.test(title))
    ceiling = Math.max(1, Math.round(12 / Math.max(counts.inspected, 1)));
  else if (/working demo/i.test(title)) ceiling = 5;
  else if (/repository topics/i.test(title)) ceiling = 5;
  else if (/recent update/i.test(title)) ceiling = 9;
  return Math.min(gap, ceiling);
}
function scanFor(user, repos, projects, facts, actions) {
  const checked = projects.filter(p => p.hasReadme !== null);
  const present = checked.filter(p => p.hasReadme === true).length;
  const described = repos.filter(r => (r.description || '').trim().length >= 15).length;
  return [
    { time: '0–5s', title: 'Identity', observation: user.bio?.trim()
      ? 'A public bio introduces this developer.' : 'No public bio is provided; visitors lack a quick introduction.' },
    { time: '5–10s', title: 'Project clarity', observation:
      facts.originalRepos + ' original public projects; ' + described + ' have descriptions of at least 15 characters.' },
    { time: '10–20s', title: 'Documentation', observation: checked.length
      ? present + ' of ' + checked.length + ' sampled repository READMEs were found.'
      : 'README samples could not be inspected. Documentation status is unknown.' },
    { time: '20–25s', title: 'Proof of work', observation:
      facts.demos + ' repositories link a demo; ' + facts.recent180 + ' had a public push in the past 180 days.' },
    { time: '25–30s', title: 'Suggested first move', observation:
      actions[0]?.title || 'Review the most important public projects.' }
  ];
}
export function buildImprovementPlan({user, repos, projects, categories, actions, facts}) {
  const enriched = actions.map(a => {
    const category = categoryFor(a.title);
    const evidence = evidenceFor(a, user, repos, projects);
    const impactEstimate = estimate({...a, category}, categories, {repos: repos.length, inspected: facts.inspected});
    return {...a, category, evidence, impactEstimate};
  });
  const fallback = [
    ['Inspect your flagship README', 'Verify that the overview, installation and usage instructions are accurate.'],
    ['Check your featured projects', 'Confirm descriptions and demo links point to real, working projects.'],
    ['Review project discoverability', 'Check topics and the public profile website field.'],
    ['Proofread suggested drafts', 'Remove unsupported claims before publishing any generated text.'],
    ['Confirm your public portfolio', 'View your public GitHub profile as someone unfamiliar with your work would.']
  ];
  const week = Array.from({length: 5}, (_, i) => ({
    day: i + 1,
    title: enriched[i]?.title || fallback[i][0],
    detail: enriched[i]?.how || fallback[i][1],
    evidence: enriched[i]?.evidence || [],
    type: enriched[i] ? 'recommended fix' : 'optional review'
  }));
  week.push(
    {day: 6, title: 'Verify everything you published', detail: 'Open the public profile, check project links and test documented commands. Mark checklist items complete only after the change is visible.', evidence: [], type: 'verification'},
    {day: 7, title: 'Measure actual improvement', detail: 'Use Track → Recheck GitHub now and compare the live deterministic score with your saved baseline. Estimates are not actual results.', evidence: [], type: 'verification'}
  );
  return {
    actions: enriched,
    week,
    scan: scanFor(user, repos, projects, facts, enriched),
    estimateDisclaimer: 'Planning estimate only, based on unearned category points and one verified change per selected fix. Multiple fixes in one category share the same maximum. Actual scores change only after GitHub is updated and rechecked.'
  };
}
