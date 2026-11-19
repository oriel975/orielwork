// API-Football (api-sports.io) – optional, needs APIFOOTBALL_KEY.
// Its odds feed includes Bet365 (bookmaker id 8): 1X2, double chance, goals
// over/under, both teams to score, Asian handicap. Free tier: 100 req/day, so
// every call is cached and only made for leagues the user is looking at.
import { fetchJson } from '../lib/http.js';

const BASE = 'https://v3.football.api-sports.io';
const BET365 = 8;
const CALENDAR_YEAR_LEAGUES = new Set([253, 71, 128, 262]); // MLS, Brazil, Argentina, Mexico

export function createApiFootball(cache, key) {
  const quota = { remaining: null, last: null, error: null };
  const get = async (path) => {
    const { data, headers } = await fetchJson(`${BASE}${path}`, { headers: { 'x-apisports-key': key }, withHeaders: true, retries: 1 });
    quota.remaining = headers.get('x-ratelimit-requests-remaining');
    quota.last = new Date().toISOString();
    if (data.errors && Object.keys(data.errors).length) {
      quota.error = JSON.stringify(data.errors);
      throw Object.assign(new Error(quota.error), { status: 400 });
    }
    quota.error = null;
    return data;
  };

  // Bet365 odds for one league on one date (YYYY-MM-DD).
  async function leagueOdds(leagueId, date) {
    if (!key || !leagueId) return [];
    return cache.wrap(`apifb:odds:${leagueId}:${date}`, 45 * 60000, async () => {
      const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
      const season = CALENDAR_YEAR_LEAGUES.has(leagueId) ? y : (m >= 7 ? y : y - 1);
      const [fx, od] = await Promise.all([
        get(`/fixtures?league=${leagueId}&season=${season}&date=${date}`),
        get(`/odds?league=${leagueId}&season=${season}&date=${date}&bookmaker=${BET365}`),
      ]);
      const fixtures = new Map((fx.response || []).map((f) => [f.fixture.id, f]));
      return (od.response || []).map((o) => {
        const f = fixtures.get(o.fixture?.id);
        if (!f) return null;
        const bk = (o.bookmakers || []).find((b) => b.id === BET365);
        if (!bk) return null;
        return { start: f.fixture.date, home: f.teams.home.name, away: f.teams.away.name, fixtureId: f.fixture.id, books: [parseBet365(bk)] };
      }).filter(Boolean);
    });
  }

  return { leagueOdds, quota, enabled: !!key };
}

function parseBet365(bk) {
  const bet = (name) => bk.bets.find((b) => b.name === name);
  const val = (b, v) => Number(b?.values.find((x) => String(x.value) === v)?.odd) || null;
  const mw = bet('Match Winner');
  const ou = bet('Goals Over/Under');
  const btts = bet('Both Teams Score');
  const dc = bet('Double Chance');
  const totals = {};
  for (const v of ou?.values || []) {
    const m = String(v.value).match(/^(Over|Under) ([\d.]+)$/);
    if (!m) continue;
    totals[m[2]] = totals[m[2]] || {};
    totals[m[2]][m[1].toLowerCase()] = Number(v.odd);
  }
  const main = totals['2.5'] ? 2.5 : Number(Object.keys(totals)[0]);
  return {
    book: 'Bet365', source: 'apifootball',
    h2h: mw ? { home: val(mw, 'Home'), draw: val(mw, 'Draw'), away: val(mw, 'Away') } : null,
    total: Number.isFinite(main) ? { line: main, over: totals[String(main)]?.over ?? null, under: totals[String(main)]?.under ?? null } : null,
    totals,
    btts: btts ? { yes: val(btts, 'Yes'), no: val(btts, 'No') } : null,
    doubleChance: dc ? { '1X': val(dc, 'Home/Draw'), '12': val(dc, 'Home/Away'), X2: val(dc, 'Draw/Away') } : null,
  };
}
