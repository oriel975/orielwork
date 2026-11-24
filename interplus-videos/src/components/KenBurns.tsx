import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease} from '../brand';
import {assetKind, assetSrc, hasAsset} from '../engine/assets';
import type {Grade, Move} from '../engine/schema';
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
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
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
