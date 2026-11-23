// Secondary pages: bet tracker, model performance, team ratings, settings.
import { api, esc, pct, odds, signedPct, money, num, dateOf, timeOf, calibrationChart, curveChart, parseOdds, selName } from './lib.js';
import { S, saveSettings, toast } from './state.js';
import { navigate } from './app.js';

const $ = (s, r = document) => r.querySelector(s);
const STATUS = { pending: 'ממתין', won: 'זכה', lost: 'הפסיד', void: 'בוטל', 'half-won': 'חצי זכייה', 'half-lost': 'חצי הפסד' };

// ------------------------------------------------------------------ bets
export async function renderBets(view) {
  view.innerHTML = '<div class="loading"><span class="spinner"></span>טוען…</div>';
  let data;
  try { data = await api('/api/bets'); } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const s = data.summary;
  view.innerHTML = `
    <div class="section-title"><h2>📒 מעקב הימורים</h2><span class="sub">הימורים מסתגרים אוטומטית כשהתוצאה מגיעה</span></div>
    <div class="kpis">
      <div class="kpi"><div class="k">רווח / הפסד</div><div class="v num ${s.profit >= 0 ? 'pos' : 'neg'}">${money(s.profit)}</div></div>
      <div class="kpi"><div class="k">תשואה (ROI)</div><div class="v num ${s.roi >= 0 ? 'pos' : 'neg'}">${s.roi == null ? '–' : signedPct(s.roi)}</div></div>
      <div class="kpi"><div class="k">אחוז הצלחה</div><div class="v num">${s.hitRate == null ? '–' : pct(s.hitRate)}</div></div>
      <div class="kpi"><div class="k">סה"כ הושקע</div><div class="v num">${money(s.staked)}</div></div>
      <div class="kpi"><div class="k">ממתינים</div><div class="v num">${s.pending} <span class="small muted">(${money(s.pendingStake)})</span></div></div>
      <div class="kpi"><div class="k">רווח צפוי (EV)</div><div class="v num ${s.expectedProfit >= 0 ? 'pos' : 'neg'}">${money(s.expectedProfit)}</div></div>
    </div>
    ${s.curve.length > 1 ? `<div class="panel" style="margin-top:12px"><h3>עקומת רווח</h3>${curveChart(s.curve)}</div>` : ''}
    <div class="notice"><b>למה "רווח צפוי"?</b> בטווח קצר המזל שולט. אם הרווח הצפוי (סכום ה-EV של ההימורים לפי ההסתברות שלנו בזמן ההימור) חיובי לאורך מאות הימורים – אתם בדרך הנכונה, גם אם החודש היה רע.</div>
    <div class="panel" style="margin-top:12px"><h3>➕ הוספת הימור ידנית</h3>
      <div class="form-grid">
        <label>משחק<input class="input" id="bMatch" placeholder="מכבי ת״א – הפועל ב״ש"></label>
        <label>בחירה<input class="input" id="bSel" placeholder="1 / X / 2 / מעל 2.5"></label>
        <label>סוכנות<select class="input" id="bBook"><option>Winner</option><option>Bet365</option><option>אחר</option></select></label>
        <label>יחס<input class="input num" id="bOdds" inputmode="decimal" placeholder="2.10"></label>
        <label>סכום (₪)<input class="input num" id="bStake" inputmode="decimal" placeholder="50"></label>
        <label>הסתברות שלכם (%)<input class="input num" id="bProb" inputmode="decimal" placeholder="לא חובה"></label>
      </div>
      <button class="btn primary" id="bAdd" style="margin-top:10px">שמירה</button>
    </div>
    ${Object.keys(s.byBook).length ? `<div class="panel" style="margin-top:12px"><h3>לפי סוכנות</h3><table class="t"><thead><tr><th>סוכנות</th><th class="c">הימורים</th><th class="c">הושקע</th><th class="c">רווח</th><th class="c">ROI</th></tr></thead><tbody>
      ${Object.entries(s.byBook).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="c num">${v.n}</td><td class="c num">${money(v.staked)}</td><td class="c num ${v.profit >= 0 ? 'pos' : 'neg'}">${money(v.profit)}</td><td class="c num">${signedPct(v.profit / v.staked)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="panel table-wrap" style="margin-top:12px"><h3>כל ההימורים (${data.bets.length})</h3>
    ${data.bets.length ? `<table class="t"><thead><tr><th>תאריך</th><th>הימור</th><th>סוכנות</th><th class="c">יחס</th><th class="c">סכום</th><th class="c">EV בזמן ההימור</th><th class="c">סטטוס</th><th></th></tr></thead><tbody>
      ${data.bets.map((b) => {
        const pnl = b.status === 'won' ? b.stake * (b.odds - 1) : b.status === 'lost' ? -b.stake : b.status === 'half-won' ? b.stake / 2 * (b.odds - 1) : b.status === 'half-lost' ? -b.stake / 2 : 0;
        return `<tr>
          <td class="small muted">${dateOf(b.placedAt, S.settings.tz)}</td>
          <td>${b.legs.map((l) => `<div><b>${esc(legLabel(l))}</b> <span class="small muted">${esc(l.match)}${l.final ? ` · ${esc(l.final)}` : ''}${l.result ? ` · ${STATUS[l.result] || l.result}` : ''}</span></div>`).join('')}${b.legs.length > 1 ? `<span class="tag">כפול ×${b.legs.length}</span>` : ''}${b.note ? `<div class="small muted">${esc(b.note)}</div>` : ''}</td>
          <td>${esc(b.book)}</td><td class="c num">${odds(b.odds)}</td><td class="c num">${money(b.stake)}</td>
          <td class="c num ${b.prob && b.prob * b.odds - 1 >= 0 ? 'pos' : 'neg'}">${b.prob ? signedPct(b.prob * b.odds - 1) : '–'}</td>
          <td class="c"><select class="input" data-bet-status="${b.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${b.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>${b.status !== 'pending' ? `<div class="small num ${pnl >= 0 ? 'pos' : 'neg'}">${money(pnl)}</div>` : ''}</td>
          <td><button class="btn ghost sm" data-bet-del="${b.id}" aria-label="מחיקה">🗑</button></td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">עוד לא נשמרו הימורים. הוסיפו מהטופס או ידנית.</div>'}</div>`;

  $('#bAdd').addEventListener('click', async () => {
    const o = parseOdds($('#bOdds').value), stake = Number($('#bStake').value);
    if (!o || !(stake > 0)) return toast('יש להזין יחס וסכום');
    const prob = Number($('#bProb').value) / 100 || null;
    try {
      await api('/api/bets', { method: 'POST', body: { book: $('#bBook').value, odds: o, stake, prob, match: $('#bMatch').value, sel: $('#bSel').value, market: 'manual' } });
      toast('נשמר ✓');
      renderBets(view);
    } catch (e) { toast(e.message); }
  });
  view.querySelectorAll('[data-bet-status]').forEach((sel) => sel.addEventListener('change', async () => {
    await api(`/api/bets/${sel.dataset.betStatus}`, { method: 'PATCH', body: { status: sel.value } });
    renderBets(view);
  }));
  view.querySelectorAll('[data-bet-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('למחוק את ההימור?')) return;
    await api(`/api/bets/${b.dataset.betDel}`, { method: 'DELETE' });
    renderBets(view);
  }));
}

function legLabel(l) {
  if (l.market === 'manual') return l.sel || '—';
  const [h, a] = (l.match || '').split(' – ');
  const base = selName({ market: l.market, sel: l.sel, line: l.line }, { sport: 'soccer', home: { short: h }, away: { short: a } });
  return l.market === '1x2' && l.line ? `${base} (הנדיקאפ ${l.line > 0 ? '+' : ''}${l.line})` : base;
}

// ---------------------------------------------------------------- models
const POOL_LABEL = { soccer: '⚽ כדורגל (כל הליגות)', nba: '🏀 NBA', eurobasket: '🏀 יורוליג + ישראל', ncaab: '🏀 מכללות', nfl: '🏈 NFL', ncaaf: '🏈 פוטבול מכללות', nhl: '🏒 NHL', mlb: '⚾ MLB' };
let modelPool = 'soccer';

export async function renderModels(view) {
  view.innerHTML = `
    <div class="section-title"><h2>🧪 ביצועי המודל</h2><span class="sub">בדיקה כנה: האם ההסתברויות באמת מדויקות?</span></div>
    <div class="notice">כאן רואים איך המודל היה מצליח בעבר. <b>Backtest</b> = כל שבוע המודל אומן רק על משחקים שקדמו לו וחזה את השבוע הבא. <b>Brier</b> נמוך יותר = טוב יותר. <b>Skill</b> חיובי = טוב יותר מניחוש לפי שכיחות (בית/תיקו/חוץ). גרף הכיול מראה אם "60%" שלנו באמת קורה ב-60% מהמקרים.</div>
    <div class="seg-tabs" style="margin:8px 0">${Object.entries(POOL_LABEL).map(([k, l]) => `<button class="${k === modelPool ? 'active' : ''}" data-pool="${k}">${l}</button>`).join('')}</div>
    <div id="bt"><div class="loading"><span class="spinner"></span>מריץ backtest (יכול לקחת כמה שניות)…</div></div>
    <div class="section-title"><h2>📋 תיעוד חי</h2><span class="sub">צילומי חיזוי לפני תחילת כל משחק, מול התוצאה האמיתית</span></div>
    <div id="tr"><div class="loading"><span class="spinner"></span></div></div>`;
  view.querySelectorAll('[data-pool]').forEach((b) => b.addEventListener('click', () => { modelPool = b.dataset.pool; renderModels(view); }));
  api(`/api/backtest/${modelPool}`).then((r) => { $('#bt').innerHTML = backtestHtml(r); }).catch((e) => { $('#bt').innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  api('/api/track-record').then((r) => { $('#tr').innerHTML = trackHtml(r); }).catch((e) => { $('#tr').innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
}

function metricsKpis(o, label) {
  if (!o?.n) return `<div class="kpi"><div class="k">${label}</div><div class="v">–</div></div>`;
  return `<div class="kpi"><div class="k">${label} · ${o.n} משחקים</div><div class="v num">${pct(o.accuracy, 1)}</div>
    <div class="small muted num">Brier ${num(o.brier, 3)} (בסיס ${num(o.baselineBrier, 3)}) · Skill <span class="${o.skill > 0 ? 'pos' : 'neg'}">${signedPct(o.skill)}</span> · LogLoss ${num(o.logloss, 3)}</div></div>`;
}

function backtestHtml(r) {
  const o = r.overall;
  if (!o?.n) return '<div class="empty">אין מספיק נתונים ל-backtest במאגר הזה כרגע (עונה חדשה או מחוץ לעונה).</div>';
  return `<div class="cols">
    <div class="panel"><h3>סיכום – ${r.days} ימים אחרונים <span class="sub">${r.threeWay ? '1X2 (שלוש תוצאות)' : 'מנצחת (שתי תוצאות)'}</span></h3>
      <div class="kpis">
        <div class="kpi"><div class="k">אחוז פגיעה (הפייבוריט שלנו ניצח)</div><div class="v num">${pct(o.accuracy, 1)}</div></div>
        <div class="kpi"><div class="k">Brier Skill מול בסיס</div><div class="v num ${o.skill > 0 ? 'pos' : 'neg'}">${signedPct(o.skill)}</div></div>
        <div class="kpi"><div class="k">משחקים שנבדקו</div><div class="v num">${o.n}</div></div>
      </div>
      <div class="small muted" style="margin-top:8px">Brier ${num(o.brier, 3)} מול ${num(o.baselineBrier, 3)} לניחוש בסיסי · LogLoss ${num(o.logloss, 3)} מול ${num(o.baselineLogloss, 3)}</div>
    </div>
    <div class="panel"><h3>כיול <span class="sub">נקודה על הקו = הסתברות מדויקת</span></h3>${calibrationChart(o.calibration)}</div>
  </div>
  <div class="panel table-wrap" style="margin-top:12px"><h3>לפי ליגה</h3><table class="t"><thead><tr><th>ליגה</th><th class="c">משחקים</th><th class="c">פגיעה</th><th class="c">Brier</th><th class="c">בסיס</th><th class="c">Skill</th></tr></thead><tbody>
    ${r.leagues.filter((l) => l.n >= 5).map((l) => `<tr><td>${esc(l.name)}</td><td class="c num">${l.n}</td><td class="c num">${pct(l.accuracy, 1)}</td><td class="c num">${num(l.brier, 3)}</td><td class="c num">${num(l.baselineBrier, 3)}</td><td class="c num ${l.skill > 0 ? 'pos' : 'neg'}">${signedPct(l.skill)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function trackHtml(r) {
  if (!r.settled) return `<div class="empty">עדיין אין משחקים שהסתיימו בתיעוד החי (${r.pending} ממתינים). המערכת שומרת את החיזוי של כל משחק שמוצג לפני שהוא מתחיל – חזרו בעוד יום-יומיים.</div>`;
  return `<div class="kpis">${metricsKpis(r.model, 'מודל סטטיסטי')}${metricsKpis(r.market, 'שוק (ללא עמלה)')}${metricsKpis(r.fair, 'משולב – מה שמוצג באפליקציה')}
    <div class="kpi"><div class="k">הימורי ערך שסומנו (1 יח' כל אחד)</div><div class="v num ${r.valueBets.profit >= 0 ? 'pos' : 'neg'}">${r.valueBets.bets ? signedPct(r.valueBets.roi) : '–'}</div><div class="small muted">${r.valueBets.bets} הימורים · רווח ${num(r.valueBets.profit, 1)} יח'</div></div></div>
    <div class="small muted" style="margin-top:8px">${r.settled} משחקים הסתיימו · ${r.pending} ממתינים. מדגם של פחות מכמה מאות משחקים עדיין רועש מאוד.</div>`;
}

// --------------------------------------------------------------- ratings
let ratingPool = 'soccer', ratingLeague = '';
export async function renderRatings(view) {
  const leagues = (S.meta?.leagues || []).filter((l) => l.pool === ratingPool);
  view.innerHTML = `
    <div class="section-title"><h2>🏆 דירוג קבוצות</h2><span class="sub">כוח התקפה והגנה מחושבים מהתוצאות, משוקללים לפי עדכניות</span></div>
    <div class="toolbar" style="padding:0">
      <div class="seg-tabs">${Object.entries(POOL_LABEL).map(([k, l]) => `<button class="${k === ratingPool ? 'active' : ''}" data-rpool="${k}">${l}</button>`).join('')}</div>
      ${leagues.length > 1 ? `<select class="input" id="rLeague"><option value="">כל הליגות במאגר</option>${leagues.map((l) => `<option value="${l.key}" ${l.key === ratingLeague ? 'selected' : ''}>${esc(l.he)}</option>`).join('')}</select>` : ''}
    </div>
    <div id="rt"><div class="loading"><span class="spinner"></span>מחשב…</div></div>`;
  view.querySelectorAll('[data-rpool]').forEach((b) => b.addEventListener('click', () => { ratingPool = b.dataset.rpool; ratingLeague = ''; renderRatings(view); }));
  $('#rLeague')?.addEventListener('change', (e) => { ratingLeague = e.target.value; renderRatings(view); });
  try {
    const r = await api(`/api/ratings/${ratingPool}${ratingLeague ? `?league=${encodeURIComponent(ratingLeague)}` : ''}`);
    if (r.pending) { $('#rt').innerHTML = '<div class="empty">המאגר עדיין נטען, נסו בעוד דקה.</div>'; return; }
    const goals = r.teams[0]?.attack != null;
    const leagueName = (k) => S.meta?.leagues?.find((l) => l.key === k)?.he || k;
    $('#rt').innerHTML = `<div class="panel table-wrap"><div class="meta-row" style="margin-bottom:8px">${goals ? `<span>ממוצע שערים לקבוצה <b class="num">${num(r.params.avgGoals)}</b></span><span>יתרון ביתיות <b class="num">${num(r.params.homeAdvantage)}×</b></span>` : `<span>נקודות בסיס <b class="num">${num(r.params.base, 1)}</b></span><span>יתרון ביתיות <b class="num">${num(r.params.homeAdvantage, 1)}</b></span><span>סטיית תקן הפרש <b class="num">${num(r.params.sigmaMargin, 1)}</b></span>`}</div>
      <table class="t"><thead><tr><th>#</th><th>קבוצה</th><th>ליגה</th>${goals ? '<th class="c">התקפה</th><th class="c">הגנה</th>' : '<th class="c">התקפה</th><th class="c">הגנה</th><th class="c">נטו</th>'}<th class="c">משחקים</th></tr></thead><tbody>
      ${r.teams.slice(0, 200).map((t, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(t.name)}</b></td><td class="small muted">${esc(leagueName(t.league))}</td>
        ${goals ? `<td class="c num">${num(t.attack)}</td><td class="c num">${num(t.defense)}</td>` : `<td class="c num">${num(t.offense, 1)}</td><td class="c num">${num(t.defense, 1)}</td><td class="c num ${t.net >= 0 ? 'pos' : 'neg'}">${t.net > 0 ? '+' : ''}${num(t.net, 1)}</td>`}
        <td class="c num">${t.games}</td></tr>`).join('')}
      </tbody></table>
      <div class="small muted" style="margin-top:8px">${goals ? 'התקפה 1.30 = מבקיעה 30% יותר מקבוצה ממוצעת; הגנה 1.30 = סופגת 30% פחות.' : 'התקפה = נקודות צפויות מול הגנה ממוצעת; הגנה = נקודות שהיריבה צפויה לקלוע; נטו = הפרש צפוי מול קבוצה ממוצעת במגרש ניטרלי.'}</div></div>`;
  } catch (e) { $('#rt').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

// -------------------------------------------------------------- settings
export async function renderSettings(view) {
  const st = S.settings;
  let meta = S.meta;
  try { meta = await api('/api/meta'); S.meta = meta; } catch { /* keep cached */ }
  const prov = meta?.providers || {};
  const row = (name, p, how) => `<div class="prov"><div><span class="${p?.enabled ? 'dot-on' : 'dot-off'}"></span><b>${name}</b> <span class="small muted">${esc(p?.note || '')}</span>
      ${p?.quota?.remaining != null ? `<div class="small muted">מכסה שנותרה: ${esc(p.quota.remaining)}</div>` : ''}${p?.quota?.error ? `<div class="small neg">${esc(p.quota.error)}</div>` : ''}</div>
      <span class="small ${p?.enabled ? 'pos' : 'muted'}">${p?.enabled ? 'מחובר' : how}</span></div>`;
  view.innerHTML = `
    <div class="section-title"><h2>⚙️ הגדרות</h2></div>
    <div class="cols">
      <div class="panel"><h3>💰 ניהול קופה</h3>
        <div class="form-grid">
          <label>גודל קופה (₪)<input class="input num" id="sBank" value="${st.bankroll}" inputmode="decimal"></label>
          <label>שבר קלי<select class="input" id="sKelly">${[[0.1, 'עשירית (שמרני מאוד)'], [0.25, 'רבע (מומלץ)'], [0.5, 'חצי (אגרסיבי)'], [1, 'מלא (מסוכן)']].map(([v, l]) => `<option value="${v}" ${st.kellyFraction === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>מקסימום להימור (% מהקופה)<input class="input num" id="sMax" value="${st.maxStakePct * 100}" inputmode="decimal"></label>
          <label>יתרון מינימלי לסימון ערך (%)<input class="input num" id="sEdge" value="${st.minEdge * 100}" inputmode="decimal"></label>
          <label>סוכנות ברירת מחדל<select class="input" id="sBook">${['Winner', 'Bet365', 'אחר'].map((b) => `<option ${st.defaultBook === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        </div>
        <p class="small muted">נוסחת קלי מחשבת כמה מהקופה להמר לפי גודל היתרון. רבע-קלי מקטין תנודות בצורה דרמטית ומגן מטעויות בהערכת ההסתברות.</p>
      </div>
      <div class="panel"><h3>🧠 המודל</h3>
        <label class="small muted">משקל המודל הסטטיסטי מול השוק: <b class="num" id="wVal">${pct(st.modelWeight)}</b></label>
        <div class="range-row"><span class="small">שוק</span><input type="range" id="sW" min="0" max="1" step="0.05" value="${st.modelWeight}"><span class="small">מודל</span></div>
        <p class="small muted">השוק (יחסי סוכנויות חדות אחרי הסרת עמלה) מדויק מאוד בליגות הגדולות. ערך נמוך (20%–35%) נותן תוצאות מכוילות יותר; ערך גבוה יראה יותר "הימורי ערך" – אבל רבים מהם יהיו טעויות של המודל.</p>
        <div class="form-grid">
          <label>רענון לייב (שניות)<input class="input num" id="sRef" value="${st.refreshSec}" inputmode="numeric"></label>
          <label>אזור זמן<input class="input" id="sTz" value="${esc(st.tz)}"></label>
        </div>
        <label class="small" style="display:block;margin-top:10px"><input type="checkbox" id="sFeat" ${st.featuredOnly ? 'checked' : ''}> להציג רק ליגות מובילות (מהיר יותר)</label>
      </div>
      <div class="panel"><h3>🔌 מקורות נתונים</h3>
        ${row('ESPN', prov.espn, '')}
        ${row('TheSportsDB', { ...prov.thesportsdb, note: `${prov.thesportsdb?.note || ''}${prov.thesportsdb?.premium ? ' · פרימיום' : ' · מפתח חינמי'}` }, '')}
        ${row('The Odds API', prov.oddsApi, 'הוסיפו ODDS_API_KEY')}
        ${row('API-Football (Bet365)', prov.apiFootball, 'הוסיפו APIFOOTBALL_KEY')}
        <p class="small muted">המפתחות נשמרים בקובץ <code>.env</code> בתיקיית האפליקציה (ראו <code>.env.example</code>) ונטענים בהפעלה מחדש של השרת. מפתח חינמי: the-odds-api.com (500 בקשות בחודש), api-football.com (100 בקשות ביום), thesportsdb.com (פרימיום – לייב מלא לליגות ישראל).</p>
      </div>
    </div>
    <div style="margin-top:12px"><button class="btn primary" id="sSave">שמירת הגדרות</button></div>
    <div class="notice warn" style="margin-top:16px"><b>הימור אחראי.</b> אין מודל שמבטיח רווח – לסוכנות יש עמלה מובנית, ובווינר היא גבוהה במיוחד. השתמשו רק בכסף שאתם מוכנים להפסיד, הגדירו תקציב חודשי, ואם ההימורים מפסיקים להיות כיף – פנו לעזרה (למשל ער"ן – 1201).</div>`;
  $('#sW').addEventListener('input', (e) => { $('#wVal').textContent = pct(Number(e.target.value)); });
  $('#sSave').addEventListener('click', () => {
    let tz = $('#sTz').value.trim();
    try { new Intl.DateTimeFormat('he-IL', { timeZone: tz }); } catch { tz = 'Asia/Jerusalem'; }
    saveSettings({
      bankroll: Math.max(0, Number($('#sBank').value) || 0),
      kellyFraction: Number($('#sKelly').value),
      maxStakePct: Math.min(1, Math.max(0.001, Number($('#sMax').value) / 100 || 0.05)),
      minEdge: Math.max(0, Number($('#sEdge').value) / 100 || 0),
      defaultBook: $('#sBook').value,
      modelWeight: Number($('#sW').value),
      refreshSec: Math.max(10, Number($('#sRef').value) || 20),
      tz,
      featuredOnly: $('#sFeat').checked,
    });
    S.cache.clear();
    toast('נשמר ✓');
  });
}

export function renderMore(view) {
  view.innerHTML = `<div class="section-title"><h2>עוד</h2></div>
    <div class="cols">
      <a class="panel" href="#/models"><h3>🧪 ביצועי המודל</h3><div class="muted small">Backtest, כיול ותיעוד חי של החיזויים</div></a>
      <a class="panel" href="#/ratings"><h3>🏆 דירוג קבוצות</h3><div class="muted small">כוח התקפה והגנה לכל קבוצה</div></a>
      <a class="panel" href="#/settings"><h3>⚙️ הגדרות</h3><div class="muted small">קופה, קלי, משקל המודל, מפתחות API</div></a>
      <a class="panel" href="#/value"><h3>💎 הימורי ערך</h3><div class="muted small">כל ההימורים עם EV חיובי היום</div></a>
    </div>`;
}
