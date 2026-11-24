import {dur} from '../brand/easing';
import {audioDuration, resolveVo} from './assets';
import type {Scene, Transition, VideoSpec} from './schema';

export type TimedScene = {
  scene: Scene;
  index: number;
  /** Frame where the scene officially starts (the script's timecode). */
  start: number;
  /** Scene length in frames, by the script. */
  length: number;
  /** How it enters, and over how many frames (centred on `start`). */
  transition: Transition;
  transitionFrames: number;
  /** Sequence window actually rendered, including transition overlaps. */
  from: number;
  span: number;
  vo?: {src: string; start: number; frames: number | null};
  voText?: {start: number; end: number; text: string};
};

export const secondsToFrames = (s: number, fps: number) => Math.round(s * fps);

export const totalFrames = (video: VideoSpec, fps: number) =>
  Math.max(1, video.scenes.reduce((a, s) => a + secondsToFrames(s.duration, fps), 0));

export const buildTimeline = (video: VideoSpec, fps: number): TimedScene[] => {
  const total = totalFrames(video, fps);
  let cursor = 0;
  const base = video.scenes.map((scene, index) => {
    const length = secondsToFrames(scene.duration, fps);
    const transition: Transition = index === 0 ? 'fade' : (scene.transition ?? 'energy');
    const transitionFrames =
      transition === 'cut' ? 0 : index === 0 ? dur.base : Math.min(dur.transition, Math.floor(length / 2));
    const start = cursor;
    cursor += length;
    return {scene, index, start, length, transition, transitionFrames};
  });

  return base.map((b, i) => {
    const next = base[i + 1];
    const lead = i === 0 ? 0 : Math.floor(b.transitionFrames / 2);
    const tail = next ? Math.ceil(next.transitionFrames / 2) : 0;
    const from = Math.max(0, b.start - lead);
    const span = Math.min(total - from, b.length + lead + tail);

    const timed: TimedScene = {...b, from, span};
    const voDelay = secondsToFrames(b.scene.voDelay ?? 0.35, fps);
    const voPath = resolveVo(video, b.scene, b.index);
    if (voPath) {
      const d = audioDuration(voPath);
      timed.vo = {src: voPath, start: b.start + voDelay, frames: d ? Math.round(d * fps) : null};
    }
    if (b.scene.vo) {
      const start = b.start + voDelay;
      const spoken = timed.vo?.frames ?? null;
      // Without a recording, spread the line over the scene, leaving a beat at the end.
      const end = spoken ? start + spoken : b.start + b.length - Math.round(fps * 0.4);
      timed.voText = {start, end: Math.max(start + fps, end), text: b.scene.vo};
    }
    return timed;
  });
};
