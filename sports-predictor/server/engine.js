// Prediction engine: pulls events from providers, fits rating pools, blends
// model and market, prices markets (pre-match and in-play) and finds value.
import { LEAGUES, LEAGUE_BY_KEY, POOLS, leaguesInPool } from './leagues.js';
import * as G from './models/goals.js';
import * as P from './models/points.js';
import { tennisPrediction } from './models/tennis.js';
import { removeVig, overround, expectedValue, kelly, round } from './models/odds.js';
import { matchEvent, normalizeName } from './lib/names.js';
import { mapLimit, withTimeout } from './lib/http.js';
import { ymdUTC, extractSummary, normalizeEvent, setDone } from './providers/espn.js';

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clampP = (p) => Math.min(0.995, Math.max(0.005, p));
const clampW = (w) => Math.min(1, Math.max(0, Number.isFinite(w) ? w : 0.35));
const FULL_SAMPLE = 12;

// Weight of the statistical model when blending with the market. It grows with
// the number of games we have on BOTH teams and reaches the user's setting at
// FULL_SAMPLE games, so thin-data teams (early-season college sports, newly
// promoted clubs) lean on the market instead of producing fake "value".
export function modelWeight(w, sample, hasModel, hasMarket) {
  if (!hasMarket) return 1;
  if (!hasModel) return 0;
  const n = Math.min(sample?.home ?? 0, sample?.away ?? 0);
  return clampW(w) * Math.min(1, n / FULL_SAMPLE);
}

export function createEngine({ cache, espn, tsdb, oddsApi, apiFootball, predLog, config }) {
  const eventIndex = new Map(); // id → last seen normalized event
  const liveHistory = new Map(); // id → [{t, label, home, draw, away}]
  const poolStatus = {};

  // ------------------------------------------------------------------ pools
  async function buildPool(key) {
    const def = POOLS[key];
    const leagues = leaguesInPool(key);
    let incomplete = false;
    const parts = await mapLimit(leagues, 5, async (l) => {
      const p = l.provider === 'espn' ? espn.history(l) : tsdb.history(l);
      return withTimeout(p, 25000, () => { incomplete = true; return []; });
    });
    const matches = [];
    const perLeague = {};
    parts.forEach((p, i) => {
      if (!Array.isArray(p)) { incomplete = true; perLeague[leagues[i].key] = { error: p?.error?.message || 'failed' }; return; }
      perLeague[leagues[i].key] = { matches: p.length };
      matches.push(...p);
    });
    matches.sort((a, b) => a.t - b.t);
    const now = Date.now();
    const model = def.model === 'goals'
      ? G.fitGoals(matches, { halfLifeDays: def.halfLifeDays, priorGames: def.priorGames, groupPriorGames: def.groupPriorGames, levelHalfLifeDays: def.levelHalfLifeDays, now, groups: def.groupPrior ? G.teamGroups(matches) : null })
      : P.fitPoints(matches, { halfLifeDays: def.halfLifeDays, ridgeGames: def.ridgeGames, now });
    const byTeam = new Map();
    const names = new Map();
    for (const m of matches) {
      for (const [k, nm] of [[m.home, m.homeName], [m.away, m.awayName]]) {
        if (!byTeam.has(k)) byTeam.set(k, []);
        byTeam.get(k).push(m);
        names.set(k, nm);
      }
    }
    poolStatus[key] = { matches: matches.length, teams: model.teams.size, builtAt: new Date(now).toISOString(), incomplete, perLeague };
    return { key, def, model, matches, byTeam, names, builtAt: now, incomplete };
  }

  function getPool(key, { waitMs = 12000 } = {}) {
    if (!key || !POOLS[key]) return Promise.resolve(null);
    // swr: an expired pool keeps serving predictions while the refit runs in the background
    const p = cache.wrap(`pool:${key}`, 20 * MIN, () => buildPool(key), { ttlFn: (v) => (v.incomplete ? 90000 : 20 * MIN), swr: true });
    p.catch(() => {});
    return withTimeout(p, waitMs, () => null);
  }

  // ------------------------------------------------------------- odds glue
  function collectBooks(ev) {
    return [...(ev.odds || []), ...(ev.extraOdds || [])];
  }

  function consensus(ev, threeWay) {
    const books = collectBooks(ev).filter((b) => b.h2h?.home && b.h2h?.away && (!threeWay || b.h2h.draw));
    if (!books.length) return null;
    const devig = books.map((b) => {
      const arr = threeWay ? [b.h2h.home, b.h2h.draw, b.h2h.away] : [b.h2h.home, b.h2h.away];
      const p = removeVig(arr);
      return { book: b.book, p, margin: overround(arr) };
    });
    const sharp = devig.find((d) => /pinnacle|betfair/i.test(d.book));
    let probs;
    if (sharp) probs = sharp.p;
    else probs = devig[0].p.map((_, i) => devig.reduce((s, d) => s + d.p[i], 0) / devig.length);
    const out = threeWay ? { home: probs[0], draw: probs[1], away: probs[2] } : { home: probs[0], away: probs[1] };
    const margins = devig.map((d) => d.margin).filter(Number.isFinite);
    return { ...out, source: sharp ? sharp.book : devig.length > 1 ? `ממוצע ${devig.length} סוכנויות` : devig[0].book, books: devig.length, overround: margins.length ? Math.min(...margins) : null };
  }

  function mainTotal(ev) {
    for (const b of collectBooks(ev)) {
      if (b.total?.line != null && b.total.over && b.total.under) {
        const [over] = removeVig([b.total.over, b.total.under]);
        return { line: b.total.line, over, book: b.book };
      }
    }
    for (const b of collectBooks(ev)) if (b.total?.line != null) return { line: b.total.line, over: null, book: b.book };
    return null;
  }

  function mainSpread(ev) {
    for (const b of collectBooks(ev)) if (b.spread?.line != null) return b.spread;
    return null;
  }

  async function attachExternalOdds(events, { bet365 = false } = {}) {
    const byLeague = new Map();
    for (const ev of events) {
      if (ev.state !== 'pre') continue;
      if (!byLeague.has(ev.league)) byLeague.set(ev.league, []);
      byLeague.get(ev.league).push(ev);
    }
    const jobs = [];
    for (const [lk, evs] of byLeague) {
      const league = LEAGUE_BY_KEY.get(lk);
      if (oddsApi.enabled && league.odds) jobs.push(oddsApi.sportOdds(league.odds).then((list) => merge(evs, list)).catch(() => {}));
      if (bet365 && apiFootball.enabled && league.apiFootball) {
        const dates = [...new Set(evs.map((e) => e.start.slice(0, 10)))];
        for (const d of dates) jobs.push(apiFootball.leagueOdds(league.apiFootball, d).then((list) => merge(evs, list)).catch(() => {}));
      }
    }
    await Promise.all(jobs);
  }

  function merge(evs, list) {
    for (const ev of evs) {
      const hit = matchEvent({ home: ev.home.name, away: ev.away.name, start: ev.start }, list);
      if (!hit) continue;
      ev.extraOdds = ev.extraOdds || [];
      for (const b of hit.candidate.books) {
        const book = hit.swapped ? swapBook(b) : b;
        if (!ev.extraOdds.some((x) => x.book === book.book && x.source === book.source)) ev.extraOdds.push(book);
      }
    }
  }

  const swapBook = (b) => ({
    ...b,
    h2h: b.h2h ? { home: b.h2h.away, away: b.h2h.home, draw: b.h2h.draw } : null,
    spread: b.spread ? { line: -b.spread.line, home: b.spread.away, away: b.spread.home } : null,
  });

  // ------------------------------------------------------------ predictions
  function predict(ev, pool, { w = config.modelWeight, full = false } = {}) {
    const league = LEAGUE_BY_KEY.get(ev.league);
    try {
      if (ev.sport === 'tennis') return predictTennis(ev, league, { w, full });
      const def = POOLS[league.pool];
      if (!def) return null;
      return def.model === 'goals' ? predictGoals(ev, league, pool, { w, full }) : predictPoints(ev, league, pool, { w, full });
    } catch (e) {
      return { error: e.message };
    }
  }

  function confidenceOf(sample, hasMarket) {
    const s = Math.min(sample.home, sample.away);
    if (hasMarket && s >= 8) return 'high';
    if (hasMarket || s >= 8) return 'medium';
    return 'low';
  }

  function predictGoals(ev, league, pool, { w, full }) {
    const sport = ev.sport;
    const threeWayMarket = sport === 'soccer';
    const model = pool?.model;
    const rho = sport === 'soccer' ? (model?.rho ?? -0.05) : 0;
    const em = model ? G.expectedGoals(model, ev.home.key, ev.away.key, { neutral: ev.neutral }) : null;
    const sample = em?.sample || { home: 0, away: 0 };
    const mk = consensus(ev, threeWayMarket);
    const tot = mainTotal(ev);
    let lmk = null;
    if (mk) {
      const key = `inv:${sport}:${round(mk.home, 3)}:${round(mk.draw ?? 0, 3)}:${tot?.line}:${round(tot?.over ?? 0, 3)}`;
      lmk = cache.peek(key);
      if (!lmk) {
        lmk = G.invertMarket(mk, tot?.over != null ? tot : null, { rho, drawPossible: threeWayMarket });
        cache.wrap(key, DAY, async () => lmk);
      }
    }
    const wm = modelWeight(w, sample, !!em, !!lmk);
    if (!em && !lmk) return { kind: 'goals', unavailable: true, reason: pool ? 'אין נתונים לקבוצות' : 'המודל נטען…' };
    const blend = (a, b) => Math.exp(wm * Math.log(a) + (1 - wm) * Math.log(b));
    const lh = em && lmk ? blend(em.lh, lmk.lh) : (em?.lh ?? lmk.lh);
    const la = em && lmk ? blend(em.la, lmk.la) : (em?.la ?? lmk.la);

    const otShare = (h, a) => 0.5 + 0.25 * (h - a) / (h + a);
    const twoWay = (x, h, a) => ({ home: x.home + x.draw * otShare(h, a), away: x.away + x.draw * (1 - otShare(h, a)) });

    const modelX = em ? G.matrix1x2(G.scoreMatrix(em.lh, em.la, { rho })) : null;
    const preMatrix = G.scoreMatrix(lh, la, { rho });
    const fairX = G.matrix1x2(preMatrix);

    let liveInfo = null, matrix = preMatrix, rates = null;
    const hs = ev.home.score ?? 0, as = ev.away.score ?? 0;
    if (ev.state === 'in') {
      const share = remainingShareGoals(ev, league);
      rates = G.liveGoalRates({ lh, la, share, scoreDiff: hs - as, redHome: ev.home.red || 0, redAway: ev.away.red || 0, scoreEffects: sport === 'soccer' });
      matrix = G.scoreMatrix(rates.lh, rates.la, { base: [hs, as] });
      liveInfo = { share, remaining: { home: rates.lh, away: rates.la }, nextGoal: G.nextGoal(rates.lh, rates.la), minute: liveMinute(ev, league) };
    } else if (ev.state === 'post') {
      matrix = G.scoreMatrix(0, 0, { base: [hs, as] });
    }
    const markets = G.matrixMarkets(matrix, { current: ev.state === 'pre' ? [0, 0] : [hs, as] });
    let probs = markets['1x2'];
    // In extra time / OT the regulation 1X2 is settled as a draw.
    const overtime = ev.state === 'in' && ((sport === 'soccer' && ev.status.period >= 3) || (sport === 'hockey' && ev.status.period >= 4) || (sport === 'baseball' && ev.status.period >= 10));
    const out = {
      kind: 'goals', sport, threeWay: true,
      probs: { home: probs.home, draw: probs.draw, away: probs.away },
      model: modelX, market: mk, fair: fairX,
      twoWay: sport !== 'soccer' ? twoWay(probs, lh, la) : null,
      expected: markets.expected, lambda: { home: lh, away: la, modelHome: em?.lh, modelAway: em?.la, marketHome: lmk?.lh, marketAway: lmk?.la },
      weight: wm, sample, confidence: confidenceOf(sample, !!mk),
      live: liveInfo, overtime,
      totals: pickTotals(markets.totals, tot?.line ?? (sport === 'soccer' ? 2.5 : sport === 'hockey' ? 5.5 : 8.5), matrix),
      btts: sport === 'soccer' ? markets.btts : null,
      topScores: markets.topScores.slice(0, 5),
      marketTotal: tot,
    };
    out.pick = pickOf(out.probs);
    out.value = ev.state === 'pre' ? findValue(ev, (sel, line, market) => priceGoals(matrix, sel, line, market, out)) : [];
    out.best = bestPrices(ev);
    if (full) out.markets = { ...markets, twoWay: out.twoWay };
    return out;
  }

  function priceGoals(m, sel, line, market, out) {
    if (market === '1x2') {
      if (out.sport !== 'soccer') return (out.twoWay || out.probs)[sel];
      return out.probs[sel];
    }
    if (market === 'total') { const t = G.matrixTotal(m, line); const n = 1 - t.push; return n > 0 ? t[sel] / n : null; }
    if (market === 'spread') { const r = G.matrix1x2(m, line); const n = r.home + r.away; return n > 0 ? (sel === 'home' ? r.home : r.away) / n : null; }
    if (market === 'btts') return out.btts?.[sel] ?? null;
    return null;
  }

  function pickTotals(totals, line, m) {
    const t = G.matrixTotal(m, line);
    return { line, over: t.over, under: t.under };
  }

  function remainingShareGoals(ev, league) {
    const st = ev.status;
    if (ev.sport === 'soccer') {
      const minute = liveMinute(ev, league);
      if (st.period >= 3) return Math.max(0.02, (122 - minute) / 90) * 0.9;
      return G.soccerRemainingShare(minute, st.period || 1, { halftime: st.halftime });
    }
    if (ev.sport === 'hockey') {
      const per = 20 * 60;
      if (st.period > 3) return Math.max(0.01, (st.clock || 0) / (60 * 60));
      const remPeriod = st.endPeriod ? 0 : (st.clock ?? per);
      return Math.max(0, ((3 - st.period) * per + remPeriod) / (3 * per));
    }
    if (ev.sport === 'baseball') {
      const inning = st.period || 1;
      const top = /top|mid/i.test(st.detail || st.short || '');
      const halvesLeft = Math.max(0.5, (9 - inning) * 2 + (top ? 1.5 : 0.5));
      return Math.min(1, halvesLeft / 18);
    }
    return 1;
  }

  function liveMinute(ev, league) {
    const st = ev.status;
    if (st.minute != null) return st.minute;
    if (ev.sport === 'soccer') return Math.round((st.clock || 0) / 60);
    return null;
  }

  function predictPoints(ev, league, pool, { w, full }) {
    const model = pool?.model;
    const fmt = league.format || { periods: 4, periodMin: 12, otMin: 5 };
    const regSec = fmt.periods * fmt.periodMin * 60;
    const ep = model ? P.expectedPoints(model, ev.home.key, ev.away.key, { neutral: ev.neutral }) : null;
    const sample = ep?.sample || { home: 0, away: 0 };
    const sigmaModel = model?.n > 30 ? model.sigmaM : (ev.sport === 'football' ? 13.5 : 12);
    const sigmaT = model?.n > 30 ? model.sigmaT : (ev.sport === 'football' ? 13 : 18);
    const mk = consensus(ev, false);
    const spread = mainSpread(ev);
    const tot = mainTotal(ev);
    let muMk = null;
    if (spread?.line != null) muMk = -spread.line;
    else if (mk) muMk = P.marginFromWinProb(mk.home, sigmaModel);
    const tauMk = tot?.line ?? null;
    if (!ep && muMk == null) return { kind: 'points', unavailable: true, reason: pool ? 'אין נתונים לקבוצות' : 'המודל נטען…' };
    const wm = modelWeight(w, sample, !!ep, muMk != null);
    // The market's own outcome spread, implied by point spread + moneyline together;
    // using the model's sigma alone would misprice spreads against the market.
    const sigmaImp = spread?.line != null && mk ? P.sigmaFromMarket(-spread.line, mk.home) : null;
    const sigma = sigmaImp ? wm * sigmaModel + (1 - wm) * sigmaImp : sigmaModel;
    const muModel = ep ? ep.ph - ep.pa : null, tauModel = ep ? ep.ph + ep.pa : null;
    const tau = tauModel != null && tauMk != null ? wm * tauModel + (1 - wm) * tauMk : (tauModel ?? tauMk ?? (ev.sport === 'football' ? 44 : 160));
    const otScale = (fmt.otMin || 5) / (regSec / 60);
    const otSigma = Math.max(3, sigma * Math.sqrt(otScale) * 1.3);
    const modelMk = ep ? P.pointsMarkets({ mu: muModel, sigma: sigmaModel, tau: tauModel, sigmaT, otMu: muModel * otScale, otSigma }) : null;
    let mu;
    if (modelMk && mk) {
      // Blend win probabilities against the de-vigged moneyline, then derive the margin.
      // Blending margins instead would let a misfit sigma create phantom underdog value.
      const pFair = sigmoid(wm * logit(clampP(modelMk.moneyline.home)) + (1 - wm) * logit(clampP(mk.home)));
      mu = P.marginFromWinProb(pFair, sigma);
    } else {
      mu = muModel != null && muMk != null ? wm * muModel + (1 - wm) * muMk : (muModel ?? muMk);
    }
    const otMu = mu * otScale;

    const pre = P.pointsMarkets({ mu, sigma, tau, sigmaT, spreadLine: spread?.line, totalLine: tot?.line, otMu, otSigma });
    let mkts = pre, liveInfo = null;
    const hs = ev.home.score ?? 0, as = ev.away.score ?? 0;
    if (ev.state === 'in' || ev.state === 'post') {
      let r = 0;
      if (ev.state === 'in') r = remainingFractionPoints(ev, fmt, regSec, tau);
      const elapsed = 1 - Math.min(1, r);
      let tauRem = tau * r;
      if (ev.state === 'in' && elapsed > 0.15 && r > 0) {
        const observed = (hs + as) / elapsed; // pace-adjusted projection
        tauRem = r * (0.6 * tau + 0.4 * observed);
      }
      mkts = P.pointsMarkets({ mu: mu * r, sigma: sigma * Math.sqrt(r), tau: tauRem, sigmaT: sigmaT * Math.sqrt(r), current: [hs, as], spreadLine: spread?.line, totalLine: tot?.line, otMu, otSigma });
      if (ev.state === 'in') liveInfo = { remaining: r, projectedTotal: hs + as + tauRem, projectedMargin: hs - as + mu * r };
    }
    const out = {
      kind: 'points', sport: ev.sport, threeWay: false,
      probs: { home: mkts.moneyline.home, away: mkts.moneyline.away },
      regulation: mkts.regulation,
      model: modelMk ? modelMk.moneyline : null, market: mk, fair: pre.moneyline,
      expected: mkts.expected, margin: { mu, sigma, sigmaModel, sigmaMarket: sigmaImp, model: muModel, market: muMk }, total: { tau, sigmaT, model: tauModel, market: tauMk },
      weight: wm, sample, confidence: confidenceOf(sample, mk != null || muMk != null),
      live: liveInfo,
      spreadLine: spread?.line ?? null,
      totals: tot?.line != null ? { line: tot.line, ...P.totalProbs(ev.state === 'in' ? (mkts.expected.total - hs - as) : tau, mkts.sigmaT, tot.line, ev.state === 'in' ? hs + as : 0) } : null,
      marketTotal: tot,
    };
    out.pick = pickOf(out.probs);
    out.value = ev.state === 'pre' ? findValue(ev, (sel, line, market) => {
      if (market === '1x2') return out.probs[sel] ?? null;
      if (market === 'spread') { const r = P.pmfMarkets(mkts.pmf, line); const n = r.home + r.away; return n ? (sel === 'home' ? r.home : r.away) / n : null; }
      if (market === 'total') return P.totalProbs(tau, sigmaT, line)[sel];
      return null;
    }) : [];
    out.best = bestPrices(ev);
    if (full) { const { pmf, ...rest } = mkts; out.markets = rest; }
    return out;
  }

  function remainingFractionPoints(ev, fmt, regSec, tau) {
    const st = ev.status;
    const perSec = fmt.periodMin * 60;
    if (ev.provider === 'tsdb' && !st.period) {
      // No period info (e.g. "BT" = break between quarters): estimate elapsed game
      // time from the score vs expected total and from wall-clock time, then snap
      // to the nearest break.
      if (st.halftime) return 0.5;
      const cur = (ev.home.score ?? 0) + (ev.away.score ?? 0);
      const byScore = tau > 0 ? cur / tau : 0.5;
      const byClock = (Date.now() - Date.parse(ev.start)) / ((fmt.periods * fmt.periodMin * 2.6 + 10) * 60000);
      const e = Math.min(0.97, Math.max(0.05, 0.6 * byScore + 0.4 * byClock));
      const snap = /BT|break/i.test(st.name || '') ? Math.min(fmt.periods - 1, Math.max(1, Math.round(e * fmt.periods))) / fmt.periods : e;
      return 1 - snap;
    }
    const p = st.period || 1;
    let clock = st.clock;
    if (clock == null || ev.provider === 'tsdb') clock = perSec / 2; // no clock from TSDB free tier
    if (st.endPeriod || st.halftime) clock = 0;
    if (p > fmt.periods) return Math.max(0.002, clock / regSec);
    return Math.max(0.002, ((fmt.periods - p) * perSec + clock) / regSec);
  }

  function predictTennis(ev, league, { w, full }) {
    const mk = consensus(ev, false);
    const pModel = tennisPrediction({ rankA: ev.home.rank ?? 250, rankB: ev.away.rank ?? 250, tour: league.tour, bestOf: ev.bestOf }).pre;
    const wm = mk ? clampW(w) : 1;
    const fairA = mk ? sigmoid(wm * logit(pModel) + (1 - wm) * logit(mk.home)) : pModel;
    let state = null;
    if (ev.state === 'in' && ev.sets?.length) {
      let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0, inSet = false;
      for (const s of ev.sets) {
        if (setDone(s)) { if (s.a > s.b) setsA++; else setsB++; } else { gamesA = s.a || 0; gamesB = s.b || 0; inSet = true; }
      }
      const aServes = ev.home.serving ? true : ev.away.serving ? false : null;
      state = { setsA, setsB, gamesA, gamesB, inSet, aServes };
    }
    const t = tennisPrediction({ rankA: ev.home.rank ?? 250, rankB: ev.away.rank ?? 250, tour: league.tour, bestOf: ev.bestOf, state, marketProbA: fairA });
    const pa = ev.state === 'post' ? (ev.home.winner ? 1 : 0) : t.live;
    const out = {
      kind: 'tennis', sport: 'tennis', threeWay: false,
      probs: { home: pa, away: 1 - pa },
      model: { home: pModel, away: 1 - pModel }, market: mk, fair: { home: fairA, away: 1 - fairA },
      weight: wm, sample: { home: ev.home.rank ? 10 : 0, away: ev.away.rank ? 10 : 0 },
      confidence: mk ? 'medium' : ev.home.rank && ev.away.rank ? 'medium' : 'low', live: state ? { ...state } : null,
      setsBetting: t.setsBetting, holds: { home: t.holdA, away: t.holdB },
    };
    out.pick = pickOf(out.probs);
    out.value = ev.state === 'pre' ? findValue(ev, (sel, line, market) => (market === '1x2' ? out.probs[sel] : null)) : [];
    out.best = bestPrices(ev);
    return out;
  }

  function pickOf(probs) {
    let best = null;
    for (const [k, v] of Object.entries(probs)) if (v != null && (!best || v > best.p)) best = { sel: k, p: v };
    return best ? { ...best, fairOdds: 1 / best.p } : null;
  }

  function bestPrices(ev) {
    const best = {};
    for (const b of collectBooks(ev)) {
      for (const k of ['home', 'draw', 'away']) {
        const o = b.h2h?.[k];
        if (o > 1 && (!best[k] || o > best[k].odds)) best[k] = { odds: o, book: b.book };
      }
    }
    return best;
  }

  function findValue(ev, price) {
    const out = [];
    for (const b of collectBooks(ev)) {
      const push = (market, sel, line, odds) => {
        if (!(odds > 1)) return;
        const p = price(sel, line, market);
        if (!(p > 0)) return;
        const e = expectedValue(p, odds);
        out.push({ book: b.book, source: b.source, market, sel, line: line ?? null, odds, p, ev: e, kelly: kelly(p, odds), fairOdds: 1 / p });
      };
      if (b.h2h) for (const k of ['home', 'draw', 'away']) push('1x2', k, null, b.h2h[k]);
      if (b.total?.line != null) { push('total', 'over', b.total.line, b.total.over); push('total', 'under', b.total.line, b.total.under); }
      if (b.spread?.line != null && !Number.isInteger(b.spread.line)) { push('spread', 'home', b.spread.line, b.spread.home); push('spread', 'away', b.spread.line, b.spread.away); }
      if (b.btts) { push('btts', 'yes', null, b.btts.yes); push('btts', 'no', null, b.btts.no); }
    }
    return out.sort((a, b) => b.ev - a.ev);
  }

  // ---------------------------------------------------------------- events
  function tzOffsetMs(tz, at) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value]));
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return asUTC - at.getTime();
  }
  const localYmd = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

  function dayRange(date, tz) {
    const [y, m, d] = date.split('-').map(Number);
    const guess = new Date(Date.UTC(y, m - 1, d));
    const start = new Date(guess.getTime() - tzOffsetMs(tz, guess));
    const end = new Date(start.getTime() + DAY - 1);
    return { start, end };
  }

  function espnDatesFor(date, tz) {
    const { start, end } = dayRange(date, tz);
    const set = new Set();
    for (const t of [start, new Date((start.getTime() + end.getTime()) / 2), end]) {
      set.add(localYmd(t.toISOString(), 'America/New_York').replace(/-/g, ''));
    }
    return [...set];
  }

  async function leagueEvents(league, date, tz) {
    if (league.provider === 'tsdb') {
      const evs = await tsdb.events(league);
      return evs.filter((e) => e.start && localYmd(e.start, tz) === date);
    }
    const today = ymdUTC(new Date());
    const dates = espnDatesFor(date, tz);
    const lists = await Promise.all(dates.map((ymd) => {
      const ttl = ymd < today ? HOUR : ymd > today ? 5 * MIN : 20000;
      return espn.scoreboard(league, ymd, { ttl }).catch(() => []);
    }));
    const seen = new Set();
    const out = lists.flat().filter((e) => {
      if (seen.has(e.id) || !e.start) return false;
      seen.add(e.id);
      return localYmd(e.start, tz) === date;
    });
    if (league.sport === 'tennis') await attachRankings(out, league.tour);
    return out;
  }

  async function attachRankings(events, tour) {
    let rk = {};
    try { rk = await espn.tennisRankings(tour); } catch { /* rankings unavailable */ }
    for (const e of events) {
      for (const side of [e.home, e.away]) {
        const r = rk[`id:${side.id}`] || rk[`n:${side.key}`];
        side.rank = r?.rank ?? null;
        side.points = r?.points ?? null;
      }
    }
  }

  function selectLeagues({ sport, league, featured } = {}) {
    return LEAGUES.filter((l) => (!sport || sport === 'all' || l.sport === sport) && (!league || l.key === league) && (!featured || l.featured));
  }

  async function listEvents({ date, tz = 'Asia/Jerusalem', sport, league, featured, w, bet365 } = {}) {
    date = date || localYmd(new Date().toISOString(), tz);
    const leagues = selectLeagues({ sport, league, featured });
    const slow = [];
    const lists = await mapLimit(leagues, 8, (l) => withTimeout(
      leagueEvents(l, date, tz).catch(() => []),
      12000,
      () => { slow.push(l.key); return []; },
    ));
    const events = lists.flatMap((x) => (Array.isArray(x) ? x : []));
    await attachExternalOdds(events, { bet365 });
    const pools = new Map();
    await Promise.all([...new Set(events.map((e) => LEAGUE_BY_KEY.get(e.league).pool).filter(Boolean))].map(async (k) => pools.set(k, await getPool(k))));
    for (const ev of events) {
      const pool = pools.get(LEAGUE_BY_KEY.get(ev.league).pool) || null;
      ev.prediction = predict(ev, pool, { w });
      eventIndex.set(ev.id, ev);
      recordLive(ev);
      logPrediction(ev);
    }
    const order = { in: 0, pre: 1, post: 2, off: 3 };
    events.sort((a, b) => order[a.state] - order[b.state] || Date.parse(a.start) - Date.parse(b.start));
    return { date, tz, events: events.map(slim), pools: poolStatus, loadingLeagues: slow };
  }

  function slim(ev) {
    const { extraOdds, goals, ...rest } = ev;
    const league = LEAGUE_BY_KEY.get(ev.league);
    return {
      ...rest, goals: goals?.slice(-8), books: collectBooks(ev).length,
      leagueName: league.he, country: league.country,
      history: liveHistory.get(ev.id)?.slice(-40) || null,
    };
  }

  function recordLive(ev) {
    if (ev.state !== 'in' || !ev.prediction?.probs) return;
    const arr = liveHistory.get(ev.id) || [];
    const p = ev.prediction.probs;
    const last = arr[arr.length - 1];
    const changed = !last || Math.abs(last.home - p.home) > 0.004 || Math.abs((last.away ?? 0) - (p.away ?? 0)) > 0.004;
    if (changed || Date.now() - last.t > 60000) {
      arr.push({ t: Date.now(), label: ev.status.display || ev.status.short, home: round(p.home, 4), draw: p.draw != null ? round(p.draw, 4) : null, away: round(p.away, 4), score: `${ev.home.score ?? 0}-${ev.away.score ?? 0}` });
      if (arr.length > 300) arr.shift();
      liveHistory.set(ev.id, arr);
    }
  }

  function logPrediction(ev) {
    const data = predLog.get();
    const pr = ev.prediction;
    const untilStart = Date.parse(ev.start) - Date.now();
    // Only genuine pre-match snapshots: never after the scheduled start (stale feeds can still say "not started").
    if (ev.state === 'pre' && pr?.probs && !pr.unavailable && untilStart > 0 && untilStart < 36 * HOUR) {
      data[ev.id] = {
        ...(data[ev.id] || {}), id: ev.id, league: ev.league, sport: ev.sport, start: ev.start,
        home: ev.home.name, away: ev.away.name, threeWay: pr.threeWay && ev.sport === 'soccer',
        model: pr.model, market: pr.market ? { home: pr.market.home, draw: pr.market.draw, away: pr.market.away } : null,
        fair: ev.sport === 'soccer' ? pr.fair : (pr.twoWay || pr.fair), confidence: pr.confidence,
        value: (pr.value || []).filter((v) => v.ev > 0.03 && v.market === '1x2').slice(0, 3).map((v) => ({ sel: v.sel, odds: v.odds, ev: v.ev, book: v.book })),
        snapAt: new Date().toISOString(),
      };
      predLog.save();
    } else if (ev.state === 'post' && data[ev.id] && !data[ev.id].result && ev.home.score != null) {
      data[ev.id].result = { hs: ev.home.score, as: ev.away.score, winner: ev.home.winner ? 'home' : ev.away.winner ? 'away' : null };
      predLog.save();
    }
  }

  async function findEvent(id, { tz = 'Asia/Jerusalem' } = {}) {
    if (eventIndex.has(id)) return eventIndex.get(id);
    const [prov, lk, nid] = id.split('~');
    const league = LEAGUE_BY_KEY.get(lk);
    if (!league) return null;
    if (prov === 'tsdb') {
      const evs = await tsdb.events(league);
      return evs.find((e) => e.id === id) || null;
    }
    const sum = await espn.summary(league, nid);
    const comp = sum.header?.competitions?.[0];
    if (!comp) return null;
    const ev = normalizeEvent({ id: nid, name: sum.header?.name || '', date: comp.date, competitions: [{ ...comp, odds: [] }], season: sum.header?.season }, league);
    return ev;
  }

  async function eventDetail(id, { w, tz } = {}) {
    let ev = await findEvent(id, { tz });
    if (!ev) return null;
    const league = LEAGUE_BY_KEY.get(ev.league);
    // refresh the event itself (score/clock) for live matches
    if (ev.state === 'in' && ev.provider === 'espn' && league.sport !== 'tennis') {
      const ymd = localYmd(ev.start, 'America/New_York').replace(/-/g, '');
      const list = await espn.scoreboard(league, ymd, { ttl: 15000 }).catch(() => []);
      ev = list.find((x) => x.id === id) || ev;
    }
    ev = { ...ev };
    await attachExternalOdds([ev], { bet365: true });
    const pool = await getPool(league.pool, { waitMs: 30000 });
    ev.prediction = predict(ev, pool, { w, full: true });
    recordLive(ev);
    let extras = null;
    if (ev.provider === 'espn' && league.sport !== 'tennis') {
      try { extras = extractSummary(await espn.summary(league, ev.nativeId)); } catch { extras = null; }
    }
    const teamInfo = pool ? {
      home: teamCard(pool, ev.home.key), away: teamCard(pool, ev.away.key),
      h2h: headToHead(pool, ev.home.key, ev.away.key),
    } : null;
    let table = null;
    try { table = league.provider === 'espn' && league.sport !== 'tennis' && !/uefa|fifa/.test(league.key) ? await espn.standings(league) : (pool ? computedTable(pool, league) : null); } catch { table = pool ? computedTable(pool, league) : null; }
    return {
      event: { ...slim(ev), allBooks: collectBooks(ev) },
      prediction: ev.prediction, extras, teams: teamInfo, table,
      liveHistory: liveHistory.get(id) || [],
      pool: pool ? { key: pool.key, matches: pool.matches.length, teams: pool.model.teams.size, builtAt: new Date(pool.builtAt).toISOString(), params: poolParams(pool) } : null,
    };
  }

  function poolParams(pool) {
    const m = pool.model;
    if (pool.def.model === 'goals') return { homeAdvantage: Math.exp(m.home), avgGoals: Math.exp(m.mu), rho: m.rho };
    return { homeAdvantage: m.home, base: m.base, sigmaMargin: m.sigmaM, sigmaTotal: m.sigmaT };
  }

  function teamCard(pool, key) {
    const t = pool.model.teams.get(key);
    const games = (pool.byTeam.get(key) || []).slice(-8).reverse().map((m) => {
      const home = m.home === key;
      const gf = home ? m.hs : m.as, ga = home ? m.as : m.hs;
      return { date: new Date(m.t).toISOString(), opponent: home ? m.awayName : m.homeName, home, gf, ga, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', league: m.league };
    });
    const ratings = pool.def.model === 'goals'
      ? (t ? { attack: Math.exp(t.att), defense: Math.exp(-t.def) } : null)
      : (t ? { offense: pool.model.base + t.off, defense: pool.model.base - t.def, net: t.off + t.def } : null);
    const rank = rankInPool(pool, key);
    return { name: pool.names.get(key) || key, games: t?.n || 0, ratings, form: games, rank };
  }

  function rankInPool(pool, key) {
    const list = [...pool.model.teams.entries()].filter(([, t]) => t.n >= 5)
      .map(([k, t]) => [k, pool.def.model === 'goals' ? t.att + t.def : t.off + t.def]).sort((a, b) => b[1] - a[1]);
    const i = list.findIndex(([k]) => k === key);
    return i < 0 ? null : { position: i + 1, of: list.length };
  }

  function headToHead(pool, a, b) {
    return (pool.byTeam.get(a) || []).filter((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a))
      .slice(-8).reverse().map((m) => ({ date: new Date(m.t).toISOString(), home: m.homeName, away: m.awayName, hs: m.hs, as: m.as, league: m.league }));
  }

  function computedTable(pool, league) {
    const rows = new Map();
    const soccer = league.sport === 'soccer';
    const seasonStart = Date.now() - 300 * DAY;
    for (const m of pool.matches) {
      if (m.league !== league.key || m.t < seasonStart) continue;
      for (const [k, nm, gf, ga] of [[m.home, m.homeName, m.hs, m.as], [m.away, m.awayName, m.as, m.hs]]) {
        if (!rows.has(k)) rows.set(k, { team: nm, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 });
        const r = rows.get(k);
        r.played++; r.gf += gf; r.ga += ga;
        if (gf > ga) { r.wins++; r.points += soccer ? 3 : 2; } else if (gf < ga) { r.losses++; r.points += soccer ? 0 : 1; } else { r.draws++; r.points += 1; }
      }
    }
    const entries = [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga, record: soccer ? `${r.wins}-${r.draws}-${r.losses}` : `${r.wins}-${r.losses}` }))
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf).map((r, i) => ({ ...r, rank: i + 1 }));
    return entries.length ? [{ name: league.he, entries }] : null;
  }

  async function ratings(poolKey, { league } = {}) {
    const pool = await getPool(poolKey, { waitMs: 60000 });
    if (!pool) return null;
    const leagueOf = new Map();
    for (const m of pool.matches) { leagueOf.set(m.home, m.league); leagueOf.set(m.away, m.league); }
    const list = (pool.def.model === 'goals' ? G.teamRatings(pool.model) : P.teamRatings(pool.model))
      .map((r) => ({ ...r, key: r.name, name: pool.names.get(r.name) || r.name, league: leagueOf.get(r.name) }))
      .filter((r) => r.games >= 3 && (!league || r.league === league))
      .sort((a, b) => (b.strength ?? b.net) - (a.strength ?? a.net));
    return { pool: poolKey, params: poolParams(pool), teams: list, builtAt: new Date(pool.builtAt).toISOString() };
  }

  return { listEvents, eventDetail, getPool, ratings, poolStatus, findEvent, selectLeagues };
}
