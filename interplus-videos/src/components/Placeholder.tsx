import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {alpha, colors, fontFamily, useFormat, type} from '../brand';

/**
 * Stand-in for a photo or clip that is not in assets/ yet. Quiet, on-brand,
 * slowly moving, and labelled so a reviewer knows what goes here.
 */
export const Placeholder: React.FC<{visual?: string; path?: string; showLabel?: boolean}> = ({
  visual,
  path,
  showLabel = true,
}) => {
  const frame = useCurrentFrame();
  const {u, safe, width, height} = useFormat();
  const t = frame / 30;
  const gx = 50 + Math.sin(t * 0.35) * 18;
  const gy = 42 + Math.cos(t * 0.27) * 10;
  const gridShift = (frame * 0.6) % (80 * u);
  const fade = interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  const scan = ((frame % 150) / 150) * (width + 400 * u) - 200 * u;

  return (
    <AbsoluteFill style={{background: colors.navyDeep, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 60% at ${gx}% ${gy}%, ${alpha(colors.blue, 0.30)}, transparent 70%),
            radial-gradient(ellipse 50% 40% at ${100 - gx}% ${85 - gy / 3}%, rgba(255,176,32,0.12), transparent 70%),
            linear-gradient(180deg, ${colors.navy} 0%, ${colors.navyDeep} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.08,
          backgroundImage: `linear-gradient(${colors.white} 1px, transparent 1px), linear-gradient(90deg, ${colors.white} 1px, transparent 1px)`,
          backgroundSize: `${80 * u}px ${80 * u}px`,
          backgroundPosition: `${-gridShift}px ${gridShift / 2}px`,
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 80%)',
        }}
      />
      <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: 0.5 * fade}}>
        <line x1={scan} y1={0} x2={scan - 160 * u} y2={height} stroke={colors.blue} strokeWidth={1.2 * u} opacity={0.35} />
      </svg>
      {showLabel && (visual || path) ? (
        <div
          style={{
            position: 'absolute',
            top: safe.top,
            left: safe.left,
            maxWidth: width * 0.5,
            direction: 'ltr',
            textAlign: 'left',
            fontFamily,
            opacity: 0.75 * fade,
            color: colors.mist,
            fontSize: type.micro * u,
            lineHeight: 1.45,
            letterSpacing: '0.04em',
          }}
        >
          <div style={{color: colors.amber, fontWeight: 500, letterSpacing: '0.2em'}}>PLACEHOLDER</div>
          {visual ? <div style={{fontWeight: 300, unicodeBidi: 'plaintext'}}>{visual}</div> : null}
          {path ? <div style={{fontWeight: 300, opacity: 0.6}}>{path}</div> : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
