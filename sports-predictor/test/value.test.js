import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelMarketGap, isSuspicious, markSuspicious } from '../server/value.js';
import { trackRecord } from '../server/backtest.js';

test('model-market gap compares like with like', () => {
  assert.ok(Math.abs(modelMarketGap({ model: { home: 0.6, draw: 0.2, away: 0.2 }, market: { home: 0.8, draw: 0.1, away: 0.1 } }) - 0.2) < 1e-9);
  // 3-way model vs 2-way market: the draw is split
  assert.ok(Math.abs(modelMarketGap({ model: { home: 0.4, draw: 0.2, away: 0.4 }, market: { home: 0.5, away: 0.5 } })) < 1e-9);
  assert.equal(modelMarketGap({ model: { home: 0.5 } }), null);
});

test('suspicious: big edge or big model-market disagreement', () => {
  assert.equal(isSuspicious(0.05, 0.05), false);
  assert.equal(isSuspicious(0.2, 0.05), true);
  assert.equal(isSuspicious(0.05, 0.2), true);
  assert.equal(isSuspicious(0.05, null), false);
  const p = markSuspicious({ model: { home: 0.6, draw: 0.2, away: 0.2 }, market: { home: 0.84, draw: 0.11, away: 0.05 }, value: [{ ev: 0.05 }] });
  assert.equal(p.value[0].suspicious, true);
});

test('track record splits clean and suspicious value bets', () => {
  const base = { threeWay: true, fair: { home: 0.5, draw: 0.25, away: 0.25 } };
  const log = {
    a: { ...base, id: 'a', league: 'eng.1', model: { home: 0.5, draw: 0.25, away: 0.25 }, market: { home: 0.52, draw: 0.24, away: 0.24 }, result: { hs: 1, as: 0 }, value: [{ sel: 'home', odds: 2.2, ev: 0.06 }] },
    b: { ...base, id: 'b', league: 'eng.1', model: { home: 0.3, draw: 0.3, away: 0.4 }, market: { home: 0.6, draw: 0.2, away: 0.2 }, result: { hs: 2, as: 0 }, value: [{ sel: 'away', odds: 5, ev: 0.1 }] },
  };
  const r = trackRecord(log);
  assert.equal(r.valueClean.bets, 1);
  assert.ok(Math.abs(r.valueClean.profit - 1.2) < 1e-9);
  assert.equal(r.valueSuspicious.bets, 1);
  assert.equal(r.valueSuspicious.profit, -1);
  assert.equal(r.valueBets.bets, 2);
});
