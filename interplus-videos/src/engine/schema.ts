import type {FormatId} from '../brand/format';

/**
 * A video is one JSON file in src/videos/. Durations are in seconds; asset
 * paths are relative to assets/ (e.g. "installations/drone-sunset.jpg").
 * Any asset that is not on disk renders as an animated placeholder showing its
 * `visual` description, and is listed by the render script.
 */

export type SceneType =
  | 'title' // full-bleed image + kinetic headline
  | 'image' // full-bleed image, optional small headline
  | 'montage' // several fast shots with energy-line cuts
  | 'projects' // project cards
  | 'stat' // one or more counting numbers
  | 'logo' // logo reveal over an image
  | 'outro' // logo assembled from energy lines + tagline
  | 'video' // a video clip (e.g. interview) with optional lower third
  | 'beforeAfter'; // wipe between two images

export type Transition = 'energy' | 'fade' | 'cut';

/** Colour treatment of the scene's imagery. */
export type Grade = 'neutral' | 'warm' | 'cool' | 'night' | 'thermal';

/** Camera move for a still. */
export type Move = 'in' | 'out' | 'left' | 'right' | 'up' | 'down';

export type Shot = {
  asset?: string;
  /** What the picture should show. Used on placeholders and in the missing-assets list. */
  visual?: string;
  /** Short on-screen label for this shot (montage stages). */
  caption?: string;
  /** Focal point in percent [x, y]; keeps the subject in frame when 9:16 crops a wide photo. */
  focus?: [number, number];
  move?: Move;
  grade?: Grade;
};

export type Card = {
  title: string;
  line?: string;
  asset?: string;
  visual?: string;
  focus?: [number, number];
};

export type Stat = {
  value: number;
  unit?: string;
  label: string;
  prefix?: string;
  decimals?: number;
};

export type Scene = {
  type: SceneType;
  duration: number;
  /** On-screen headline, exactly as it should appear. */
  text?: string;
  subtitle?: string;
  asset?: string;
  visual?: string;
  focus?: [number, number];
  move?: Move;
  grade?: Grade;
  /** Optional transparent PNG cut-out laid over `asset` for real foreground depth. */
  foreground?: string;
  /** Voiceover line. Also burned in as captions unless captions are off. */
  vo?: string;
  /** Voiceover audio. Default: <company>/vo/<video id>-<NN>.mp3|wav|m4a (NN = scene number). */
  voFile?: string;
  /** Seconds after the scene starts before the voiceover begins. Default 0.35. */
  voDelay?: number;
  captions?: boolean;
  shots?: Shot[];
  cards?: Card[];
  stats?: Stat[];
  before?: Shot;
  after?: Shot;
  lowerThird?: {name: string; role: string};
  tagline?: string;
  url?: string;
  /** How this scene enters. Default "energy"; the first scene always fades in. */
  transition?: Transition;
};

export type VideoSpec = {
  id: string;
  /** Folder under assets/ and out/: installations, ev, enerlec, systems, b, group. */
  company: string;
  title?: string;
  /** Wordmark used when no logo file is found. */
  brandName?: string;
  /** Logo path. Default: logos/<company>.svg|png, then logos/interplus.svg|png. */
  logo?: string;
  music?: string;
  /** Music level with no voiceover (0..1). Default 0.55. */
  musicVolume?: number;
  /** Music level under voiceover (0..1). Default 0.14 (about -12 dB under the bed). */
  duckedVolume?: number;
  captions?: boolean;
  formats?: FormatId[];
  scenes: Scene[];
};
