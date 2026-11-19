// Tennis: ranking-based Elo → serve-hold probabilities → game/set/match Markov
// chain. Works pre-match and live (sets + games in the current set).

export function eloFromRank(rank) {
  const r = Number(rank);
  return -100 * Math.log(Number.isFinite(r) && r > 0 ? r : 300);
}

export const eloWinProb = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

function tiebreakProb(pa, pb) {
  // Points are won on serve with roughly the same edge as games.
  const d = pa - pb;
  return Math.min(0.97, Math.max(0.03, 0.5 + 1.2 * d));
}

function setProb(pa, pb, ga, gb, aServes, memo) {
  if (ga >= 6 && ga - gb >= 2) return 1;
  if (gb >= 6 && gb - ga >= 2) return 0;
  if (ga === 7) return 1;
  if (gb === 7) return 0;
  if (ga === 6 && gb === 6) return tiebreakProb(pa, pb);
  const key = `${ga}-${gb}-${aServes ? 1 : 0}`;
  if (memo.has(key)) return memo.get(key);
  const win = aServes ? pa : 1 - pb;
  const v = win * setProb(pa, pb, ga + 1, gb, !aServes, memo) + (1 - win) * setProb(pa, pb, ga, gb + 1, !aServes, memo);
  memo.set(key, v);
  return v;
}

// pa/pb: probability that A/B holds serve. Server unknown → average.
export function setWin(pa, pb, ga = 0, gb = 0, aServes = null) {
  if (aServes === true || aServes === false) return setProb(pa, pb, ga, gb, aServes, new Map());
  const memo1 = new Map(), memo2 = new Map();
  return 0.5 * setProb(pa, pb, ga, gb, true, memo1) + 0.5 * setProb(pa, pb, ga, gb, false, memo2);
}

export function matchWin(pa, pb, { bestOf = 3, setsA = 0, setsB = 0, gamesA = 0, gamesB = 0, inSet = false, aServes = null } = {}) {
  const need = Math.ceil(bestOf / 2);
  const q0 = setWin(pa, pb);
  const memo = new Map();
  const M = (sa, sb) => {
    if (sa >= need) return 1;
    if (sb >= need) return 0;
    const k = `${sa}-${sb}`;
    if (memo.has(k)) return memo.get(k);
    const v = q0 * M(sa + 1, sb) + (1 - q0) * M(sa, sb + 1);
    memo.set(k, v);
    return v;
  };
  if (!inSet) return M(setsA, setsB);
  const qc = setWin(pa, pb, gamesA, gamesB, aServes);
  return qc * M(setsA + 1, setsB) + (1 - qc) * M(setsA, setsB + 1);
}

// Finds symmetric hold probabilities that reproduce a pre-match win probability.
export function holdsFromMatchProb(p, { tour = 'atp', bestOf = 3 } = {}) {
  const base = tour === 'wta' ? 0.64 : 0.8;
  let lo = -0.35, hi = 0.35;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    const pa = clamp(base + d), pb = clamp(base - d);
    if (matchWin(pa, pb, { bestOf }) < p) lo = d; else hi = d;
  }
  const d = (lo + hi) / 2;
  return { pa: clamp(base + d), pb: clamp(base - d) };
}

const clamp = (x) => Math.min(0.98, Math.max(0.2, x));

export function tennisPrediction({ rankA, rankB, tour, bestOf = 3, state, marketProbA }) {
  const pre = marketProbA ?? eloWinProb(eloFromRank(rankA), eloFromRank(rankB));
  const { pa, pb } = holdsFromMatchProb(pre, { tour, bestOf });
  const live = state ? matchWin(pa, pb, { bestOf, ...state }) : pre;
  const setsBetting = {};
  const need = Math.ceil(bestOf / 2);
  const q = setWin(pa, pb);
  // Exact set-score probabilities pre-match (e.g. 2-0, 2-1).
  for (let lost = 0; lost < need; lost++) {
    const comb = binom(need - 1 + lost, lost);
    setsBetting[`${need}-${lost}`] = comb * q ** need * (1 - q) ** lost;
    setsBetting[`${lost}-${need}`] = comb * (1 - q) ** need * q ** lost;
  }
  return { pre, live, holdA: pa, holdB: pb, setProb: q, setsBetting };
}

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
