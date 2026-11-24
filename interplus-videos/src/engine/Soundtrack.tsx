import React from 'react';
import {Html5Audio, Sequence, interpolate, useVideoConfig} from 'remotion';
import {assetSrc, hasAsset} from './assets';
import type {VideoSpec} from './schema';
import type {TimedScene} from './timeline';

/**
 * Music bed with ducking under every voiceover, plus one voiceover file per
 * scene. Ramps are short (≈0.3s down, ≈0.4s up) so the dip is felt, not heard.
 */
export const Soundtrack: React.FC<{video: VideoSpec; timeline: TimedScene[]}> = ({video, timeline}) => {
  const {durationInFrames, fps} = useVideoConfig();
  const base = video.musicVolume ?? 0.55;
  const ducked = video.duckedVolume ?? 0.14;
  const windows = timeline
    .filter((t) => t.vo)
    .map((t) => {
      const start = t.vo!.start;
      const end = t.vo!.frames ? start + t.vo!.frames : t.start + t.length;
      return [start, end] as const;
    });
  const down = Math.round(fps * 0.3);
  const up = Math.round(fps * 0.4);

  const musicVolume = (f: number) => {
    const fadeIn = interpolate(f, [0, fps * 1.2], [0, 1], {extrapolateRight: 'clamp'});
    const fadeOut = interpolate(f, [durationInFrames - fps * 1.8, durationInFrames - 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    let level = base;
    for (const [s, e] of windows) {
      const d = interpolate(f, [s - down, s, e, e + up], [base, ducked, ducked, base], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      level = Math.min(level, d);
    }
    return level * fadeIn * fadeOut;
  };

  // Whooshes: on every energy transition, every montage cut and before/after wipe.
  const whooshes: {at: number; gain: number}[] = [];
  if (video.sfx !== false && hasAsset('sfx/whoosh.wav')) {
    for (const t of timeline) {
      if (t.index > 0 && t.transition === 'energy' && t.transitionFrames) whooshes.push({at: t.from - 2, gain: 0.55});
      const lead = t.start - t.from;
      if (t.scene.type === 'montage' && (t.scene.shots?.length ?? 0) > 1) {
        const n = t.scene.shots!.length;
        for (let k = 1; k < n; k++) whooshes.push({at: Math.round(t.from + lead + (k * t.length) / n - 7 - 4), gain: 0.35});
      }
      if (t.scene.type === 'beforeAfter') whooshes.push({at: Math.round(t.from + lead + t.length * 0.38 - 4), gain: 0.45});
    }
  }

  return (
    <>
      {whooshes.map((w, i) => (
        <Sequence key={`w${i}`} from={Math.max(0, w.at)} durationInFrames={Math.round(fps * 1.4)} name="whoosh" layout="none">
          <Html5Audio src={assetSrc('sfx/whoosh.wav')} volume={w.gain} />
        </Sequence>
      ))}
      {video.music && hasAsset(video.music) ? (
        <Html5Audio src={assetSrc(video.music)} volume={musicVolume} loop />
      ) : null}
      {timeline
        .filter((t) => t.vo)
        .map((t) => (
          <Sequence key={t.index} from={t.vo!.start} name={`VO ${t.index + 1}`} layout="none">
            <Html5Audio src={assetSrc(t.vo!.src)} />
          </Sequence>
        ))}
    </>
  );
};
