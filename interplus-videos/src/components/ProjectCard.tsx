import React from 'react';
import {Img, interpolate, useCurrentFrame} from 'remotion';
import {colors, ease, fontFamily, radius, useFormat, weights} from '../brand';
import {assetSrc, hasAsset} from '../engine/assets';
import {Placeholder} from './Placeholder';

type Props = {
  title: string;
  line?: string;
  asset?: string;
  visual?: string;
  focus?: [number, number];
  width: number;
  height: number;
  /** Frame (within the sequence) when this card starts sliding in. */
  delay?: number;
  /** Slide direction: cards enter from the left edge so they read right → left. */
  from?: 'left' | 'right' | 'bottom';
};

/** Photo card with project name and one line, sliding in with a slow settle. */
export const ProjectCard: React.FC<Props> = ({
  title,
  line,
  asset,
  visual,
  focus = [50, 50],
  width,
  height,
  delay = 0,
  from = 'left',
}) => {
  const frame = useCurrentFrame();
  const {u} = useFormat();
  const p = ease.out(interpolate(frame, [delay, delay + 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const textP = ease.out(
    interpolate(frame, [delay + 10, delay + 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );
  const local = Math.max(0, frame - delay);
  const imgScale = 1.12 - Math.min(1, local / 150) * 0.08;
  const offset = (1 - p) * 90 * u;
  const tx = from === 'left' ? -offset : from === 'right' ? offset : 0;
  const ty = from === 'bottom' ? offset : 0;

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: radius.card * u,
        overflow: 'hidden',
        opacity: p,
        transform: `translate(${tx}px, ${ty}px) scale(${0.97 + 0.03 * p})`,
        boxShadow: `0 ${30 * u}px ${80 * u}px rgba(3,10,18,0.55)`,
        outline: `${1 * u}px solid ${colors.hairline}`,
        background: colors.navyDeep,
      }}
    >
      {hasAsset(asset) ? (
        <Img
          src={assetSrc(asset)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${focus[0]}% ${focus[1]}%`,
            transform: `scale(${imgScale})`,
            transformOrigin: `${focus[0]}% ${focus[1]}%`,
          }}
        />
      ) : (
        <Placeholder visual={visual ?? title} path={asset} showLabel={false} />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(3,10,18,0) 35%, rgba(3,10,18,0.55) 62%, rgba(3,10,18,0.92) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 34 * u,
          left: 34 * u,
          bottom: 30 * u,
          direction: 'rtl',
          textAlign: 'right',
          fontFamily,
          opacity: textP,
          transform: `translateY(${(1 - textP) * 16 * u}px)`,
        }}
      >
        <div style={{width: 44 * u, height: 3 * u, background: colors.amber, marginBottom: 16 * u}} />
        <div style={{fontWeight: weights.heavy, fontSize: 44 * u, lineHeight: 1.1, color: colors.white}}>{title}</div>
        {line ? (
          <div style={{marginTop: 10 * u, fontWeight: weights.light, fontSize: 27 * u, lineHeight: 1.3, color: colors.mist}}>
            {line}
          </div>
        ) : null}
      </div>
    </div>
  );
};
