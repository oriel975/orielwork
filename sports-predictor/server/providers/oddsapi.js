// The Odds API (https://the-odds-api.com) – optional, needs ODDS_API_KEY.
// Pulls 1X2 / totals / spreads from dozens of bookmakers (Pinnacle, Betfair,
// William Hill, Unibet, 1xBet, ...) so the app can find the best price and a
// sharp consensus. Free tier: 500 requests / month, so results are cached.
import { fetchJson } from '../lib/http.js';

export function createOddsApi(cache, key, { ttlMin = Number(process.env.ODDS_API_TTL_MIN || 30) } = {}) {
  const quota = { remaining: null, used: null, last: null, error: null };

  async function sportOdds(sportKey) {
    if (!key || !sportKey) return [];
    return cache.wrap(`oddsapi:${sportKey}`, ttlMin * 60000, async () => {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?regions=eu,uk&markets=h2h,totals,spreads&oddsFormat=decimal&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
      try {
        const { data, headers } = await fetchJson(url, { withHeaders: true, retries: 1 });
        quota.remaining = headers.get('x-requests-remaining');
        quota.used = headers.get('x-requests-used');
        quota.last = new Date().toISOString();
        quota.error = null;
        return (Array.isArray(data) ? data : []).map(parseEvent);
      } catch (e) {
        quota.error = e.message;
        if (e.status === 404 || e.status === 422) return []; // sport not offered / out of season
        throw e;
      }
    });
  }

  return { sportOdds, quota, enabled: !!key };
}

function parseEvent(ev) {
  return {
    start: ev.commence_time, home: ev.home_team, away: ev.away_team,
    books: (ev.bookmakers || []).map((b) => parseBook(b, ev)).filter(Boolean),
  };
}

function parseBook(b, ev) {
  const out = { book: b.title, bookKey: b.key, source: 'oddsapi', updated: b.last_update, h2h: null, total: null, spread: null };
  for (const m of b.markets || []) {
    if (m.key === 'h2h') {
      const f = (name) => m.outcomes.find((o) => o.name === name)?.price ?? null;
      out.h2h = { home: f(ev.home_team), away: f(ev.away_team), draw: f('Draw') };
    } else if (m.key === 'totals') {
      const over = m.outcomes.find((o) => o.name === 'Over');
      const under = m.outcomes.find((o) => o.name === 'Under');
      if (over) out.total = { line: over.point, over: over.price, under: under?.price ?? null };
    } else if (m.key === 'spreads') {
      const h = m.outcomes.find((o) => o.name === ev.home_team);
      const a = m.outcomes.find((o) => o.name === ev.away_team);
      if (h) out.spread = { line: h.point, home: h.price, away: a?.price ?? null };
    }
  }
  return out.h2h || out.total || out.spread ? out : null;
}
