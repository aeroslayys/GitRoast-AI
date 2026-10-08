import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncCache, createRateLimiter } from '../http/request-controls.js';

test('fixed-window limiter counts requests and resets at the next window',()=>{
  let clock=1000;
  const blocked=createRateLimiter({limit:2,windowMs:60000,maxKeys:2,now:()=>clock});
  assert.equal(blocked('first'),false);
  assert.equal(blocked('first'),false);
  assert.equal(blocked('first'),true);
  clock+=60001;
  assert.equal(blocked('first'),false);
});
test('client quotas are independent and map size stays bounded',()=>{
  let clock=1;
  const blocked=createRateLimiter({limit:1,windowMs:100,maxKeys:2,now:()=>clock});
  assert.equal(blocked('a'),false);assert.equal(blocked('b'),false);
  assert.equal(blocked('a'),true);
  clock+=200;
  assert.equal(blocked('c'),false);
  assert.equal(blocked('a'),false);
});
test('duplicate concurrent cache requests share one upstream promise',async()=>{
  const cache=createAsyncCache({ttl:500,maxEntries:2});
  let called=0;
  const get=()=>cache.getOrCreate('same',async()=>{called++;await Promise.resolve();return{ok:true};});
  const [a,b]=await Promise.all([get(),get()]);
  assert.deepEqual(a,{ok:true});assert.equal(a,b);assert.equal(called,1);
  assert.equal(await get(),a);assert.equal(called,1);
});
test('expired cache entries reload; failures never poison the next request',async()=>{
  let clock=1;
  const cache=createAsyncCache({ttl:10,maxEntries:1,now:()=>clock});
  let n=0;
  assert.equal(await cache.getOrCreate('a',()=>++n),1);
  clock=12;
  assert.equal(await cache.getOrCreate('a',()=>++n),2);
  await assert.rejects(cache.getOrCreate('b',()=>Promise.reject(new Error('GitHub timeout'))),/timeout/);
  assert.equal(await cache.getOrCreate('b',()=>42),42);
});
test('request controls reject invalid configuration',()=>{
  assert.throws(()=>createAsyncCache({ttl:0}),TypeError);
  assert.throws(()=>createRateLimiter({limit:0}),TypeError);
});
