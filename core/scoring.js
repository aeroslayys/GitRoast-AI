// Pure deterministic portfolio scoring and action prioritization.
import { buildImprovementPlan } from '../improvement-plan.js';
import { explainScore, SCORE_POLICY } from '../score-explain.js';
import { day, clamp, fraction } from './shared.js';
function detailed(p) {
  return p.hasReadme === true && p.readmeLength >= 350 &&
    /install|setup|usage|how to|getting started|run|demo|feature/i.test(p.sections.join(' '));
}
export function scoreProfile(data, now = new Date()) {
  const { user, repos, projects } = data;
  const count = repos.length;
  const described = repos.filter(r => r.description?.trim().length >= 15).length;
  const tagged = repos.filter(r => r.topics?.length).length;
  const demos = repos.filter(r => /^https?:\/\//i.test(r.homepage || '')).length;
  const daysAgo = r => (now - new Date(r.pushedAt || 0)) / day;
  const recent180 = repos.filter(r => daysAgo(r) >= 0 && daysAgo(r) <= 180).length;
  const recent365 = repos.filter(r => daysAgo(r) >= 0 && daysAgo(r) <= 365).length;
  const checked = projects.filter(p => p.hasReadme !== null);
  const readmes = checked.filter(p => p.hasReadme === true);
  const thorough = readmes.filter(detailed);
  const categories = [
    { name: 'Profile basics', max: 20, score: (user.bio?.trim() ? 10 : 0) + (user.name?.trim() ? 5 : 0) + (user.blog?.trim() ? 5 : 0), note: 'Name, bio, website' },
    { name: 'Project clarity', max: 25, score: (count >= 3 ? 7 : count ? 3 : 0) + Math.round(12 * fraction(described, count)) + (count >= 2 ? 6 : count ? 3 : 0), note: 'Original repos and descriptions' },
    { name: 'Documentation', max: 30, score: checked.length ? Math.round(18 * fraction(readmes.length, checked.length)) + Math.round(12 * fraction(thorough.length, checked.length)) : 0, note: 'Up to eight sampled READMEs' },
    { name: 'Recent work', max: 15, score: (recent180 ? 9 : 0) + (recent365 >= 3 ? 6 : 0), note: 'Public pushes in the past year' },
    { name: 'Discoverability', max: 10, score: (tagged >= 2 ? 5 : tagged ? 2 : 0) + (demos ? 5 : 0), note: 'Topics and live demos' }
  ];
  const score = clamp(categories.reduce((n, c) => n + c.score, 0), 0, 100);
  const facts = { originalRepos: count, described, tagged, demos, recent180, recent365,
    sampleSize: projects.length, inspected: checked.length, readmes: readmes.length, thoroughReadmes: thorough.length };
  const actions = [];
  const add = (priority, title, why, how, repo = '') => actions.push({ priority, title, why, how, repo });
  if (!user.bio?.trim()) add('high', 'Write a real GitHub bio', 'Your profile has no bio.', 'In one line, say what you build, your specialty, and what you want to work on.');
  if (!count) add('high', 'Ship a finished project', 'No original public repositories were found.', 'Publish one working app with a README, screenshots, and steps to run it.');
  if (count && described < count) {
    const r = repos.find(x => !x.description || x.description.trim().length < 15);
    add('high', 'Explain your projects in one sentence', (count - described) + ' original repositories lack helpful descriptions.', 'Describe the problem, technology and outcome in repository settings.', r?.name);
  }
  if (checked.length && readmes.length < checked.length) {
    const r = checked.find(x => x.hasReadme === false);
    add('high', 'Give your featured repo a README', (checked.length - readmes.length) + ' sampled repositories have no README.', 'Add overview, features, setup, usage and a screenshot.', r?.name);
  }
  if (readmes.length && thorough.length < readmes.length) {
    const r = readmes.find(x => !detailed(x));
    add('medium', 'Upgrade a thin README', 'Some sampled READMEs lack useful setup or usage information.', 'Include runnable instructions, a preview, and what you learned.', r?.name);
  }
  if (!demos && count) add('medium', 'Link to a working demo', 'No original repository has a live homepage URL.', 'Deploy your best app, then add its link in repository settings.');
  if (tagged < 2 && count >= 2) add('medium', 'Add discoverable repository topics', 'Fewer than two original repos use topics.', 'Tag flagship projects with accurate languages, frameworks and problem domains.');
  if (!user.blog?.trim()) add('low', 'Add a portfolio or LinkedIn link', 'Your GitHub profile has no website.', 'Use the website field to make it easier to find your work.');
  if (!recent180 && count) add('low', 'Show a meaningful recent update', 'No original public repo has a push within 180 days.', 'Polish an existing project and publish an actual improvement.');
  if (!actions.length) add('low', 'Make a flagship project memorable', 'Your visible fundamentals already look good.', 'Publish a clear product screenshot, a live demo, and a short architecture note.');
  actions.sort((a,b) => ({high:0,medium:1,low:2}[a.priority] - {high:0,medium:1,low:2}[b.priority]));
  const plan = buildImprovementPlan({ user, repos, projects, categories, actions: actions.slice(0, 5), facts });
  return { score, categories, scoreDetails: explainScore(data, categories, now), scorePolicy: SCORE_POLICY, facts, actions: plan.actions, plan: {week: plan.week, scan: plan.scan, estimateDisclaimer: plan.estimateDisclaimer},
    label: score >= 80 ? 'Strong first impression' : score >= 60 ? 'Good foundation' : score >= 40 ? 'Getting there' : 'Needs some love',
    disclaimer: 'This transparent heuristic is not a hiring prediction. Only public GitHub data is used; README sampling is not exhaustive.' };
}

