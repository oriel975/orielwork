// Odds math: conversions, vig removal, expected value, Kelly staking.

export function americanToDecimal(american) {
  const n = typeof american === 'string' ? parseFloat(american.replace(/[^\d.+-]/g, '')) : Number(american);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
}

// Accepts decimal (1.85), American (+150 / -120) or fractional ("5/2").
export function parseOdds(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value > 1 ? value : null;
  const s = String(value).trim();
  if (/^[+-]\d+(\.\d+)?$/.test(s) && Math.abs(parseFloat(s)) >= 100) return americanToDecimal(s);
  if (/^\d+\/\d+$/.test(s)) {
    const [a, b] = s.split('/').map(Number);
    return b ? 1 + a / b : null;
  }
  if (s.toUpperCase() === 'EVEN' || s.toUpperCase() === 'EV') return 2;
  const d = parseFloat(s);
  return Number.isFinite(d) && d > 1 ? d : null;
}

export function overround(decimals) {
  const valid = decimals.filter((d) => d > 1);
  if (valid.length !== decimals.length) return null;
  return valid.reduce((s, d) => s + 1 / d, 0) - 1;
}

// Removes the bookmaker margin. "power" handles favourite–longshot bias better
// than plain normalisation, so it is the default.
export function removeVig(decimals, method = 'power') {
  if (!decimals || decimals.some((d) => !(d > 1))) return null;
  const raw = decimals.map((d) => 1 / d);
  const total = raw.reduce((a, b) => a + b, 0);
  if (method === 'proportional' || total <= 1) return raw.map((p) => p / total);
  let lo = 1, hi = 5;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const s = raw.reduce((acc, p) => acc + Math.pow(p, k), 0);
    if (s > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  const probs = raw.map((p) => Math.pow(p, k));
  const z = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => p / z);
}

export const fairOdds = (p) => (p > 0 ? 1 / p : null);
export const expectedValue = (p, decimal) => (p > 0 && decimal > 1 ? p * decimal - 1 : null);

// Full Kelly fraction of bankroll; caller applies a fractional multiplier.
export function kelly(p, decimal) {
  if (!(p > 0) || !(decimal > 1)) return 0;
  const b = decimal - 1;
  return Math.max(0, (b * p - (1 - p)) / b);
}

export function round(x, digits = 3) {
  if (x == null || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
