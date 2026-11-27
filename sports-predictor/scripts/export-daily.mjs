// Exports the daily SportEdge report as JSON files ({rows, meta}) for the
// phone dashboard. Reads a running SportEdge server and data/predictions.json.
// Usage: node scripts/export-daily.mjs [--base http://127.0.0.1:3111] [--out data/export] [--date YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:3111');
const OUT = path.resolve(arg('out', path.join(ROOT, 'data', 'export')));
const TZ = 'Asia/Jerusalem';
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = arg('date', ymd(new Date()));
const shift = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TOMORROW = shift(TODAY, 1), YESTERDAY = shift(TODAY, -1);
const hhmm = (iso) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false });
const dayOf = (iso) => ymd(new Date(iso));

const MAIN = ['isr.1', 'isr.2', 'isr.basket', 'euroleague', 'eurocup', 'bcl', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'nba'];
const pct = (p) => (p == null || !Number.isFinite(p) ? null : Math.round(p * 100));
const odds2 = (p) => (p > 0 ? Math.round((1 / p) * 100) / 100 : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const CONF = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };

async function get(p) {
  const res = await fetch(BASE + p);
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
  return res.json();
}

const code = fs.readFileSync(SELF, 'utf8');
const meta = (extra = []) => [
  { label: 'export-daily.mjs', value: code, type: 'code', lang: 'javascript' },
  { label: 'נוצר', value: new Date().toISOString() },
  { label: 'מקור', value: 'שרת SportEdge (ESPN, TheSportsDB, יחסי DraftKings) ו-data/predictions.json' },
  ...extra,
];
const write = (name, rows, extra) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ rows, meta: meta(extra) }));
  console.log(`${name}.json: ${rows.length} rows`);
};

const leagueHe = Object.fromEntries((await get('/api/meta')).leagues.map((l) => [l.key, l.he]));

// ---------------------------------------------------------------- games
const lists = {};
for (const [label, date] of [['היום', TODAY], ['מחר', TOMORROW]]) {
  lists[label] = (await get(`/api/events?date=${date}&tz=${encodeURIComponent(TZ)}&w=0.3`)).events;
}
const gap = new Map();
const games = [];
for (const [day, evs] of Object.entries(lists)) {
  for (const e of evs) {
    const p = e.prediction;
    if (!MAIN.includes(e.league) || !p?.probs || (e.state !== 'pre' && e.state !== 'in')) continue;
    const three = !!p.threeWay;
    if (p.model && p.market) gap.set(e.id, Math.abs((p.model.home ?? 0) - (p.market.home ?? 0)));
    games.push({
      id: e.id, day, time: hhmm(e.start), league: e.leagueName, home: e.home.name, away: e.away.name,
      p1: pct(p.probs.home), px: three ? pct(p.probs.draw) : null, p2: pct(p.probs.away),
      fair1: odds2(p.probs.home), fairx: three ? odds2(p.probs.draw) : null, fair2: odds2(p.probs.away),
      mkt1: p.market ? pct(p.market.home) : null, mktx: p.market && three ? pct(p.market.draw) : null, mkt2: p.market ? pct(p.market.away) : null,
      model1: p.model ? pct(p.model.home) : null,
      confidence: CONF[p.confidence] || '', live: e.state === 'in' ? `${e.home.score ?? 0}-${e.away.score ?? 0}` : '',
    });
  }
}
write('games', games, [{ label: 'ליגות', value: MAIN.join(', ') }, { label: 'תאריכים', value: `${TODAY}, ${TOMORROW}` }]);

// ---------------------------------------------------------------- value
const SEL = { home: '1', draw: 'X', away: '2' };
const betLabel = (v) => {
  if (v.market === '1x2') return v.sport === 'soccer' ? SEL[v.sel] : (v.sel === 'home' ? v.home : v.sel === 'away' ? v.away : 'X');
  if (v.market === 'total') return `${v.sel === 'over' ? 'מעל' : 'מתחת'} ${v.line}`;
  if (v.market === 'spread') { const l = v.sel === 'home' ? v.line : -v.line; return `${v.sel === 'home' ? v.home : v.away} ${l > 0 ? '+' : ''}${l}`; }
  if (v.market === 'btts') return `שתיהן יבקיעו: ${v.sel === 'yes' ? 'כן' : 'לא'}`;
  return v.sel;
};
const value = [];
for (const [day, date] of [['היום', TODAY], ['מחר', TOMORROW]]) {
  const r = await get(`/api/value?date=${date}&tz=${encodeURIComponent(TZ)}&w=0.3&minEdge=0.03&includeSuspicious=1`);
  for (const v of r.rows) {
    if (/^(ncaab|ncaaf)$/.test(v.league)) continue; // too little data per team for value signals
    const g = gap.get(v.eventId) ?? 0;
    value.push({
      id: `${v.eventId}|${v.market}|${v.sel}|${v.line ?? ''}|${v.book}`, day, time: hhmm(v.start), league: v.leagueName, match: v.match,
      bet: betLabel(v), book: v.book, odds: Math.round(v.odds * 100) / 100, prob: pct(v.p), fair: Math.round(v.fairOdds * 100) / 100,
      ev: Math.round(v.ev * 1000) / 10, flag: v.suspicious ? 'חשוד' : '',
    });
  }
}
value.sort((x, y) => y.ev - x.ev).splice(20);
write('value', value, [{ label: 'סף', value: 'EV של 3% ומעלה, 20 הגבוהים, בלי מכללות בארה"ב; "חשוד" = EV מעל 15% או פער של יותר מ-15 נקודות בין המודל לשוק' }]);

// ------------------------------------------------------------ yesterday
const log = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'predictions.json'), 'utf8'));
const yesterday = [];
for (const v of Object.values(log)) {
  if (!v.result || !v.fair || dayOf(v.start) !== YESTERDAY || !MAIN.includes(v.league)) continue;
  const { hs, as } = v.result;
  const keys = v.threeWay ? ['home', 'draw', 'away'] : ['home', 'away'];
  if (!v.threeWay && hs === as) continue;
  const out = hs > as ? 'home' : hs < as ? 'away' : 'draw';
  const z = keys.reduce((s, k) => s + (v.fair[k] || 0), 0) || 1;
  const pick = keys.reduce((a, k) => ((v.fair[k] || 0) > (v.fair[a] || 0) ? k : a), keys[0]);
  yesterday.push({
    id: v.id, league: leagueHe[v.league] || v.league, match: `${v.home} – ${v.away}`, score: `${hs}-${as}`,
    pick: v.threeWay ? SEL[pick] : (pick === 'home' ? v.home : v.away), pickProb: pct(v.fair[pick] / z),
    actualProb: pct((v.fair[out] || 0) / z), hit: pick === out ? 'כן' : 'לא',
  });
}
write('yesterday', yesterday, [{ label: 'תאריך', value: YESTERDAY }]);

// --------------------------------------------------------- track record
const tr = await get('/api/track-record');
const GROUPS = [['model', 'מודל סטטיסטי'], ['market', 'שוק (ללא עמלה)'], ['fair', 'משולב – מה שהאפליקציה מציגה']];
const record = GROUPS.filter(([k]) => tr[k]?.n).map(([k, label]) => ({
  group: label, games: tr[k].n, hitRate: Math.round(tr[k].accuracy * 1000) / 10, logloss: r3(tr[k].logloss), brier: r3(tr[k].brier),
}));
write('record', record, [{ label: 'משחקים שהסתיימו', value: String(tr.settled) }]);
write('valuesim', [{ bets: tr.valueBets.bets, profit: Math.round(tr.valueBets.profit * 100) / 100, roi: tr.valueBets.roi == null ? null : Math.round(tr.valueBets.roi * 1000) / 10 }],
  [{ label: 'שיטה', value: 'יחידה אחת על כל הימור 1X2 שסומן כערך (EV מעל 3%) לפני תחילת המשחק' }]);

// ------------------------------------------------------------- backtest
const POOLS = [['soccer', 'כדורגל (1X2)'], ['eurobasket', 'יורוליג וכדורסל ישראלי'], ['nba', 'NBA'], ['nhl', 'NHL'], ['nfl', 'NFL']];
const backtest = [];
for (const [k, label] of POOLS) {
  try {
    const b = await get(`/api/backtest/${k}`);
    if (b.overall?.n) backtest.push({ pool: label, games: b.overall.n, hitRate: Math.round(b.overall.accuracy * 1000) / 10, skill: Math.round(b.overall.skill * 1000) / 10 });
  } catch { /* pool not ready */ }
}
write('backtest', backtest, [{ label: 'שיטה', value: '8 שבועות אחרונים; כל שבוע המודל מאומן רק על משחקים שקדמו לו' }]);
