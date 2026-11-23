// Personal bet tracker with automatic settlement when results arrive.
import crypto from 'node:crypto';

export function createTracker(store, engine) {
  const list = () => store.get().bets;

  function summary(bets) {
    const settled = bets.filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'void' || b.status === 'half-won' || b.status === 'half-lost');
    let staked = 0, ret = 0, wins = 0, expected = 0;
    for (const b of settled) {
      if (b.status === 'void') continue;
      staked += b.stake;
      ret += payout(b);
      if (b.status === 'won' || b.status === 'half-won') wins++;
    }
    for (const b of bets) if (b.prob && b.status !== 'void') expected += b.stake * (b.prob * b.odds - 1);
    const pending = bets.filter((b) => b.status === 'pending');
    const byBook = {};
    for (const b of settled) {
      if (b.status === 'void') continue;
      const k = b.book || 'אחר';
      byBook[k] = byBook[k] || { staked: 0, profit: 0, n: 0 };
      byBook[k].staked += b.stake; byBook[k].profit += payout(b) - b.stake; byBook[k].n++;
    }
    const curve = [];
    let run = 0;
    for (const b of [...settled].sort((a, c) => Date.parse(a.settledAt || a.placedAt) - Date.parse(c.settledAt || c.placedAt))) {
      if (b.status === 'void') continue;
      run += payout(b) - b.stake;
      curve.push({ t: b.settledAt || b.placedAt, profit: run });
    }
    return {
      count: bets.length, settled: settled.length, pending: pending.length,
      staked, profit: ret - staked, roi: staked ? (ret - staked) / staked : null,
      hitRate: settled.length ? wins / settled.filter((b) => b.status !== 'void').length : null,
      pendingStake: pending.reduce((s, b) => s + b.stake, 0),
      expectedProfit: expected, byBook, curve,
    };
  }

  function payout(b) {
    if (b.status === 'won') return b.stake * b.odds;
    if (b.status === 'void') return b.stake;
    if (b.status === 'half-won') return b.stake / 2 * b.odds + b.stake / 2;
    if (b.status === 'half-lost') return b.stake / 2;
    return 0;
  }

  function add(input) {
    const odds = Number(input.odds), stake = Number(input.stake);
    if (!(odds > 1) || !(stake > 0)) throw Object.assign(new Error('יחס והשקעה חייבים להיות חיוביים'), { status: 400 });
    const legs = Array.isArray(input.legs) && input.legs.length ? input.legs.map(cleanLeg) : [cleanLeg(input)];
    const bet = {
      id: crypto.randomUUID(), placedAt: new Date().toISOString(), status: 'pending',
      book: String(input.book || 'Winner').slice(0, 40), odds, stake,
      prob: Number(input.prob) > 0 ? Number(input.prob) : legs.every((l) => l.prob) ? legs.reduce((p, l) => p * l.prob, 1) : null,
      note: String(input.note || '').slice(0, 200), legs,
    };
    list().unshift(bet);
    store.save();
    return bet;
  }

  function cleanLeg(l) {
    return {
      eventId: l.eventId ? String(l.eventId) : null, match: String(l.match || '').slice(0, 120), start: l.start || null,
      market: String(l.market || '1x2'), sel: String(l.sel || ''), line: l.line == null || l.line === '' ? null : Number(l.line),
      odds: Number(l.odds) || null, prob: Number(l.prob) || null, result: null,
    };
  }

  function update(id, patch) {
    const b = list().find((x) => x.id === id);
    if (!b) return null;
    if (patch.status) { b.status = patch.status; b.settledAt = new Date().toISOString(); b.auto = false; }
    for (const k of ['stake', 'odds']) if (Number(patch[k]) > 0) b[k] = Number(patch[k]);
    if (patch.note != null) b.note = String(patch.note).slice(0, 200);
    store.save();
    return b;
  }

  function remove(id) {
    const arr = list();
    const i = arr.findIndex((x) => x.id === id);
    if (i < 0) return false;
    arr.splice(i, 1);
    store.save();
    return true;
  }

  // Settles a leg from a final score. Returns 'won' | 'lost' | 'void' | 'half-won' | 'half-lost' | null.
  function legResult(leg, hs, as, sport) {
    const diff = hs - as, total = hs + as;
    const twoWay = sport && sport !== 'soccer';
    if (leg.market === '1x2') {
      const h = leg.line || 0;
      const d = diff + h;
      const outcome = d > 0 ? 'home' : d < 0 ? 'away' : 'draw';
      if (twoWay && !h && outcome === 'draw') return null; // needs OT info
      return outcome === leg.sel ? 'won' : 'lost';
    }
    if (leg.market === 'dc') {
      const o = diff > 0 ? '1' : diff < 0 ? '2' : 'X';
      return leg.sel.includes(o) ? 'won' : 'lost';
    }
    if (leg.market === 'total' && leg.line != null) {
      if (total === leg.line) return 'void';
      return (leg.sel === 'over') === (total > leg.line) ? 'won' : 'lost';
    }
    if (leg.market === 'spread' && leg.line != null) {
      // line is always quoted for the home side
      const d = leg.sel === 'home' ? diff + leg.line : -(diff + leg.line);
      if (d === 0) return 'void';
      if (Math.abs(d) === 0.25) return d > 0 ? 'half-won' : 'half-lost';
      return d > 0 ? 'won' : 'lost';
    }
    if (leg.market === 'btts') return (leg.sel === 'yes') === (hs > 0 && as > 0) ? 'won' : 'lost';
    return null;
  }

  async function autoSettle() {
    const pending = list().filter((b) => b.status === 'pending' && b.legs.some((l) => l.eventId && !l.result));
    let changed = false;
    for (const b of pending) {
      for (const leg of b.legs) {
        if (!leg.eventId || leg.result) continue;
        if (leg.start && Date.now() - Date.parse(leg.start) < 90 * 60000) continue;
        try {
          const ev = await engine.findEvent(leg.eventId);
          if (ev?.state === 'post' && ev.home.score != null) {
            const r = legResult(leg, ev.home.score, ev.away.score, ev.sport);
            if (r) { leg.result = r; leg.final = `${ev.home.score}-${ev.away.score}`; changed = true; }
          }
        } catch { /* try again later */ }
      }
      const results = b.legs.map((l) => l.result);
      if (results.some((r) => r === 'lost')) { b.status = 'lost'; b.auto = true; b.settledAt = new Date().toISOString(); }
      else if (results.every((r) => r)) {
        if (b.legs.length === 1) b.status = results[0];
        else b.status = results.every((r) => r === 'void') ? 'void' : 'won'; // voided legs in accumulators count as 1.00 – odds kept as entered
        b.auto = true; b.settledAt = new Date().toISOString();
      }
    }
    if (changed) store.save();
  }

  return { list, add, update, remove, summary, autoSettle, legResult };
}
