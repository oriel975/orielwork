// SportEdge server: JSON API + static frontend. Zero runtime dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './lib/config.js';
import { createCache } from './lib/cache.js';
import { jsonStore } from './lib/store.js';
import { createEspn } from './providers/espn.js';
import { createTsdb } from './providers/tsdb.js';
import { createOddsApi } from './providers/oddsapi.js';
import { createApiFootball } from './providers/apifootball.js';
import { createEngine } from './engine.js';
import { createTracker } from './tracker.js';
import { runBacktest, trackRecord } from './backtest.js';
import { LEAGUES, SPORTS, POOLS } from './leagues.js';

const cache = createCache({ dir: path.join(config.dataDir, 'cache') });
const espn = createEspn(cache);
const tsdb = createTsdb(cache, config.keys.tsdb);
const oddsApi = createOddsApi(cache, config.keys.oddsApi);
const apiFootball = createApiFootball(cache, config.keys.apiFootball);
const predLog = jsonStore(path.join(config.dataDir, 'predictions.json'), {});
const betStore = jsonStore(path.join(config.dataDir, 'bets.json'), { bets: [] });
const engine = createEngine({ cache, espn, tsdb, oddsApi, apiFootball, predLog, config });
const tracker = createTracker(betStore, engine);

const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

async function readBody(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 1e6) throw Object.assign(new Error('body too large'), { status: 413 }); }
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

const opts = (q) => ({
  date: q.get('date') || undefined,
  tz: validTz(q.get('tz')),
  sport: q.get('sport') || undefined,
  league: q.get('league') || undefined,
  featured: q.get('featured') === '1',
  w: q.has('w') ? Number(q.get('w')) : undefined,
  bet365: q.get('bet365') === '1',
});

function validTz(tz) {
  if (!tz) return 'Asia/Jerusalem';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'Asia/Jerusalem'; }
}

route('GET', '/api/meta', async () => ({
  sports: SPORTS,
  leagues: LEAGUES.map(({ key, sport, he, country, provider, featured, pool, odds }) => ({ key, sport, he, country, provider, featured: !!featured, pool, hasOddsApi: !!odds })),
  pools: Object.keys(POOLS),
  providers: {
    espn: { enabled: true, note: 'תוצאות לייב, היסטוריה ויחסי DraftKings' },
    thesportsdb: { enabled: true, premium: config.keys.tsdb !== '123', note: 'ליגות ישראל, יורוליג, יורוקאפ' },
    oddsApi: { enabled: oddsApi.enabled, quota: oddsApi.quota, note: 'יחסים מעשרות סוכנויות (Pinnacle, Betfair, ...)' },
    apiFootball: { enabled: apiFootball.enabled, quota: apiFootball.quota, note: 'יחסי Bet365 לכדורגל' },
  },
  modelWeight: config.modelWeight,
  poolStatus: engine.poolStatus,
}));

route('GET', '/api/events', async (q) => engine.listEvents(opts(q)));

route('GET', '/api/live', async (q) => {
  const o = opts(q);
  const r = await engine.listEvents({ ...o, date: undefined });
  return { ...r, events: r.events.filter((e) => e.state === 'in' || (e.state === 'post' && Date.now() - Date.parse(e.start) < 3.5 * 3600000)) };
});

route('GET', '/api/value', async (q) => {
  const o = opts(q);
  const minEdge = Number(q.get('minEdge') ?? 0.02);
  const r = await engine.listEvents(o);
  const rows = [];
  for (const e of r.events) {
    for (const v of e.prediction?.value || []) {
      if (v.ev >= minEdge) rows.push({ ...v, eventId: e.id, match: `${e.home.name} – ${e.away.name}`, home: e.home.name, away: e.away.name, start: e.start, league: e.league, leagueName: e.leagueName, sport: e.sport, confidence: e.prediction.confidence });
    }
  }
  rows.sort((a, b) => b.ev - a.ev);
  return { date: r.date, minEdge, rows, scanned: r.events.length };
});

route('GET', '/api/event/(?<id>[^/]+)', async (q, p) => {
  const d = await engine.eventDetail(decodeURIComponent(p.id), opts(q));
  if (!d) throw Object.assign(new Error('המשחק לא נמצא'), { status: 404 });
  return d;
});

route('GET', '/api/ratings/(?<pool>[a-z]+)', async (q, p) => {
  if (!POOLS[p.pool]) throw Object.assign(new Error('unknown pool'), { status: 404 });
  return (await engine.ratings(p.pool, { league: q.get('league') || undefined })) || { pending: true };
});

route('GET', '/api/backtest/(?<pool>[a-z]+)', async (q, p) => {
  if (!POOLS[p.pool]) throw Object.assign(new Error('unknown pool'), { status: 404 });
  const days = Math.min(120, Math.max(14, Number(q.get('days') || 56)));
  return cache.wrap(`backtest:${p.pool}:${days}`, 6 * 3600000, async () => {
    const pool = await engine.getPool(p.pool, { waitMs: 120000 });
    if (!pool) throw Object.assign(new Error('המודל עדיין נטען, נסו שוב בעוד דקה'), { status: 503 });
    return runBacktest(pool, { days });
  });
});

route('GET', '/api/track-record', async () => trackRecord(predLog.get()));

route('GET', '/api/bets', async () => {
  await tracker.autoSettle().catch(() => {});
  const bets = tracker.list();
  return { bets, summary: tracker.summary(bets) };
});
route('POST', '/api/bets', async (q, p, req) => tracker.add(await readBody(req)));
route('PATCH', '/api/bets/(?<id>[\\w-]+)', async (q, p, req) => tracker.update(p.id, await readBody(req)) || Promise.reject(Object.assign(new Error('not found'), { status: 404 })));
route('DELETE', '/api/bets/(?<id>[\\w-]+)', async (q, p) => ({ ok: tracker.remove(p.id) }));

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.re);
    if (!m) continue;
    const t0 = Date.now();
    try {
      const out = await r.handler(url.searchParams, m.groups || {}, req);
      send(res, 200, out);
    } catch (e) {
      console.error(`[${req.method} ${url.pathname}]`, e.message);
      send(res, e.status && e.status < 600 ? e.status : 500, { error: e.message });
    } finally {
      if (process.env.LOG_REQUESTS) console.log(`${req.method} ${url.pathname}${url.search} ${Date.now() - t0}ms`);
    }
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(config.port, config.host, () => {
  console.log(`\n  SportEdge פועל בכתובת: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}\n`);
  console.log(`  ספקי נתונים: ESPN ✓  TheSportsDB ✓${config.keys.tsdb !== '123' ? ' (פרימיום)' : ''}  The Odds API ${oddsApi.enabled ? '✓' : '✗ (אין מפתח)'}  API-Football/Bet365 ${apiFootball.enabled ? '✓' : '✗ (אין מפתח)'}\n`);
  // Warm the most used rating pools in the background.
  for (const k of ['soccer', 'nba', 'eurobasket', 'nhl', 'nfl']) engine.getPool(k, { waitMs: 1 }).catch(() => {});
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { predLog.flushNow(); betStore.flushNow(); } catch {} process.exit(0); });
