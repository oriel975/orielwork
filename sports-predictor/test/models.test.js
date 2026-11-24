import { test } from 'node:test';
import assert from 'node:assert/strict';
import { americanToDecimal, parseOdds, removeVig, kelly, expectedValue, overround } from '../server/models/odds.js';
import { scoreMatrix, matrix1x2, matrixMarkets, fitGoals, expectedGoals, invertMarket, soccerRemainingShare, liveGoalRates } from '../server/models/goals.js';
import { fitPoints, expectedPoints, pointsMarkets, marginFromWinProb } from '../server/models/points.js';
import { tennisPrediction, matchWin } from '../server/models/tennis.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

test('odds conversions', () => {
  close(americanToDecimal('+150'), 2.5);
  close(americanToDecimal(-200), 1.5);
  close(parseOdds('5/2'), 3.5);
  close(parseOdds('1.85'), 1.85);
  close(parseOdds('-110'), 1 + 100 / 110);
  assert.equal(parseOdds('abc'), null);
});

test('vig removal sums to one and keeps order', () => {
  const p = removeVig([1.5, 4.2, 6.5]);
  close(p.reduce((a, b) => a + b, 0), 1);
  assert.ok(p[0] > p[1] && p[1] > p[2]);
  assert.ok(overround([1.5, 4.2, 6.5]) > 0);
});

test('kelly and EV', () => {
  close(expectedValue(0.55, 2), 0.1);
  close(kelly(0.55, 2), 0.1);
  assert.equal(kelly(0.4, 2), 0);
});

test('score matrix sums to one and handicap logic', () => {
  const m = scoreMatrix(1.6, 1.1, { rho: -0.05 });
  let s = 0; for (const r of m) for (const p of r) s += p;
  close(s, 1);
  const r = matrix1x2(m);
  close(r.home + r.draw + r.away, 1);
  assert.ok(r.home > r.away);
  // home -1 handicap: home win only if margin >= 2, draw if margin == 1
  const h = matrix1x2(m, -1);
  assert.ok(h.home < r.home);
  const mk = matrixMarkets(m);
  close(mk.btts.yes + mk.btts.no, 1);
  close(mk.expected.home, 1.6, 0.05);
});

test('live matrix respects current score', () => {
  const m = scoreMatrix(0.0001, 0.0001, { base: [2, 1] });
  const r = matrix1x2(m);
  assert.ok(r.home > 0.99);
});

test('goal model recovers stronger team', () => {
  const now = Date.now();
  const teams = ['A', 'B', 'C', 'D'];
  const strength = { A: 2.2, B: 1.4, C: 1.0, D: 0.7 };
  const matches = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pois = (l) => { let k = 0, p = Math.exp(-l), s = p; const u = rnd(); while (u > s) { k++; p *= l / k; s += p; } return k; };
  for (let r = 0; r < 30; r++) for (const h of teams) for (const a of teams) {
    if (h === a) continue;
    matches.push({ home: h, away: a, hs: pois(strength[h] / strength[a] * 1.3), as: pois(strength[a] / strength[h] * 1.0), t: now - r * 86400000 * 3 });
  }
  const model = fitGoals(matches, { now });
  const ab = expectedGoals(model, 'A', 'D');
  const da = expectedGoals(model, 'D', 'A');
  assert.ok(ab.lh > ab.la * 2, 'A should dominate D');
  assert.ok(da.la > da.lh, 'A away should still be favoured');
  assert.ok(model.home > 0, 'home advantage should be positive');
});

test('market inversion reproduces probabilities', () => {
  const target = { home: 0.55, draw: 0.25, away: 0.2 };
  const fit = invertMarket(target, { line: 2.5, over: 0.52 });
  const r = matrix1x2(scoreMatrix(fit.lh, fit.la, { rho: -0.05 }));
  close(r.home, 0.55, 0.02);
  close(r.draw, 0.25, 0.02);
});

test('soccer remaining share', () => {
  close(soccerRemainingShare(0, 1), 1);
  const ht = soccerRemainingShare(45, 1, { halftime: true });
  assert.ok(ht > 0.5 && ht < 0.62);
  assert.ok(soccerRemainingShare(80, 2) < 0.2);
  const r = liveGoalRates({ lh: 1.5, la: 1, share: 0.5, redHome: 1 });
  assert.ok(r.lh < 0.75 && r.la > 0.5);
});

test('points model and markets', () => {
  const now = Date.now();
  const matches = [];
  const rating = { A: 8, B: 2, C: -3, D: -7 };
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (let r = 0; r < 25; r++) for (const h in rating) for (const a in rating) {
    if (h === a) continue;
    const margin = 3 + rating[h] - rating[a] + gauss() * 11;
    const total = 225 + gauss() * 15;
    matches.push({ home: h, away: a, hs: Math.round((total + margin) / 2), as: Math.round((total - margin) / 2), t: now - r * 86400000 * 2 });
  }
  const model = fitPoints(matches, { now });
  const e = expectedPoints(model, 'A', 'D');
  assert.ok(e.ph - e.pa > 12, `margin ${e.ph - e.pa}`);
  assert.ok(model.home > 1 && model.home < 6, `home ${model.home}`);
  assert.ok(model.sigmaM > 8 && model.sigmaM < 15, `sigma ${model.sigmaM}`);
  const mk = pointsMarkets({ mu: 5, sigma: 12, tau: 220, sigmaT: 17 });
  close(mk.moneyline.home + mk.moneyline.away, 1, 1e-6);
  assert.ok(mk.moneyline.home > 0.6);
  const h5 = mk.handicaps['-5'];
  close(h5.home + h5.draw + h5.away, 1, 1e-6);
  assert.ok(h5.draw > 0.02);
  const mu = marginFromWinProb(mk.moneyline.home, 12);
  close(mu, 5, 0.3);
});

test('live points: big lead late is near-certain', () => {
  const mk = pointsMarkets({ mu: 0.2, sigma: 12 * Math.sqrt(0.02), tau: 4, sigmaT: 2, current: [110, 95] });
  assert.ok(mk.moneyline.home > 0.99);
});

test('tennis model', () => {
  const t = tennisPrediction({ rankA: 1, rankB: 50, tour: 'atp' });
  assert.ok(t.pre > 0.75);
  close(Object.values(t.setsBetting).reduce((a, b) => a + b, 0), 1, 1e-6);
  const live = matchWin(0.8, 0.8, { bestOf: 3, setsA: 1, setsB: 0, gamesA: 5, gamesB: 2, inSet: true });
  assert.ok(live > 0.9);
});

test('market-implied sigma reproduces spread + moneyline', async () => {
  const { sigmaFromMarket, marginPmf, pmfMarkets } = await import('../server/models/points.js');
  const s = sigmaFromMarket(6.5, 0.72);
  assert.ok(s > 8 && s < 20, `sigma ${s}`);
  const ph = pmfMarkets(marginPmf({ mu: 6.5, sigma: s, otMu: 0.65 }).pmf).home;
  close(ph, 0.72, 0.005);
  assert.equal(sigmaFromMarket(6.5, 0.4), null, 'contradictory markets');
});

test('team groups use the domestic league, not cups', async () => {
  const { teamGroups } = await import('../server/models/goals.js');
  const m = (league, home, away) => ({ league, home, away });
  const g = teamGroups([m('esp.1', 'real', 'barca'), m('esp.1', 'real', 'sevilla'), m('uefa.champions', 'real', 'psv'), m('ned.1', 'psv', 'ajax'), m('uefa.champions', 'bodo', 'real'), m('fifa.friendly', 'israel', 'norway')]);
  assert.equal(g.get('real'), 'esp.1');
  assert.equal(g.get('psv'), 'ned.1');
  assert.equal(g.get('bodo'), undefined, 'cup-only team has no league group');
  assert.equal(g.get('israel'), 'national');
});

test('league-centred prior lifts a thin-data team from a strong league', async () => {
  const { fitGoals, teamGroups, expectedGoals } = await import('../server/models/goals.js');
  const now = Date.now();
  const ms = [];
  // strong league S (teams beat weak league W in cups); newcomer s9 has only 1 game
  for (let r = 0; r < 20; r++) {
    ms.push({ league: 'S', home: 's1', away: 's2', hs: 2, as: 1, t: now - r * 86400000 * 3 });
    ms.push({ league: 'W', home: 'w1', away: 'w2', hs: 1, as: 1, t: now - r * 86400000 * 3 });
    ms.push({ league: 'cup', home: r % 2 ? 's1' : 's2', away: r % 2 ? 'w1' : 'w2', hs: 3, as: 0, t: now - r * 86400000 * 3 });
  }
  ms.push({ league: 'S', home: 's9', away: 's1', hs: 1, as: 1, t: now - 86400000 });
  const plain = fitGoals(ms, { now });
  const grouped = fitGoals(ms, { now, groups: teamGroups(ms) });
  const lift = (m) => expectedGoals(m, 's9', 'w1').lh / expectedGoals(m, 's9', 'w1').la;
  assert.ok(lift(grouped) > lift(plain), 'newcomer in strong league should be rated higher with the league prior');
});

test('ESPN football leagues keep last year of history (cross-league links)', async () => {
  const { LEAGUES } = await import('../server/leagues.js');
  const espnSoccer = LEAGUES.filter((l) => l.sport === 'soccer' && l.provider === 'espn');
  assert.ok(espnSoccer.length > 10);
  for (const l of espnSoccer) assert.equal(l.history?.prevYear, true, l.key);
});
