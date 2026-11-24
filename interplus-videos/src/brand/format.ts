import {useVideoConfig} from 'remotion';

export type FormatId = '16x9' | '9x16' | '1x1';

export const FORMATS: Record<FormatId, {width: number; height: number; label: string}> = {
  '16x9': {width: 1920, height: 1080, label: 'LinkedIn / YouTube / website'},
  '9x16': {width: 1080, height: 1920, label: 'Reels / TikTok / Shorts'},
  '1x1': {width: 1080, height: 1080, label: 'Feed'},
};

export type Orientation = 'landscape' | 'portrait' | 'square';

export type Safe = {top: number; right: number; bottom: number; left: number};

export type FormatInfo = {
  orientation: Orientation;
  width: number;
  height: number;
  /** 1 unit = 1px on a 1080px short side. Multiply token values by u. */
  u: number;
  /** Area kept free of platform UI. Text and logos stay inside it. */
  safe: Safe;
};

/**
 * Safe areas. 9:16 keeps clear of the Reels/TikTok chrome: account name and
 * caption at the bottom, the like/comment/share column on the right, the
 * status/header strip at the top.
 */
export const useFormat = (): FormatInfo => {
  const {width, height} = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  if (height > width) {
    return {
      orientation: 'portrait',
      width,
      height,
      u,
      safe: {top: 250 * u, right: 150 * u, bottom: 420 * u, left: 80 * u},
    };
  }
  if (width > height) {
    return {
      orientation: 'landscape',
      width,
      height,
      u,
      safe: {top: 90 * u, right: 130 * u, bottom: 90 * u, left: 130 * u},
    };
  }
  return {
    orientation: 'square',
    width,
    height,
    u,
    safe: {top: 90 * u, right: 90 * u, bottom: 110 * u, left: 90 * u},
  };
};
