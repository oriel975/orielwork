import type {TimedScene} from '../engine/timeline';
import type {VideoSpec} from '../engine/schema';

export type SceneProps = {
  ts: TimedScene;
  video: VideoSpec;
  logo?: string;
  /** Frames from the start of the rendered window to the scene's official start. */
  lead: number;
  /** Whether burned-in captions are showing in this scene (keeps layouts clear of them). */
  captioned: boolean;
};

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
