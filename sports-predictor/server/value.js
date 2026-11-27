// What counts as a believable value bet.
// Live track record on 27.11.2026: all 95 value flags (model blend vs
// DraftKings) returned -13.8%. Split by this rule: "clean" 25 bets -21.5%,
// suspicious 70 bets -11.0%, so neither group has shown an edge yet.
// Flags where the statistical model and the de-vigged market disagree by more
// than 15 points (or claim an edge above 15%) are still hidden by default:
// such gaps usually mean the market knows something the model does not
// (injuries, line-ups, rotation). The track record reports both groups so the
// rule keeps being tested.

export const SUSPICIOUS_EV = 0.15;
export const SUSPICIOUS_GAP = 0.15;

// |model − market| on the home win, comparing like with like (a 3-way model
// against a 2-way market splits the draw).
export function modelMarketGap(p) {
  const m = p?.model, k = p?.market;
  if (!m || !k || m.home == null || k.home == null) return null;
  let mh = m.home;
  if (k.draw == null && m.draw != null) mh = m.home + m.draw / 2;
  return Math.abs(mh - k.home);
}

export function isSuspicious(ev, gap) {
  return ev > SUSPICIOUS_EV || (gap != null && gap > SUSPICIOUS_GAP);
}

export function markSuspicious(prediction) {
  if (!prediction?.value) return prediction;
  const gap = modelMarketGap(prediction);
  prediction.gap = gap;
  for (const v of prediction.value) v.suspicious = isSuspicious(v.ev, gap);
  return prediction;
}
