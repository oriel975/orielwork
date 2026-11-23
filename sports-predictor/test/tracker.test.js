import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../server/tracker.js';

const t = createTracker({ get: () => ({ bets: [] }), save() {} }, {});

test('1X2 and Winner-style handicap settlement', () => {
  assert.equal(t.legResult({ market: '1x2', sel: 'home' }, 2, 1, 'soccer'), 'won');
  assert.equal(t.legResult({ market: '1x2', sel: 'draw' }, 1, 1, 'soccer'), 'won');
  assert.equal(t.legResult({ market: '1x2', sel: 'home', line: -1 }, 2, 1, 'soccer'), 'lost');
  assert.equal(t.legResult({ market: '1x2', sel: 'draw', line: -1 }, 2, 1, 'soccer'), 'won');
  assert.equal(t.legResult({ market: '1x2', sel: 'away', line: 1 }, 0, 2, 'soccer'), 'won');
});

test('totals, BTTS, double chance', () => {
  assert.equal(t.legResult({ market: 'total', sel: 'over', line: 2.5 }, 2, 1), 'won');
  assert.equal(t.legResult({ market: 'total', sel: 'under', line: 2.5 }, 2, 1), 'lost');
  assert.equal(t.legResult({ market: 'total', sel: 'over', line: 3 }, 2, 1), 'void');
  assert.equal(t.legResult({ market: 'btts', sel: 'yes' }, 2, 1), 'won');
  assert.equal(t.legResult({ market: 'dc', sel: '1X' }, 1, 1), 'won');
});

test('spread lines are quoted for the home side', () => {
  assert.equal(t.legResult({ market: 'spread', sel: 'home', line: -1.5 }, 3, 1), 'won');
  assert.equal(t.legResult({ market: 'spread', sel: 'away', line: -1.5 }, 3, 1), 'lost');
  assert.equal(t.legResult({ market: 'spread', sel: 'away', line: -6.5 }, 100, 95), 'won');
  assert.equal(t.legResult({ market: 'spread', sel: 'home', line: -0.25 }, 1, 1), 'half-lost');
});
