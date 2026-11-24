import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fontFamily, useFormat, type FormatId} from '../brand';
import {Captions, EnergySweep, revealMask} from '../components';
import {ChargeBar, RunningClock} from '../components/Motifs';
import {SCENES} from '../scenes';
import {resolveLogo} from './assets';
import type {VideoSpec} from './schema';
import {Soundtrack} from './Soundtrack';
import {buildTimeline, type TimedScene} from './timeline';

export type VideoProps = {video: VideoSpec; format: FormatId};

/** Applies the scene's entrance: energy reveal, fade, or a hard cut. */
const Entrance: React.FC<{ts: TimedScene; children: React.ReactNode}> = ({ts, children}) => {
  const frame = useCurrentFrame();
  const {width, u} = useFormat();
  const T = ts.transitionFrames;
  if (!T) return <AbsoluteFill>{children}</AbsoluteFill>;
  if (ts.transition === 'fade') {
    return <AbsoluteFill style={{opacity: interpolate(frame, [0, T], [0, 1], {extrapolateRight: 'clamp'})}}>{children}</AbsoluteFill>;
  }
  return <AbsoluteFill style={revealMask(frame / T, width, u)}>{children}</AbsoluteFill>;
};

const SweepOverlay: React.FC<{frames: number; seed: string}> = ({frames, seed}) => {
  const frame = useCurrentFrame();
  return <EnergySweep progress={frame / frames} seed={seed} />;
};

const FadeOut: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const o = interpolate(frame, [durationInFrames - 10, durationInFrames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return o > 0 ? <AbsoluteFill style={{background: colors.ink, opacity: o}} /> : null;
};

/** Renders any video described by a JSON file in src/videos/. */
export const VideoFromJson: React.FC<VideoProps> = ({video}) => {
  const {fps} = useVideoConfig();
  const timeline = useMemo(() => buildTimeline(video, fps), [video, fps]);
  const logo = resolveLogo(video);
  const captionsOn = video.captions !== false;
  const cues = captionsOn
    ? timeline.filter((t) => t.voText && t.scene.captions !== false).map((t) => t.voText!)
    : [];

  return (
    <AbsoluteFill style={{background: colors.ink, direction: 'rtl', fontFamily}}>
      {timeline.map((ts) => {
        const Scene = SCENES[ts.scene.type];
        if (!Scene) throw new Error(`Unknown scene type "${ts.scene.type}" in ${video.id}, scene ${ts.index + 1}`);
        return (
          <Sequence key={ts.index} from={ts.from} durationInFrames={ts.span} name={`${ts.index + 1}. ${ts.scene.type}`}>
            <Entrance ts={ts}>
              <Scene
                ts={ts}
                video={video}
                logo={logo}
                lead={ts.start - ts.from}
                captioned={Boolean(captionsOn && ts.voText && ts.scene.captions !== false)}
              />
            </Entrance>
          </Sequence>
        );
      })}
      {timeline
        .filter((ts) => ts.index > 0 && ts.transition === 'energy' && ts.transitionFrames > 0)
        .map((ts) => (
          <Sequence key={`t${ts.index}`} from={ts.from} durationInFrames={ts.transitionFrames} name={`→ ${ts.index + 1}`} layout="none">
            <SweepOverlay frames={ts.transitionFrames} seed={`${video.id}-${ts.index}`} />
          </Sequence>
        ))}
      {video.clock
        ? (() => {
            const a = timeline[video.clock.fromScene - 1];
            const b = timeline[video.clock.toScene - 1];
            if (!a || !b) return null;
            const from = a.start;
            const to = b.start + b.length;
            return (
              <Sequence from={from} durationInFrames={to - from} name="clock" layout="none">
                <RunningClock start={video.clock.start} total={to - from} />
              </Sequence>
            );
          })()
        : null}
      {video.chargeBar ? (
        <ChargeBar fullAt={(timeline.find((t) => t.scene.type === 'outro') ?? timeline[timeline.length - 1]).start} />
      ) : null}
      <Captions cues={cues} />
      <FadeOut />
      <Soundtrack video={video} timeline={timeline} />
    </AbsoluteFill>
  );
};
