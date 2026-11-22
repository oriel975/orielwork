// TheSportsDB (free test key "123", or a premium key via THESPORTSDB_KEY).
// Used for leagues ESPN does not cover: Israeli football & basketball,
// EuroLeague, EuroCup, FIBA Champions League.
import { fetchJson } from '../lib/http.js';
import { normalizeName } from '../lib/names.js';

const DAY = 86400000;
const FINISHED = /^(FT|AET|PEN|AOT|AP|FT_PEN|Match Finished|After Over ?Time|After Penalties|Finished)$/i;
const OFF = /^(PST|Postponed|CANC|Cancelled|Canceled|ABD|Abandoned|AWD|WO|Suspended|SUSP|INT)$/i;
const NOT_STARTED = /^(NS|Not Started|TBD|TBA|)$/i;

export function createTsdb(cache, key = '123') {
  const base = `https://www.thesportsdb.com/api/v1/json/${key}`;
  const pace = key === '123' ? 3000 : 700; // free tier is rate-limited (~20-30 req/min)
  const get = (path) => fetchJson(`${base}/${path}`, { minIntervalMs: pace, timeout: 20000, retries: 4 });

  async function season(league) {
    return cache.wrap(`tsdb:season:${league.tsdbId}`, 12 * 3600000, async () => {
      const d = await get(`lookupleague.php?id=${league.tsdbId}`);
      return d.leagues?.[0]?.strCurrentSeason || guessSeason();
    }, { persist: true });
  }

  async function round(league, s, r) {
    return cache.wrap(`tsdb:round:${league.tsdbId}:${s}:${r}`, 90000, async () => {
      const d = await get(`eventsround.php?id=${league.tsdbId}&r=${r}&s=${encodeURIComponent(s)}`);
      return (d.events || []).map(rawEvent);
    }, {
      persist: true,
      // finished rounds rarely change; the live round refreshes every 90s
      ttlFn: (evs) => {
        const done = (e) => FINISHED.test(e.status || '') || OFF.test(e.status || '');
        if (evs.length && evs.every(done) && evs.every((e) => Date.now() - Date.parse(e.start) > 2 * DAY)) return 5 * DAY;
        if (evs.length && evs.every((e) => Date.parse(e.start) - Date.now() > 6 * 3600000)) return 30 * 60000;
        return 90000;
      },
    });
  }

  // All events of the current season (finished + upcoming), discovered round by round.
  async function seasonEvents(league) {
    return cache.wrap(`tsdb:seasonEvents:${league.tsdbId}`, 90000, async () => {
      const reported = await season(league);
      let failedAll = true;
      // TheSportsDB sometimes reports "2026" while the games are filed under "2026-2027" (EuroCup).
      for (const s of seasonCandidates(reported)) {
        const { all, failed } = await walkRounds(league, s);
        if (!failed) failedAll = false;
        if (all.length) return all;
      }
      if (failedAll) throw new Error(`TheSportsDB unavailable for ${league.key}`);
      return [];
    }, { ttlFn: () => 90000, swr: true, persist: true });
  }

  async function walkRounds(league, s) {
    const all = [];
    let empty = 0, future = 0, failed = 0;
    for (let r = 1; r <= 60; r++) {
      let evs;
      try { evs = await round(league, s, r); } catch (e) {
        console.warn(`[tsdb] ${league.key} ${s} round ${r}: ${e.message}`);
        if (++failed >= 3) break;
        r--; // retry the same round
        continue;
      }
      if (!evs.length) { if (++empty >= 2) break; continue; }
      empty = 0;
      all.push(...evs);
      if (evs.every((e) => NOT_STARTED.test(e.status || '') && Date.parse(e.start) > Date.now())) { if (++future >= 2) break; } else future = 0;
    }
    return { all, failed: failed >= 3 };
  }

  async function livescores(sport) {
    const s = sport === 'basketball' ? 'Basketball' : 'Soccer';
    return cache.wrap(`tsdb:live:${s}`, 45000, async () => {
      const d = await get(`livescore.php?s=${s}`);
      const list = d.livescore || d.events || [];
      return Object.fromEntries(list.filter((x) => x.idEvent).map((x) => [x.idEvent, x]));
    }).catch(() => ({}));
  }

  async function events(league) {
    const evs = await seasonEvents(league);
    const now = Date.now();
    const anyLive = evs.some((e) => { const t = Date.parse(e.start); return t < now + 10 * 60000 && t > now - 3 * 3600000 && !FINISHED.test(e.status || ''); });
    const live = anyLive ? await livescores(league.sport) : {};
    return evs.map((e) => normalize(e, league, live[e.idEvent]));
  }

  async function history(league) {
    const evs = await seasonEvents(league);
    return evs.filter((e) => FINISHED.test(e.status || '') && e.hs != null && e.as != null).map((e) => ({
      id: e.idEvent, league: league.key, t: Date.parse(e.start),
      home: normalizeName(e.homeName), away: normalizeName(e.awayName), homeName: e.homeName, awayName: e.awayName,
      hs: e.hs, as: e.as, neutral: false,
    }));
  }

  async function lookupEvent(id) {
    const d = await get(`lookupevent.php?id=${id}`);
    return d.events?.[0] ? rawEvent(d.events[0]) : null;
  }

  return { events, history, lookupEvent, normalize };
}

const STATUS_HE = {
  '1H': 'מחצית 1', '2H': 'מחצית 2', HT: 'מחצית', BT: 'הפסקה', ET: 'הארכה', P: 'פנדלים', PEN: 'פנדלים',
  Q1: 'רבע 1', Q2: 'רבע 2', Q3: 'רבע 3', Q4: 'רבע 4', OT: 'הארכה', FT: 'הסתיים', AET: 'הסתיים (הארכה)', AOT: 'הסתיים (הארכה)',
  NS: '', PST: 'נדחה', POSTPONED: 'נדחה', CANC: 'בוטל', LIVE: 'לייב', INT: 'הופסק', SUSP: 'הופסק',
};

// "2026" → ["2026", "2026-2027"]; "2026-2027" → ["2026-2027", "2026"].
export function seasonCandidates(s) {
  const str = String(s || guessSeason());
  const m = str.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) return [str];
  return m[2] ? [str, m[1]] : [str, `${m[1]}-${Number(m[1]) + 1}`];
}

function guessSeason() {
  const d = new Date();
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const toNum = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

function rawEvent(e) {
  let ts = e.strTimestamp || (e.dateEvent ? `${e.dateEvent}T${e.strTime || '00:00:00'}` : null);
  if (ts && !/[zZ]|[+-]\d\d:?\d\d$/.test(ts)) ts += 'Z';
  return {
    idEvent: e.idEvent, name: e.strEvent, start: ts ? new Date(ts).toISOString() : null,
    homeName: e.strHomeTeam, awayName: e.strAwayTeam, homeId: e.idHomeTeam, awayId: e.idAwayTeam,
    homeLogo: e.strHomeTeamBadge, awayLogo: e.strAwayTeamBadge,
    hs: toNum(e.intHomeScore), as: toNum(e.intAwayScore), status: e.strStatus || '', progress: e.strProgress || '',
    postponed: e.strPostponed === 'yes', round: e.intRound, venue: e.strVenue,
  };
}

function normalize(e, league, live) {
  const status = (live?.strStatus ?? e.status) || '';
  const progress = live?.strProgress ?? e.progress ?? '';
  const hs = live ? toNum(live.intHomeScore) : e.hs;
  const as = live ? toNum(live.intAwayScore) : e.as;
  let state = 'pre';
  if (e.postponed || OFF.test(status)) state = 'off';
  else if (FINISHED.test(status)) state = 'post';
  else if (!NOT_STARTED.test(status)) state = 'in';
  else if (hs != null && Date.now() - Date.parse(e.start) > 3 * 3600000) state = 'post';
  const minute = parseInt(String(progress).replace(/[^\d]/g, ''), 10);
  let period = 0;
  if (/^1H$/i.test(status)) period = 1;
  else if (/^(2H|HT)$/i.test(status)) period = /HT/i.test(status) ? 1 : 2;
  else if (/^Q(\d)$/i.test(status)) period = Number(status.slice(1));
  else if (/^OT/i.test(status)) period = 5;
  const he = STATUS_HE[status.toUpperCase()] || status;
  const label = state === 'in' && league.sport === 'soccer' && Number.isFinite(minute) && !/HT/i.test(status) ? `${minute}'` : he;
  return {
    id: `tsdb~${league.key}~${e.idEvent}`, provider: 'tsdb', nativeId: e.idEvent, league: league.key, sport: league.sport,
    name: e.name, start: e.start, state,
    status: {
      name: status, detail: label, short: label,
      completed: state === 'post', period, minute: Number.isFinite(minute) ? minute : null, halftime: /^HT$/i.test(status),
      clock: null, display: Number.isFinite(minute) ? `${minute}'` : status,
    },
    home: { id: e.homeId, name: e.homeName, short: e.homeName, logo: e.homeLogo, score: state === 'pre' ? null : hs, red: 0, key: normalizeName(e.homeName) },
    away: { id: e.awayId, name: e.awayName, short: e.awayName, logo: e.awayLogo, score: state === 'pre' ? null : as, red: 0, key: normalizeName(e.awayName) },
    neutral: false, venue: e.venue || null, round: e.round ? `מחזור ${e.round}` : null, odds: [], goals: [],
  };
}
