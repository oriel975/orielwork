// Walk-forward backtest: refit the ratings each week using only games played
// before that week, predict the week, score against real results.
import * as G from './models/goals.js';
import * as P from './models/points.js';
import { LEAGUE_BY_KEY } from './leagues.js';

const DAY = 86400000;

function emptyStats() {
  return { n: 0, correct: 0, brier: 0, logloss: 0, baseBrier: 0, baseLogloss: 0, calib: Array.from({ length: 10 }, () => ({ p: 0, hit: 0, n: 0 })) };
}

function score(stats, probs, outcomeIdx, base) {
  stats.n++;
  let best = 0;
  probs.forEach((p, i) => { if (p > probs[best]) best = i; });
  if (best === outcomeIdx) stats.correct++;
  probs.forEach((p, i) => {
    const y = i === outcomeIdx ? 1 : 0;
    stats.brier += (p - y) ** 2;
    stats.baseBrier += (base[i] - y) ** 2;
    const b = Math.min(9, Math.floor(p * 10));
    stats.calib[b].p += p; stats.calib[b].hit += y; stats.calib[b].n++;
  });
  stats.logloss += -Math.log(Math.max(1e-6, probs[outcomeIdx]));
  stats.baseLogloss += -Math.log(Math.max(1e-6, base[outcomeIdx]));
}

function finalize(s) {
  if (!s.n) return { n: 0 };
  return {
    n: s.n,
    accuracy: s.correct / s.n,
    brier: s.brier / s.n,
    logloss: s.logloss / s.n,
    baselineBrier: s.baseBrier / s.n,
    baselineLogloss: s.baseLogloss / s.n,
    skill: 1 - s.brier / s.baseBrier, // >0 = better than base rates
    calibration: s.calib.filter((c) => c.n).map((c) => ({ predicted: c.p / c.n, actual: c.hit / c.n, n: c.n })),
  };
}

export function runBacktest(pool, { days = 56, stepDays = 7, now = Date.now(), groupPrior = pool.def.groupPrior ?? false } = {}) {
  const goals = pool.def.model === 'goals';
  const threeWay = pool.def.sport === 'soccer';
  const matches = pool.matches;
  const overall = emptyStats();
  const byLeague = new Map();
  let weeks = 0;
  for (let ws = now - days * DAY; ws < now; ws += stepDays * DAY) {
    const train = matches.filter((m) => m.t < ws);
    const test = matches.filter((m) => m.t >= ws && m.t < ws + stepDays * DAY);
    if (train.length < 60 || !test.length) continue;
    weeks++;
    const model = goals
      ? G.fitGoals(train, { halfLifeDays: pool.def.halfLifeDays, priorGames: pool.def.priorGames, groupPriorGames: pool.def.groupPriorGames, now: ws, iterations: 40, groups: groupPrior ? G.teamGroups(train) : null })
      : P.fitPoints(train, { halfLifeDays: pool.def.halfLifeDays, ridgeGames: pool.def.ridgeGames, now: ws, iterations: 50 });
    // base rates from the training window
    const recent = train.slice(-1500);
    const hw = recent.filter((m) => m.hs > m.as).length / recent.length;
    const dr = recent.filter((m) => m.hs === m.as).length / recent.length;
    const base = threeWay ? [hw, dr, 1 - hw - dr] : [hw / (1 - dr || 1), 1 - hw / (1 - dr || 1)];
    for (const m of test) {
      const th = model.teams.get(m.home), ta = model.teams.get(m.away);
      if (!th || !ta || th.n < 3 || ta.n < 3) continue;
      let probs;
      if (goals) {
        const e = G.expectedGoals(model, m.home, m.away, { neutral: m.neutral });
        const r = G.matrix1x2(G.scoreMatrix(e.lh, e.la, { rho: threeWay ? model.rho : 0 }));
        probs = threeWay ? [r.home, r.draw, r.away] : [r.home + r.draw / 2, r.away + r.draw / 2];
      } else {
        const e = P.expectedPoints(model, m.home, m.away, { neutral: m.neutral });
        const mk = P.pointsMarkets({ mu: e.ph - e.pa, sigma: model.sigmaM, tau: e.ph + e.pa, sigmaT: model.sigmaT });
        probs = [mk.moneyline.home, mk.moneyline.away];
      }
      let outcome;
      if (threeWay) outcome = m.hs > m.as ? 0 : m.hs === m.as ? 1 : 2;
      else { if (m.hs === m.as) continue; outcome = m.hs > m.as ? 0 : 1; }
      score(overall, probs, outcome, base);
      if (!byLeague.has(m.league)) byLeague.set(m.league, emptyStats());
      score(byLeague.get(m.league), probs, outcome, base);
    }
  }
  return {
    pool: pool.key, threeWay, weeks, days,
    overall: finalize(overall),
    leagues: [...byLeague.entries()].map(([k, s]) => ({ league: k, name: LEAGUE_BY_KEY.get(k)?.he || k, ...finalize(s) })).sort((a, b) => b.n - a.n),
    generatedAt: new Date().toISOString(),
  };
}

// Track record of real snapshots taken before kick-off (model vs market vs blend).
export function trackRecord(log) {
  const entries = Object.values(log).filter((e) => e.result && e.fair);
  const groups = { model: emptyStats(), market: emptyStats(), fair: emptyStats() };
  const byLeague = new Map();
  const valueSim = { bets: 0, staked: 0, profit: 0 };
  for (const e of entries) {
    const { hs, as } = e.result;
    const three = e.threeWay;
    if (!three && hs === as) continue;
    const outcome = three ? (hs > as ? 0 : hs === as ? 1 : 2) : (hs > as ? 0 : 1);
    const vec = (p) => (!p ? null : three ? [p.home, p.draw, p.away] : [p.home, p.away]);
    const base = three ? [0.45, 0.27, 0.28] : [0.56, 0.44];
    for (const k of ['model', 'market', 'fair']) {
      const v = vec(e[k]);
      if (!v || v.some((x) => x == null || !Number.isFinite(x))) continue;
      const z = v.reduce((a, b) => a + b, 0);
      score(groups[k], v.map((x) => x / z), outcome, base);
    }
    if (!byLeague.has(e.league)) byLeague.set(e.league, emptyStats());
    const fv = vec(e.fair);
    if (fv) score(byLeague.get(e.league), fv, outcome, base);
    for (const v of e.value || []) {
      const idx = three ? { home: 0, draw: 1, away: 2 }[v.sel] : { home: 0, away: 1 }[v.sel];
      valueSim.bets++; valueSim.staked += 1;
      valueSim.profit += idx === outcome ? v.odds - 1 : -1;
    }
  }
  return {
    settled: entries.length,
    pending: Object.values(log).filter((e) => !e.result).length,
    model: finalize(groups.model), market: finalize(groups.market), fair: finalize(groups.fair),
    leagues: [...byLeague.entries()].map(([k, s]) => ({ league: k, name: LEAGUE_BY_KEY.get(k)?.he || k, ...finalize(s) })).sort((a, b) => b.n - a.n),
    valueBets: { ...valueSim, roi: valueSim.staked ? valueSim.profit / valueSim.staked : null },
  };
}
