import React from 'react';
import {Composition, Folder} from 'remotion';
import {FORMATS, fps, type FormatId} from './brand';
import type {VideoSpec} from './engine/schema';
import {totalFrames} from './engine/timeline';
import {VideoFromJson} from './engine/VideoFromJson';

// Every JSON file in src/videos becomes a composition per format, e.g.
// "installations-brand-16x9". Adding a video means adding a JSON file.
const ctx = require.context('./videos', false, /\.json$/);
const videos: VideoSpec[] = ctx
  .keys()
  .map((k) => {
    const mod = ctx(k);
    return (mod.default ?? mod) as VideoSpec;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const ALL_FORMATS = Object.keys(FORMATS) as FormatId[];
const companies = [...new Set(videos.map((v) => v.company))];

export const Root: React.FC = () => (
  <>
    {companies.map((company) => (
      <Folder key={company} name={company}>
        {videos
          .filter((v) => v.company === company)
          .flatMap((v) =>
            (v.formats ?? ALL_FORMATS).map((f) => (
              <Composition
                key={`${v.id}-${f}`}
                id={`${v.id}-${f}`}
                component={VideoFromJson}
                durationInFrames={totalFrames(v, fps)}
                fps={fps}
                width={FORMATS[f].width}
                height={FORMATS[f].height}
                defaultProps={{video: v, format: f}}
              />
            )),
          )}
      </Folder>
    ))}
  </>
);
