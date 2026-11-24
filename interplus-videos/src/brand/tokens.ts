import logoPalette from './logo-palette.json';

/**
 * Interplus design tokens. Base values come from the brief; once a real logo is
 * in assets/logos/, `npm run logo-colors` samples it and writes logo-palette.json,
 * which overrides `navy` (the logo's dark brand colour) and `blue` (its
 * saturated brand colour). Amber stays as the high-voltage accent.
 */
const base = {
  navy: '#0B1F3A',
  blue: '#1E88FF',
  amber: '#FFB020',
  white: '#FFFFFF',
} as const;

type Palette = {primary: string | null; accent: string | null};
const sampled = logoPalette as unknown as Palette;

/** '#RRGGBB' + alpha -> 'rgba(r,g,b,a)'. */
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const accent = sampled.accent ?? base.blue;

export const colors = {
  navy: sampled.primary ?? base.navy,
  /** Brand accent: the logo's green once sampled (named blue after the original brief). */
  blue: accent,
  amber: base.amber,
  white: base.white,
  // Derived tones, kept in one place so every scene uses the same values.
  navyDeep: '#06121F',
  ink: '#030A12',
  mist: 'rgba(255,255,255,0.72)',
  hairline: 'rgba(255,255,255,0.14)',
  glowBlue: alpha(accent, 0.55),
  glowAmber: 'rgba(255,176,32,0.55)',
} as const;

/** Spacing scale in "units"; multiply by `u` from useFormat() to get px. */
export const space = {
  xxs: 6,
  xs: 12,
  s: 20,
  m: 32,
  l: 56,
  xl: 88,
  xxl: 140,
} as const;

export const radius = {
  card: 22,
  pill: 999,
} as const;

/** Type scale in units (1 unit = 1px on a 1080px short side). */
export const type = {
  display: 104,
  headline: 76,
  title: 52,
  body: 36,
  caption: 40,
  label: 24,
  micro: 18,
} as const;

export const weights = {light: 300, medium: 500, heavy: 800} as const;

export const fps = 30;
