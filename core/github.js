// Public GitHub collection only. README API failures are unknown, not missing.
import { str } from './shared.js';
const USERNAME = /^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const API = 'https://api.github.com';
export const validUsername = name => typeof name === 'string' && USERNAME.test(name);

export class ApiError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function github(path, optional = false) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GitRoast-AI'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  let response;
  try { response = await fetch(API + path, { headers, signal: AbortSignal.timeout(10000) }); }
  catch { throw new ApiError('Could not reach GitHub right now. Please retry.'); }
  if (optional && response.status === 404) return null;
  if (response.status === 404) throw new ApiError('This GitHub username does not exist.', 404);
  if (response.status === 403 || response.status === 429) throw new ApiError('GitHub API rate limit reached. Please retry later.', 429);
  if (!response.ok) throw new ApiError('GitHub returned an error (' + response.status + ').');
  return response.json();
}

async function readmeInfo(repo) {
  try {
    const owner = encodeURIComponent(repo.owner.login);
    const name = encodeURIComponent(repo.name);
    const result = await github('/repos/' + owner + '/' + name + '/readme', true);
    if (!result) return { hasReadme: false, sections: [], readmeLength: 0 };
    const text = result.content ? Buffer.from(result.content.replace(/\s/g, ''), 'base64').toString('utf8').slice(0, 40000) : '';
    const sections = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1].trim().slice(0, 60)).slice(0, 18);
    return { hasReadme: true, sections, readmeLength: text.length };
  } catch {
    // Rate limits or errors are *unknown*, never falsely presented as missing READMEs.
    return { hasReadme: null, sections: [], readmeLength: 0 };
  }
}

async function mapLimited(items, limit, fn) {
  const output = Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; output[index] = await fn(items[index]); }
  }));
  return output;
}

export async function collectProfile(username) {
  if (!validUsername(username)) throw new ApiError('Enter a valid GitHub username.', 400);
  const user = await github('/users/' + encodeURIComponent(username));
  if (user.type !== 'User') throw new ApiError('Please enter a personal GitHub account.', 400);
  const fetched = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await github('/users/' + encodeURIComponent(username) + '/repos?sort=pushed&direction=desc&per_page=100&page=' + page);
    fetched.push(...batch);
    if (batch.length < 100) break;
  }
  const originals = fetched.filter(r => !r.fork && !r.archived);
  const ranked = [...originals].sort((a, b) => {
    const score = r => (r.stargazers_count || 0) * 2 + (r.description ? 4 : 0) + (r.homepage ? 3 : 0) + (r.topics?.length ? 2 : 0);
    return score(b) - score(a) || new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0);
  });
  const featured = ranked.slice(0, 8);
  const readmes = await mapLimited(featured, 4, readmeInfo);
  return {
    user: {
      login: str(user.login, 40), name: str(user.name, 100), bio: str(user.bio, 280),
      avatar: user.avatar_url, url: user.html_url, blog: str(user.blog, 180),
      followers: user.followers || 0, publicRepos: user.public_repos || 0,
      createdAt: user.created_at
    },
    repos: originals.map(r => ({
      name: str(r.name, 100), description: str(r.description, 240),
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 8) : [],
      homepage: str(r.homepage, 220), pushedAt: r.pushed_at
    })),
    projects: featured.map((r, i) => ({
      name: str(r.name, 100), fullName: str(r.full_name, 180), url: r.html_url,
      description: str(r.description, 240), language: str(r.language, 40),
      stars: r.stargazers_count || 0, forks: r.forks_count || 0,
      homepage: /^https?:\/\//i.test(r.homepage || '') ? r.homepage : '',
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 5) : [],
      pushedAt: r.pushed_at, ...readmes[i]
    })),
    scannedCount: fetched.length, capped: fetched.length >= 300,
    analyzedAt: new Date().toISOString()
  };
}

