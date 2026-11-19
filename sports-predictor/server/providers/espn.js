// ESPN public site API (no key). Scoreboards, season histories, odds
// (DraftKings / ESPN BET lines incl. open vs close), match summaries.
import { fetchJson, mapLimit } from '../lib/http.js';
import { normalizeName } from '../lib/names.js';
import { americanToDecimal } from '../models/odds.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const HOUR = 3600000, DAY = 24 * HOUR;

const num = (x) => {
  if (x == null || x === '') return null;
  const n = typeof x === 'object' ? Number(x.value ?? x.displayValue) : Number(String(x).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function createEspn(cache) {
  async function rawScoreboard(league, params) {
    const extra = league.scoreboardParams ? `&${league.scoreboardParams}` : '&limit=300';
    return fetchJson(`${BASE}/${league.espn}/scoreboard?${params}${extra}`);
  }

  async function scoreboard(league, ymd, { ttl = 20000 } = {}) {
    return cache.wrap(`espn:sb:${league.key}:${ymd}`, ttl, async () => {
      const data = await rawScoreboard(league, `dates=${ymd}`);
      return normalizeScoreboard(data, league);
    });
  }

  async function historyChunk(league, param, ttl) {
    return cache.wrap(`espn:hist:${league.key}:${param}`, ttl, async () => {
      const extra = league.history?.params ? `&${league.history.params}` : '';
      const data = await fetchJson(`${BASE}/${league.espn}/scoreboard?dates=${param}&limit=1000${extra}`, { timeout: 30000 });
      return (data.events || []).map((e) => historyRow(e, league)).filter(Boolean);
    }, { persist: true });
  }

  async function history(league, now = new Date()) {
    const h = league.history || { mode: 'year' };
    const Y = now.getUTCFullYear(), M = now.getUTCMonth() + 1;
    const chunks = [];
    if (h.mode === 'year') {
      chunks.push([String(Y), HOUR]);
      if (h.prevYear || M < 7) chunks.push([String(Y - 1), 7 * DAY]);
    } else if (h.mode === 'season-months') {
      const S = M >= h.startMonth ? Y : Y - 1;
      let y = S, m = h.startMonth;
      while (y < Y || (y === Y && m <= M)) {
        if (h.endMonth && m > h.endMonth && y === S) break;
        const current = y === Y && m === M;
        chunks.push([`${y}${String(m).padStart(2, '0')}`, current ? HOUR : 7 * DAY]);
        m++; if (m > 12) { m = 1; y++; }
      }
      // tail of the previous season keeps early-season ratings stable
      const prevS = S - (h.startMonth > 6 ? 0 : 1);
      for (const pm of h.carryMonths || [2, 3, 4]) chunks.push([`${prevS}${String(pm).padStart(2, '0')}`, 30 * DAY]);
    } else if (h.mode === 'days') {
      for (let d = 1; d <= (h.days || 30); d++) {
        const dt = new Date(now.getTime() - d * DAY);
        chunks.push([ymdUTC(dt), d <= 2 ? HOUR : 14 * DAY]);
      }
    }
    const parts = await mapLimit(chunks, 6, ([p, ttl]) => historyChunk(league, p, ttl));
    const seen = new Set();
    const rows = [];
    for (const part of parts) {
      if (!Array.isArray(part)) continue;
      for (const r of part) { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } }
    }
    return rows;
  }

  async function summary(league, nativeId) {
    return cache.wrap(`espn:sum:${league.key}:${nativeId}`, 30000, async () => {
      const d = await fetchJson(`${BASE}/${league.espn}/summary?event=${nativeId}`);
      return d;
    });
  }

  async function standings(league) {
    return cache.wrap(`espn:st:${league.key}`, 30 * 60000, async () => {
      const d = await fetchJson(`https://site.api.espn.com/apis/v2/sports/${league.espn}/standings`);
      const groups = d.children?.length ? d.children : [d];
      return groups.map((g) => ({
        name: g.name || g.abbreviation || '',
        entries: (g.standings?.entries || []).map((e) => {
          const s = Object.fromEntries((e.stats || []).map((x) => [x.name, x.value ?? x.displayValue]));
          const disp = Object.fromEntries((e.stats || []).map((x) => [x.name, x.displayValue]));
          return {
            team: e.team?.displayName, logo: e.team?.logos?.[0]?.href, rank: s.rank ?? s.playoffSeed,
            played: s.gamesPlayed, wins: s.wins, draws: s.ties, losses: s.losses,
            gf: s.pointsFor, ga: s.pointsAgainst, gd: s.pointDifferential, points: s.points, record: disp.overall,
            pct: s.winPercent, streak: disp.streak,
          };
        }).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
      }));
    });
  }

  // World rankings (top 150) keyed by athlete id and normalised name.
  async function tennisRankings(tour) {
    return cache.wrap(`espn:rank:${tour}`, 12 * HOUR, async () => {
      const d = await fetchJson(`${BASE}/tennis/${tour}/rankings`);
      const out = {};
      for (const r of d.rankings?.[0]?.ranks || []) {
        const a = r.athlete || {};
        const entry = { rank: r.current, points: r.points };
        if (a.id) out[`id:${a.id}`] = entry;
        if (a.displayName) out[`n:${normalizeName(a.displayName)}`] = entry;
      }
      return out;
    }, { persist: true });
  }

  return { scoreboard, history, summary, standings, extractSummary, tennisRankings };
}

export function ymdUTC(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function historyRow(e, league) {
  const c = e.competitions?.[0];
  if (!c || !c.status?.type?.completed) return null;
  if (/POSTPONED|CANCELED|CANCELLED|FORFEIT|ABANDONED/i.test(c.status.type.name || '')) return null;
  const H = c.competitors?.find((x) => x.homeAway === 'home');
  const A = c.competitors?.find((x) => x.homeAway === 'away');
  if (!H || !A) return null;
  const hs = num(H.score), as = num(A.score);
  if (hs == null || as == null) return null;
  return {
    id: e.id, league: league.key, t: Date.parse(e.date),
    home: normalizeName(H.team?.displayName), away: normalizeName(A.team?.displayName),
    homeName: H.team?.displayName, awayName: A.team?.displayName,
    hs, as, neutral: !!c.neutralSite,
  };
}

function normalizeScoreboard(data, league) {
  if (league.sport === 'tennis') return normalizeTennis(data, league);
  return (data.events || []).map((e) => normalizeEvent(e, league)).filter(Boolean);
}

function competitorInfo(x, details) {
  const t = x.team || {};
  const red = (details || []).filter((d) => d.redCard && d.team?.id === t.id).length;
  return {
    id: t.id, name: t.displayName || t.name, short: t.shortDisplayName || t.abbreviation, abbr: t.abbreviation,
    logo: t.logo, color: t.color ? `#${t.color}` : null,
    score: num(x.score), record: x.records?.[0]?.summary || null, form: x.form || null, red,
    linescores: (x.linescores || []).map((l) => num(l.value ?? l.displayValue)),
    key: normalizeName(t.displayName || t.name),
  };
}

export function normalizeEvent(e, league) {
  const c = e.competitions?.[0];
  if (!c) return null;
  const H = c.competitors?.find((x) => x.homeAway === 'home') || c.competitors?.[0];
  const A = c.competitors?.find((x) => x.homeAway === 'away') || c.competitors?.[1];
  if (!H || !A) return null;
  const st = c.status || e.status || {};
  const type = st.type || {};
  const goals = (c.details || []).filter((d) => d.scoringPlay).map((d) => ({
    minute: d.clock?.displayValue, team: d.team?.id === H.team?.id ? 'home' : 'away',
    player: d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName, type: d.type?.text,
    penalty: !!d.penaltyKick, ownGoal: !!d.ownGoal,
  }));
  return {
    id: `espn~${league.key}~${e.id}`, provider: 'espn', nativeId: e.id, league: league.key, sport: league.sport,
    name: e.name, start: e.date,
    state: /POSTPONED|CANCELED|CANCELLED|SUSPENDED/i.test(type.name || '') ? 'off' : type.state,
    status: {
      name: type.name, detail: type.detail, short: type.shortDetail, completed: !!type.completed,
      period: st.period ?? 0, clock: st.clock ?? 0, display: st.displayClock,
      halftime: /HALFTIME/i.test(type.name || ''), endPeriod: /END_PERIOD/i.test(type.name || ''),
    },
    home: competitorInfo(H, c.details), away: competitorInfo(A, c.details),
    neutral: !!c.neutralSite,
    venue: c.venue?.fullName || null,
    broadcast: (c.broadcasts || []).flatMap((b) => b.names || []).join(', ') || null,
    goals,
    odds: (c.odds || []).filter(Boolean).map(parseEspnOdds).filter(Boolean),
    round: null,
  };
}

export function parseEspnOdds(o) {
  const book = o.provider?.displayName || o.provider?.name || 'ESPN';
  const ml = o.moneyline || {};
  const dec = (x) => americanToDecimal(x);
  const h2h = {
    home: dec(ml.home?.close?.odds ?? o.homeTeamOdds?.moneyLine),
    away: dec(ml.away?.close?.odds ?? o.awayTeamOdds?.moneyLine),
    draw: dec(ml.draw?.close?.odds ?? o.drawOdds?.moneyLine),
  };
  const h2hOpen = {
    home: dec(ml.home?.open?.odds), away: dec(ml.away?.open?.odds), draw: dec(ml.draw?.open?.odds),
  };
  const ps = o.pointSpread || {};
  let spreadLine = num(ps.home?.close?.line);
  if (spreadLine == null && Number.isFinite(o.spread)) spreadLine = o.spread;
  const spread = spreadLine == null ? null : {
    line: spreadLine, home: dec(ps.home?.close?.odds), away: dec(ps.away?.close?.odds),
    open: num(ps.home?.open?.line),
  };
  const tt = o.total || {};
  let totalLine = num(tt.over?.close?.line);
  if (totalLine == null && Number.isFinite(o.overUnder)) totalLine = o.overUnder;
  const total = totalLine == null ? null : {
    line: totalLine, over: dec(tt.over?.close?.odds ?? o.overOdds), under: dec(tt.under?.close?.odds ?? o.underOdds),
    open: num(tt.over?.open?.line),
  };
  if (!h2h.home && !spread && !total) return null;
  return { book, source: 'espn', h2h: h2h.home ? h2h : null, h2hOpen: h2hOpen.home ? h2hOpen : null, spread, total };
}

export function setDone(s) {
  if (s.a == null || s.b == null) return false;
  return s.a === 7 || s.b === 7 || ((s.a >= 6 || s.b >= 6) && Math.abs(s.a - s.b) >= 2);
}

function normalizeTennis(data, league) {
  const out = [];
  for (const ev of data.events || []) {
    for (const g of ev.groupings || []) {
      if (!/singles/i.test(g.grouping?.displayName || '')) continue;
      for (const c of g.competitions || []) {
        const [a, b] = c.competitors || [];
        const pa = a?.athlete, pb = b?.athlete;
        if (!pa?.displayName || !pb?.displayName || /TBD/i.test(pa.displayName + pb.displayName)) continue;
        const type = c.status?.type || {};
        const sets = (a.linescores || []).map((l, i) => ({ a: num(l.value), b: num(b.linescores?.[i]?.value) }));
        out.push({
          id: `espn~${league.key}~${c.id}`, provider: 'espn', nativeId: c.id, league: league.key, sport: 'tennis',
          name: `${pa.displayName} vs ${pb.displayName}`, start: c.date || c.startDate || ev.date,
          state: type.state, tournament: ev.name, round: c.round?.displayName || g.grouping?.displayName,
          bestOf: ev.major && league.tour === 'atp' ? 5 : 3,
          status: { name: type.name, detail: type.detail, short: type.shortDetail, completed: !!type.completed, period: c.status?.period ?? 0 },
          home: { id: a.id, name: pa.displayName, short: pa.shortName || pa.displayName, logo: pa.flag?.href, seed: a.curatedRank?.current ?? null, serving: !!a.possession, score: sets.filter((s) => setDone(s) && s.a > s.b).length, winner: a.winner, key: normalizeName(pa.displayName) },
          away: { id: b.id, name: pb.displayName, short: pb.shortName || pb.displayName, logo: pb.flag?.href, seed: b.curatedRank?.current ?? null, serving: !!b.possession, score: sets.filter((s) => setDone(s) && s.b > s.a).length, winner: b.winner, key: normalizeName(pb.displayName) },
          sets, odds: (c.odds || []).filter(Boolean).map(parseEspnOdds).filter(Boolean),
        });
      }
    }
  }
  return out;
}

// Compact, UI-ready subset of an ESPN summary payload.
export function extractSummary(d) {
  if (!d) return null;
  const pct = (x) => (x == null ? null : Number(x) / 100);
  const out = {};
  if (d.predictor?.homeTeam) {
    out.predictor = {
      home: pct(d.predictor.homeTeam.gameProjection), away: pct(d.predictor.awayTeam?.gameProjection),
      draw: d.predictor.homeTeam.tiePercentage ? pct(d.predictor.homeTeam.tiePercentage) : null,
    };
  }
  if (Array.isArray(d.winprobability) && d.winprobability.length) {
    const wp = d.winprobability;
    const step = Math.max(1, Math.floor(wp.length / 60));
    out.winprob = { last: wp[wp.length - 1].homeWinPercentage, tie: wp[wp.length - 1].tiePercentage || 0, series: wp.filter((_, i) => i % step === 0).map((x) => x.homeWinPercentage) };
  }
  out.injuries = (d.injuries || []).map((t) => ({
    team: t.team?.displayName,
    items: (t.injuries || []).slice(0, 12).map((i) => ({ name: i.athlete?.displayName, status: i.status, detail: i.details?.type || i.type?.description || '' })),
  })).filter((t) => t.items.length);
  out.lastFive = (d.lastFiveGames || []).map((t) => ({
    team: t.team?.displayName,
    games: (t.events || []).map((g) => ({ date: g.gameDate, result: g.gameResult, score: g.score, opponent: g.opponent?.displayName, atVs: g.atVs })),
  }));
  const h2h = d.headToHeadGames || [];
  out.headToHead = h2h.flatMap((t) => (t.events || []).map((g) => ({ date: g.gameDate, score: g.score, result: g.gameResult, opponent: g.opponent?.displayName, atVs: g.atVs, team: t.team?.displayName }))).slice(0, 10);
  out.seasonSeries = (d.seasonseries || []).map((s) => s.summary || s.description).filter(Boolean);
  out.books = (d.pickcenter || []).map((p) => ({
    book: p.provider?.name, details: p.details, spread: p.spread, overUnder: p.overUnder,
    home: americanToDecimal(p.homeTeamOdds?.moneyLine), away: americanToDecimal(p.awayTeamOdds?.moneyLine), draw: americanToDecimal(p.drawOdds?.moneyLine),
  })).filter((b) => b.book);
  out.info = {
    venue: d.gameInfo?.venue?.fullName, city: d.gameInfo?.venue?.address?.city, attendance: d.gameInfo?.attendance,
    officials: (d.gameInfo?.officials || []).map((o) => o.displayName).slice(0, 4),
  };
  const box = d.boxscore?.teams || [];
  out.teamStats = box.map((t) => ({
    team: t.team?.displayName,
    stats: (t.statistics || []).slice(0, 18).map((s) => ({ label: s.label || s.name, value: s.displayValue })),
  })).filter((t) => t.stats.length);
  const groups = d.standings?.groups || [];
  out.standings = groups.map((g) => ({
    header: g.header,
    entries: (g.standings?.entries || []).map((e) => ({ team: e.team, stats: (e.stats || []).map((s) => ({ k: s.abbreviation || s.name, v: s.displayValue })) })),
  }));
  return out;
}
