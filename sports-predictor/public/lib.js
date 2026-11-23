// Shared helpers: API access, formatting, storage, small SVG charts.

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `שגיאה ${res.status}`);
  return data;
}

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pct = (p, d = 0) => (p == null || !Number.isFinite(p) ? '–' : `${(p * 100).toFixed(d)}%`);
export const odds = (o) => (o == null || !Number.isFinite(o) || o <= 1 ? '–' : o >= 100 ? o.toFixed(0) : o.toFixed(2));
export const fairOdds = (p) => (p > 0 ? odds(1 / p) : '–');
export const money = (x) => (x == null || !Number.isFinite(x) ? '–' : `${x < 0 ? '-' : ''}₪${Math.abs(x).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`);
export const signedPct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%`);
export const num = (x, d = 2) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));

export function parseOdds(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(',', '.');
  if (/^[+-]\d{3,}$/.test(s)) { const n = Number(s); return n > 0 ? 1 + n / 100 : 1 + 100 / -n; }
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return b ? 1 + a / b : null; }
  const d = Number(s);
  return Number.isFinite(d) && d > 1 ? d : null;
}

export const kelly = (p, o) => (p > 0 && o > 1 ? Math.max(0, ((o - 1) * p - (1 - p)) / (o - 1)) : 0);

export function timeOf(iso, tz) {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}
export function dateOf(iso, tz, opts = { day: 'numeric', month: 'numeric' }) {
  return new Date(iso).toLocaleDateString('he-IL', { ...opts, timeZone: tz });
}
export function localYmd(d = new Date(), tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function shiftYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
export function hebDay(ymd, tz) {
  const today = localYmd(new Date(), tz);
  if (ymd === today) return 'היום';
  if (ymd === shiftYmd(today, 1)) return 'מחר';
  if (ymd === shiftYmd(today, -1)) return 'אתמול';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
}

export const SEL_LABEL = { home: '1', draw: 'X', away: '2', over: 'מעל', under: 'מתחת', yes: 'כן', no: 'לא' };
export const MARKET_LABEL = { '1x2': '1X2', total: 'סה"כ', spread: 'הנדיקאפ', btts: 'שתי הקבוצות יבקיעו', dc: 'סיכוי כפול' };

export function selName(v, ev) {
  if (v.market === '1x2') {
    if (ev?.sport === 'tennis' || ev?.sport && ev.sport !== 'soccer' && v.sel !== 'draw') return v.sel === 'home' ? ev.home.short || ev.home.name : ev.away.short || ev.away.name;
    return SEL_LABEL[v.sel];
  }
  if (v.market === 'total') return `${SEL_LABEL[v.sel]} ${v.line}`;
  if (v.market === 'spread') {
    const team = v.sel === 'home' ? (ev?.home?.short || 'בית') : (ev?.away?.short || 'חוץ');
    const line = v.sel === 'home' ? v.line : -v.line;
    return `${team} ${line > 0 ? '+' : ''}${line}`;
  }
  if (v.market === 'btts') return `שתיהן יבקיעו: ${SEL_LABEL[v.sel]}`;
  return v.sel;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ------------------------------------------------------------------ charts
export function probBar(p, { threeWay = true } = {}) {
  const h = p?.home ?? 0, d = threeWay ? (p?.draw ?? 0) : 0, a = p?.away ?? 0;
  const tot = h + d + a || 1;
  const seg = (cls, v, label) => `<span class="seg ${cls}" style="flex:${v / tot}" title="${label} ${pct(v)}">${v / tot > 0.12 ? pct(v) : ''}</span>`;
  return `<div class="probbar">${seg('h', h, '1')}${threeWay ? seg('d', d, 'X') : ''}${seg('a', a, '2')}</div>`;
}

export function sparkline(values, { w = 120, h = 32, cls = 'spark' } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 2 - ((x - min) / span) * (h - 4)}`).join(' ');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

// Probability timeline for live games: three series in [0,1].
export function probChart(history, { threeWay = true, w = 640, h = 180 } = {}) {
  if (!history || history.length < 2) return '<div class="muted small">גרף ההסתברויות יתמלא בזמן שהמשחק רץ והעמוד פתוח.</div>';
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i) => pad.l + (i / (history.length - 1)) * iw;
  const y = (p) => pad.t + (1 - p) * ih;
  const line = (key, cls) => `<polyline class="${cls}" fill="none" stroke-width="2.2" points="${history.map((r, i) => `${x(i).toFixed(1)},${y(r[key] ?? 0).toFixed(1)}`).join(' ')}"/>`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${pad.l - 6}" y="${y(g) + 4}" class="axis" text-anchor="end">${g * 100}%</text>`).join('');
  const labels = [0, Math.floor((history.length - 1) / 2), history.length - 1].map((i) => `<text x="${x(i)}" y="${h - 4}" class="axis" text-anchor="middle">${esc(history[i].label || '')}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="הסתברויות לאורך המשחק">${grid}${line('home', 'l-h')}${threeWay ? line('draw', 'l-d') : ''}${line('away', 'l-a')}${labels}</svg>`;
}

export function calibrationChart(points, { w = 320, h = 240 } = {}) {
  if (!points?.length) return '';
  const pad = 32;
  const s = (v) => pad + v * (w - 2 * pad);
  const t = (v) => h - pad - v * (h - 2 * pad);
  const maxN = Math.max(...points.map((p) => p.n));
  const dots = points.map((p) => `<circle cx="${s(p.predicted)}" cy="${t(p.actual)}" r="${3 + 6 * Math.sqrt(p.n / maxN)}" class="dot"><title>חזוי ${pct(p.predicted)} · בפועל ${pct(p.actual)} · ${p.n}</title></circle>`).join('');
  const ticks = [0, 0.5, 1].map((v) => `<text x="${s(v)}" y="${h - 10}" class="axis" text-anchor="middle">${v * 100}%</text><text x="${pad - 6}" y="${t(v) + 4}" class="axis" text-anchor="end">${v * 100}%</text>`).join('');
  return `<svg class="chart calib" viewBox="0 0 ${w} ${h}" role="img" aria-label="כיול המודל"><line x1="${s(0)}" y1="${t(0)}" x2="${s(1)}" y2="${t(1)}" class="diag"/>${dots}${ticks}</svg>`;
}

export function curveChart(points, { w = 640, h = 160 } = {}) {
  if (!points || points.length < 2) return '';
  const vals = [0, ...points.map((p) => p.profit)];
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i) => 10 + (i / (vals.length - 1)) * (w - 20);
  const y = (v) => 8 + (1 - (v - min) / span) * (h - 16);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="עקומת רווח"><line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" class="grid"/><polyline points="${pts}" fill="none" class="${vals[vals.length - 1] >= 0 ? 'l-pos' : 'l-neg'}" stroke-width="2.4"/></svg>`;
}
