import React, {useId} from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {colors, ease, useFormat} from '../brand';

/**
 * Power lines with current running through them. A cubic Bézier whose control
 * points are evenly spaced in x has x(t) linear in t, so the head of the
 * current can be placed exactly on the sweep front.
 */
type Line = {y0: number; y1: number; sag: number; w: number; tint: string};

const makeLines = (seed: string, count: number, width: number, height: number, u: number): Line[] =>
  new Array(count).fill(0).map((_, i) => {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const band = 0.22 + (0.56 * (i + 0.5)) / count;
    const y0 = height * (band + (r('a') - 0.5) * 0.08);
    return {
      y0,
      y1: y0 + height * (r('b') - 0.5) * 0.16,
      sag: height * (0.035 + r('c') * 0.05),
      w: (1.4 + r('d') * 1.6) * u,
      tint: i % 3 === 1 ? colors.amber : colors.blue,
    };
  });

const pointAt = (l: Line, t: number, x0: number, x3: number) => {
  const y = (1 - t) ** 3 * l.y0 + 3 * (1 - t) ** 2 * t * (l.y0 + l.sag) + 3 * (1 - t) * t ** 2 * (l.y1 + l.sag) + t ** 3 * l.y1;
  return {x: x0 + (x3 - x0) * t, y};
};

const pathOf = (l: Line, x0: number, x3: number) => {
  const d = (x3 - x0) / 3;
  return `M ${x0} ${l.y0} C ${x0 + d} ${l.y0 + l.sag}, ${x0 + 2 * d} ${l.y1 + l.sag}, ${x3} ${l.y1}`;
};

/** Horizontal position of the sweep front. Moves right → left, the Hebrew reading direction. */
export const sweepFront = (progress: number, width: number, pad: number) =>
  width + pad - (width + 2 * pad) * ease.inOut(Math.min(1, Math.max(0, progress)));

/** Mask for the incoming scene: visible to the right of the front, feathered edge. */
export const revealMask = (progress: number, width: number, u: number): React.CSSProperties => {
  if (progress >= 1) return {};
  const pad = 140 * u;
  const x = sweepFront(progress, width, pad);
  const f = 70 * u;
  const m = `linear-gradient(to right, transparent ${x - f}px, black ${x + f}px)`;
  return {maskImage: m, WebkitMaskImage: m};
};

/**
 * Transition overlay: current races across the frame along 4 power lines,
 * led by a vertical light front. Pair with `revealMask` on the incoming scene.
 */
export const EnergySweep: React.FC<{progress: number; seed?: string; lines?: number}> = ({
  progress,
  seed = 'sweep',
  lines = 4,
}) => {
  const {width, height, u} = useFormat();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (progress <= 0 || progress >= 1) return null;
  const pad = 140 * u;
  const x0 = width + pad;
  const x3 = -pad;
  const front = sweepFront(progress, width, pad);
  const t = (x0 - front) / (x0 - x3);
  const ls = makeLines(seed, lines, width, height, u);
  // Fade in fast, out over the last third so nothing lingers on the new scene.
  const alpha = Math.min(1, progress / 0.12) * Math.min(1, (1 - progress) / 0.35);
  const tail = width * 0.55;

  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: alpha}}>
        <defs>
          <filter id={`g${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <feGaussianBlur stdDeviation={7 * u} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`trail${id}`} gradientUnits="userSpaceOnUse" x1={front} y1={0} x2={front + tail} y2={0}>
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="0.18" stopColor={colors.blue} stopOpacity={0.9} />
            <stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`front${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={colors.blue} stopOpacity={0} />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.55} />
            <stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </linearGradient>
          <radialGradient id={`head${id}`}>
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="0.35" stopColor={colors.amber} stopOpacity={0.6} />
            <stop offset="1" stopColor={colors.amber} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={front - 120 * u} y={0} width={240 * u} height={height} fill={`url(#front${id})`} opacity={0.5} />
        <g filter={`url(#g${id})`}>
          {ls.map((l, i) => (
            <path
              key={i}
              d={pathOf(l, x0, x3)}
              pathLength={1}
              fill="none"
              stroke={`url(#trail${id})`}
              strokeWidth={l.w}
              strokeLinecap="round"
              strokeDasharray="1 1"
              strokeDashoffset={1 - t}
            />
          ))}
        </g>
        {ls.map((l, i) => {
          const p = pointAt(l, t, x0, x3);
          return <circle key={i} cx={p.x} cy={p.y} r={26 * u} fill={`url(#head${id})`} />;
        })}
        <rect x={front - 1.2 * u} y={0} width={2.4 * u} height={height} fill="#FFFFFF" opacity={0.35} />
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Background texture: faint power lines with pulses of current travelling
 * along them. Use behind cards, stats and the outro.
 */
export const EnergyAmbient: React.FC<{opacity?: number; seed?: string; lines?: number}> = ({
  opacity = 0.5,
  seed = 'ambient',
  lines = 5,
}) => {
  const frame = useCurrentFrame();
  const {width, height, u} = useFormat();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pad = 80 * u;
  const ls = makeLines(seed, lines, width, height, u);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity}}>
      <svg width={width} height={height}>
        <defs>
          <filter id={`ag${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <feGaussianBlur stdDeviation={4 * u} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {ls.map((l, i) => {
          const d = pathOf(l, width + pad, -pad);
          const speed = 0.006 + random(`${seed}-s-${i}`) * 0.004;
          const phase = random(`${seed}-p-${i}`);
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={colors.white} strokeOpacity={0.12} strokeWidth={1 * u} />
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke={l.tint}
                strokeWidth={l.w}
                strokeLinecap="round"
                strokeDasharray="0.06 0.94"
                strokeDashoffset={-(phase + frame * speed)}
                filter={`url(#ag${id})`}
              />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
