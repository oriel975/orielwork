import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Heebo (300 / 500 / 800), Hebrew + Latin subsets, served from assets/fonts.
// The files come from @fontsource/heebo and are copied there by
// scripts/build-manifest.mjs, so a render never needs network access.
const FAMILY = 'Heebo';

const RANGES = {
  hebrew: 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
} as const;

const loads: Promise<void>[] = [];
for (const subset of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
  for (const weight of ['300', '500', '800']) {
    loads.push(
      loadFont({
        family: FAMILY,
        url: staticFile(`fonts/heebo-${subset}-${weight}-normal.woff2`),
        weight,
        unicodeRange: RANGES[subset],
        format: 'woff2',
      }),
    );
  }
}

export const fontFamily = `${FAMILY}, "Arial Hebrew", Arial, sans-serif`;
export const waitForFonts = () => Promise.all(loads);
