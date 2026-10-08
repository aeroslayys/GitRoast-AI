const { test, expect } = require('@playwright/test');

function report(username) {
  const categories = [
    { name: 'Profile basics', score: 5, max: 20, note: 'Name, bio, website' },
    { name: 'Project clarity', score: 9, max: 25, note: 'Original repos and descriptions' },
    { name: 'Documentation', score: 0, max: 30, note: 'Sampled README quality' },
    { name: 'Recent work', score: 9, max: 15, note: 'Recent public pushes' },
    { name: 'Discoverability', score: 2, max: 10, note: 'Topics and demos' }
  ];
  return {
    user: {
      login: username, name: 'Sample Developer', bio: '',
      avatar: '', url: 'https://github.com/' + username, followers: 2
    },
    projects: [{
      name: 'demo-app', url: 'https://github.com/' + username + '/demo-app',
      description: '', language: 'JavaScript', homepage: '', stars: 0,
      hasReadme: false, readmeLength: 0
    }],
    analyzedAt: '2026-10-08T10:00:00Z',
    scannedCount: 1,
    capped: false,
    analysis: {
      score: 25, label: 'Needs some love', categories,
      facts: {
        originalRepos: 1, described: 0, tagged: 1, demos: 0,
        recent180: 1, recent365: 1, sampleSize: 1, inspected: 1,
        readmes: 0, thoroughReadmes: 0
      },
      actions: [
        { priority: 'high', title: 'Write a real GitHub bio', why: 'The profile is missing a bio.',
          how: 'Add a sentence about what you build.' },
        { priority: 'high', title: 'Give your featured repo a README', why: 'README missing.',
          how: 'Add setup and usage instructions.', repo: 'demo-app' }
      ],
      disclaimer: 'Presentation heuristic; not a hiring prediction.'
    },
    feedback: {
      source: 'rules', model: null, headline: 'Build a stronger first impression',
      verdict: 'A visitor can see your projects but needs better documentation.',
      roast: 'Your README is currently on vacation.',
      kind: 'You can improve this with one strong README.',
      nextStep: 'Start with a useful description.'
    }
  };
}

test.beforeEach(async ({ page }) => {
  // Keep browser smoke tests deterministic, offline from GitHub/Gemini and cost-free.
  await page.route('**/api/analyze?**', async route => {
    const username = new URL(route.request().url()).searchParams.get('username');
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(report(username)) });
  });
});

test('desktop: report tabs, unified workshop, source labels and reset URL', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?campaign=ci');
  await expect(page.locator('.hero-art')).toBeVisible();
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main-content');
  await expect(page.locator('.hero-art')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#username').fill('demo-user');
  await page.locator('#analyze-btn').click();
  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#source-title')).toContainText('rules-based');
  await expect(page.locator('#audit-tab-review')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#audit-review')).toBeVisible();
  await expect(page.locator('#audit-improve')).toBeHidden();
  await expect(page.locator('.audit-search-prompt')).toBeVisible();
  await expect(page).toHaveURL(/u=demo-user/);
  await page.locator('#audit-tab-improve').click();
  await expect(page.locator('#audit-improve')).toBeVisible();
  await expect(page.locator('#audit-review')).toBeHidden();
  await expect(page.locator('#workshop-repo')).toHaveValue('demo-app');
  await expect(page.locator('#readme-doctor')).toBeVisible();
  await page.locator('#workshop-tab-write').click();
  await expect(page.locator('#fixit-studio')).toBeVisible();
  await expect(page.locator('#readme-doctor')).toBeHidden();
  await page.locator('#audit-tab-track').click();
  await expect(page.locator('#audit-track')).toBeVisible();
  await page.locator('#new-search').click();
  await expect(page.locator('#report')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page).not.toHaveURL(/[\?&]u=/);
  await expect(page).toHaveURL(/campaign=ci/);
  await expect(page.locator('.hero-art')).toBeVisible();
});

test('mobile: usable audit and keyboard-accessible tabs at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.locator('#username').fill('mobile-user');
  await page.locator('#analyze-btn').click();
  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#audit-tab-review')).toHaveAttribute('aria-selected','true');
  await page.locator('#audit-tab-review').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#audit-tab-improve')).toBeFocused();
  await expect(page.locator('#audit-improve')).toBeVisible();
  await expect(page.locator('#workshop-repo')).toBeVisible();
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth
  }));
  if (sizes.page > sizes.viewport + 5) {
    const overflowing = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .map(el => ({ tag: el.tagName, id: el.id, className: typeof el.className === 'string' ? el.className.slice(0,80) : '',
        right: Math.round(el.getBoundingClientRect().right), left: Math.round(el.getBoundingClientRect().left),
        width: Math.round(el.getBoundingClientRect().width) }))
      .filter(e => e.right > innerWidth + 10 || e.left < -10)
      .sort((a,b) => b.right-a.right).slice(0,24));
    console.log('MOBILE OVERFLOW DIAGNOSTIC:', JSON.stringify(overflowing));
  }
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport + 5);
});


test('deep-linked audit shows detailed points, planner and repository evidence', async ({ page }) => {
  await page.unroute('**/api/analyze?**');
  await page.route('**/api/analyze?**', route => {
    const data=report('aeroslayys');
    data.analysis.scoreDetails=[{
      name:'Profile basics',score:5,max:20,limitation:'Public evidence only.',
      signals:[{id:'bio',title:'Profile bio',earned:0,max:10,evidence:'No public bio found.'}]
    }];
    data.analysis.scorePolicy=['Follower counts do not earn points.'];
    data.analysis.actions[0].category='Profile basics';
    data.analysis.actions[0].impactEstimate=10;
    data.analysis.plan={
      scan:[{time:'0–5s',title:'Identity',observation:'No bio found.'}],
      week:[{day:1,title:'Write a bio',detail:'Describe your focus.',evidence:[]}],
      estimateDisclaimer:'Estimates are not actual scores.'
    };
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.route('**/api/repo-evidence?**', route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({
      repository:'demo-app',branch:'main',truncated:false,scannedPaths:4,
      findings:[{id:'readme',label:'README',status:'found',confidence:'medium',paths:['README.md']}],
      roles:[{id:'frontend',label:'Frontend developer',score:75,coverage:100,confidence:'medium',
        criteria:[{label:'frontend',weight:40,status:'found',paths:['src/App.js']}]}],
      limitation:'Filename evidence does not prove functioning software.'
    })
  }));
  await page.goto('/?u=aeroslayys');
  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#username')).toHaveValue('aeroslayys');
  await page.locator('#breakdown-list .score-detail').first().locator('summary').click();
  await expect(page.locator('#breakdown-list')).toContainText('Profile bio');
  await page.locator('#score-policy summary').click();
  await expect(page.locator('#score-policy-list')).toContainText('Follower counts');
  await page.locator('#audit-tab-improve').click();
  await expect(page.locator('#plan-score-current')).toHaveText('25 / 100');
  await page.locator('#plan-selection-list input').first().check();
  await expect(page.locator('#plan-score-preview')).toHaveText('35 / 100');
  await expect(page.locator('#plan-week-list')).toContainText('Write a bio');
  await expect(page.locator('#evidence-inspect')).toBeEnabled();
  await page.locator('#evidence-inspect').click();
  await expect(page.locator('#evidence-summary')).toContainText('4 public file paths');
  await page.locator('#evidence-role').selectOption('frontend');
  await expect(page.locator('#evidence-role-result')).toContainText('75/100');
  await expect(page.locator('#evidence-limitation')).toContainText('Filename evidence');
});
