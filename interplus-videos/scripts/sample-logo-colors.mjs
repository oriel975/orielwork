// Samples the real brand colours from the logo and writes src/brand/logo-palette.json,
// which src/brand/tokens.ts uses to override `navy` (dark brand colour) and `blue`
// (saturated brand colour).
//
//   npm run logo-colors                      uses assets/logos/interplus.svg|png|webp
//   npm run logo-colors -- assets/logos/ev.png
import sharp from 'sharp';
import {existsSync} from 'node:fs';
import {readdir, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logosDir = join(root, 'assets', 'logos');
const outFile = join(root, 'src', 'brand', 'logo-palette.json');

async function findLogo() {
  if (process.argv[2]) return resolve(process.argv[2]);
  for (const ext of ['svg', 'png', 'webp']) {
    const p = join(logosDir, `interplus.${ext}`);
    if (existsSync(p)) return p;
  }
  const any = (await readdir(logosDir).catch(() => [])).find((f) => /\.(svg|png|webp)$/i.test(f));
  return any ? join(logosDir, any) : null;
}

const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return {h: (h * 60 + 360) % 360, s, l};
}

const file = await findLogo();
if (!file) {
  console.error('No logo found. Put the logo in assets/logos/interplus.svg (or .png), or pass a path.');
  process.exit(1);
}

const {data, info} = await sharp(file, {density: 300})
  .resize(160, 160, {fit: 'inside'})
  .ensureAlpha()
  .raw()
  .toBuffer({resolveWithObject: true});

// Bucket opaque, coloured pixels by hue and lightness; ignore white, black and greys.
const buckets = new Map();
let counted = 0;
for (let i = 0; i < info.width * info.height; i++) {
  const o = i * 4;
  if (data[o + 3] < 200) continue;
  const rgb = [data[o], data[o + 1], data[o + 2]];
  const c = hsl(rgb);
  if (c.l > 0.93 || c.l < 0.04 || c.s < 0.18) continue;
  const key = `${Math.round(c.h / 20)}-${Math.round(c.l * 5)}`;
  const b = buckets.get(key) ?? {n: 0, sum: [0, 0, 0]};
  b.n++;
  b.sum = b.sum.map((v, k) => v + rgb[k]);
  buckets.set(key, b);
  counted++;
}

const swatches = [...buckets.values()]
  .map((b) => {
    const rgb = b.sum.map((v) => v / b.n);
    return {hex: toHex(rgb), share: b.n / Math.max(1, counted), ...hsl(rgb)};
  })
  .filter((s) => s.share > 0.02)
  .sort((a, b) => b.share - a.share);

if (!swatches.length) {
  console.error('The logo has no saturated colours (monochrome); keeping the base palette.');
  process.exit(0);
}

const dark = swatches.filter((s) => s.l < 0.38);
const vivid = swatches.filter((s) => s.l >= 0.3 && s.l <= 0.72 && s.s > 0.45);
const primary = (dark[0] ?? swatches[0]).hex;
const accent = (vivid.find((s) => s.hex !== primary) ?? null)?.hex ?? null;

const palette = {
  source: relative(root, file),
  note: 'Written by `npm run logo-colors`. primary overrides brand navy, accent overrides brand blue.',
  primary,
  accent,
  swatches: swatches.slice(0, 6).map((s) => ({hex: s.hex, share: Math.round(s.share * 1000) / 1000})),
};
await writeFile(outFile, JSON.stringify(palette, null, 2) + '\n');
console.log(`Logo palette from ${palette.source}: primary ${primary}, accent ${accent ?? '(none, keeping #1E88FF)'}`);
console.log('Swatches:', palette.swatches.map((s) => `${s.hex} ${(s.share * 100).toFixed(0)}%`).join(', '));
