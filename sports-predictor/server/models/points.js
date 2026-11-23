// Points-based sports (basketball, American football).
// Ratings: ridge-regularised offence/defence model fitted on time-weighted
// results. Outcome: discretised normal margin distribution with overtime
// resolving ties, so integer handicaps (Winner "X" on the line) are priced.

const DAY = 86400000;

export function normCdf(x) {
  // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function fitPoints(matches, { halfLifeDays = 120, ridgeGames = 4, now = Date.now(), iterations = 80 } = {}) {
  const xi = Math.log(2) / halfLifeDays;
  const rows = [];
  for (const m of matches) {
    if (!Number.isFinite(m.hs) || !Number.isFinite(m.as)) continue;
    const w = Math.exp(-xi * Math.max(0, (now - m.t) / DAY)) * (m.weight ?? 1);
    if (w < 0.02) continue;
    rows.push({ h: m.home, a: m.away, hs: m.hs, as: m.as, w, neutral: !!m.neutral });
  }
  const teams = new Map();
  const team = (k) => { if (!teams.has(k)) teams.set(k, { off: 0, def: 0, n: 0 }); return teams.get(k); };
  let W = 0, P = 0;
  for (const r of rows) { team(r.h).n++; team(r.a).n++; W += r.w; P += r.w * (r.hs + r.as); }
  if (!rows.length) return { teams, base: 100, home: 2.5, sigmaM: 12, sigmaT: 18, n: 0 };
  let base = P / (2 * W);
  let home = 0;
  const lam = ridgeGames;

  for (let it = 0; it < iterations; it++) {
    // home advantage
    let num = 0, den = 0;
    for (const r of rows) {
      if (r.neutral) continue;
      const th = teams.get(r.h), ta = teams.get(r.a);
      num += r.w * ((r.hs - base - th.off + ta.def) - (r.as - base - ta.off + th.def));
      den += r.w;
    }
    home = den ? num / (den + 2) : 0;
    // offence
    const sum = new Map(), wsum = new Map();
    const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
    for (const r of rows) {
      const th = teams.get(r.h), ta = teams.get(r.a);
      const hA = r.neutral ? 0 : home / 2;
      add(sum, r.h, r.w * (r.hs - base - hA + ta.def)); add(wsum, r.h, r.w);
      add(sum, r.a, r.w * (r.as - base + hA + th.def)); add(wsum, r.a, r.w);
    }
    for (const [k, t] of teams) t.off = (sum.get(k) || 0) / ((wsum.get(k) || 0) + lam);
    // defence
    sum.clear(); wsum.clear();
    for (const r of rows) {
      const th = teams.get(r.h), ta = teams.get(r.a);
      const hA = r.neutral ? 0 : home / 2;
      add(sum, r.h, r.w * (base - hA + ta.off - r.as)); add(wsum, r.h, r.w);
      add(sum, r.a, r.w * (base + hA + th.off - r.hs)); add(wsum, r.a, r.w);
    }
    for (const [k, t] of teams) t.def = (sum.get(k) || 0) / ((wsum.get(k) || 0) + lam);
    // base
    let bn = 0;
    for (const r of rows) {
      const th = teams.get(r.h), ta = teams.get(r.a);
      bn += r.w * ((r.hs - th.off + ta.def) + (r.as - ta.off + th.def));
    }
    base = bn / (2 * W);
  }

  let rm = 0, rt = 0;
  for (const r of rows) {
    const e = expectedPoints({ teams, base, home }, r.h, r.a, { neutral: r.neutral });
    rm += r.w * ((r.hs - r.as) - (e.ph - e.pa)) ** 2;
    rt += r.w * ((r.hs + r.as) - (e.ph + e.pa)) ** 2;
  }
  // small inflation for parameter uncertainty
  const sigmaM = Math.sqrt(rm / W) * 1.04;
  const sigmaT = Math.sqrt(rt / W) * 1.04;
  return { teams, base, home, sigmaM, sigmaT, n: rows.length };
}

export function expectedPoints(model, home, away, { neutral = false } = {}) {
  const th = model.teams.get(home) || { off: 0, def: 0, n: 0 };
  const ta = model.teams.get(away) || { off: 0, def: 0, n: 0 };
  const h = neutral ? 0 : model.home / 2;
  return {
    ph: model.base + h + th.off - ta.def,
    pa: model.base - h + ta.off - th.def,
    sample: { home: th.n || 0, away: ta.n || 0 },
  };
}

export function teamRatings(model) {
  return [...model.teams.entries()].map(([name, t]) => ({
    name, offense: model.base + t.off, defense: model.base - t.def, net: t.off + t.def, games: t.n,
  }));
}

// PMF of the final margin (home − away) given expected margin mu and sd sigma
// for the remaining time, a current margin, and overtime parameters.
export function marginPmf({ mu, sigma, current = 0, otMu = 0, otSigma = 4.5, allowTie = false, range = 90 }) {
  const pmf = new Map();
  const add = (k, p) => pmf.set(k, (pmf.get(k) || 0) + p);
  let tie = 0;
  if (sigma < 0.05) {
    const k = Math.round(current + mu);
    if (k === 0 && !allowTie) tie = 1; else add(k, 1);
  } else {
    const lo = Math.floor(current + mu - range), hi = Math.ceil(current + mu + range);
    for (let k = lo; k <= hi; k++) {
      const p = normCdf((k + 0.5 - current - mu) / sigma) - normCdf((k - 0.5 - current - mu) / sigma);
      if (p < 1e-12) continue;
      if (k === 0 && !allowTie) tie += p; else add(k, p);
    }
  }
  if (tie > 0) {
    const ot = [];
    let z = 0;
    for (let k = -25; k <= 25; k++) {
      if (k === 0) continue;
      const p = normCdf((k + 0.5 - otMu) / otSigma) - normCdf((k - 0.5 - otMu) / otSigma);
      ot.push([k, p]); z += p;
    }
    for (const [k, p] of ot) add(k, tie * p / z);
  }
  return { pmf, regulationTie: tie };
}

export function pmfMarkets(pmf, handicap = 0) {
  let home = 0, draw = 0, away = 0;
  for (const [k, p] of pmf) {
    const d = k + handicap;
    if (Math.abs(d) < 1e-9) draw += p; else if (d > 0) home += p; else away += p;
  }
  return { home, draw, away };
}

export function totalProbs(mean, sigma, line, current = 0) {
  if (sigma < 0.05) {
    const t = current + mean;
    return { over: t > line ? 1 : 0, under: t < line ? 1 : 0 };
  }
  const over = 1 - normCdf((line - current - mean) / sigma);
  return { over, under: 1 - over };
}

// Builds every market for a points game.
export function pointsMarkets({ mu, sigma, tau, sigmaT, current = [0, 0], spreadLine, totalLine, otScale = 5 / 48, otMu, otSigma }) {
  const cm = current[0] - current[1];
  const { pmf, regulationTie } = marginPmf({
    mu, sigma, current: cm,
    otMu: otMu ?? mu * otScale,
    otSigma: otSigma ?? Math.max(3, sigma * Math.sqrt(otScale) * 1.3),
  });
  const ml = pmfMarkets(pmf);
  const handicaps = {};
  const centre = Math.round(cm + mu);
  const lines = new Set();
  for (let d = -6; d <= 6; d++) lines.add(-(centre + d));
  if (Number.isFinite(spreadLine)) { lines.add(spreadLine); lines.add(Math.round(spreadLine)); }
  for (const h of [...lines].sort((a, b) => a - b)) {
    const r = pmfMarkets(pmf, h);
    handicaps[h > 0 ? `+${h}` : String(h)] = r;
  }
  const totals = {};
  const curTot = current[0] + current[1];
  const meanTot = tau;
  const tl = new Set();
  const c = Math.round(curTot + meanTot) + 0.5;
  for (let d = -10; d <= 10; d += 2.5) tl.add(Math.round((c + d) * 2) / 2);
  if (Number.isFinite(totalLine)) tl.add(totalLine);
  for (const line of [...tl].sort((a, b) => a - b)) totals[String(line)] = totalProbs(meanTot, sigmaT, line, curTot);
  return {
    moneyline: { home: ml.home, away: ml.away },
    regulation: { home: normCdfSafe(cm + mu, sigma, 0.5), draw: regulationTie, away: 1 - normCdfSafe(cm + mu, sigma, 0.5) - regulationTie },
    handicaps,
    totals,
    expected: { margin: cm + mu, total: curTot + meanTot, home: current[0] + (meanTot + mu) / 2, away: current[1] + (meanTot - mu) / 2 },
    sigma, sigmaT,
    pmf,
  };
}

function normCdfSafe(mean, sigma, thr) {
  if (sigma < 0.05) return mean >= thr ? 1 : 0;
  return 1 - normCdf((thr - mean) / sigma);
}

// Market-implied spread of outcomes: the sigma at which a margin of `mu` (from the
// point spread) reproduces the no-vig moneyline probability. Null when the two
// markets point in opposite directions or the answer is implausible.
export function sigmaFromMarket(mu, pHome, { lo = 4, hi = 30 } = {}) {
  if (!Number.isFinite(mu) || !(pHome > 0 && pHome < 1) || Math.abs(mu) < 0.5) return null;
  if ((mu > 0) !== (pHome > 0.5)) return null;
  const ph = (s) => pmfMarkets(marginPmf({ mu, sigma: s, otMu: mu * 0.1 }).pmf).home;
  // |P - 0.5| shrinks as sigma grows
  if (Math.abs(ph(lo) - 0.5) < Math.abs(pHome - 0.5) || Math.abs(ph(hi) - 0.5) > Math.abs(pHome - 0.5)) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(ph(mid) - 0.5) > Math.abs(pHome - 0.5)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Inverse: margin that yields a given no-vig moneyline probability.
export function marginFromWinProb(p, sigma) {
  let lo = -60, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const { pmf } = marginPmf({ mu: mid, sigma, otMu: mid * 0.1 });
    const ph = pmfMarkets(pmf).home;
    if (ph < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
