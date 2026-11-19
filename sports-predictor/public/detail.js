// Match detail: probabilities, value calculator for Winner / Bet365 odds,
// every market, bookmaker comparison, form, H2H, injuries, live chart.
import { api, esc, pct, odds, fairOdds, signedPct, money, timeOf, dateOf, probBar, probChart, sparkline, parseOdds, store, num, kelly } from './lib.js';
import { S, stakeFor, wParam, inSlip, toast } from './state.js';
import { schedule, addLeg, statusHe } from './app.js';

const $ = (s, r = document) => r.querySelector(s);
let state = { id: null, data: null, market: null, line: null };

export async function renderDetail(view, id) {
  const path = `/api/event/${encodeURIComponent(id)}?${wParam()}`;
  const first = state.id !== id;
  if (first) {
    state = { id, data: null, market: null, line: null };
    view.innerHTML = '<div class="loading"><span class="spinner"></span>טוען נתוני משחק, יחסים ומודלים…</div>';
  }
  try {
    const d = await api(path);
    S.cache.set(path, d);
    state.data = d;
    // don't clobber the page while the user is typing odds
    if (!first && document.activeElement?.classList?.contains('odds-in')) { schedule(() => renderDetail(view, id), 10); return; }
    draw(view, d);
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="big">⚠️</div>${esc(e.message)}<br><a class="btn" href="#/matches" style="margin-top:12px">חזרה למשחקים</a></div>`;
    return;
  }
  const ev = state.data.event;
  const soon = ev.state === 'pre' && Date.parse(ev.start) - Date.now() < 20 * 60000;
  if (ev.state === 'in' || soon) schedule(() => renderDetail(view, id));
}

const SEL = { home: '1', draw: 'X', away: '2' };

function teamLabel(ev, k, short = true) {
  if (k === 'draw') return 'תיקו';
  const t = k === 'home' ? ev.home : ev.away;
  return short ? (t.short || t.name) : t.name;
}

function logo(t, size = 54) {
  return t.logo ? `<img src="${esc(t.logo)}" alt="" width="${size}" height="${size}">` : `<span class="logo-ph" style="width:${size}px;height:${size}px">${esc((t.name || '?').slice(0, 1))}</span>`;
}

// ------------------------------------------------------------- markets
function marketDefs(ev, p) {
  const m = p.markets || {};
  const defs = [];
  if (p.kind === 'goals') {
    const lbl1x2 = ev.sport === 'soccer' ? '1X2' : '1X2 (זמן חוקי)';
    defs.push({ key: '1x2', label: lbl1x2, sels: three(m['1x2'] || p.probs) });
    if (m.twoWay) defs.push({ key: 'twoway', label: 'כולל הארכה', sels: [{ sel: 'home', label: teamLabel(ev, 'home'), p: m.twoWay.home }, { sel: 'away', label: teamLabel(ev, 'away'), p: m.twoWay.away }] });
    if (m.doubleChance) defs.push({ key: 'dc', label: 'סיכוי כפול', sels: Object.entries(m.doubleChance).map(([k, v]) => ({ sel: k, label: k, p: v })) });
    if (m.handicaps) defs.push({ key: 'handicap', label: 'הנדיקאפ 1X2 (ווינר)', lines: Object.keys(m.handicaps), defaultLine: ev.sport === 'soccer' ? (p.probs.home > p.probs.away ? '-1' : '+1') : '-1', sels: (line) => three(m.handicaps[line]) });
    if (m.totals) defs.push({ key: 'total', label: 'מעל / מתחת', lines: Object.keys(m.totals), defaultLine: Object.keys(m.totals).includes('2.5') ? '2.5' : Object.keys(m.totals)[0], sels: (line) => [{ sel: 'over', label: `מעל ${line}`, p: m.totals[line].over }, { sel: 'under', label: `מתחת ${line}`, p: m.totals[line].under }] });
    if (m.btts && ev.sport === 'soccer') defs.push({ key: 'btts', label: 'שתיהן יבקיעו', sels: [{ sel: 'yes', label: 'כן', p: m.btts.yes }, { sel: 'no', label: 'לא', p: m.btts.no }] });
    if (m.asian) defs.push({ key: 'spread', label: 'הנדיקאפ אסייתי', lines: Object.keys(m.asian), defaultLine: p.probs.home > p.probs.away ? '-0.5' : '+0.5', sels: (line) => [{ sel: 'home', label: `${teamLabel(ev, 'home')} ${line}`, p: m.asian[line].home }, { sel: 'away', label: `${teamLabel(ev, 'away')} ${flip(line)}`, p: m.asian[line].away }] });
  } else if (p.kind === 'points') {
    defs.push({ key: '1x2', label: 'מנצחת (כולל הארכה)', sels: [{ sel: 'home', label: teamLabel(ev, 'home'), p: m.moneyline?.home ?? p.probs.home }, { sel: 'away', label: teamLabel(ev, 'away'), p: m.moneyline?.away ?? p.probs.away }] });
    if (m.regulation) defs.push({ key: 'regulation', label: '1X2 (זמן חוקי)', sels: three(m.regulation) });
    if (m.handicaps) {
      const keys = Object.keys(m.handicaps);
      const spread = p.spreadLine;
      const def = spread != null ? (keys.find((k) => Number(k) === Math.round(spread)) || keys[Math.floor(keys.length / 2)]) : keys[Math.floor(keys.length / 2)];
      defs.push({ key: 'handicap', label: 'הנדיקאפ (ווינר)', lines: keys, defaultLine: def, sels: (line) => three(m.handicaps[line]) });
    }
    if (m.totals) { const keys = Object.keys(m.totals); defs.push({ key: 'total', label: 'סה"כ נקודות', lines: keys, defaultLine: p.marketTotal?.line != null ? String(p.marketTotal.line) : keys[Math.floor(keys.length / 2)], sels: (line) => [{ sel: 'over', label: `מעל ${line}`, p: m.totals[line].over }, { sel: 'under', label: `מתחת ${line}`, p: m.totals[line].under }] }); }
  } else if (p.kind === 'tennis') {
    defs.push({ key: '1x2', label: 'מנצח המשחק', sels: [{ sel: 'home', label: ev.home.name, p: p.probs.home }, { sel: 'away', label: ev.away.name, p: p.probs.away }] });
    if (p.setsBetting && ev.state === 'pre') defs.push({ key: 'sets', label: 'תוצאה מדויקת במערכות', sels: Object.entries(p.setsBetting).map(([k, v]) => ({ sel: k, label: k, p: v })) });
  }
  return defs;
  function three(x) { return x ? ['home', 'draw', 'away'].map((k) => ({ sel: k, label: SEL[k], p: x[k] })) : []; }
}
const flip = (line) => { const n = -Number(line); return n > 0 ? `+${n}` : String(n); };

function oddsKey(id) { return `se.odds.${id}`; }

function calcHtml(ev, p) {
  const defs = marketDefs(ev, p);
  if (!defs.length) return '';
  const def = defs.find((d) => d.key === state.market) || defs[0];
  state.market = def.key;
  const line = def.lines ? (def.lines.includes(state.line) ? state.line : def.defaultLine) : null;
  state.line = line;
  const sels = typeof def.sels === 'function' ? def.sels(line) : def.sels;
  const saved = store.get(oddsKey(ev.id), {});
  const prefill = bookPrefill(ev, def.key, line);
  const books = ['Winner', 'Bet365'];
  const marginOf = (book) => {
    const vals = sels.map((s) => parseOdds(saved[`${def.key}|${line ?? ''}|${s.sel}|${book}`] ?? prefill[book]?.[s.sel]));
    if (def.key === 'sets' || vals.some((v) => !v)) return null;
    return vals.reduce((a, v) => a + 1 / v, 0) - 1;
  };
  return `<div class="panel" id="calc">
    <h3>🧮 מחשבון ערך – Winner / Bet365 <span class="sub">הקלידו את היחס שאתם רואים באתר ותקבלו EV וסכום מומלץ</span></h3>
    <div class="seg-tabs" style="margin-bottom:10px">${defs.map((d) => `<button class="${d.key === def.key ? 'active' : ''}" data-calc-market="${d.key}">${esc(d.label)}</button>`).join('')}</div>
    ${def.lines ? `<label class="small muted">קו: <select class="input" id="calcLine">${def.lines.map((l) => `<option ${l === line ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${def.key === 'handicap' ? '<span class="small muted"> · הקו מתווסף לקבוצת הבית (למשל ‎-1 = הבית מתחילה בפיגור שער). בקו שלם יש "X" כשההפרש שווה לקו.</span>' : ''}` : ''}
    <div class="table-wrap"><table class="t" style="margin-top:8px">
      <thead><tr><th>בחירה</th><th class="c">הסתברות</th><th class="c">יחס הוגן</th>${books.map((b) => `<th class="c">יחס ${b}</th><th class="c">EV</th><th class="c">סכום</th>`).join('')}<th></th></tr></thead>
      <tbody>${sels.map((s) => `<tr class="calc-row">
        <td><b>${esc(s.label)}</b></td>
        <td class="c num">${pct(s.p, 1)}</td>
        <td class="c num">${fairOdds(s.p)}</td>
        ${books.map((b) => {
          const k = `${def.key}|${line ?? ''}|${s.sel}|${b}`;
          const raw = saved[k] ?? (prefill[b]?.[s.sel] ? String(prefill[b][s.sel]) : '');
          const o = parseOdds(raw);
          const evv = o ? s.p * o - 1 : null;
          const st = o ? stakeFor(s.p, o) : null;
          return `<td class="c"><input class="odds-in" data-odds-key="${esc(k)}" data-book="${b}" data-p="${s.p}" value="${esc(raw)}" inputmode="decimal" placeholder="—" aria-label="יחס ${b} ל${esc(s.label)}"></td>
            <td class="c num ev-cell" data-ev-for="${esc(k)}">${evCell(s.p, o)}</td>
            <td class="c num kelly-cell" data-stake-for="${esc(k)}">${stakeCell(s.p, o)}</td>`;
        }).join('')}
        <td><button class="btn sm ${inSlip(ev.id, def.key, s.sel, line == null ? null : Number(line)) ? 'primary' : ''}" data-calc-add="${s.sel}" data-label="${esc(s.label)}" data-p="${s.p}">+ טופס</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="meta-row" style="margin-top:8px">${def.key === 'sets' ? '' : books.map((b) => `<span data-margin-for="${b}">${marginCell(b, marginOf(b))}</span>`).join('')}
      <span>סכום לפי קלי ${S.settings.kellyFraction}× מתוך קופה של ${money(S.settings.bankroll)} (עד ${pct(S.settings.maxStakePct)} להימור)</span></div>
  </div>`;
}

function evCell(p, o) {
  if (!o) return '';
  const e = p * o - 1;
  return `<span class="${e >= 0 ? 'pos' : 'neg'}">${signedPct(e)}</span>`;
}
function stakeCell(p, o) {
  if (!o) return '';
  const st = stakeFor(p, o);
  return st.amount ? money(st.amount) : '<span class="faint">לא</span>';
}
function marginCell(book, mg) {
  return mg == null ? '' : `עמלת ${book} בשוק הזה: <b class="num ${mg > 0.1 ? 'neg' : ''}">${pct(mg, 1)}</b>`;
}

function bookPrefill(ev, market, line) {
  const out = {};
  for (const b of ev.allBooks || []) {
    const name = /bet365/i.test(b.book) ? 'Bet365' : /winner/i.test(b.book) ? 'Winner' : null;
    if (!name) continue;
    if (market === '1x2' && b.h2h) out[name] = { home: b.h2h.home, draw: b.h2h.draw, away: b.h2h.away };
    if (market === 'total' && b.totals?.[line]) out[name] = b.totals[line];
    if (market === 'btts' && b.btts) out[name] = b.btts;
    if (market === 'dc' && b.doubleChance) out[name] = b.doubleChance;
  }
  return out;
}

// -------------------------------------------------------------- sections
function headHtml(ev, p, d) {
  const live = ev.state === 'in';
  const status = live ? `<span class="status live">${esc(statusHe(ev.status.short || ev.status.display))}</span>` : ev.state === 'post' ? 'הסתיים' : `${dateOf(ev.start, S.settings.tz, { weekday: 'long', day: 'numeric', month: 'numeric' })} · ${timeOf(ev.start, S.settings.tz)}`;
  const keys = p?.threeWay ? ['home', 'draw', 'away'] : ['home', 'away'];
  const cls = { home: 'h', draw: 'd', away: 'a' };
  return `<div class="detail-head">
    <div class="card-top"><span>${esc(ev.leagueName)} · ${esc(ev.country)}${ev.round && ev.sport !== 'tennis' ? ` · ${esc(ev.round)}` : ev.tournament ? ` · ${esc(ev.tournament)} · ${esc(ev.round || '')}` : ''}</span><span>${ev.venue ? `📍 ${esc(ev.venue)}` : ''}${ev.broadcast ? ` · 📺 ${esc(ev.broadcast)}` : ''}</span></div>
    <div class="vs" style="margin-top:12px">
      <div class="side">${logo(ev.home)}<span>${esc(ev.home.name)}</span><span class="small muted">${esc(ev.home.record || (ev.home.rank ? `דירוג ${ev.home.rank}` : ''))}${ev.home.red ? ` 🟥×${ev.home.red}` : ''}</span></div>
      <div class="mid num">${ev.state === 'pre' ? '<span style="font-size:20px">VS</span>' : `${ev.home.score ?? 0} : ${ev.away.score ?? 0}`}<span class="st">${status}</span></div>
      <div class="side">${logo(ev.away)}<span>${esc(ev.away.name)}</span><span class="small muted">${esc(ev.away.record || (ev.away.rank ? `דירוג ${ev.away.rank}` : ''))}${ev.away.red ? ` 🟥×${ev.away.red}` : ''}</span></div>
    </div>
    ${ev.sport === 'tennis' && ev.sets?.length ? `<div class="meta-row num" style="justify-content:center;margin-top:6px">${ev.sets.map((s, i) => `<span>מערכה ${i + 1}: <b>${s.a ?? ''}-${s.b ?? ''}</b></span>`).join('')}</div>` : ''}
    ${p?.probs ? `<div class="big-probs c${keys.length}">${keys.map((k) => `<button class="bp ${cls[k]}" data-calc-add-main="${k}"><div class="l">${k === 'draw' ? 'X · תיקו' : `${SEL[k]} · ${esc(teamLabel(ev, k))}`}</div><div class="p num">${pct(p.probs[k])}</div><div class="l num">יחס הוגן ${fairOdds(p.probs[k])}${p.best?.[k] ? ` · הכי טוב ${odds(p.best[k].odds)} (${esc(p.best[k].book)})` : ''}</div></button>`).join('')}</div>
      <div style="margin-top:10px">${probBar(p.probs, { threeWay: p.threeWay })}</div>` : `<div class="notice">${esc(p?.reason || 'אין חיזוי זמין')}</div>`}
    ${ev.goals?.length ? `<div class="meta-row" style="margin-top:10px">${ev.goals.map((g) => `<span>⚽ ${esc(g.minute || '')} ${esc(g.player || '')}${g.penalty ? ' (פנדל)' : ''}${g.ownGoal ? ' (עצמי)' : ''} – ${esc(g.team === 'home' ? ev.home.short : ev.away.short)}</span>`).join('')}</div>` : ''}
  </div>`;
}

function liveHtml(ev, p, d) {
  if (ev.state !== 'in' && !(d.liveHistory?.length > 1) && !d.extras?.winprob) return '';
  const rows = [];
  if (p?.live?.nextGoal) rows.push(`<span>השער הבא: <b>${esc(ev.home.short)} ${pct(p.live.nextGoal.home)}</b> · אין שער ${pct(p.live.nextGoal.none)} · <b>${esc(ev.away.short)} ${pct(p.live.nextGoal.away)}</b></span>`);
  if (p?.live?.remaining && p.kind === 'goals') rows.push(`<span>שערים צפויים עד הסוף: <b class="num">${num(p.live.remaining.home)} – ${num(p.live.remaining.away)}</b></span>`);
  if (p?.live?.projectedTotal) rows.push(`<span>צפי סיום: <b class="num">${Math.round(p.expected.home)}–${Math.round(p.expected.away)}</b> (סה"כ ${Math.round(p.live.projectedTotal)})</span>`);
  if (d.extras?.winprob) rows.push(`<span>ESPN – סיכוי בית: <b class="num">${pct(d.extras.winprob.last)}</b> ${sparkline(d.extras.winprob.series, { w: 90, h: 22 })}</span>`);
  return `<div class="panel"><h3>📈 מהלך המשחק <span class="sub">הסתברויות SportEdge לאורך הזמן</span></h3>
    <div class="legend"><span><i style="background:var(--home)"></i>${esc(ev.home.short)}</span>${p?.threeWay ? '<span><i style="background:var(--draw)"></i>תיקו</span>' : ''}<span><i style="background:var(--away)"></i>${esc(ev.away.short)}</span></div>
    ${probChart(d.liveHistory, { threeWay: p?.threeWay })}
    ${rows.length ? `<div class="meta-row" style="margin-top:8px">${rows.join('')}</div>` : ''}</div>`;
}

function compareHtml(ev, p, d) {
  if (!p?.probs) return '';
  const keys = p.threeWay ? ['home', 'draw', 'away'] : ['home', 'away'];
  const marketKeys = p.market && p.market.draw == null && p.threeWay ? null : keys;
  const row = (label, x, note = '', ks = keys) => x ? `<tr><td><b>${label}</b> <span class="small muted">${note}</span></td>${keys.map((k) => `<td class="c num">${ks.includes(k) && x[k] != null ? pct(x[k], 1) : '–'}</td>`).join('')}</tr>` : '';
  const two = p.kind === 'goals' && ev.sport !== 'soccer';
  return `<div class="panel"><h3>⚖️ השוואת הסתברויות <span class="sub">מודל סטטיסטי מול שוק ההימורים</span></h3>
    <div class="table-wrap"><table class="t">
      <thead><tr><th></th>${keys.map((k) => `<th class="c">${k === 'draw' ? 'X' : `${SEL[k]} · ${esc(teamLabel(ev, k))}`}</th>`).join('')}</tr></thead>
      <tbody>
        ${row('מודל סטטיסטי', p.model, p.kind === 'goals' ? '(Dixon-Coles)' : p.kind === 'points' ? '(דירוג התקפה/הגנה)' : '(דירוג עולמי)')}
        ${p.market ? (two ? `<tr><td><b>שוק</b> <span class="small muted">(${esc(p.market.source)}, כולל הארכה)</span></td><td class="c num">${pct(p.market.home, 1)}</td><td class="c">–</td><td class="c num">${pct(p.market.away, 1)}</td></tr>` : row('שוק ללא עמלה', p.market, `(${esc(p.market.source)}${p.market.overround != null ? ` · עמלה ${pct(p.market.overround, 1)}` : ''})`, marketKeys || keys)) : ''}
        ${row('הוגן (משולב)', p.fair, `(משקל מודל ${pct(p.weight)})`)}
        ${ev.state === 'in' ? row('לייב – עכשיו', p.probs, '') : ''}
        ${d.extras?.predictor ? row('ESPN Predictor', { home: d.extras.predictor.home, draw: d.extras.predictor.draw, away: d.extras.predictor.away }) : ''}
        <tr><td><b>יחס הוגן</b></td>${keys.map((k) => `<td class="c num"><b>${fairOdds(p.probs[k])}</b></td>`).join('')}</tr>
      </tbody></table></div>
    ${p.model && p.market && Math.abs(p.model.home - p.market.home) > 0.15 ? '<div class="notice warn"><b>סטייה חריגה בין המודל לשוק.</b> לרוב זה סימן שיש מידע שהמודל לא רואה (פציעות, רוטציה, הרכב). בדקו חדשות לפני שמהמרים על סמך הסטייה.</div>' : ''}
    ${two && p.twoWay ? `<div class="meta-row"><span>כולל הארכה/פנדלים: <b class="num">${esc(ev.home.short)} ${pct(p.twoWay.home, 1)}</b> · <b class="num">${esc(ev.away.short)} ${pct(p.twoWay.away, 1)}</b></span></div>` : ''}
  </div>`;
}

function scoresHtml(ev, p) {
  if (p?.kind !== 'goals' || !p.markets?.matrix) return '';
  const m = p.markets.matrix;
  const n = Math.min(6, m.length);
  const max = Math.max(...m.slice(0, n).flatMap((r) => r.slice(0, n)));
  let cells = `<div class="hd"></div>${Array.from({ length: n }, (_, j) => `<div class="hd">${j}</div>`).join('')}`;
  for (let i = 0; i < n; i++) {
    cells += `<div class="hd">${i}</div>`;
    for (let j = 0; j < n; j++) {
      const v = m[i]?.[j] || 0;
      const a = Math.min(1, v / max);
      cells += `<div style="background:color-mix(in srgb, var(--accent) ${Math.round(a * 85)}%, var(--surface-2));color:${a > 0.55 ? 'white' : 'var(--text)'}" title="${i}-${j}: ${pct(v, 1)}">${v >= 0.005 ? pct(v, 0) : ''}</div>`;
    }
  }
  return `<div class="panel"><h3>🎯 תוצאה מדויקת <span class="sub">שורות = ${esc(ev.home.short)}, עמודות = ${esc(ev.away.short)}</span></h3>
    <div class="heat" style="grid-template-columns:repeat(${n + 1},1fr)">${cells}</div>
    <div class="meta-row" style="margin-top:10px">${p.markets.topScores.slice(0, 6).map((s) => `<span><b class="num">${s.score}</b> ${pct(s.p, 1)} <span class="faint">(${fairOdds(s.p)})</span></span>`).join('')}</div>
  </div>`;
}

function marketsTablesHtml(ev, p) {
  const m = p?.markets;
  if (!m) return '';
  const parts = [];
  if (m.totals) {
    parts.push(`<div class="panel"><h3>${p.kind === 'points' ? '🏀 סה"כ נקודות' : '⚽ מעל / מתחת'}</h3><table class="t"><thead><tr><th>קו</th><th class="c">מעל</th><th class="c">יחס</th><th class="c">מתחת</th><th class="c">יחס</th></tr></thead><tbody>
      ${Object.entries(m.totals).map(([l, v]) => `<tr ${p.marketTotal?.line != null && Number(l) === p.marketTotal.line ? 'class="hl"' : ''}><td class="num">${l}</td><td class="c num">${pct(v.over, 1)}</td><td class="c num">${fairOdds(v.over)}</td><td class="c num">${pct(v.under, 1)}</td><td class="c num">${fairOdds(v.under)}</td></tr>`).join('')}
    </tbody></table></div>`);
  }
  if (m.handicaps) {
    parts.push(`<div class="panel"><h3>📐 הנדיקאפ בסגנון ווינר <span class="sub">קו מתווסף ל${esc(ev.home.short)}</span></h3><table class="t"><thead><tr><th>קו</th><th class="c">1</th><th class="c">X</th><th class="c">2</th><th class="c">יחסים הוגנים</th></tr></thead><tbody>
      ${Object.entries(m.handicaps).map(([l, v]) => `<tr><td class="num">${l}</td><td class="c num">${pct(v.home, 1)}</td><td class="c num">${v.draw > 0.0005 ? pct(v.draw, 1) : '–'}</td><td class="c num">${pct(v.away, 1)}</td><td class="c num small">${fairOdds(v.home)} / ${v.draw > 0.0005 ? fairOdds(v.draw) : '–'} / ${fairOdds(v.away)}</td></tr>`).join('')}
    </tbody></table></div>`);
  }
  if (m.btts || m.doubleChance) {
    parts.push(`<div class="panel"><h3>➕ שווקים נוספים</h3><table class="t"><tbody>
      ${m.btts ? `<tr><td>שתיהן יבקיעו – כן</td><td class="c num">${pct(m.btts.yes, 1)}</td><td class="c num">${fairOdds(m.btts.yes)}</td></tr><tr><td>שתיהן יבקיעו – לא</td><td class="c num">${pct(m.btts.no, 1)}</td><td class="c num">${fairOdds(m.btts.no)}</td></tr>` : ''}
      ${m.doubleChance ? Object.entries(m.doubleChance).map(([k, v]) => `<tr><td>סיכוי כפול ${k}</td><td class="c num">${pct(v, 1)}</td><td class="c num">${fairOdds(v)}</td></tr>`).join('') : ''}
      ${m.drawNoBet ? `<tr><td>ללא תיקו – ${esc(ev.home.short)}</td><td class="c num">${pct(m.drawNoBet.home, 1)}</td><td class="c num">${fairOdds(m.drawNoBet.home)}</td></tr><tr><td>ללא תיקו – ${esc(ev.away.short)}</td><td class="c num">${pct(m.drawNoBet.away, 1)}</td><td class="c num">${fairOdds(m.drawNoBet.away)}</td></tr>` : ''}
      ${m.expected ? `<tr><td>${p.kind === 'goals' ? 'שערים צפויים' : 'נקודות צפויות'}</td><td class="c num" colspan="2">${num(m.expected.home, p.kind === 'goals' ? 2 : 1)} – ${num(m.expected.away, p.kind === 'goals' ? 2 : 1)}</td></tr>` : ''}
    </tbody></table></div>`);
  }
  if (p.kind === 'tennis' && p.setsBetting) {
    parts.push(`<div class="panel"><h3>🎾 תוצאה במערכות</h3><table class="t"><tbody>${Object.entries(p.setsBetting).map(([k, v]) => `<tr><td class="num">${k}</td><td class="c num">${pct(v, 1)}</td><td class="c num">${fairOdds(v)}</td></tr>`).join('')}</tbody></table>
      <div class="small muted">סיכוי שמירת הגשה משוער: ${esc(ev.home.short)} ${pct(p.holds.home)} · ${esc(ev.away.short)} ${pct(p.holds.away)}</div></div>`);
  }
  return parts.length ? `<div class="cols">${parts.join('')}</div>` : '';
}

function booksHtml(ev, p, d) {
  const books = ev.allBooks || [];
  const extra = d.extras?.books || [];
  if (!books.length && !extra.length) return `<div class="panel"><h3>🏦 יחסי סוכנויות</h3><div class="muted small">אין יחסים זמינים למשחק הזה מהמקורות המחוברים. אפשר להקליד יחסי Winner / Bet365 במחשבון למעלה.${S.meta?.providers?.oddsApi?.enabled ? '' : ' לחיבור עשרות סוכנויות הוסיפו מפתח The Odds API בהגדרות.'}</div></div>`;
  const three = p?.threeWay && ev.sport === 'soccer';
  const best = {};
  for (const b of books) for (const k of ['home', 'draw', 'away']) if (b.h2h?.[k] > (best[k] || 0)) best[k] = b.h2h[k];
  const ev1 = (k, o) => (o && p?.probs?.[k] && ev.state === 'pre' ? p.probs[k] * o - 1 : null);
  const cell = (k, o) => {
    const e = ev1(k, o);
    return `<td class="c num ${o && o === best[k] ? 'cell-best' : ''}">${odds(o)}${e != null ? `<div class="small ${e >= 0 ? 'pos' : 'faint'}">${signedPct(e)}</div>` : ''}</td>`;
  };
  return `<div class="panel"><h3>🏦 יחסי סוכנויות <span class="sub">הירוק = היחס הגבוה ביותר · מתחת: EV מול ההסתברות שלנו</span></h3>
    <div class="table-wrap"><table class="t"><thead><tr><th>סוכנות</th><th class="c">1</th>${three ? '<th class="c">X</th>' : ''}<th class="c">2</th><th class="c">עמלה</th><th class="c">סה"כ</th><th class="c">הנדיקאפ</th><th>תנועת שוק</th></tr></thead><tbody>
    ${books.map((b) => {
      const arr = b.h2h ? (three ? [b.h2h.home, b.h2h.draw, b.h2h.away] : [b.h2h.home, b.h2h.away]) : [];
      const margin = arr.length && arr.every((x) => x > 1) ? arr.reduce((a, x) => a + 1 / x, 0) - 1 : null;
      const mv = b.h2hOpen?.home && b.h2h?.home ? `${esc(ev.home.short)} ${odds(b.h2hOpen.home)} → ${odds(b.h2h.home)}` : b.spread?.open != null && b.spread.open !== b.spread.line ? `קו ${b.spread.open} → ${b.spread.line}` : '';
      return `<tr><td><b>${esc(b.book)}</b> <span class="small faint">${esc(b.source || '')}</span></td>
        ${cell('home', b.h2h?.home)}${three ? cell('draw', b.h2h?.draw) : ''}${cell('away', b.h2h?.away)}
        <td class="c num">${margin != null ? pct(margin, 1) : '–'}</td>
        <td class="c num">${b.total?.line != null ? `${b.total.line} <span class="small faint">(${odds(b.total.over)}/${odds(b.total.under)})</span>` : '–'}</td>
        <td class="c num">${b.spread?.line != null ? `${b.spread.line > 0 ? '+' : ''}${b.spread.line}` : '–'}</td>
        <td class="small muted num">${mv}</td></tr>`;
    }).join('')}
    ${extra.filter((x) => !books.some((b) => b.book === x.book)).map((x) => `<tr><td><b>${esc(x.book)}</b> <span class="small faint">ESPN</span></td><td class="c num">${odds(x.home)}</td>${three ? `<td class="c num">${odds(x.draw)}</td>` : ''}<td class="c num">${odds(x.away)}</td><td></td><td class="c num">${x.overUnder ?? '–'}</td><td class="c num">${x.spread ?? '–'}</td><td></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function teamsHtml(ev, d) {
  if (!d.teams) return '';
  const goals = d.pool && d.prediction?.kind === 'goals';
  const tcard = (t, side) => {
    if (!t) return '';
    const r = t.ratings;
    return `<div class="panel"><h3>${logo(ev[side], 22)} ${esc(ev[side].name)} <span class="sub">${t.rank ? `מקום ${t.rank.position} מתוך ${t.rank.of} במאגר` : ''}</span></h3>
      ${r ? `<div class="meta-row">${goals ? `<span>כוח התקפה <b class="num">${num(r.attack)}×</b></span><span>חוזק הגנה <b class="num">${num(r.defense)}×</b></span>` : `<span>התקפה <b class="num">${num(r.offense, 1)}</b></span><span>הגנה (נק' ספוגות) <b class="num">${num(r.defense, 1)}</b></span><span>נטו <b class="num">${r.net > 0 ? '+' : ''}${num(r.net, 1)}</b></span>`}<span>משחקים במדגם <b class="num">${t.games}</b></span></div>` : '<div class="muted small">אין מספיק משחקים במאגר</div>'}
      <div style="margin:10px 0 6px" class="form">${t.form.slice(0, 6).map((g) => `<i class="${g.result}" title="${esc(g.opponent)} ${g.gf}-${g.ga}">${{ W: 'נ', D: 'ת', L: 'ה' }[g.result]}</i>`).join('')}</div>
      <table class="t"><tbody>${t.form.slice(0, 6).map((g) => `<tr><td class="small muted">${dateOf(g.date, S.settings.tz)}</td><td>${g.home ? 'בית' : 'חוץ'} מול ${esc(g.opponent)}</td><td class="c num"><b class="${g.result === 'W' ? 'pos' : g.result === 'L' ? 'neg' : ''}">${g.gf}-${g.ga}</b></td></tr>`).join('')}</tbody></table>
    </div>`;
  };
  const h2h = d.teams.h2h || [];
  return `<div class="cols">${tcard(d.teams.home, 'home')}${tcard(d.teams.away, 'away')}
    ${h2h.length ? `<div class="panel"><h3>🤝 מפגשים אחרונים</h3><table class="t"><tbody>${h2h.map((g) => `<tr><td class="small muted">${dateOf(g.date, S.settings.tz, { day: 'numeric', month: 'numeric', year: '2-digit' })}</td><td>${esc(g.home)}</td><td class="c num"><b>${g.hs}-${g.as}</b></td><td>${esc(g.away)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </div>`;
}

function extrasHtml(ev, d) {
  const x = d.extras;
  const parts = [];
  if (x?.injuries?.length) {
    parts.push(`<div class="panel"><h3>🩹 פציעות והיעדרויות</h3>${x.injuries.map((t) => `<div style="margin-bottom:8px"><b>${esc(t.team)}</b><div class="meta-row">${t.items.map((i) => `<span>${esc(i.name)} <span class="faint">(${esc(i.status || '')}${i.detail ? ` · ${esc(i.detail)}` : ''})</span></span>`).join('')}</div></div>`).join('')}</div>`);
  }
  if (x?.teamStats?.length && ev.state !== 'pre') {
    const [a, b] = x.teamStats;
    if (a && b) parts.push(`<div class="panel"><h3>📊 סטטיסטיקה במשחק</h3><table class="t"><thead><tr><th>${esc(a.team)}</th><th class="c"></th><th style="text-align:end">${esc(b.team)}</th></tr></thead><tbody>${a.stats.map((s, i) => `<tr><td class="num">${esc(s.value)}</td><td class="c small muted">${esc(s.label)}</td><td class="num" style="text-align:end">${esc(b.stats[i]?.value ?? '')}</td></tr>`).join('')}</tbody></table></div>`);
  }
  if (x?.seasonSeries?.length) parts.push(`<div class="panel"><h3>🔁 סדרת העונה</h3><div class="muted">${x.seasonSeries.map(esc).join('<br>')}</div></div>`);
  if (d.table?.length) {
    const g = d.table.find((t) => t.entries.some((e) => e.team === ev.home.name || e.team === ev.away.name)) || d.table[0];
    const soccer = ev.sport === 'soccer';
    parts.push(`<div class="panel"><h3>🏁 טבלה – ${esc(g.name || ev.leagueName)}</h3><div class="table-wrap" style="max-height:420px;overflow-y:auto"><table class="t"><thead><tr><th>#</th><th>קבוצה</th><th class="c">מש'</th>${soccer ? '<th class="c">נ-ת-ה</th><th class="c">שערים</th><th class="c">נק\'</th>' : '<th class="c">מאזן</th><th class="c">הפרש</th>'}</tr></thead><tbody>
      ${g.entries.map((e) => `<tr ${e.team === ev.home.name || e.team === ev.away.name ? 'class="hl"' : ''}><td class="num">${e.rank ?? ''}</td><td>${esc(e.team)}</td><td class="c num">${e.played ?? ''}</td>${soccer ? `<td class="c num">${e.wins ?? 0}-${e.draws ?? 0}-${e.losses ?? 0}</td><td class="c num">${e.gf ?? ''}:${e.ga ?? ''}</td><td class="c num"><b>${e.points ?? ''}</b></td>` : `<td class="c num">${esc(e.record || `${e.wins}-${e.losses}`)}</td><td class="c num">${e.gd ?? ''}</td>`}</tr>`).join('')}
    </tbody></table></div></div>`);
  }
  return parts.length ? `<div class="cols">${parts.join('')}</div>` : '';
}

function modelHtml(ev, p, d) {
  if (!p || p.unavailable) return '';
  const rows = [];
  if (p.kind === 'goals' && p.lambda) {
    rows.push(['שערים צפויים – מודל', p.lambda.modelHome != null ? `${num(p.lambda.modelHome)} – ${num(p.lambda.modelAway)}` : '–']);
    rows.push(['שערים צפויים – נגזר מהשוק', p.lambda.marketHome != null ? `${num(p.lambda.marketHome)} – ${num(p.lambda.marketAway)}` : '–']);
    rows.push(['שערים צפויים – משולב', `${num(p.lambda.home)} – ${num(p.lambda.away)}`]);
  }
  if (p.kind === 'points' && p.margin) {
    rows.push(['הפרש צפוי (מודל / שוק / משולב)', `${num(p.margin.model, 1)} / ${num(p.margin.market, 1)} / ${num(p.margin.mu, 1)}`]);
    rows.push(['סה"כ צפוי (מודל / שוק / משולב)', `${num(p.total.model, 1)} / ${num(p.total.market, 1)} / ${num(p.total.tau, 1)}`]);
    rows.push(['סטיית תקן הפרש / סה"כ', `${num(p.margin.sigma, 1)} / ${num(p.total.sigmaT, 1)}`]);
  }
  rows.push(['משקל המודל בשילוב', pct(p.weight)]);
  rows.push(['משחקים במדגם (בית / חוץ)', `${p.sample?.home ?? 0} / ${p.sample?.away ?? 0}`]);
  if (d.pool) {
    rows.push(['מאגר דירוג', `${d.pool.key} · ${d.pool.matches} משחקים · ${d.pool.teams} קבוצות`]);
    if (d.pool.params.homeAdvantage != null) rows.push(['יתרון ביתיות', d.prediction.kind === 'goals' ? `${num(d.pool.params.homeAdvantage)}× שערים` : `${num(d.pool.params.homeAdvantage, 1)} נק'`]);
    if (d.pool.params.rho != null) rows.push(['תיקון Dixon-Coles (ρ)', num(d.pool.params.rho)]);
  }
  return `<div class="panel"><h3>🔬 איך זה חושב</h3>
    <table class="t"><tbody>${rows.map(([k, v]) => `<tr><td class="muted">${k}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>
    <div class="small muted" style="margin-top:8px">${p.kind === 'goals' ? 'כוח התקפה/הגנה של כל קבוצה מחושב מכל המשחקים בשנה האחרונה (משקל גבוה יותר למשחקים אחרונים, כולל משחקי אירופה שמקשרים בין ליגות). בלייב: השערים הצפויים לזמן שנותר מחושבים לפי הדקה, התוצאה וכרטיסים אדומים, ומהם מטריצת תוצאות סופית.' : p.kind === 'points' ? 'דירוג התקפה/הגנה מחושב ברגרסיה על תוצאות העונה. התוצאה מתפלגת נורמלית סביב ההפרש הצפוי; בתיקו – הארכה. בלייב: ההפרש והשונות מצטמצמים לפי הזמן שנותר, והקצב בפועל משפיע על צפי הנקודות.' : 'הדירוג העולמי מומר לסיכוי שמירת הגשה, ומשם שרשרת מרקוב משחק→מערכה→משחק מלא, כולל מצב לייב.'}</div>
  </div>`;
}

function draw(view, d) {
  const ev = d.event, p = d.prediction;
  view.innerHTML = `
    <div class="section-title"><a class="btn ghost sm" href="javascript:history.back()">→ חזרה</a><span class="sub">עודכן ${new Date().toLocaleTimeString('he-IL')}</span></div>
    ${headHtml(ev, p, d)}
    <div style="display:grid;gap:12px;margin-top:12px">
      ${liveHtml(ev, p, d)}
      ${compareHtml(ev, p, d)}
      ${p?.probs ? calcHtml(ev, p) : ''}
      ${booksHtml(ev, p, d)}
      ${scoresHtml(ev, p)}
      ${marketsTablesHtml(ev, p)}
      ${teamsHtml(ev, d)}
      ${extrasHtml(ev, d)}
      ${modelHtml(ev, p, d)}
    </div>`;
  bind(view, d, true);
}

function bind(view, d, full = false) {
  const ev = d.event;
  view.querySelectorAll('[data-calc-market]').forEach((b) => b.addEventListener('click', () => { state.market = b.dataset.calcMarket; state.line = null; redrawCalc(view, d); }));
  view.querySelector('#calcLine')?.addEventListener('change', (e) => { state.line = e.target.value; redrawCalc(view, d); });
  // Typing updates EV / stake / margin cells in place – no re-render, so focus and Tab order survive.
  view.querySelectorAll('[data-odds-key]').forEach((inp) => inp.addEventListener('input', () => {
    const key = inp.dataset.oddsKey;
    const saved = store.get(oddsKey(ev.id), {});
    if (inp.value.trim()) saved[key] = inp.value.trim(); else delete saved[key];
    store.set(oddsKey(ev.id), saved);
    const calc = inp.closest('#calc') || document.getElementById('calc');
    const p = Number(inp.dataset.p), o = parseOdds(inp.value);
    const evEl = calc.querySelector(`[data-ev-for="${CSS.escape(key)}"]`);
    const stEl = calc.querySelector(`[data-stake-for="${CSS.escape(key)}"]`);
    if (evEl) evEl.innerHTML = evCell(p, o);
    if (stEl) stEl.innerHTML = stakeCell(p, o);
    const book = inp.dataset.book;
    const all = [...calc.querySelectorAll(`input[data-book="${book}"]`)].map((x) => parseOdds(x.value));
    const mEl = calc.querySelector(`[data-margin-for="${book}"]`);
    if (mEl) mEl.innerHTML = marginCell(book, all.length && all.every(Boolean) ? all.reduce((a, v) => a + 1 / v, 0) - 1 : null);
  }));
  view.querySelectorAll('[data-calc-add]').forEach((b) => b.addEventListener('click', () => {
    const sel = b.dataset.calcAdd;
    const line = state.line == null ? null : Number(state.line);
    const saved = store.get(oddsKey(ev.id), {});
    const o = parseOdds(saved[`${state.market}|${state.line ?? ''}|${sel}|${S.settings.defaultBook}`]) || parseOdds(saved[`${state.market}|${state.line ?? ''}|${sel}|Winner`]) || parseOdds(saved[`${state.market}|${state.line ?? ''}|${sel}|Bet365`]);
    const market = state.market === 'handicap' || state.market === 'regulation' || state.market === 'twoway' ? '1x2' : state.market;
    const marketLabel = { handicap: `הנדיקאפ ${state.line}`, regulation: 'זמן חוקי', twoway: 'כולל הארכה', total: '', btts: '', dc: 'סיכוי כפול', spread: 'אסייתי', sets: 'מערכות' }[state.market] || '';
    addLeg({ eventId: ev.id, market: state.market === 'handicap' ? '1x2' : market, sel, line: state.market === 'handicap' ? line : market === '1x2' ? null : line, p: Number(b.dataset.p), odds: o, book: S.settings.defaultBook, match: `${ev.home.name} – ${ev.away.name}`, start: ev.start, label: `${b.dataset.label}${marketLabel ? ` (${marketLabel})` : ''}` });
    redrawCalc(view, d);
  }));
  if (full) view.querySelectorAll('[data-calc-add-main]').forEach((b) => b.addEventListener('click', () => {
    const sel = b.dataset.calcAddMain;
    const p = d.prediction.probs[sel];
    const best = d.prediction.best?.[sel];
    addLeg({ eventId: ev.id, market: '1x2', sel, line: null, p, odds: best?.odds, book: best?.book, match: `${ev.home.name} – ${ev.away.name}`, start: ev.start, label: sel === 'draw' ? 'X' : (sel === 'home' ? ev.home.short || ev.home.name : ev.away.short || ev.away.name) });
  }));
}

let redrawing = false;
function redrawCalc(_view, d) {
  const el = document.getElementById('calc');
  if (!el || redrawing) return;
  redrawing = true;
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = calcHtml(d.event, d.prediction);
    const next = tmp.firstElementChild;
    el.replaceWith(next);
    bind(next, d);
  } finally {
    redrawing = false;
  }
}
