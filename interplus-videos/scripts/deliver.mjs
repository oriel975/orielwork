// Package rendered videos for hand-off: a cover image per video and out/README.md.
//
//   npm run deliver
//
// For every out/<company>/<id>-<format>.mp4 it grabs a cover frame (once the
// opening headline has landed) into out/<company>/covers/<id>-<format>.jpg, then
// writes out/README.md: a Hebrew index of the files, their length and where each
// format belongs. A video can set "cover": <seconds> in its JSON to pick the frame.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');
const videosDir = join(root, 'src', 'videos');

const COMPANY = {
  installations: 'אינטר אלקטריק התקנות',
  ev: 'אינטר EV',
  enerlec: 'אינטר אנרלק',
};
const FORMAT = {
  '16x9': {name: '16:9 רוחבי', where: 'יוטיוב, אתר החברה, לינקדאין, מצגות'},
  '9x16': {name: '9:16 אנכי', where: 'רילס באינסטגרם ובפייסבוק, טיקטוק, יוטיוב שורטס, סטוריז'},
  '1x1': {name: '1:1 ריבועי', where: 'פיד פייסבוק, אינסטגרם ולינקדאין'},
};

const probe = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
  return Number(r.stdout.trim()) || 0;
};

const videos = [];
for (const f of (await readdir(videosDir)).filter((f) => f.endsWith('.json')).sort()) {
  const v = JSON.parse(await readFile(join(videosDir, f), 'utf8'));
  if (v.id !== 'style-test') videos.push(v);
}

const rows = [];
for (const v of videos) {
  const headline = v.scenes.find((s) => s.text)?.text ?? v.title ?? v.id;
  const kind = v.id.includes('-brand') ? 'סרטון תדמית' : 'רילס';
  const first = v.scenes[0];
  const coverAt = v.cover ?? Math.max(0.5, Math.min(first.duration - 0.6, 2.8));
  for (const f of v.formats ?? ['16x9', '9x16', '1x1']) {
    const name = `${v.id}-${f}`;
    const mp4 = join(outDir, v.company, `${name}.mp4`);
    if (!existsSync(mp4)) continue;
    await mkdir(join(outDir, v.company, 'covers'), {recursive: true});
    const cover = join(outDir, v.company, 'covers', `${name}.jpg`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(coverAt), '-i', mp4, '-frames:v', '1', '-q:v', '2', cover]);
    rows.push({v, f, name, kind, headline, seconds: probe(mp4)});
  }
}

const md = [
  '# סרטוני אינטר פלוס',
  '',
  'כל הסרטונים כוללים קריינות בעברית, מוזיקה מקורית וכתוביות צרובות (לצפייה בלי קול).',
  'עוצמת השמע מנורמלת ל־‎-14 LUFS, הרמה שרשתות חברתיות מנגנות בה.',
  'לכל סרטון יש תמונת שער בתיקייה `covers/` שליד הקובץ, להעלאה כ־thumbnail.',
  '',
  ...Object.entries(COMPANY).flatMap(([company, label]) => {
    const list = rows.filter((r) => r.v.company === company);
    if (!list.length) return [];
    return [
      `## ${label}`,
      '',
      '| קובץ | סוג | פתיח | פורמט | אורך |',
      '| --- | --- | --- | --- | --- |',
      ...list.map((r) => `| \`${r.v.company}/${r.name}.mp4\` | ${r.kind} | ${r.headline} | ${FORMAT[r.f].name} | ${Math.round(r.seconds)} שנ׳ |`),
      '',
    ];
  }),
  '## איפה להעלות כל פורמט',
  '',
  ...Object.values(FORMAT).map((x) => `- **${x.name}**: ${x.where}`),
  '',
  '## הקריינות',
  '',
  'הקריינות נוצרה בבינה מלאכותית (Chatterbox, עם סימן מים דיגיטלי בלתי נשמע).',
  'כדי להחליף בקריין אמיתי: מקליטים כל משפט לקובץ באותו שם בתיקייה `assets/<חברה>/vo/` ומריצים `npm run render:all` ואז `npm run deliver`.',
  'שמות הקבצים והטקסט של כל משפט נמצאים בקבצי `src/videos/*.json` (שדה `vo`).',
  '',
].join('\n');
await writeFile(join(outDir, 'README.md'), md);
console.log(`covers + out/README.md for ${rows.length} videos`);
