// Team-name normalisation and fuzzy matching across providers.
const STOP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'bc', 'bk', 'b', 'c', 'fk', 'sk', 'club', 'de', 'the', 'cd', 'ud', 'sd', 'ss', 'as', 'us', 'ssc', 'calcio', 'football', 'basketball', 'kk', 'ca', 'rc', 'vfb', 'vfl', 'tsg', 'sv', '1', 'f', 'ff', 'if', 'ik']);
const ALIASES = {
  'man city': 'manchester city', 'man utd': 'manchester united', 'man united': 'manchester united',
  'spurs': 'tottenham hotspur', 'wolves': 'wolverhampton wanderers', 'inter': 'internazionale', 'inter milan': 'internazionale',
  'psg': 'paris saint germain', 'paris sg': 'paris saint germain', 'bayern': 'bayern munich', 'bayern munchen': 'bayern munich',
  'atletico madrid': 'atletico de madrid', 'atl madrid': 'atletico de madrid', 'nottm forest': 'nottingham forest',
  'hapoel beer sheva': 'hapoel beer sheva', "hapoel be'er sheva": 'hapoel beer sheva', 'h beer sheva': 'hapoel beer sheva',
  'maccabi tel-aviv': 'maccabi tel aviv', 'hapoel tel-aviv': 'hapoel tel aviv', 'red star belgrade': 'crvena zvezda',
  'kk crvena zvezda': 'crvena zvezda', 'la clippers': 'los angeles clippers', 'la lakers': 'los angeles lakers',
};

export function normalizeName(name) {
  if (!name) return '';
  let s = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[’'`´]/g, '').replace(/[^a-z0-9֐-׿]+/g, ' ').trim();
  if (ALIASES[s]) s = ALIASES[s];
  const tokens = s.split(' ').filter((t) => t && !STOP.has(t));
  const joined = tokens.join(' ');
  return ALIASES[joined] || joined || s;
}

function tokens(n) { return new Set(normalizeName(n).split(' ').filter(Boolean)); }

export function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = tokens(a), tb = tokens(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jac = inter / (ta.size + tb.size - inter || 1);
  // prefix bonus: "wolverhampton" vs "wolves"
  let pref = 0;
  for (const x of ta) for (const y of tb) if (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4)))) pref = 0.15;
  return Math.min(0.95, jac + pref);
}

// Finds the best counterpart for an event among candidates with {home, away, start}.
export function matchEvent(ev, candidates, { maxHours = 6, minScore = 1.2 } = {}) {
  let best = null, bestScore = 0;
  const t = Date.parse(ev.start);
  for (const c of candidates) {
    const dt = Math.abs(Date.parse(c.start) - t) / 3600000;
    if (Number.isFinite(dt) && dt > maxHours) continue;
    const direct = nameSimilarity(ev.home, c.home) + nameSimilarity(ev.away, c.away);
    const swapped = nameSimilarity(ev.home, c.away) + nameSimilarity(ev.away, c.home);
    const score = Math.max(direct, swapped * 0.9);
    if (score > bestScore) { bestScore = score; best = { candidate: c, swapped: swapped > direct, score }; }
  }
  return bestScore >= minScore ? best : null;
}
