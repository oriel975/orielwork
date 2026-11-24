// Scans assets/ and writes src/generated/assets.json so compositions know which
// files really exist (missing ones render as an animated placeholder) and how
// long each voiceover file is (used for caption timing and music ducking).
import {copyFile, readdir, stat, writeFile, mkdir} from 'node:fs/promises';
import {join, relative, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');
const outFile = join(root, 'src', 'generated', 'assets.json');

const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg', '.avif']);
const VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v']);

async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, {withFileTypes: true});
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function audioDuration(file) {
  try {
    const {Input, FilePathSource, ALL_FORMATS} = await import('mediabunny');
    const input = new Input({source: new FilePathSource(file), formats: ALL_FORMATS});
    const d = await input.computeDuration();
    input.dispose?.();
    return Number.isFinite(d) ? Math.round(d * 1000) / 1000 : null;
  } catch {
    return null;
  }
}

// Heebo is served from assets/fonts (copied from @fontsource/heebo), so renders
// never depend on reaching Google Fonts.
const fontsDir = join(assetsDir, 'fonts');
await mkdir(fontsDir, {recursive: true});
for (const subset of ['hebrew', 'latin']) {
  for (const w of [300, 500, 800]) {
    const name = `heebo-${subset}-${w}-normal.woff2`;
    await copyFile(join(root, 'node_modules', '@fontsource', 'heebo', 'files', name), join(fontsDir, name));
  }
}

const files = await walk(assetsDir);
const manifest = {generatedAt: new Date().toISOString(), files: {}};
for (const f of files.sort()) {
  const rel = relative(assetsDir, f).split('\\').join('/');
  const ext = extname(f).toLowerCase();
  const kind = AUDIO.has(ext) ? 'audio' : IMAGE.has(ext) ? 'image' : VIDEO.has(ext) ? 'video' : 'other';
  if (kind === 'other') continue;
  const entry = {kind, bytes: (await stat(f)).size};
  if (kind === 'audio') entry.duration = await audioDuration(f);
  manifest.files[rel] = entry;
}

await mkdir(dirname(outFile), {recursive: true});
await writeFile(outFile, JSON.stringify(manifest, null, 2) + '\n');
const counts = Object.values(manifest.files).reduce((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {});
console.log(`assets manifest: ${Object.keys(manifest.files).length} files`, counts);
