// SportEdge client: router, toolbar, match lists, value finder, bet slip.
import { api, esc, pct, odds, fairOdds, signedPct, money, timeOf, hebDay, shiftYmd, localYmd, probBar, sparkline, selName, parseOdds, store } from './lib.js';
import { S, saveSettings, toggleSlip, inSlip, updateLeg, clearSlip, toast, stakeFor, wParam } from './state.js';
import { renderDetail } from './detail.js';
import { renderBets, renderModels, renderRatings, renderSettings, renderMore } from './pages.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

// ------------------------------------------------------------------ theme
const savedTheme = store.get('se.theme', null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

// ----------------------------------------------------------------- router
const ROUTES = {
  live: { render: renderLive, toolbar: 'live', title: 'לייב' },
  matches: { render: renderMatches, toolbar: 'full', title: 'משחקים' },
  value: { render: renderValue, toolbar: 'full', title: 'הימורי ערך' },
  event: { render: (arg) => renderDetail(view, arg), toolbar: null, title: 'משחק' },
  bets: { render: () => renderBets(view), toolbar: null, title: 'מעקב הימורים' },
  models: { render: () => renderModels(view), toolbar: null, title: 'ביצועי המודל' },
  ratings: { render: () => renderRatings(view), toolbar: null, title: 'דירוג קבוצות' },
  settings: { render: () => renderSettings(view), toolbar: null, title: 'הגדרות' },
  more: { render: () => renderMore(view), toolbar: null, title: 'עוד' },
};

let currentRoute = null;
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: ROUTES[name] ? name : 'live', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

export async function navigate() {
  clearTimeout(S.timer);
  const { name, arg } = parseHash();
  currentRoute = name;
  document.querySelectorAll('[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === name || (name === 'event' && a.dataset.view === 'matches')));
  document.title = `SportEdge – ${ROUTES[name].title}`;
  renderToolbar(ROUTES[name].toolbar);
  window.scrollTo({ top: 0 });
  await ROUTES[name].render(arg);
}
window.addEventListener('hashchange', navigate);

export function schedule(fn, sec = S.settings.refreshSec) {
  clearTimeout(S.timer);
  S.timer = setTimeout(() => { if (!document.hidden) fn(); else schedule(fn, sec); }, sec * 1000);
}

// ---------------------------------------------------------------- toolbar
const SPORT_CHIPS = [['all', 'הכל'], ['soccer', '⚽ כדורגל'], ['basketball', '🏀 כדורסל'], ['tennis', '🎾 טניס'], ['football', '🏈 פוטבול'], ['hockey', '🏒 הוקי'], ['baseball', '⚾ בייסבול']];

function renderToolbar(kind) {
  const tb = $('#toolbar');
  if (!kind) { tb.innerHTML = ''; tb.classList.add('hidden'); return; }
  tb.classList.remove('hidden');
  const leagues = (S.meta?.leagues || []).filter((l) => S.sport === 'all' || l.sport === S.sport);
  tb.innerHTML = `
    ${kind === 'full' ? `<div class="daynav" role="group" aria-label="בחירת יום">
      <button data-act="day" data-d="-1" aria-label="יום קודם">›</button>
      <span class="day">${esc(hebDay(S.date, S.settings.tz))}</span>
      <button data-act="day" data-d="1" aria-label="יום הבא">‹</button>
      <input type="date" id="datePick" value="${S.date}" aria-label="תאריך">
    </div>` : ''}
    <div class="chips">${SPORT_CHIPS.map(([k, l]) => `<button class="chip ${S.sport === k ? 'active' : ''}" data-act="sport" data-s="${k}">${l}</button>`).join('')}</div>
    ${kind === 'full' ? `<select class="input" id="leaguePick" aria-label="ליגה"><option value="">כל הליגות</option>${leagues.map((l) => `<option value="${l.key}" ${S.league === l.key ? 'selected' : ''}>${esc(l.he)} · ${esc(l.country)}</option>`).join('')}</select>` : ''}
    <input class="search" id="search" placeholder="חיפוש קבוצה / שחקן…" value="${esc(S.search)}" aria-label="חיפוש">
  `;
  $('#datePick')?.addEventListener('change', (e) => { S.date = e.target.value; navigate(); });
  $('#leaguePick')?.addEventListener('change', (e) => { S.league = e.target.value; navigate(); });
  $('#search').addEventListener('input', (e) => { S.search = e.target.value; rerenderList(); });
}

// ------------------------------------------------------------ event lists
let lastList = null;
function filterEvents(events) {
  const q = S.search.trim().toLowerCase();
  return events.filter((e) => !q || `${e.home.name} ${e.away.name} ${e.leagueName}`.toLowerCase().includes(q));
}

export function statusHe(t) {
  if (!t) return 'לייב';
  return String(t)
    .replace(/^Halftime$/i, 'מחצית').replace(/^Half$/i, 'מחצית')
    .replace(/^End of (\d)\w*( Quarter| Period)?$/i, 'סוף תקופה $1')
    .replace(/^Q(\d)\s*/i, 'רבע $1 · ').replace(/ · $/, '')
    .replace(/^OT\s*/i, 'הארכה ').replace(/^Final.*$/i, 'הסתיים').replace(/^FT$/i, 'הסתיים')
    .replace(/^(\d)(st|nd|rd|th)$/i, 'מערכה/תקופה $1');
}

function statusHtml(e) {
  if (e.state === 'in') return `<span class="status live">${esc(statusHe(e.status.short || e.status.display))}</span>`;
  if (e.state === 'post') return `<span class="status">הסתיים</span>`;
  if (e.state === 'off') return `<span class="status warn">${esc(e.status.short || 'נדחה')}</span>`;
  return `<span class="status">${timeOf(e.start, S.settings.tz)}</span>`;
}

function logo(t) {
  return t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo-ph',textContent:'${esc((t.short || t.name || '?').slice(0, 1))}'}))">` : `<span class="logo-ph">${esc((t.short || t.name || '?').slice(0, 1))}</span>`;
}

function outcomeButtons(e) {
  const p = e.prediction;
  if (!p?.probs) return '';
  const keys = p.threeWay ? ['home', 'draw', 'away'] : ['home', 'away'];
  const value = new Map((p.value || []).filter((v) => v.market === '1x2' && v.ev >= S.settings.minEdge && !v.suspicious).map((v) => [v.sel, v]));
  const label = (k) => (k === 'draw' ? 'X' : p.threeWay ? (k === 'home' ? '1' : '2') : (k === 'home' ? e.home.short || e.home.name : e.away.short || e.away.name));
  return `<div class="outcomes c${keys.length}">${keys.map((k) => {
    const pr = p.probs[k];
    const v = value.get(k);
    const best = p.best?.[k];
    const cls = ['oc', p.pick?.sel === k ? 'top' : '', v ? 'value' : '', inSlip(e.id, '1x2', k, null) ? 'in-slip' : ''].join(' ');
    return `<button class="${cls}" data-act="add" data-id="${esc(e.id)}" data-sel="${k}" data-market="1x2" title="הוספה לטופס">
      <span class="l">${esc(label(k))}</span><span class="p num">${pct(pr)}</span>
      <span class="f">הוגן <span class="num">${fairOdds(pr)}</span>${best ? ` · שוק <span class="num">${odds(best.odds)}</span>` : ''}</span></button>`;
  }).join('')}</div>`;
}

function card(e) {
  const p = e.prediction || {};
  const live = e.state === 'in';
  const showScore = e.state !== 'pre';
  const val = (p.value || []).filter((v) => v.ev >= S.settings.minEdge && !v.suspicious);
  const disagree = p.model && p.market && Math.abs((p.model.home ?? 0) - (p.market.home ?? 0)) > 0.15;
  const hist = (e.history || []).map((h) => h.home);
  const metaBits = [];
  if (p.kind === 'goals' && p.expected && e.state !== 'post') metaBits.push(`צפי שערים <b class="num">${p.expected.home.toFixed(1)}–${p.expected.away.toFixed(1)}</b>`);
  if (p.kind === 'points' && p.expected) metaBits.push(`צפי <b class="num">${Math.round(p.expected.home)}–${Math.round(p.expected.away)}</b>`);
  if (p.totals?.line != null && e.state !== 'post') metaBits.push(`מעל ${p.totals.line}: <b class="num">${pct(p.totals.over)}</b>`);
  if (p.btts && e.state !== 'post') metaBits.push(`שתיהן יבקיעו: <b class="num">${pct(p.btts.yes)}</b>`);
  if (p.twoWay && e.sport !== 'soccer') metaBits.push(`כולל הארכה: <b class="num">${pct(p.twoWay.home)} / ${pct(p.twoWay.away)}</b>`);
  if (live && p.live?.nextGoal) metaBits.push(`השער הבא: <b class="num">${pct(p.live.nextGoal.home)} · ${pct(p.live.nextGoal.none)} · ${pct(p.live.nextGoal.away)}</b>`);
  if (p.market) metaBits.push(`שוק (${esc(p.market.source)}): <b class="num">${pct(p.market.home)}${p.market.draw != null ? ` / ${pct(p.market.draw)}` : ''} / ${pct(p.market.away)}</b>`);
  return `<article class="card ${live ? 'live' : ''}" data-act="open" data-id="${esc(e.id)}">
    <div class="card-top">
      <span>${statusHtml(e)}${e.round && e.sport === 'tennis' ? ` · ${esc(e.round)}` : ''}</span>
      <span style="display:flex;gap:6px;align-items:center">
        ${hist.length > 2 ? sparkline(hist, { w: 70, h: 20 }) : ''}
        ${val.length ? `<span class="tag value">💎 ${signedPct(val[0].ev)}</span>` : ''}
        ${disagree ? '<span class="tag warn" title="המודל והשוק חלוקים מאוד – בדקו פציעות/הרכבים">⚠ סטייה</span>' : ''}
        ${p.confidence ? `<span class="tag conf-${p.confidence}" title="רמת ביטחון: גודל המדגם וזמינות יחסי שוק">${{ high: 'ביטחון גבוה', medium: 'ביטחון בינוני', low: 'ביטחון נמוך' }[p.confidence]}</span>` : ''}
      </span>
    </div>
    <div class="teams">
      <div class="team">${logo(e.home)}<span class="n">${esc(e.home.name)}</span>${e.home.rank ? `<span class="rec">#${e.home.rank}</span>` : e.home.record ? `<span class="rec">${esc(e.home.record)}</span>` : ''}${e.home.red ? `<span title="כרטיס אדום">🟥${e.home.red > 1 ? e.home.red : ''}</span>` : ''}</div>
      <div class="score num ${e.state === 'post' && e.home.score > e.away.score ? 'win' : ''}">${showScore ? esc(e.home.score ?? '') : ''}</div>
      <div class="team">${logo(e.away)}<span class="n">${esc(e.away.name)}</span>${e.away.rank ? `<span class="rec">#${e.away.rank}</span>` : e.away.record ? `<span class="rec">${esc(e.away.record)}</span>` : ''}${e.away.red ? `<span title="כרטיס אדום">🟥${e.away.red > 1 ? e.away.red : ''}</span>` : ''}</div>
      <div class="score num ${e.state === 'post' && e.away.score > e.home.score ? 'win' : ''}">${showScore ? esc(e.away.score ?? '') : ''}</div>
    </div>
    ${e.sport === 'tennis' && e.sets?.length ? `<div class="meta-row num">${e.sets.map((s) => `${s.a ?? ''}-${s.b ?? ''}`).join(' · ')}</div>` : ''}
    ${p.unavailable ? `<div class="muted small">${esc(p.reason || 'אין חיזוי')}</div>` : p.probs ? `${probBar(p.probs, { threeWay: p.threeWay })}${outcomeButtons(e)}` : ''}
    ${metaBits.length ? `<div class="meta-row">${metaBits.map((b) => `<span>${b}</span>`).join('')}</div>` : ''}
  </article>`;
}

function groupByLeague(events) {
  const groups = new Map();
  for (const e of events) {
    const k = e.league;
    if (!groups.has(k)) groups.set(k, { name: e.leagueName, country: e.country, sport: e.sport, events: [] });
    groups.get(k).events.push(e);
  }
  return [...groups.values()];
}

const SPORT_ICON = { soccer: '⚽', basketball: '🏀', football: '🏈', hockey: '🏒', baseball: '⚾', tennis: '🎾' };

function listHtml(events, { grouped = true } = {}) {
  if (!events.length) return '';
  if (!grouped) return `<div class="grid">${events.map(card).join('')}</div>`;
  return groupByLeague(events).map((g) => `
    <div class="league-head"><span class="flag">${SPORT_ICON[g.sport] || ''}</span>${esc(g.name)} · ${esc(g.country)} <span class="faint">(${g.events.length})</span></div>
    <div class="grid">${g.events.map(card).join('')}</div>`).join('');
}

function eventsQuery({ date, live } = {}) {
  const parts = [wParam()];
  if (S.sport !== 'all') parts.push(`sport=${S.sport}`);
  if (S.league && !live) parts.push(`league=${encodeURIComponent(S.league)}`);
  if (date) parts.push(`date=${date}`);
  if (S.settings.featuredOnly) parts.push('featured=1');
  return parts.join('&');
}

function rerenderList() {
  if (!lastList) return;
  const { container, events, empty, grouped } = lastList;
  const f = filterEvents(events);
  container.innerHTML = f.length ? listHtml(f, { grouped }) : empty;
}

async function loadInto(path, render) {
  try {
    const data = await api(path);
    S.cache.set(path, data);
    render(data);
  } catch (err) {
    const cached = S.cache.get(path);
    if (cached) { render(cached); toast('שגיאת רשת – מוצגים נתונים אחרונים'); } else view.innerHTML = `<div class="empty"><div class="big">⚠️</div>${esc(err.message)}<br><button class="btn" data-act="reload" style="margin-top:12px">נסו שוב</button></div>`;
  }
}

function loadingHtml(msg = 'טוען נתונים ומחשב הסתברויות…') {
  return `<div class="loading"><span class="spinner"></span>${msg}<div class="small faint" style="margin-top:8px">בהפעלה הראשונה המערכת מורידה היסטוריית משחקים לכל הליגות – זה לוקח כדקה ונשמר במטמון.</div></div>`;
}

// ------------------------------------------------------------------- live
async function renderLive() {
  if (!S.cache.has(`/api/live?${eventsQuery({ live: true })}`)) view.innerHTML = loadingHtml();
  const path = `/api/live?${eventsQuery({ live: true })}`;
  await loadInto(path, (data) => {
    if (currentRoute !== 'live') return;
    const live = data.events.filter((e) => e.state === 'in');
    const done = data.events.filter((e) => e.state === 'post');
    setLiveCount(live.length);
    view.innerHTML = `
      <div class="section-title"><h2>🔴 משחקים בלייב</h2><span class="sub">מתעדכן כל ${S.settings.refreshSec} שניות · ההסתברויות מחושבות מחדש לפי תוצאה, דקה וכרטיסים אדומים</span></div>
      <div id="liveList"></div>
      ${done.length ? `<div class="section-title"><h2>הסתיימו לאחרונה</h2></div><div id="doneList"></div>` : ''}`;
    const liveEmpty = `<div class="empty"><div class="big">📺</div>אין כרגע משחקים בלייב${S.sport !== 'all' ? ' בענף הזה' : ''}.<br><a class="btn" href="#/matches" style="margin-top:12px">למשחקי היום ←</a></div>`;
    const lc = $('#liveList');
    lastList = { container: lc, events: live, empty: liveEmpty, grouped: true };
    rerenderList();
    if (done.length) $('#doneList').innerHTML = listHtml(filterEvents(done));
  });
  schedule(renderLive);
}

function setLiveCount(n) {
  const c = $('#liveCount');
  c.textContent = n;
  c.classList.toggle('hidden', !n);
}

// ---------------------------------------------------------------- matches
async function renderMatches() {
  const path = `/api/events?${eventsQuery({ date: S.date })}`;
  if (!S.cache.has(path)) view.innerHTML = loadingHtml();
  await loadInto(path, (data) => {
    if (currentRoute !== 'matches') return;
    const ev = data.events;
    const counts = { in: 0, pre: 0, post: 0 };
    for (const e of ev) counts[e.state] = (counts[e.state] || 0) + 1;
    const leagueName = (k) => S.meta?.leagues?.find((l) => l.key === k)?.he || k;
    const slow = data.loadingLeagues || [];
    const poolsLoading = Object.values(data.pools || {}).some((p) => p.incomplete);
    view.innerHTML = `
      <div class="section-title"><h2>📅 ${esc(hebDay(S.date, S.settings.tz))}</h2>
        <span class="sub">${ev.length} משחקים · ${counts.in} בלייב · ${counts.pre} טרם התחילו · ${counts.post} הסתיימו</span></div>
      ${slow.length ? `<div class="notice"><span class="spinner" style="width:14px;height:14px;border-width:2px"></span> עוד ${slow.length} ליגות נטענות${slow.length <= 4 ? ` (${slow.map(leagueName).join(', ')})` : ''} – הן יופיעו ברענון הבא.</div>` : poolsLoading ? '<div class="notice">חלק מנתוני ההיסטוריה עדיין נטענים – ההסתברויות יתעדכנו אוטומטית.</div>' : ''}
      <div id="matchList"></div>`;
    const empty = `<div class="empty"><div class="big">🗓️</div>אין משחקים ביום הזה לפי הסינון.</div>`;
    lastList = { container: $('#matchList'), events: ev, empty, grouped: true };
    rerenderList();
    setLiveCount(counts.in);
  });
  if (S.date === localYmd(new Date(), S.settings.tz) || (S.cache.get(path)?.loadingLeagues || []).length) schedule(renderMatches, Math.max(30, S.settings.refreshSec));
}

// ------------------------------------------------------------------ value
let valueFilter = { market: 'all', minEdge: null, bet365: false, suspicious: false };
async function renderValue() {
  const minEdge = valueFilter.minEdge ?? S.settings.minEdge;
  const path = `/api/value?${eventsQuery({ date: S.date })}&minEdge=${Math.max(0, minEdge - 0.0001)}${valueFilter.bet365 ? '&bet365=1' : ''}${valueFilter.suspicious ? '&includeSuspicious=1' : ''}`;
  if (!S.cache.has(path)) view.innerHTML = loadingHtml('סורק את כל המשחקים ומשווה יחסים להסתברויות…');
  await loadInto(path, (data) => {
    if (currentRoute !== 'value') return;
    const hasApiFootball = S.meta?.providers?.apiFootball?.enabled;
    const rows = data.rows.filter((r) => valueFilter.market === 'all' || r.market === valueFilter.market)
      .filter((r) => !S.search || r.match.toLowerCase().includes(S.search.toLowerCase()));
    view.innerHTML = `
      <div class="section-title"><h2>💎 הימורי ערך – ${esc(hebDay(S.date, S.settings.tz))}</h2><span class="sub">נסרקו ${data.scanned} משחקים</span></div>
      <div class="notice"><b>מה זה הימור ערך?</b> כשהיחס שהסוכנות נותנת גבוה מהיחס ההוגן לפי ההסתברות שלנו (EV חיובי). רווח לאורך זמן מגיע רק מהימורים כאלה – לא מ"ניחוש המנצח".
      ההסתברות כאן היא שילוב של המודל הסטטיסטי (${pct(S.settings.modelWeight)}) עם השוק אחרי הסרת עמלה. ערכים חריגים (מעל 15%) לרוב אומרים שלמודל חסר מידע – פציעה, הרכב, מוטיבציה.</div>
      <div class="toolbar" style="padding:0;margin:8px 0">
        <div class="seg-tabs">${[['all', 'הכל'], ['1x2', '1X2'], ['total', 'מעל/מתחת'], ['spread', 'הנדיקאפ'], ['btts', 'שתיהן יבקיעו']].map(([k, l]) => `<button class="${valueFilter.market === k ? 'active' : ''}" data-act="vf-market" data-m="${k}">${l}</button>`).join('')}</div>
        <label class="range-row small muted" style="min-width:240px">יתרון מינימלי <input type="range" min="0" max="0.15" step="0.005" value="${minEdge}" id="edgeRange"><b class="num" id="edgeVal">${pct(minEdge, 1)}</b></label>
        <label class="small"><input type="checkbox" id="vfSus" ${valueFilter.suspicious ? 'checked' : ''}> הצג גם חשודים${data.hiddenSuspicious ? ` (${data.hiddenSuspicious} מוסתרים)` : ''}</label>
        ${hasApiFootball ? `<label class="small"><input type="checkbox" id="b365" ${valueFilter.bet365 ? 'checked' : ''}> טען יחסי Bet365 (API-Football)</label>` : ''}
      </div>
      ${rows.length ? `<div class="panel table-wrap"><table class="t">
        <thead><tr><th>משחק</th><th>הימור</th><th>סוכנות</th><th class="c">יחס</th><th class="c">הסתברות</th><th class="c">יחס הוגן</th><th class="c">EV</th><th class="c">סכום מומלץ</th><th></th></tr></thead>
        <tbody>${rows.map((r) => {
          const st = stakeFor(r.p, r.odds);
          const ev = { sport: r.sport, home: { short: r.home, name: r.home }, away: { short: r.away, name: r.away } };
          return `<tr class="click ${r.suspicious ? '' : 'hl'}" data-act="open" data-id="${esc(r.eventId)}">
            <td><div style="font-weight:600">${esc(r.match)}</div><div class="small muted">${esc(r.leagueName)} · ${timeOf(r.start, S.settings.tz)}</div></td>
            <td>${esc(selName(r, ev))}${r.suspicious ? ' <span class="tag warn" title="המודל חולק על השוק ביותר מ-15 נקודות, או יתרון מעל 15%">חשוד</span>' : ''}</td>
            <td>${esc(r.book)}</td>
            <td class="c num"><b>${odds(r.odds)}</b></td>
            <td class="c num">${pct(r.p, 1)}</td>
            <td class="c num">${odds(r.fairOdds)}</td>
            <td class="c num ev-cell pos">${signedPct(r.ev)}</td>
            <td class="c num">${st.amount ? money(st.amount) : '–'} <span class="small muted">(${pct(st.fraction, 1)})</span></td>
            <td><button class="btn sm" data-act="add-value" data-id="${esc(r.eventId)}" data-market="${r.market}" data-sel="${r.sel}" data-line="${r.line ?? ''}" data-odds="${r.odds}" data-p="${r.p}" data-book="${esc(r.book)}" data-match="${esc(r.match)}" data-start="${esc(r.start)}">+ טופס</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : `<div class="empty"><div class="big">🔍</div>לא נמצאו הימורי ערך מעל ${pct(minEdge, 1)} ביום הזה.<br><span class="small">זה המצב הנפוץ – השוק יעיל. הכניסו יחסי Winner / Bet365 בעמוד המשחק כדי לבדוק אותם מול ההסתברות שלנו.</span></div>`}
    `;
    $('#edgeRange')?.addEventListener('input', (e) => { $('#edgeVal').textContent = pct(Number(e.target.value), 1); });
    $('#edgeRange')?.addEventListener('change', (e) => { valueFilter.minEdge = Number(e.target.value); renderValue(); });
    $('#b365')?.addEventListener('change', (e) => { valueFilter.bet365 = e.target.checked; renderValue(); });
    $('#vfSus')?.addEventListener('change', (e) => { valueFilter.suspicious = e.target.checked; renderValue(); });
  });
}

// ------------------------------------------------------------------- slip
export function renderSlip() {
  $('#slipCount').textContent = S.slip.length;
  const d = $('#drawer');
  const legs = S.slip;
  const combinedOdds = legs.reduce((a, l) => a * (Number(l.odds) || 1), 1);
  const allOdds = legs.every((l) => Number(l.odds) > 1);
  const combinedP = legs.reduce((a, l) => a * (l.p || 0), 1);
  const ev = allOdds && legs.length ? combinedP * combinedOdds - 1 : null;
  const sameEvent = new Set(legs.map((l) => l.eventId)).size < legs.length;
  const st = allOdds && legs.length ? stakeFor(combinedP, combinedOdds) : { amount: 0, fraction: 0 };
  d.innerHTML = `
    <header><b>🧾 הטופס שלי (${legs.length})</b><button class="btn ghost sm" data-act="slip-close" aria-label="סגירה">✕</button></header>
    <div class="body">
      ${legs.length ? legs.map((l, i) => `
        <div class="leg">
          <div><div class="s">${esc(l.label)}</div><div class="m">${esc(l.match)}</div>
            <div class="m num">הסתברות ${pct(l.p, 1)} · הוגן ${fairOdds(l.p)}${Number(l.odds) > 1 ? ` · <span class="${l.p * l.odds - 1 >= 0 ? 'pos' : 'neg'}">EV ${signedPct(l.p * l.odds - 1)}</span>` : ''}</div></div>
          <input class="odds-in" data-act="leg-odds" data-i="${i}" value="${esc(l.odds ?? '')}" placeholder="יחס" inputmode="decimal" aria-label="יחס">
          <button class="btn ghost sm" data-act="leg-del" data-i="${i}" aria-label="הסרה">✕</button>
        </div>`).join('') : '<div class="empty" style="margin-top:20px">לחצו על הסתברות (1 / X / 2) בכרטיס משחק כדי להוסיף לטופס.</div>'}
      ${sameEvent ? '<div class="notice warn">יש בטופס כמה הימורים מאותו משחק – הם תלויים זה בזה, ההסתברות המשולבת לא מדויקת.</div>' : ''}
    </div>
    ${legs.length ? `<footer>
      <div class="meta-row"><span>יחס משולב <b class="num">${allOdds ? odds(combinedOdds) : '–'}</b></span><span>הסתברות <b class="num">${pct(combinedP, 2)}</b></span><span>יחס הוגן <b class="num">${fairOdds(combinedP)}</b></span>
        <span>EV <b class="num ${ev >= 0 ? 'pos' : 'neg'}">${signedPct(ev)}</b></span></div>
      ${legs.length > 1 ? '<div class="small muted">בכל רגל עמלת הסוכנות מצטברת – בטפסים ארוכים ה-EV כמעט תמיד שלילי, אלא אם כל רגל היא ערך.</div>' : ''}
      <div class="form-grid">
        <label>סוכנות<select class="input" id="slipBook">${['Winner', 'Bet365', 'אחר'].map((b) => `<option ${S.settings.defaultBook === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label>סכום (₪)<input class="input num" id="slipStake" value="${st.amount || 20}" inputmode="decimal"></label>
      </div>
      <div class="small muted">המלצת קלי (${S.settings.kellyFraction}×): ${st.amount ? money(st.amount) : 'לא להמר – אין יתרון'}</div>
      <div style="display:flex;gap:8px"><button class="btn primary" data-act="slip-save" ${allOdds ? '' : 'disabled'} style="flex:1">שמירה למעקב</button><button class="btn" data-act="slip-clear">ניקוי</button></div>
    </footer>` : ''}`;
}

function openSlip(open = true) {
  $('#drawer').classList.toggle('open', open);
  $('#scrim').classList.toggle('hidden', !open);
  if (open) renderSlip();
}

// Finds an event object in any loaded list (for building slip legs).
function findLoadedEvent(id) {
  for (const data of S.cache.values()) {
    const e = data?.events?.find?.((x) => x.id === id);
    if (e) return e;
    if (data?.event?.id === id) return { ...data.event, prediction: data.prediction };
  }
  return null;
}

export function addLeg({ eventId, market, sel, line = null, p, odds: o, book, match, start, label }) {
  const added = toggleSlip({ eventId, market, sel, line, p, odds: o ?? '', book, match, start, label });
  renderSlip();
  toast(added ? `נוסף לטופס: ${label}` : 'הוסר מהטופס');
  document.querySelectorAll(`[data-act="add"][data-id="${CSS.escape(eventId)}"]`).forEach((b) => b.classList.toggle('in-slip', inSlip(eventId, b.dataset.market, b.dataset.sel, b.dataset.line ? Number(b.dataset.line) : null)));
}

// --------------------------------------------------------- event delegation
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'open') { if (ev.target.closest('button, input, select, a') && ev.target.closest('[data-act]') !== a) return; location.hash = `#/event/${encodeURIComponent(a.dataset.id)}`; return; }
  if (act === 'add') {
    ev.stopPropagation();
    const e = findLoadedEvent(a.dataset.id);
    if (!e) return;
    const sel = a.dataset.sel, market = a.dataset.market || '1x2';
    const line = a.dataset.line ? Number(a.dataset.line) : null;
    const p = a.dataset.p ? Number(a.dataset.p) : e.prediction?.probs?.[sel];
    const best = market === '1x2' ? e.prediction?.best?.[sel] : null;
    const label = a.dataset.label || selName({ market, sel, line }, e);
    addLeg({ eventId: e.id, market, sel, line, p, odds: a.dataset.odds ? Number(a.dataset.odds) : best?.odds, book: best?.book, match: `${e.home.name} – ${e.away.name}`, start: e.start, label: `${label}${market === '1x2' && e.sport === 'soccer' ? '' : ''}` });
    return;
  }
  if (act === 'add-value') {
    ev.stopPropagation();
    const d = a.dataset;
    const evl = { sport: '', home: { short: d.match.split(' – ')[0] }, away: { short: d.match.split(' – ')[1] } };
    addLeg({ eventId: d.id, market: d.market, sel: d.sel, line: d.line === '' ? null : Number(d.line), p: Number(d.p), odds: Number(d.odds), book: d.book, match: d.match, start: d.start, label: selName({ market: d.market, sel: d.sel, line: d.line === '' ? null : Number(d.line) }, evl) });
    return;
  }
  if (act === 'sport') { S.sport = a.dataset.s; S.league = ''; navigate(); return; }
  if (act === 'day') { S.date = shiftYmd(S.date, Number(a.dataset.d)); navigate(); return; }
  if (act === 'vf-market') { valueFilter.market = a.dataset.m; renderValue(); return; }
  if (act === 'slip-open') { openSlip(!$('#drawer').classList.contains('open')); return; }
  if (act === 'slip-close') { openSlip(false); return; }
  if (act === 'leg-del') { S.slip.splice(Number(a.dataset.i), 1); store.set('se.slip', S.slip); renderSlip(); return; }
  if (act === 'slip-clear') { clearSlip(); renderSlip(); return; }
  if (act === 'slip-save') {
    const legs = S.slip;
    const combinedOdds = legs.reduce((x, l) => x * Number(l.odds), 1);
    const stake = Number($('#slipStake').value);
    try {
      await api('/api/bets', { method: 'POST', body: {
        book: $('#slipBook').value, odds: combinedOdds, stake, prob: legs.reduce((x, l) => x * (l.p || 0), 1) || null,
        legs: legs.map((l) => ({ eventId: l.eventId, match: l.match, start: l.start, market: l.market, sel: l.sel, line: l.line, odds: Number(l.odds), prob: l.p })),
      } });
      clearSlip(); renderSlip(); toast('ההימור נשמר במעקב ✓');
      if (currentRoute === 'bets') navigate();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'theme') {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('se.theme', next);
    return;
  }
  if (act === 'reload') { navigate(); return; }
});

document.addEventListener('change', (ev) => {
  const a = ev.target.closest('[data-act="leg-odds"]');
  if (!a) return;
  updateLeg(Number(a.dataset.i), { odds: parseOdds(a.value) ?? '' });
  renderSlip();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && ['live', 'matches', 'event'].includes(currentRoute)) navigate(); });

// ------------------------------------------------------------------- boot
(async function boot() {
  try { S.meta = await api('/api/meta'); } catch { S.meta = null; }
  renderSlip();
  navigate();
})();
