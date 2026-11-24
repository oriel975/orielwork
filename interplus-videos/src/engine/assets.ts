import {staticFile} from 'remotion';
import manifest from '../generated/assets.json';
import type {Scene, VideoSpec} from './schema';

type Entry = {kind: 'image' | 'video' | 'audio'; bytes: number; duration?: number | null; width?: number; height?: number};
const files = (manifest as unknown as {files: Record<string, Entry>}).files;

export const hasAsset = (path: string | undefined): path is string => Boolean(path && files[path]);

export const assetSrc = (path: string) => staticFile(path);

export const assetKind = (path: string) => files[path]?.kind;

/** Width / height of an image, if known. */
export const assetAspect = (path: string): number | null => {
  const e = files[path];
  return e?.width && e?.height ? e.width / e.height : null;
};

export const audioDuration = (path: string): number | null => files[path]?.duration ?? null;

const firstExisting = (candidates: string[]) => candidates.find((c) => hasAsset(c));

export const resolveLogo = (video: VideoSpec): string | undefined => {
  if (video.logo) return hasAsset(video.logo) ? video.logo : undefined;
  return firstExisting(
    ['svg', 'png', 'webp'].flatMap((ext) => [`logos/${video.company}.${ext}`, `logos/interplus.${ext}`]),
  );
};

export const voCandidates = (video: VideoSpec, scene: Scene, index: number): string[] => {
  if (scene.voFile) return [scene.voFile];
  const nn = String(index + 1).padStart(2, '0');
  return ['mp3', 'wav', 'm4a'].map((ext) => `${video.company}/vo/${video.id}-${nn}.${ext}`);
};

export const resolveVo = (video: VideoSpec, scene: Scene, index: number): string | undefined =>
  firstExisting(voCandidates(video, scene, index));
