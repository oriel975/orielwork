import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, ease, fontFamily, useFormat, weights} from '../brand';

/**
 * Running clock in the corner (Enerlec). With `start` ("02:00") it shows the
 * time of day ticking in real time from that moment; without it, a stopwatch.
 * It never compresses time, so it never implies a response time.
 */
export const RunningClock: React.FC<{start?: string; fadeFrames?: number; total: number}> = ({start, fadeFrames = 10, total}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, safe} = useFormat();
  const secs = frame / fps;
  let label: string;
  if (start) {
    const [h, m] = start.split(':').map(Number);
    const t = h * 3600 + m * 60 + Math.floor(secs);
    const hh = String(Math.floor(t / 3600) % 24).padStart(2, '0');
    const mm = String(Math.floor(t / 60) % 60).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    label = `${hh}:${mm}:${ss}`;
  } else {
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(Math.floor(secs) % 60).padStart(2, '0');
    const cc = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
    label = `${mm}:${ss}.${cc}`;
  }
  const o = interpolate(frame, [0, fadeFrames, total - fadeFrames, total], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const blink = Math.floor(frame / (fps / 2)) % 2 === 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: safe.top - 40 * u,
        left: safe.left,
        display: 'flex',
        alignItems: 'center',
        gap: 14 * u,
        direction: 'ltr',
        opacity: o,
        fontFamily,
      }}
    >
      <div style={{width: 14 * u, height: 14 * u, borderRadius: 99, background: '#FF3B30', opacity: blink ? 1 : 0.25, boxShadow: `0 0 ${12 * u}px #FF3B30`}} />
      <div
        style={{
          fontWeight: weights.medium,
          fontSize: 40 * u,
          letterSpacing: '0.06em',
          color: colors.white,
          fontVariantNumeric: 'tabular-nums',
          textShadow: `0 0 ${18 * u}px rgba(255,59,48,0.45)`,
        }}
      >
        {label}
      </div>
    </div>
  );
};

/**
 * EV's recurring motif: a glowing charge bar that fills across the whole video,
 * reaching 100% as the outro begins.
 */
export const ChargeBar: React.FC<{fullAt: number}> = ({fullAt}) => {
  const frame = useCurrentFrame();
  const {u, safe, width, orientation} = useFormat();
  const p = ease.inOut(Math.min(1, frame / Math.max(1, fullAt)));
  const barW = (orientation === 'landscape' ? 300 : 260) * u;
  const barH = 22 * u;
  const appear = interpolate(frame, [6, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const full = frame >= fullAt;
  const pulse = full ? 0.6 + 0.4 * Math.sin(frame / 4) : 1;
  const fillColor = `linear-gradient(270deg, ${colors.blue}, ${colors.amber})`;
  return (
    <div
      style={{
        position: 'absolute',
        top: safe.top - 52 * u,
        right: orientation === 'portrait' ? (width - barW) / 2 - 40 * u : safe.right,
        display: 'flex',
        alignItems: 'center',
        gap: 16 * u,
        direction: 'ltr',
        opacity: appear,
        fontFamily,
      }}
    >
      <div style={{color: colors.white, fontWeight: weights.medium, fontSize: 26 * u, fontVariantNumeric: 'tabular-nums', width: 70 * u, textAlign: 'right'}}>
        {Math.round(p * 100)}%
      </div>
      <div style={{position: 'relative', width: barW, height: barH, borderRadius: 6 * u, border: `${2 * u}px solid rgba(255,255,255,0.55)`, padding: 3 * u}}>
        <div
          style={{
            position: 'absolute',
            right: 3 * u,
            top: 3 * u,
            bottom: 3 * u,
            width: (barW - 6 * u - 4 * u) * p,
            borderRadius: 3 * u,
            background: fillColor,
            boxShadow: `0 0 ${16 * u * pulse}px ${colors.glowBlue}`,
          }}
        />
        <div style={{position: 'absolute', left: -9 * u, top: barH / 2 - 7 * u, width: 6 * u, height: 14 * u, borderRadius: 2 * u, background: 'rgba(255,255,255,0.55)'}} />
      </div>
    </div>
  );
};
