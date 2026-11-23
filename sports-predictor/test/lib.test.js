import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../server/lib/cache.js';
import { withTimeout } from '../server/lib/http.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('withTimeout: fallback runs only on a real timeout', async () => {
  let fired = 0;
  const fast = await withTimeout(sleep(5).then(() => 'data'), 50, () => { fired++; return 'fallback'; });
  assert.equal(fast, 'data');
  await sleep(80); // past the timeout: the cleared timer must not fire
  assert.equal(fired, 0);
  const slow = await withTimeout(sleep(80).then(() => 'data'), 20, () => { fired++; return 'fallback'; });
  assert.equal(slow, 'fallback');
  assert.equal(fired, 1);
});

test('cache swr returns the stale value at once and refreshes in the background', async () => {
  const cache = createCache();
  let calls = 0;
  const fn = async () => { calls++; await sleep(40); return calls; };
  assert.equal(await cache.wrap('k', 1, fn, { swr: true }), 1);
  await sleep(5); // expire
  const t0 = Date.now();
  assert.equal(await cache.wrap('k', 1000, fn, { swr: true }), 1, 'stale value served');
  assert.ok(Date.now() - t0 < 30, 'did not wait for the refresh');
  await sleep(60);
  assert.equal(await cache.wrap('k', 1000, fn, { swr: true }), 2, 'refreshed value');
  assert.equal(calls, 2);
});

test('cache without swr waits for the refresh', async () => {
  const cache = createCache();
  let calls = 0;
  const fn = async () => { calls++; await sleep(20); return calls; };
  await cache.wrap('k', 1, fn);
  await sleep(5);
  assert.equal(await cache.wrap('k', 1000, fn), 2);
});

test('TheSportsDB season fallbacks', async () => {
  const { seasonCandidates } = await import('../server/providers/tsdb.js');
  assert.deepEqual(seasonCandidates('2026'), ['2026', '2026-2027']);
  assert.deepEqual(seasonCandidates('2026-2027'), ['2026-2027', '2026']);
});

test('model weight scales with sample size', async () => {
  const { modelWeight } = await import('../server/engine.js');
  assert.equal(modelWeight(0.3, { home: 30, away: 40 }, true, true), 0.3);
  assert.ok(Math.abs(modelWeight(0.3, { home: 5, away: 20 }, true, true) - 0.125) < 1e-9);
  assert.equal(modelWeight(0.3, { home: 0, away: 0 }, true, true), 0);
  assert.equal(modelWeight(0.3, { home: 5, away: 5 }, true, false), 1, 'no market → model only');
  assert.equal(modelWeight(0.3, null, false, true), 0, 'no model → market only');
});

test('basic auth', async () => {
  const { checkBasicAuth } = await import('../server/lib/auth.js');
  const hdr = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
  assert.equal(checkBasicAuth(undefined, ''), true, 'no password configured → open');
  assert.equal(checkBasicAuth(undefined, 'secret'), false);
  assert.equal(checkBasicAuth(hdr('any', 'secret'), 'secret'), true);
  assert.equal(checkBasicAuth(hdr('any', 'wrong'), 'secret'), false);
  assert.equal(checkBasicAuth(hdr('x', 'pa:ss'), 'pa:ss'), true, 'colon inside password');
});

test('TheSportsDB: stale "not started" after kick-off is shown as awaiting result', async () => {
  const { normalize } = await import('../server/providers/tsdb.js');
  const league = { key: 'isr.basket', sport: 'basketball' };
  const ev = (minsFromNow, status, hs = null, as = null) => ({
    idEvent: '1', name: 'A vs B', start: new Date(Date.now() + minsFromNow * 60000).toISOString(),
    homeName: 'A', awayName: 'B', hs, as, status, progress: '', postponed: false,
  });
  assert.equal(normalize(ev(60, 'NS'), league).state, 'pre');
  const stale = normalize(ev(-300, 'NS'), league);
  assert.equal(stale.state, 'off');
  assert.equal(stale.status.short, 'ממתין לתוצאה');
  assert.equal(normalize(ev(-300, 'FT', 67, 73), league).state, 'post');
  assert.equal(normalize(ev(-300, 'NS', 67, 73), league).state, 'post', 'scores present → finished');
});
