// Render videos from src/videos/*.json in every format into out/<company>/.
//
//   npm run render -- installations-brand            one video, all its formats
//   npm run render -- installations-brand --formats=9x16
//   npm run render -- --company=ev                    every video of a company
//   npm run render:all                                everything
//   npm run render -- style-test --stills             review stills instead of video
//   npm run render -- style-test --stills --frames=30,90  stills at chosen frames
//
// Also writes out/<company>/<id>-missing.md listing assets still to supply.
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {existsSync} from 'node:fs';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}`));
const flagValue = (name) => flag(name)?.split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const ALL_FORMATS = ['16x9', '9x16', '1x1'];
const wantFormats = flagValue('formats')?.split(',');
const stills = Boolean(flag('stills'));

const browserExecutable = [process.env.REMOTION_BROWSER, '/opt/pw-browsers/chromium_headless_shell'].find(
  (p) => p && existsSync(p),
);

await import('./build-manifest.mjs');

const videosDir = join(root, 'src', 'videos');
const videos = [];
for (const f of (await readdir(videosDir)).filter((f) => f.endsWith('.json')).sort()) {
  videos.push(JSON.parse(await readFile(join(videosDir, f), 'utf8')));
}

const company = flagValue('company');
const selected = videos.filter((v) =>
  flag('all') ? true : company ? v.company === company : ids.includes(v.id),
);
if (!selected.length) {
  console.error(`Nothing to render. Videos: ${videos.map((v) => v.id).join(', ')}`);
  process.exit(1);
}

const voPaths = (v, s, i) =>
  s.voFile ? [s.voFile] : ['mp3', 'wav', 'm4a'].map((e) => `${v.company}/vo/${v.id}-${String(i + 1).padStart(2, '0')}.${e}`);

function missingReport(v) {
  const rows = [];
  const check = (scene, path, what) => {
    if (path && !existsSync(join(assetsDir, path))) rows.push({scene, path, what: what ?? ''});
  };
  v.scenes.forEach((s, i) => {
    const n = i + 1;
    if (['title', 'image', 'logo', 'video'].includes(s.type) && !s.asset) rows.push({scene: n, path: '(none set)', what: s.visual ?? s.type});
    check(n, s.asset, s.visual);
    check(n, s.foreground, 'foreground cut-out');
    s.shots?.forEach((sh) => (sh.asset ? check(n, sh.asset, sh.visual) : rows.push({scene: n, path: '(none set)', what: sh.visual ?? sh.caption ?? 'shot'})));
    s.cards?.forEach((c) => (c.asset ? check(n, c.asset, c.visual ?? c.title) : rows.push({scene: n, path: '(none set)', what: `card: ${c.title}`})));
    check(n, s.before?.asset, s.before?.visual);
    check(n, s.after?.asset, s.after?.visual);
    if (s.vo && !voPaths(v, s, i).some((p) => existsSync(join(assetsDir, p)))) {
      rows.push({scene: n, path: voPaths(v, s, i)[0], what: `voiceover: "${s.vo}"`});
    }
  });
  if (v.music && !existsSync(join(assetsDir, v.music))) rows.push({scene: '-', path: v.music, what: 'licensed music track'});
  const logoCandidates = v.logo
    ? [v.logo]
    : ['svg', 'png', 'webp'].flatMap((e) => [`logos/${v.company}.${e}`, `logos/interplus.${e}`]);
  if (!logoCandidates.some((p) => existsSync(join(assetsDir, p)))) {
    rows.push({scene: '-', path: logoCandidates[0], what: 'logo (SVG or transparent PNG); a text wordmark is used until then'});
  }
  return rows;
}

console.log('Bundling…');
const serveUrl = await bundle({
  entryPoint: join(root, 'src', 'index.ts'),
  publicDir: assetsDir,
});

for (const v of selected) {
  const outDir = join(root, 'out', v.company);
  await mkdir(outDir, {recursive: true});
  const formats = (v.formats ?? ALL_FORMATS).filter((f) => !wantFormats || wantFormats.includes(f));
  for (const f of formats) {
    const id = `${v.id}-${f}`;
    const composition = await selectComposition({serveUrl, id, browserExecutable});
    if (stills) {
      await mkdir(join(outDir, 'stills'), {recursive: true});
      const n = 8;
      const frames = flagValue('frames')
        ? flagValue('frames').split(',').map(Number)
        : Array.from({length: n}, (_, k) => Math.round(((k + 0.5) / n) * (composition.durationInFrames - 1)));
      for (const frame of frames) {
        const output = join(outDir, 'stills', `${id}-${String(frame).padStart(4, '0')}.jpg`);
        await renderStill({composition, serveUrl, output, frame, imageFormat: 'jpeg', jpegQuality: 90, browserExecutable});
      }
      console.log(`stills → out/${v.company}/stills/${id}-*.jpg`);
      continue;
    }
    const output = join(outDir, `${id}.mp4`);
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: output,
      crf: 18,
      pixelFormat: 'yuv420p',
      imageFormat: 'jpeg',
      jpegQuality: 92,
      browserExecutable,
      onProgress: ({progress}) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct !== last) {
          last = pct;
          process.stdout.write(`\r${id}: ${pct}%   `);
        }
      },
    });
    console.log(`\r${id} → out/${v.company}/${id}.mp4`);
  }

  const missing = missingReport(v);
  const md = [
    `# Missing assets: ${v.title ?? v.id}`,
    '',
    missing.length ? '| Scene | Path under assets/ | What it should be |\n| --- | --- | --- |' : 'Nothing missing.',
    ...missing.map((m) => `| ${m.scene} | \`${m.path}\` | ${m.what.replace(/\|/g, '\\|')} |`),
    '',
  ].join('\n');
  await writeFile(join(outDir, `${v.id}-missing.md`), md);
  if (missing.length) {
    console.log(`\n${v.id}: ${missing.length} asset(s) still missing (out/${v.company}/${v.id}-missing.md):`);
    for (const m of missing) console.log(`  scene ${m.scene}: ${m.path}  ${m.what}`);
  }
}
