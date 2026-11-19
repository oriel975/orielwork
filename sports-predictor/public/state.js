// Global client state, settings and the bet slip.
import { store, localYmd } from './lib.js';

const DEFAULTS = {
  bankroll: 1000,
  kellyFraction: 0.25,
  minEdge: 0.03,
  modelWeight: 0.3,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem',
  refreshSec: 20,
  featuredOnly: false,
  defaultBook: 'Winner',
  maxStakePct: 0.05,
};

export const S = {
  settings: { ...DEFAULTS, ...store.get('se.settings', {}) },
  slip: store.get('se.slip', []),
  meta: null,
  date: null,
  sport: 'all',
  league: '',
  search: '',
  cache: new Map(), // last loaded event lists by key
  timer: null,
};
S.date = localYmd(new Date(), S.settings.tz);

export function saveSettings(patch) {
  Object.assign(S.settings, patch);
  store.set('se.settings', S.settings);
}

export function stakeFor(p, o) {
  const f = p > 0 && o > 1 ? Math.max(0, ((o - 1) * p - (1 - p)) / (o - 1)) : 0;
  const pct = Math.min(S.settings.maxStakePct, f * S.settings.kellyFraction);
  return { fraction: pct, amount: Math.round(pct * S.settings.bankroll) };
}

export function wParam() {
  return `w=${encodeURIComponent(S.settings.modelWeight)}&tz=${encodeURIComponent(S.settings.tz)}`;
}

// ---------------------------------------------------------------- slip
export function slipKey(l) { return `${l.eventId}|${l.market}|${l.sel}|${l.line ?? ''}`; }
export function inSlip(eventId, market, sel, line) {
  return S.slip.some((l) => slipKey(l) === slipKey({ eventId, market, sel, line }));
}
export function toggleSlip(leg) {
  const k = slipKey(leg);
  const i = S.slip.findIndex((l) => slipKey(l) === k);
  if (i >= 0) S.slip.splice(i, 1);
  else {
    // one selection per market per event
    S.slip = S.slip.filter((l) => !(l.eventId === leg.eventId && l.market === leg.market && (l.line ?? '') === (leg.line ?? '')));
    S.slip.push(leg);
  }
  store.set('se.slip', S.slip);
  return i < 0;
}
export function updateLeg(i, patch) {
  Object.assign(S.slip[i], patch);
  store.set('se.slip', S.slip);
}
export function clearSlip() {
  S.slip = [];
  store.set('se.slip', S.slip);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
