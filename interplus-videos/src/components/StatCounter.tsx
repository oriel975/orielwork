import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {colors, ease, fontFamily, useFormat, weights} from '../brand';

type Props = {
  value: number;
  unit?: string;
  label: string;
  prefix?: string;
  decimals?: number;
  delay?: number;
  /** Frames the count takes. */
  countFrames?: number;
  /** Number size in units. */
  size?: number;
};

const fmt = (n: number, decimals: number) =>
  new Intl.NumberFormat('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(n);

/**
 * A big number that counts up and lands slowly, with its unit in amber and a
 * Hebrew label underneath. The final value is laid out invisibly first so the
 * block never changes width while counting.
 */
export const StatCounter: React.FC<Props> = ({
  value,
  unit,
  label,
  prefix = '',
  decimals = 0,
  delay = 0,
  countFrames = 48,
  size = 168,
}) => {
  const frame = useCurrentFrame();
  const {u} = useFormat();
  const enter = ease.out(interpolate(frame, [delay, delay + 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const count = ease.count(
    interpolate(frame, [delay + 4, delay + 4 + countFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );
  const rule = ease.out(
    interpolate(frame, [delay + 10, delay + 10 + 28], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );
  const labelIn = ease.out(
    interpolate(frame, [delay + 14, delay + 32], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );

  const number = (n: number) => (
    <>
      {prefix}
      {fmt(n, decimals)}
      {unit ? (
        <span style={{color: colors.amber, fontWeight: weights.medium, fontSize: '0.42em', marginLeft: '0.18em'}}>
          {unit}
        </span>
      ) : null}
    </>
  );

  const numStyle: React.CSSProperties = {
    gridArea: '1 / 1',
    direction: 'ltr',
    fontFamily,
    fontWeight: weights.heavy,
    fontSize: size * u,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    color: colors.white,
    whiteSpace: 'nowrap',
    textAlign: 'center',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30 * u}px)`,
      }}
    >
      <div style={{display: 'grid'}}>
        <div style={{...numStyle, visibility: 'hidden'}}>{number(value)}</div>
        <div style={numStyle}>{number(value * count)}</div>
      </div>
      <div
        style={{
          height: 3 * u,
          width: 120 * u * rule,
          marginTop: 22 * u,
          background: `linear-gradient(90deg, transparent, ${colors.amber}, transparent)`,
          boxShadow: `0 0 ${14 * u}px ${colors.glowAmber}`,
        }}
      />
      <div
        style={{
          marginTop: 20 * u,
          direction: 'rtl',
          fontFamily,
          fontWeight: weights.light,
          fontSize: 44 * u,
          color: 'rgba(255,255,255,0.86)',
          opacity: labelIn,
          transform: `translateY(${(1 - labelIn) * 12 * u}px)`,
          textAlign: 'center',
        }}
      >
        {label}
      </div>
    </div>
  );
};
