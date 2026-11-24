import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {colors, ease, fontFamily, useFormat, weights} from '../brand';

/** Name and role, anchored to the right (the start side in Hebrew). */
export const LowerThird: React.FC<{name: string; role: string; delay?: number}> = ({name, role, delay = 0}) => {
  const frame = useCurrentFrame();
  const {u, safe, orientation} = useFormat();
  const p = ease.out(interpolate(frame, [delay, delay + 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const bar = ease.out(interpolate(frame, [delay, delay + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const bottom = orientation === 'portrait' ? safe.bottom + 190 * u : safe.bottom + 120 * u;
  return (
    <div
      style={{
        position: 'absolute',
        right: safe.right,
        bottom,
        display: 'flex',
        flexDirection: 'row',
        direction: 'rtl',
        alignItems: 'stretch',
        gap: 20 * u,
        fontFamily,
      }}
    >
      <div style={{width: 5 * u, background: colors.amber, transform: `scaleY(${bar})`, transformOrigin: 'top'}} />
      <div style={{opacity: p, transform: `translateX(${(1 - p) * 40 * u}px)`}}>
        <div style={{fontWeight: weights.heavy, fontSize: 46 * u, color: colors.white, lineHeight: 1.1}}>{name}</div>
        <div style={{fontWeight: weights.light, fontSize: 30 * u, color: colors.mist, marginTop: 6 * u}}>{role}</div>
      </div>
    </div>
  );
};
