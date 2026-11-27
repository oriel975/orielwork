// Goal-based sports (football/soccer, ice hockey, baseball runs).
// Team strengths are fitted with a time-weighted Dixon–Coles style Poisson
// model; markets are derived from the full score matrix so any Winner-style
// handicap (1X2 with a goal start) or total line can be priced.

const DAY = 86400000;

export function poissonVector(lambda, max) {
  const out = new Array(max + 1).fill(0);
  if (!(lambda > 0)) { out[0] = 1; return out; }
  let p = Math.exp(-lambda);
  out[0] = p;
  for (let k = 1; k <= max; k++) { p *= lambda / k; out[k] = p; }
  return out;
}

function dcTau(h, a, lh, la, rho) {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

// Matrix of FINAL score probabilities. `base` is the current score (live),
// lh/la are expected goals still to come.
export function scoreMatrix(lh, la, { rho = 0, base = [0, 0], max } = {}) {
  const span = max ?? Math.max(10, Math.ceil(Math.max(lh, la) * 2.5 + 6));
  const ph = poissonVector(lh, span);
  const pa = poissonVector(la, span);
  const size = span + 1;
  const m = Array.from({ length: base[0] + size }, () => new Array(base[1] + size).fill(0));
  let total = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let p = ph[i] * pa[j];
      if (rho && base[0] === 0 && base[1] === 0) p *= Math.max(0, dcTau(i, j, lh, la, rho));
      m[base[0] + i][base[1] + j] = p;
      total += p;
    }
  }
  for (const row of m) for (let j = 0; j < row.length; j++) row[j] /= total;
  return m;
}

function eachCell(m, fn) {
  for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) if (m[i][j]) fn(i, j, m[i][j]);
}

export function matrix1x2(m, handicap = 0) {
  let home = 0, draw = 0, away = 0;
  eachCell(m, (i, j, p) => {
    const d = i + handicap - j;
    if (Math.abs(d) < 1e-9) draw += p; else if (d > 0) home += p; else away += p;
  });
  return { home, draw, away };
}

export function matrixTotal(m, line) {
  let over = 0, under = 0, push = 0;
  eachCell(m, (i, j, p) => {
    const t = i + j;
    if (Math.abs(t - line) < 1e-9) push += p; else if (t > line) over += p; else under += p;
  });
  return { over, under, push };
}

export function matrixMarkets(m, { current = [0, 0] } = {}) {
  const x12 = matrix1x2(m);
  let btts = 0, expH = 0, expA = 0;
  const scores = [];
  eachCell(m, (i, j, p) => {
    if (i > 0 && j > 0) btts += p;
    expH += i * p; expA += j * p;
    scores.push({ score: `${i}-${j}`, p });
  });
  scores.sort((a, b) => b.p - a.p);
  const totals = {};
  const minLine = current[0] + current[1] + 0.5;
  for (let line = Math.max(0.5, minLine); line <= minLine + 5 && line <= 9.5; line += 1) {
    const t = matrixTotal(m, line);
    totals[line.toFixed(1)] = { over: t.over, under: t.under };
  }
  const handicaps = {};
  for (const h of [-3, -2, -1, 1, 2, 3]) handicaps[h > 0 ? `+${h}` : String(h)] = matrix1x2(m, h);
  const asian = {};
  for (const h of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
    const r = matrix1x2(m, h);
    asian[h > 0 ? `+${h}` : String(h)] = { home: r.home, away: r.away };
  }
  return {
    '1x2': x12,
    doubleChance: { '1X': x12.home + x12.draw, '12': x12.home + x12.away, X2: x12.draw + x12.away },
    drawNoBet: { home: x12.home / (x12.home + x12.away), away: x12.away / (x12.home + x12.away) },
    btts: { yes: btts, no: 1 - btts },
    totals,
    handicaps,
    asian,
    expected: { home: expH, away: expA },
    topScores: scores.slice(0, 12),
    matrix: m.slice(0, 7).map((row) => row.slice(0, 7)),
  };
}

// ---------------------------------------------------------------------------
// Fitting
// matches: [{ home, away, hs, as, t }]  (t = epoch ms of kick-off)
// ---------------------------------------------------------------------------
export function fitGoals(matches, { halfLifeDays = 180, priorGames = 3, now = Date.now(), iterations = 60, groups = null, groupPriorGames = null, levelHalfLifeDays = null } = {}) {
  const xi = Math.log(2) / halfLifeDays;
  const rows = [];
  for (const m of matches) {
    if (!Number.isFinite(m.hs) || !Number.isFinite(m.as)) continue;
    const age = Math.max(0, (now - m.t) / DAY);
    const w = Math.exp(-xi * age) * (m.weight ?? 1);
    if (w < 0.02) continue;
    rows.push({ h: m.home, a: m.away, hs: m.hs, as: m.as, w, t: m.t, neutral: !!m.neutral });
  }
  const teams = new Map();
  const team = (k) => {
    if (!teams.has(k)) teams.set(k, { att: 0, def: 0, n: 0, wn: 0 });
    return teams.get(k);
  };
  let W = 0, G = 0, HG = 0, AG = 0;
  for (const r of rows) {
    const th = team(r.h), ta = team(r.a);
    th.n++; ta.n++; th.wn += r.w; ta.wn += r.w;
    W += r.w; G += r.w * (r.hs + r.as); HG += r.w * r.hs; AG += r.w * r.as;
  }
  if (!rows.length) return { teams, mu: Math.log(1.35), home: Math.log(1.2), rho: -0.05, n: 0, avg: 1.35 };
  const avgSide = G / (2 * W);
  let mu = Math.log(avgSide);
  let home = Math.log(Math.max(0.6, Math.min(1.8, (HG + 1) / (AG + 1))));
  // pseudo-goals pulling each team towards its prior centre; leagues with little
  // history (e.g. current-season-only feeds) can ask for a stronger pull
  const priorOf = (k) => (groupPriorGames?.[groups?.get(k)] ?? priorGames) * avgSide;

  for (let it = 0; it < iterations; it++) {
    const S = new Map(), E = new Map();
    const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
    for (const r of rows) {
      const th = teams.get(r.h), ta = teams.get(r.a);
      const hAdv = r.neutral ? 0 : home;
      add(S, r.h, r.w * r.hs); add(E, r.h, r.w * Math.exp(mu + hAdv - ta.def));
      add(S, r.a, r.w * r.as); add(E, r.a, r.w * Math.exp(mu - th.def));
    }
    const gAtt = groupMeans(teams, groups, 'att');
    for (const [k, t] of teams) {
      const c = gAtt?.get(groups.get(k)) ?? 0; // prior centre: own league's level
      const a = priorOf(k);
      t.att = Math.log(((S.get(k) || 0) + a * Math.exp(c)) / ((E.get(k) || 0) + a));
    }
    center(teams, 'att');

    const C = new Map(), F = new Map();
    for (const r of rows) {
      const th = teams.get(r.h), ta = teams.get(r.a);
      const hAdv = r.neutral ? 0 : home;
      add(C, r.h, r.w * r.as); add(F, r.h, r.w * Math.exp(mu + ta.att));
      add(C, r.a, r.w * r.hs); add(F, r.a, r.w * Math.exp(mu + hAdv + th.att));
    }
    const gDef = groupMeans(teams, groups, 'def');
    for (const [k, t] of teams) {
      const c = gDef?.get(groups.get(k)) ?? 0;
      const a = priorOf(k);
      t.def = -Math.log(((C.get(k) || 0) + a * Math.exp(-c)) / ((F.get(k) || 0) + a));
    }
    center(teams, 'def');

    let expTot = 0, expHome = 0, homeGoalsNonNeutral = 0;
    for (const r of rows) {
      const th = teams.get(r.h), ta = teams.get(r.a);
      const hAdv = r.neutral ? 0 : home;
      expTot += r.w * (Math.exp(hAdv + th.att - ta.def) + Math.exp(ta.att - th.def));
      if (!r.neutral) { expHome += r.w * Math.exp(mu + th.att - ta.def); homeGoalsNonNeutral += r.w * r.hs; }
    }
    mu = Math.log(G / expTot);
    if (expHome > 0) home = Math.log(Math.max(0.5, Math.min(2, (homeGoalsNonNeutral + 2) / (expHome + 2))));
  }

  // Scoring level drifts between seasons faster than team strength: re-estimate
  // the overall goal level from recent games only, keeping the team ratings.
  if (levelHalfLifeDays) {
    const xl = Math.log(2) / levelHalfLifeDays;
    let g2 = 0, e2 = 0;
    for (const r of rows) {
      const w = Math.exp(-xl * Math.max(0, (now - r.t) / DAY));
      const th = teams.get(r.h), ta = teams.get(r.a);
      const hAdv = r.neutral ? 0 : home;
      g2 += w * (r.hs + r.as);
      e2 += w * (Math.exp(mu + hAdv + th.att - ta.def) + Math.exp(mu + ta.att - th.def));
    }
    if (g2 > 0 && e2 > 0) mu += Math.log(g2 / e2);
  }

  const model = { teams, mu, home, rho: 0, n: rows.length, avg: avgSide };
  model.rho = fitRho(rows, model);
  return model;
}

// Weighted mean rating per group (league). Null when grouping is off.
function groupMeans(teams, groups, key) {
  if (!groups) return null;
  const sum = new Map(), wsum = new Map();
  for (const [k, t] of teams) {
    const g = groups.get(k);
    if (!g) continue;
    sum.set(g, (sum.get(g) || 0) + t[key] * t.wn);
    wsum.set(g, (wsum.get(g) || 0) + t.wn);
  }
  const out = new Map();
  for (const [g, s] of sum) out.set(g, wsum.get(g) ? s / wsum.get(g) : 0);
  return out;
}

// Each team's "home" league: its most frequent domestic competition. Cup-only
// teams (e.g. clubs from leagues outside the catalogue) get no group.
export function teamGroups(matches) {
  const counts = new Map();
  for (const m of matches) {
    const cup = /^(uefa|fifa)\./.test(m.league) && m.league !== 'uefa.nations';
    const g = /^(fifa\.|uefa\.nations)/.test(m.league) ? 'national' : cup ? null : m.league;
    if (!g) continue;
    for (const k of [m.home, m.away]) {
      if (!counts.has(k)) counts.set(k, new Map());
      const c = counts.get(k);
      c.set(g, (c.get(g) || 0) + 1);
    }
  }
  const out = new Map();
  for (const [k, c] of counts) out.set(k, [...c.entries()].sort((x, y) => y[1] - x[1])[0][0]);
  return out;
}

function center(teams, key) {
  let s = 0;
  for (const t of teams.values()) s += t[key];
  const mean = s / teams.size;
  for (const t of teams.values()) t[key] -= mean;
}

function fitRho(rows, model) {
  let best = 0, bestLL = -Infinity;
  for (let rho = -0.2; rho <= 0.1001; rho += 0.01) {
    let ll = 0;
    for (const r of rows) {
      if (r.hs > 1 || r.as > 1) continue;
      const { lh, la } = expectedGoals(model, r.h, r.a, { neutral: r.neutral });
      const tau = dcTau(r.hs, r.as, lh, la, rho);
      if (tau <= 0) { ll = -Infinity; break; }
      ll += r.w * Math.log(tau);
    }
    if (ll > bestLL) { bestLL = ll; best = rho; }
  }
  return Math.round(best * 100) / 100;
}

export function expectedGoals(model, home, away, { neutral = false } = {}) {
  const th = model.teams.get(home) || { att: 0, def: 0, n: 0 };
  const ta = model.teams.get(away) || { att: 0, def: 0, n: 0 };
  const h = neutral ? 0 : model.home;
  return {
    lh: Math.exp(model.mu + h + th.att - ta.def),
    la: Math.exp(model.mu + ta.att - th.def),
    sample: { home: th.n || 0, away: ta.n || 0 },
  };
}

export function teamRatings(model) {
  return [...model.teams.entries()].map(([name, t]) => ({
    name,
    attack: Math.exp(t.att),
    defense: Math.exp(t.def), // >1 = concedes less than average
    games: t.n,
    strength: t.att + t.def,
  }));
}

// ---------------------------------------------------------------------------
// Market inversion: expected goals that reproduce bookmaker probabilities.
// target: { home, draw, away } (no-vig) and optional total { line, over }.
// ---------------------------------------------------------------------------
export function invertMarket(target, total, { rho = -0.05, drawPossible = true } = {}) {
  const err = (lh, la) => {
    const m = scoreMatrix(lh, la, { rho, max: 10 });
    const r = matrix1x2(m);
    let e = 0;
    if (drawPossible && target.draw != null) {
      e += (r.home - target.home) ** 2 + (r.draw - target.draw) ** 2 + (r.away - target.away) ** 2;
    } else {
      const ph = r.home + r.draw / 2;
      e += (ph - target.home) ** 2 * 2;
    }
    if (total && Number.isFinite(total.line) && Number.isFinite(total.over)) {
      const t = matrixTotal(m, total.line);
      e += (t.over - total.over) ** 2;
    }
    return e;
  };
  let best = { lh: 1.4, la: 1.1, e: Infinity };
  for (let lh = 0.15; lh <= 4.5; lh += 0.15) {
    for (let la = 0.15; la <= 4.5; la += 0.15) {
      const e = err(lh, la);
      if (e < best.e) best = { lh, la, e };
    }
  }
  let step = 0.075;
  for (let r = 0; r < 4; r++, step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dh, da] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]]) {
        const lh = best.lh + dh, la = best.la + da;
        if (lh <= 0.05 || la <= 0.05) continue;
        const e = err(lh, la);
        if (e < best.e - 1e-12) { best = { lh, la, e }; improved = true; }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// In-play: share of a match's expected goals still to come.
// ---------------------------------------------------------------------------
// Soccer goal intensity rises through a match (≈45% of goals in the 1st half).
const soccerCum = (t) => t + (t * t) / 360; // ∫(1 + 0.5·s/90) ds
const SOCCER_TOTAL = soccerCum(90) + 2 * 1.25 + 4 * 1.5; // incl. expected stoppage time

export function soccerRemainingShare(minute, period, { halftime = false } = {}) {
  if (halftime) return (SOCCER_TOTAL - soccerCum(45) - 2.5) / SOCCER_TOTAL;
  const m = Math.max(0, minute);
  if (period <= 1) {
    const used = soccerCum(Math.min(m, 45)) + Math.max(0, m - 45) * 1.25;
    const firstHalfLeft = Math.max(0, soccerCum(45) + 2.5 - used);
    return Math.max(0, firstHalfLeft + (SOCCER_TOTAL - soccerCum(45) - 2.5)) / SOCCER_TOTAL;
  }
  if (period === 2) {
    if (m >= 90) return (Math.max(0.5, 94 - m) * 1.5) / SOCCER_TOTAL;
    return (soccerCum(90) - soccerCum(Math.max(45, m)) + 6) / SOCCER_TOTAL;
  }
  return 0; // extra time handled separately
}

export function liveGoalRates({ lh, la, share, scoreDiff = 0, redHome = 0, redAway = 0, scoreEffects = true }) {
  let h = lh * share, a = la * share;
  if (scoreEffects && scoreDiff !== 0) {
    const lead = Math.min(2, Math.abs(scoreDiff));
    const trail = 1 + 0.08 * lead, leader = 1 - 0.04 * lead;
    if (scoreDiff > 0) { h *= leader; a *= trail; } else { h *= trail; a *= leader; }
  }
  if (redHome) { h *= 0.68 ** redHome; a *= 1.25 ** redHome; }
  if (redAway) { a *= 0.68 ** redAway; h *= 1.25 ** redAway; }
  return { lh: h, la: a };
}

// Probability of the next goal (live).
export function nextGoal(lhRem, laRem) {
  const tot = lhRem + laRem;
  const none = Math.exp(-tot);
  if (tot <= 0) return { home: 0, none: 1, away: 0 };
  return { home: (1 - none) * (lhRem / tot), none, away: (1 - none) * (laRem / tot) };
}
