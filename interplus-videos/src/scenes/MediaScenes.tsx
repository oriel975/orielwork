import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {colors, ease, fontFamily, useFormat, weights} from '../brand';
import {EnergySweep, KenBurns, KineticTitle, LogoMark, LowerThird, Placeholder, revealMask} from '../components';
import {assetKind, assetSrc, hasAsset} from '../engine/assets';
import type {Shot} from '../engine/schema';
import {clamp, type SceneProps} from './common';

const Sub: React.FC<{text: string; delay: number; size?: number}> = ({text, delay, size = 40}) => {
  const frame = useCurrentFrame();
  const {u} = useFormat();
  const p = ease.out(interpolate(frame, [delay, delay + 20], [0, 1], clamp));
  return (
    <div
      style={{
        marginTop: 26 * u,
        direction: 'rtl',
        textAlign: 'center',
        fontFamily,
        fontWeight: weights.light,
        fontSize: size * u,
        color: colors.mist,
        opacity: p,
        transform: `translateY(${(1 - p) * 14 * u}px)`,
      }}
    >
      {text}
    </div>
  );
};

/** Full-bleed image with the headline in the middle. */
export const TitleScene: React.FC<SceneProps> = ({ts, lead}) => {
  const s = ts.scene;
  const {safe, orientation} = useFormat();
  return (
    <AbsoluteFill>
      <KenBurns asset={s.asset} visual={s.visual} focus={s.focus} move={s.move} grade={s.grade} fit={s.fit} foreground={s.foreground} length={ts.span} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(3,10,18,0.62), rgba(3,10,18,0) 78%)'}} />
      {s.text ? (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: safe.top,
            paddingBottom: safe.bottom,
            paddingLeft: safe.left,
            paddingRight: safe.right,
            flexDirection: 'column',
          }}
        >
          <KineticTitle text={s.text} size={orientation === 'landscape' ? 108 : 100} delay={lead + 4} />
          {s.subtitle ? <Sub text={s.subtitle} delay={lead + 28} /> : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** Full-bleed image; an optional short headline sits at the top right. */
export const ImageScene: React.FC<SceneProps> = ({ts, lead}) => {
  const s = ts.scene;
  const {safe} = useFormat();
  return (
    <AbsoluteFill>
      <KenBurns asset={s.asset} visual={s.visual} focus={s.focus} move={s.move} grade={s.grade} fit={s.fit} foreground={s.foreground} length={ts.span} />
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(3,10,18,0.5) 0%, rgba(3,10,18,0) 30%, rgba(3,10,18,0) 60%, rgba(3,10,18,0.6) 100%)'}} />
      {s.text ? (
        <div style={{position: 'absolute', top: safe.top, right: safe.right, left: safe.left}}>
          <KineticTitle text={s.text} size={64} align="start" delay={lead + 4} />
          {s.subtitle ? (
            <div style={{textAlign: 'right'}}>
              <Sub text={s.subtitle} delay={lead + 24} size={34} />
            </div>
          ) : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const ShotLabel: React.FC<{index: number; caption: string; delay: number}> = ({index, caption, delay}) => {
  const frame = useCurrentFrame();
  const {u, safe} = useFormat();
  const p = ease.out(interpolate(frame, [delay, delay + 16], [0, 1], clamp));
  return (
    <div
      style={{
        position: 'absolute',
        top: safe.top,
        right: safe.right,
        display: 'flex',
        alignItems: 'baseline',
        gap: 18 * u,
        direction: 'rtl',
        fontFamily,
        opacity: p,
        transform: `translateX(${(1 - p) * 30 * u}px)`,
      }}
    >
      <span style={{direction: 'ltr', color: colors.amber, fontWeight: weights.medium, fontSize: 28 * u, letterSpacing: '0.1em'}}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span style={{color: colors.white, fontWeight: weights.heavy, fontSize: 52 * u, textShadow: '0 2px 20px rgba(3,10,18,0.6)'}}>
        {caption}
      </span>
    </div>
  );
};

/** Several fast shots, each cut with a quick energy sweep. */
export const MontageScene: React.FC<SceneProps> = ({ts, lead}) => {
  const frame = useCurrentFrame();
  const s = ts.scene;
  const {width, u} = useFormat();
  const shots: Shot[] = s.shots?.length ? s.shots : [{asset: s.asset, visual: s.visual, focus: s.focus, move: s.move}];
  const cut = 14;
  const shotLen = ts.length / shots.length;
  const moves = ['in', 'left', 'out', 'right'] as const;
  return (
    <AbsoluteFill>
      {shots.map((sh, k) => {
        const from = k === 0 ? 0 : Math.round(lead + k * shotLen - cut / 2);
        const to = k === shots.length - 1 ? ts.span : Math.round(lead + (k + 1) * shotLen + cut / 2);
        const local = frame - from;
        const mask = k === 0 ? {} : revealMask(local / cut, width, u);
        return (
          <Sequence key={k} from={from} durationInFrames={Math.max(1, to - from)} layout="none">
            <AbsoluteFill style={mask}>
              <KenBurns
                asset={sh.asset}
                visual={sh.visual}
                focus={sh.focus}
                move={sh.move ?? moves[k % moves.length]}
                grade={sh.grade ?? s.grade}
                fit={sh.fit ?? s.fit}
                intensity={1.3}
                length={to - from}
              />
              <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(3,10,18,0.55) 0%, rgba(3,10,18,0) 32%)'}} />
              {sh.caption ? <ShotLabel index={k} caption={sh.caption} delay={k === 0 ? lead + 4 : cut / 2 + 2} /> : null}
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {shots.slice(1).map((_, i) => {
        const from = Math.round(lead + (i + 1) * shotLen - cut / 2);
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={cut} layout="none">
            <EnergySweep progress={(frame - from) / cut} seed={`cut${i}`} lines={3} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Logo reveal over an image (e.g. the crew on site). */
export const LogoScene: React.FC<SceneProps> = ({ts, lead, logo, video}) => {
  const frame = useCurrentFrame();
  const s = ts.scene;
  const {u, orientation, height} = useFormat();
  const p = ease.out(interpolate(frame, [lead + 2, lead + 26], [0, 1], clamp));
  const logoH = (orientation === 'landscape' ? 120 : 110) * u;
  return (
    <AbsoluteFill>
      <KenBurns asset={s.asset} visual={s.visual} focus={s.focus} move={s.move ?? 'left'} grade={s.grade} fit={s.fit} length={ts.span} />
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(3,10,18,0.62) 0%, rgba(3,10,18,0.18) 45%, rgba(3,10,18,0.5) 100%)'}} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: height * (orientation === 'portrait' ? 0.3 : 0.32) - logoH / 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            opacity: p,
            filter: `blur(${(1 - p) * 12 * u}px)`,
            transform: `scale(${1.05 - 0.05 * p})`,
          }}
        >
          <LogoMark logo={logo} brandName={video.brandName} height={logoH} />
        </div>
        {s.text ? (
          <div style={{marginTop: 34 * u}}>
            <KineticTitle text={s.text} size={44} weight={weights.light} delay={lead + 22} stagger={3} sweep={false} />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** A clip with sound (interview, talking head) and an optional lower third. */
export const VideoScene: React.FC<SceneProps> = ({ts, lead}) => {
  const s = ts.scene;
  const isVideo = hasAsset(s.asset) && assetKind(s.asset) === 'video';
  return (
    <AbsoluteFill style={{background: colors.ink}}>
      {isVideo ? (
        <OffthreadVideo
          src={assetSrc(s.asset!)}
          style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${s.focus?.[0] ?? 50}% ${s.focus?.[1] ?? 50}%`}}
        />
      ) : hasAsset(s.asset) ? (
        <KenBurns asset={s.asset} visual={s.visual} focus={s.focus} move={s.move} grade={s.grade} fit={s.fit} length={ts.span} />
      ) : (
        <Placeholder visual={s.visual} path={s.asset} />
      )}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(3,10,18,0) 55%, rgba(3,10,18,0.55) 100%)'}} />
      {s.lowerThird ? <LowerThird name={s.lowerThird.name} role={s.lowerThird.role} delay={lead + 12} /> : null}
    </AbsoluteFill>
  );
};

const Pill: React.FC<{text: string; opacity: number}> = ({text, opacity}) => {
  const {u, safe} = useFormat();
  return (
    <div
      style={{
        position: 'absolute',
        top: safe.top,
        right: safe.right,
        padding: `${8 * u}px ${22 * u}px`,
        borderRadius: 999,
        background: 'rgba(6,18,31,0.6)',
        border: `${1 * u}px solid ${colors.hairline}`,
        color: colors.white,
        fontFamily,
        fontWeight: weights.medium,
        fontSize: 30 * u,
        direction: 'rtl',
        opacity,
      }}
    >
      {text}
    </div>
  );
};

/** Before → after, wiped right to left by a line of current. */
export const BeforeAfterScene: React.FC<SceneProps> = ({ts, lead}) => {
  const frame = useCurrentFrame();
  const s = ts.scene;
  const {width, u} = useFormat();
  const wipeStart = Math.round(lead + ts.length * 0.38);
  const wipeLen = Math.round(Math.min(30, ts.length * 0.25));
  const wp = interpolate(frame, [wipeStart, wipeStart + wipeLen], [0, 1], clamp);
  const before = s.before ?? {};
  const after = s.after ?? {};
  return (
    <AbsoluteFill>
      <KenBurns asset={before.asset} visual={before.visual ?? 'before'} focus={before.focus} move="in" grade={before.grade ?? s.grade} fit={before.fit ?? s.fit} length={ts.span} />
      {wp > 0 ? (
        <AbsoluteFill style={revealMask(wp, width, u)}>
          <KenBurns asset={after.asset} visual={after.visual ?? 'after'} focus={after.focus} move="in" grade={after.grade ?? s.grade} fit={after.fit ?? s.fit} length={ts.span} />
        </AbsoluteFill>
      ) : null}
      <Sequence from={wipeStart} durationInFrames={wipeLen} layout="none">
        <EnergySweep progress={wp} seed="ba" lines={3} />
      </Sequence>
      <Pill text="לפני" opacity={interpolate(frame, [lead, lead + 10, wipeStart, wipeStart + 8], [0, 1, 1, 0], clamp)} />
      <Pill text="אחרי" opacity={interpolate(frame, [wipeStart + wipeLen - 6, wipeStart + wipeLen + 6], [0, 1], clamp)} />
    </AbsoluteFill>
  );
};
