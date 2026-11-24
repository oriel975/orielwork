import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {colors, fontFamily, useFormat, weights} from '../brand';

export type CaptionCue = {start: number; end: number; text: string};

/** Split words into the fewest chunks under maxChars, with chunk lengths as even as possible. */
const balance = (words: string[], maxChars: number): string[] => {
  const text = words.join(' ');
  const n = Math.max(1, Math.ceil(text.length / maxChars));
  if (n === 1) return [text];
  const target = text.length / n;
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    // Close the chunk once it reaches its share, unless that would strand the rest.
    if (cur && next.length > target * 1.15 && out.length < n - 1) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
};

/**
 * Split a voiceover line into subtitle chunks: at punctuation first, then into
 * even chunks by length; each chunk is timed by its share of the characters.
 */
export const chunkCue = (cue: CaptionCue, maxChars: number): CaptionCue[] => {
  // Split at punctuation, then re-join comma-separated phrases that fit on one line
  // (never across the end of a sentence).
  const merged = cue.text.split(/(?<=[,.!?;:])\s+/).reduce<string[]>((acc, ph) => {
    const last = acc[acc.length - 1];
    if (last && !/[.!?]$/.test(last) && `${last} ${ph}`.length <= maxChars) acc[acc.length - 1] = `${last} ${ph}`;
    else acc.push(ph);
    return acc;
  }, []);
  const phrases = merged.flatMap((ph) => balance(ph.split(/\s+/).filter(Boolean), maxChars)).filter(Boolean);
  const totalChars = phrases.reduce((a, p) => a + p.length, 0);
  const span = cue.end - cue.start;
  let t = cue.start;
  return phrases.map((p, i) => {
    const end = i === phrases.length - 1 ? cue.end : Math.min(cue.end, t + Math.round((p.length / totalChars) * span));
    const c = {start: t, end, text: p};
    t = end;
    return c;
  });
};

/**
 * Burned-in Hebrew subtitles. Kept inside the format's safe area: in 9:16 they
 * sit above the Reels/TikTok caption block and clear of the right-hand buttons.
 */
export const Captions: React.FC<{cues: CaptionCue[]}> = ({cues}) => {
  const frame = useCurrentFrame();
  const {u, safe, width, orientation} = useFormat();
  const maxChars = orientation === 'portrait' ? 26 : orientation === 'square' ? 32 : 46;
  const chunks = cues.flatMap((c) => chunkCue(c, maxChars));
  const active = chunks.find((c) => frame >= c.start && frame < c.end);
  if (!active) return null;
  const f = Math.max(1, Math.min(5, Math.floor((active.end - active.start) / 3)));
  const p = interpolate(frame, [active.start, active.start + f, active.end - f, active.end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const size = (orientation === 'portrait' ? 50 : 40) * u;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          bottom: safe.bottom,
          left: safe.left,
          right: safe.right,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            direction: 'rtl',
            maxWidth: orientation === 'landscape' ? width * 0.62 : undefined,
            padding: `${10 * u}px ${24 * u}px ${12 * u}px`,
            borderRadius: 14 * u,
            background: 'rgba(6,18,31,0.66)',
            backdropFilter: `blur(${10 * u}px)`,
            fontFamily,
            fontWeight: weights.medium,
            fontSize: size,
            lineHeight: 1.3,
            color: colors.white,
            textAlign: 'center',
            opacity: p,
            transform: `translateY(${(1 - p) * 8 * u}px)`,
          }}
        >
          {active.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
