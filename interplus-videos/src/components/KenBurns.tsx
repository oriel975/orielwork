import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease, useFormat} from '../brand';
import {assetAspect, assetKind, assetSrc, hasAsset} from '../engine/assets';
import type {Fit, Grade, Move} from '../engine/schema';
import {GradeOverlay, ThermalFilterDefs, gradeFilter, useThermalId} from './Grade';
import {Placeholder} from './Placeholder';

type Props = {
  asset?: string;
  visual?: string;
  /** Focal point in percent. Both the crop and the push-in are anchored on it. */
  focus?: [number, number];
  move?: Move;
  grade?: Grade;
  /** Transparent PNG cut-out for true foreground separation (optional). */
  foreground?: string;
  /** 0 = static, 1 = default amount of camera travel. */
  intensity?: number;
  /** Depth effect: sharp foreground around the focus over a softly blurred, slower background. */
  depth?: boolean;
  vignette?: number;
  /** Frames over which the move runs. Defaults to the enclosing sequence. */
  length?: number;
  /**
   * cover: fill the frame. contain: whole photo over a blurred copy of itself.
   * auto (default): contain when cropping would throw away most of the photo
   * (a landscape photo in 9:16, a panorama in 16:9), otherwise cover.
   */
  fit?: Fit;
};

/** Whether a photo of this aspect should be shown whole inside a frame of frameAspect. */
export const shouldContain = (imageAspect: number | null, frameAspect: number) => {
  if (!imageAspect) return false;
  const limit = frameAspect < 1 ? 1.5 : 1.6;
  return imageAspect > frameAspect * limit;
};

const camera = (move: Move, p: number, k: number) => {
  // Scale never drops below 1.06 so the frame edge never shows during a pan.
  switch (move) {
    case 'out':
      return {scale: 1.16 - 0.1 * p * k, x: 0, y: 0};
    case 'left':
      return {scale: 1.1, x: (2.2 - 4.4 * p) * k, y: 0};
    case 'right':
      return {scale: 1.1, x: (-2.2 + 4.4 * p) * k, y: 0};
    case 'up':
      return {scale: 1.1, x: 0, y: (1.8 - 3.6 * p) * k};
    case 'down':
      return {scale: 1.1, x: 0, y: (-1.8 + 3.6 * p) * k};
    default:
      return {scale: 1.06 + 0.1 * p * k, x: 0, y: -0.6 * p * k};
  }
};

/**
 * Slow cinematic push on a still (or a gentle push on a clip), with a 2.5D
 * depth effect: the area around the focal point stays sharp and travels a
 * touch faster than a softly blurred background. Missing files become a
 * labelled animated placeholder.
 */
export const KenBurns: React.FC<Props> = ({
  asset,
  visual,
  focus = [50, 50],
  move = 'in',
  grade = 'neutral',
  foreground,
  intensity = 1,
  depth = true,
  vignette,
  length,
  fit = 'auto',
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const {width, height, u, orientation} = useFormat();
  const thermalId = useThermalId();
  const total = length ?? durationInFrames;
  const p = ease.drift(Math.min(1, Math.max(0, frame / Math.max(1, total))));

  if (!hasAsset(asset)) {
    return <Placeholder visual={visual} path={asset} />;
  }

  const kind = assetKind(asset);
  const cam = camera(move, p, intensity);
  const origin = `${focus[0]}% ${focus[1]}%`;
  const objectPosition = origin;
  const filter = gradeFilter(grade, thermalId);
  const fade = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

  const layer = (scale: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
    transformOrigin: origin,
    transform: `translate(${cam.x}%, ${cam.y}%) scale(${scale})`,
    ...extra,
  });

  if (kind === 'video') {
    return (
      <AbsoluteFill style={{overflow: 'hidden', background: '#000', opacity: fade}}>
        {grade === 'thermal' ? <ThermalFilterDefs id={thermalId} /> : null}
        <OffthreadVideo muted src={assetSrc(asset)} style={layer(1 + (cam.scale - 1) * 0.5, {filter})} />
        <GradeOverlay grade={grade} vignette={vignette} />
      </AbsoluteFill>
    );
  }

  const contain = kind === 'image' && (fit === 'contain' || (fit === 'auto' && shouldContain(assetAspect(asset), width / height)));
  if (contain) {
    const aspect = assetAspect(asset) ?? 16 / 9;
    // At least 45% of the frame height (portrait) so the photo carries the frame;
    // the sides of very wide photos are trimmed rather than shrinking the band.
    const minH = orientation === 'portrait' ? height * 0.45 : 0;
    const boxH = Math.max(width / aspect, minH);
    const boxW = boxH * aspect;
    // Portrait: sit a little above centre, leaving the lower third for captions.
    const top = (orientation === 'portrait' ? height * 0.43 : height / 2) - boxH / 2;
    const s = 1.0 + 0.07 * p * intensity;
    const feather = `linear-gradient(180deg, transparent 0%, black 7%, black 93%, transparent 100%)`;
    return (
      <AbsoluteFill style={{overflow: 'hidden', background: '#000', opacity: fade}}>
        {grade === 'thermal' ? <ThermalFilterDefs id={thermalId} /> : null}
        <Img src={assetSrc(asset)} style={layer(1.3 + 0.05 * p, {filter: `${filter} blur(${30 * u}px) brightness(0.72) saturate(1.2)`})} />
        <AbsoluteFill style={{background: 'rgba(6,18,31,0.22)'}} />
        <div
          style={{
            position: 'absolute',
            left: (width - boxW) / 2,
            top,
            width: boxW,
            height: boxH,
            transform: `translate(${cam.x * 0.4}%, ${cam.y * 0.4}%) scale(${s})`,
            transformOrigin: origin,
            boxShadow: `0 ${30 * u}px ${90 * u}px rgba(0,0,0,0.5)`,
            maskImage: feather,
            WebkitMaskImage: feather,
          }}
        >
          <Img src={assetSrc(asset)} style={{width: '100%', height: '100%', objectFit: 'cover', filter, display: 'block'}} />
        </div>
        <GradeOverlay grade={grade} vignette={vignette} />
      </AbsoluteFill>
    );
  }

  // Foreground travels ~2.5% further than the background over the shot.
  const fgScale = cam.scale * (1 + 0.025 * p * intensity);
  const mask = `radial-gradient(ellipse 58% 62% at ${focus[0]}% ${focus[1]}%, black 38%, transparent 78%)`;

  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#000', opacity: fade}}>
      {grade === 'thermal' ? <ThermalFilterDefs id={thermalId} /> : null}
      <Img
        src={assetSrc(asset)}
        style={layer(cam.scale, {filter: depth ? `${filter} blur(2.2px)` : filter})}
      />
      {depth && !foreground ? (
        <Img src={assetSrc(asset)} style={layer(fgScale, {filter, maskImage: mask, WebkitMaskImage: mask})} />
      ) : null}
      {foreground && hasAsset(foreground) ? (
        <Img src={assetSrc(foreground)} style={layer(cam.scale * (1 + 0.05 * p * intensity), {filter})} />
      ) : null}
      <GradeOverlay grade={grade} vignette={vignette} />
    </AbsoluteFill>
  );
};
