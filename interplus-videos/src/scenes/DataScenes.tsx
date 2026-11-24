import React from 'react';
import {AbsoluteFill} from 'remotion';
import {colors, useFormat} from '../brand';
import {EnergyAmbient, KenBurns, KineticTitle, LogoOutro, ProjectCard, StatCounter} from '../components';
import {hasAsset} from '../engine/assets';
import type {SceneProps} from './common';

/** Dark backdrop: the scene's image pushed far back, or brand navy with ambient current. */
const Backdrop: React.FC<SceneProps & {dim?: number}> = ({ts, dim = 0.72}) => {
  const s = ts.scene;
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse 90% 80% at 50% 35%, ${colors.navy} 0%, ${colors.navyDeep} 60%, ${colors.ink} 100%)`}}>
      {hasAsset(s.asset) ? (
        <>
          <KenBurns asset={s.asset} focus={s.focus} move={s.move} grade={s.grade ?? 'night'} fit={s.fit} depth={false} length={ts.span} />
          <AbsoluteFill style={{background: `rgba(6,18,31,${dim})`}} />
        </>
      ) : null}
      <EnergyAmbient opacity={0.35} seed={`bg${ts.index}`} />
    </AbsoluteFill>
  );
};

const Headline: React.FC<{text?: string; delay: number}> = ({text, delay}) => {
  const {safe} = useFormat();
  if (!text) return null;
  return (
    <div style={{position: 'absolute', top: safe.top, left: safe.left, right: safe.right, display: 'flex', justifyContent: 'center'}}>
      <KineticTitle text={text} size={58} delay={delay} stagger={3} />
    </div>
  );
};

/** Up to three project cards: a row in 16:9, a stack in 9:16 and 1:1. */
export const ProjectsScene: React.FC<SceneProps> = (props) => {
  const {ts, lead, captioned} = props;
  const s = ts.scene;
  const {u, safe, width, height, orientation} = useFormat();
  const cards = s.cards ?? [];
  const n = Math.max(1, cards.length);
  const top = safe.top + (s.text ? 130 * u : 0);
  const bottom = safe.bottom + (captioned ? 120 * u : 0);
  const areaW = width - safe.left - safe.right;
  const areaH = height - top - bottom;
  const row = orientation === 'landscape';
  const gap = (row ? 36 : 26) * u;
  const cardW = row ? (areaW - gap * (n - 1)) / n : areaW;
  const cardH = row ? Math.min(areaH, cardW * 1.22) : (areaH - gap * (n - 1)) / n;

  return (
    <AbsoluteFill>
      <Backdrop {...props} />
      <Headline text={s.text} delay={lead + 2} />
      <div
        style={{
          position: 'absolute',
          top,
          left: safe.left,
          right: safe.right,
          height: areaH,
          display: 'flex',
          flexDirection: row ? 'row' : 'column',
          direction: 'rtl',
          gap,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {cards.map((c, i) => (
          <ProjectCard
            key={i}
            title={c.title}
            line={c.line}
            asset={c.asset}
            visual={c.visual}
            focus={c.focus}
            width={cardW}
            height={cardH}
            delay={lead + 6 + i * 8}
            from={row ? 'left' : 'bottom'}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** One to three numbers counting up. */
export const StatScene: React.FC<SceneProps> = (props) => {
  const {ts, lead} = props;
  const s = ts.scene;
  const {u, orientation} = useFormat();
  const stats = s.stats ?? [];
  const row = orientation === 'landscape' && stats.length > 1;
  const size = stats.length > 1 ? (orientation === 'landscape' ? 150 : 132) : 200;
  return (
    <AbsoluteFill>
      <Backdrop {...props} dim={0.6} />
      <Headline text={s.text} delay={lead + 2} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: row ? 'row' : 'column',
          direction: 'rtl',
          gap: (row ? 140 : 70) * u,
        }}
      >
        {stats.map((st, i) => (
          <StatCounter key={i} {...st} size={size} delay={lead + 6 + i * 10} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Logo assembled from energy lines, tagline and URL. */
export const OutroScene: React.FC<SceneProps> = (props) => {
  const {ts, lead, logo, video} = props;
  const s = ts.scene;
  return (
    <AbsoluteFill>
      <Backdrop {...props} dim={0.7} />
      <LogoOutro logo={logo} brandName={video.brandName} tagline={s.tagline ?? s.text} url={s.url} delay={lead} />
    </AbsoluteFill>
  );
};
