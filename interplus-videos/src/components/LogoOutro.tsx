import React, {useId} from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame} from 'remotion';
import {alpha, colors, ease, fontFamily, useFormat, weights} from '../brand';
import {assetSrc} from '../engine/assets';
import {EnergyAmbient} from './EnergyLines';
import {KineticTitle} from './KineticTitle';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** The logo itself, or a typographic wordmark when no logo file exists yet. */
export const LogoMark: React.FC<{logo?: string; brandName?: string; height: number}> = ({logo, brandName, height}) => {
  const {u, width, safe} = useFormat();
  const maxW = width - safe.left - safe.right;
  if (logo) {
    return <Img src={assetSrc(logo)} style={{height, maxWidth: maxW, width: 'auto', objectFit: 'contain', display: 'block'}} />;
  }
  const name = brandName ?? 'אינטר פלוס';
  // Heebo heavy averages ~0.52em per Hebrew character; shrink long names to fit.
  const fontSize = Math.min(height * 0.82, maxW / (name.length * 0.52));
  return (
    <div
      style={{
        direction: 'rtl',
        fontFamily,
        fontWeight: weights.heavy,
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        color: colors.white,
        whiteSpace: 'nowrap',
        textShadow: `0 0 ${30 * u}px ${alpha(colors.blue, 0.35)}`,
      }}
    >
      {brandName ?? 'אינטר פלוס'}
    </div>
  );
};

type Props = {
  logo?: string;
  brandName?: string;
  tagline?: string;
  url?: string;
  /** Frame (within the sequence) when the lines start converging. */
  delay?: number;
};

/**
 * Six lines of current race in from both edges, meet on the centre line in a
 * flash, and the logo opens out of that line. Then the tagline and the URL.
 */
export const LogoOutro: React.FC<Props> = ({logo, brandName, tagline, url, delay = 0}) => {
  const frame = useCurrentFrame() - delay;
  const {width, height, u, orientation} = useFormat();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const cx = width / 2;
  const cy = height * (orientation === 'portrait' ? 0.44 : 0.42);
  const logoH = (orientation === 'landscape' ? 150 : 132) * u;
  const barW = (orientation === 'portrait' ? 620 : 700) * u;

  const converge = ease.inOut(interpolate(frame, [0, 22], [0, 1], clamp));
  const flash = interpolate(frame, [18, 23, 46], [0, 1, 0], clamp);
  const open = ease.out(interpolate(frame, [22, 44], [0, 1], clamp));
  const settle = ease.out(interpolate(frame, [40, 70], [0, 1], clamp));
  const urlIn = ease.out(interpolate(frame, [70, 90], [0, 1], clamp));

  const lines = [-1, 1].flatMap((side) =>
    [0, 1, 2].map((k) => {
      const startY = cy + (k - 1) * height * 0.22 + side * height * 0.04;
      const y = startY + (cy - startY) * converge;
      const headX = side < 0 ? -40 * u + (cx - barW / 2 + 40 * u) * converge : width + 40 * u - (width - cx - barW / 2 + 40 * u) * converge;
      const tailX = side < 0 ? Math.max(-40 * u, headX - width * 0.4 * (1 - converge * 0.6)) : Math.min(width + 40 * u, headX + width * 0.4 * (1 - converge * 0.6));
      return {key: `${side}${k}`, x1: tailX, x2: headX, y, w: (3.4 - k * 0.6) * u, tint: k === 1 ? colors.amber : colors.blue};
    }),
  );
  const linesAlpha = interpolate(frame, [0, 4, 20, 30], [0, 1, 1, 0], clamp);

  // After the flash, the bar becomes a short amber rule under the logo.
  const ruleW = interpolate(open, [0, 1], [barW, 90 * u]);
  const ruleY = cy + interpolate(open, [0, 1], [0, logoH * 0.5 + 34 * u]);

  return (
    <AbsoluteFill>
      <EnergyAmbient opacity={0.22 * settle} seed="outro" lines={4} />
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(ellipse ${40 + flash * 30}% ${18 + flash * 22}% at 50% ${(cy / height) * 100}%, rgba(255,255,255,${0.38 * flash}), rgba(255,255,255,0) 60%)`,
            `radial-gradient(ellipse 60% 40% at 50% ${(cy / height) * 100}%, ${alpha(colors.blue, 0.16 + 0.18 * flash)}, ${alpha(colors.blue, 0)} 70%)`,
          ].join(', '),
        }}
      />
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <defs>
          <filter id={`og${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <feGaussianBlur stdDeviation={6 * u} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <defs>
          {lines.map((l) => (
            <linearGradient key={l.key} id={`ol${id}${l.key.replace('-', 'm')}`} gradientUnits="userSpaceOnUse" x1={l.x1} y1={0} x2={l.x2} y2={0}>
              <stop offset="0" stopColor={l.tint} stopOpacity={0} />
              <stop offset="0.7" stopColor={l.tint} stopOpacity={1} />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity={1} />
            </linearGradient>
          ))}
        </defs>
        <g filter={`url(#og${id})`} opacity={linesAlpha}>
          {lines.map((l) => (
            <line
              key={l.key}
              x1={l.x1}
              y1={l.y}
              x2={l.x2}
              y2={l.y}
              stroke={`url(#ol${id}${l.key.replace('-', 'm')})`}
              strokeWidth={l.w}
              strokeLinecap="round"
            />
          ))}
        </g>
        {frame >= 20 ? (
          <rect
            x={cx - ruleW / 2}
            y={ruleY - 1.5 * u}
            width={ruleW}
            height={3 * u}
            rx={1.5 * u}
            fill={open < 0.5 ? '#FFFFFF' : colors.amber}
            filter={`url(#og${id})`}
            opacity={interpolate(frame, [20, 24], [0, 1], clamp)}
          />
        ) : null}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: cy - logoH / 2,
          height: logoH,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          clipPath: `inset(${(1 - open) * 50}% 0 ${(1 - open) * 50}% 0)`,
          filter: `blur(${(1 - open) * 10 * u}px)`,
          transform: `scale(${1.04 - 0.04 * open})`,
        }}
      >
        <LogoMark logo={logo} brandName={brandName} height={logoH} />
      </div>
      {tagline ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: ruleY + 44 * u,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <KineticTitle text={tagline} size={46} weight={weights.light} delay={delay + 44} stagger={3} sweep={false} />
        </div>
      ) : null}
      {url ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: ruleY + 44 * u + 46 * u * 1.4 + 30 * u,
            textAlign: 'center',
            direction: 'ltr',
            fontFamily,
            fontWeight: weights.medium,
            fontSize: 26 * u,
            letterSpacing: '0.12em',
            color: colors.mist,
            opacity: urlIn,
          }}
        >
          {url}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
