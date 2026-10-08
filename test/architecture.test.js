import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../engine.js';
import * as github from '../core/github.js';
import * as scoring from '../core/scoring.js';
import * as feedback from '../core/feedback.js';

test('stable engine exports delegate to independently maintained modules', () => {
  assert.equal(engine.collectProfile, github.collectProfile);
  assert.equal(engine.ApiError, github.ApiError);
  assert.equal(engine.validUsername, github.validUsername);
  assert.equal(engine.scoreProfile, scoring.scoreProfile);
  assert.equal(engine.aiFeedback, feedback.aiFeedback);
  assert.equal(engine.fallbackFeedback, feedback.fallbackFeedback);
  assert.equal(engine.requestGeminiModel, feedback.requestGeminiModel);
});

test('scoring is pure and does not mutate the GitHub profile data', () => {
  const profile = {
    user:{ login:'demo', bio:'An example', name:'Example', blog:'' },
    repos:[{name:'project',description:'A real public project',topics:[],homepage:'',pushedAt:'2026-09-30'}],
    projects:[{name:'project',hasReadme:null,sections:[],readmeLength:0}]
  };
  const frozen = structuredClone(profile);
  const a=engine.scoreProfile(profile,new Date('2026-10-08'));
  const b=scoring.scoreProfile(profile,new Date('2026-10-08'));
  assert.deepEqual(a,b);
  assert.deepEqual(profile,frozen);
  assert.equal(a.facts.inspected,0);
  assert.equal(a.score,a.categories.reduce((s,c)=>s+c.score,0));
});
