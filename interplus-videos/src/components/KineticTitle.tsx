import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {colors, ease, fontFamily, useFormat, weights} from '../brand';

type Props = {
  text: string;
  /** Font size in units (see brand/tokens `type`). */
  size?: number;
  weight?: number;
  color?: string;
  /** Frame (within the sequence) when the first word starts. */
  delay?: number;
  /** Frames between words. */
  stagger?: number;
  align?: 'center' | 'start';
  /** Max line width in px. Defaults to the safe area width. */
  maxWidth?: number;
  sweep?: boolean;
  lineHeight?: number;
};

/**
 * Hebrew headline, revealed word by word (right to left) out of a soft blur
 * with a slight 3D tilt that settles, then a single light sweep across it.
 * Words keep their punctuation, so RTL bidi places it correctly.
 */
export const KineticTitle: React.FC<Props> = ({
  text,
  size = 96,
  weight = weights.heavy,
  color = colors.white,
  delay = 0,
  stagger = 4,
  align = 'center',
  maxWidth,
  sweep = true,
  lineHeight = 1.08,
}) => {
  const frame = useCurrentFrame();
  const {u, width, safe} = useFormat();
  const words = text.trim().split(/\s+/);
  // Balance line lengths: estimate the set width (~0.5em per character) and, when
  // the title wraps, narrow the block so lines come out even instead of leaving
  // one word alone on the last line.
  const available = maxWidth ?? width - safe.left - safe.right;
  const estimate = text.length * size * u * 0.5;
  const lines = Math.ceil(estimate / available);
  const balancedWidth = lines > 1 ? Math.min(available, (estimate / lines) * 1.15) : available;
  const wordIn = 18;
  const settle = delay + words.length * stagger + wordIn;
  const tiltP = ease.out(interpolate(frame, [delay, settle + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const sweepStart = settle + 6;
  const sweepP = interpolate(frame, [sweepStart, sweepStart + 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const band = 112 - ease.inOut(sweepP) * 124; // % across the block, right → left

  const block: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    direction: 'rtl',
    justifyContent: align === 'center' ? 'center' : 'flex-start',
    columnGap: '0.24em',
    rowGap: '0.02em',
    fontFamily,
    fontWeight: weight,
    fontSize: size * u,
    lineHeight,
    letterSpacing: '-0.012em',
    color,
    textAlign: align === 'center' ? 'center' : 'right',
    maxWidth: balancedWidth,
  };

  return (
    <div style={{position: 'relative', perspective: 1400 * u}}>
      <div
        style={{
          ...block,
          transform: `rotateX(${(1 - tiltP) * 14}deg) rotateY(${(1 - tiltP) * -7}deg) translateZ(0)`,
          transformOrigin: '50% 60%',
          textShadow: `0 ${2 * u}px ${24 * u}px rgba(3,10,18,0.6), 0 0 ${6 * u}px rgba(3,10,18,0.35)`,
        }}
      >
        {words.map((w, i) => {
          const p = ease.out(
            interpolate(frame, [delay + i * stagger, delay + i * stagger + wordIn], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          );
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: p,
                filter: `blur(${(1 - p) * 10 * u}px)`,
                transform: `translateY(${(1 - p) * 0.32}em) rotateX(${(1 - p) * -48}deg)`,
                transformOrigin: '50% 100%',
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      {sweep && sweepP > 0 && sweepP < 1 ? (
        <div
          aria-hidden
          style={{
            ...block,
            position: 'absolute',
            inset: 0,
            color: '#FFF7E6',
            textShadow: `0 0 ${18 * u}px rgba(255,214,140,0.95), 0 0 ${42 * u}px rgba(255,176,32,0.55)`,
            maskImage: `linear-gradient(105deg, transparent ${band - 9}%, black ${band}%, transparent ${band + 9}%)`,
            WebkitMaskImage: `linear-gradient(105deg, transparent ${band - 9}%, black ${band}%, transparent ${band + 9}%)`,
          }}
        >
          {words.map((w, i) => (
            <span key={i} style={{display: 'inline-block'}}>
              {w}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** Duration in frames until a KineticTitle has fully landed (handy for chaining). */
export const kineticLanded = (text: string, delay = 0, stagger = 4) =>
  delay + text.trim().split(/\s+/).length * stagger + 18;
