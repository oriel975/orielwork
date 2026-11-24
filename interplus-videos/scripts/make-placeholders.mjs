// Generates stand-in "photos" for the style test (assets/placeholders/*.jpg):
// drawn substation scenes, so camera moves, grading and type can be judged
// before real photography arrives. Real assets replace them per video JSON.
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'placeholders');
const W = 3200;
const H = 1800;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function tower(x, gy, h, stroke, sw) {
  const w = h * 0.34;
  const parts = [];
  const lx0 = x - w / 2, rx0 = x + w / 2, lx1 = x - w * 0.1, rx1 = x + w * 0.1, ty = gy - h * 0.86;
  parts.push(`M${lx0} ${gy} L${lx1} ${ty} L${x} ${gy - h} L${rx1} ${ty} L${rx0} ${gy}`);
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const a = i / steps, b = (i + 1) / steps;
    const ya = gy - (gy - ty) * a, yb = gy - (gy - ty) * b;
    const la = lx0 + (lx1 - lx0) * a, ra = rx0 + (rx1 - rx0) * a;
    const lb = lx0 + (lx1 - lx0) * b, rb = rx0 + (rx1 - rx0) * b;
    parts.push(`M${la} ${ya} L${rb} ${yb} M${ra} ${ya} L${lb} ${yb} M${la} ${ya} L${ra} ${ya}`);
  }
  const arms = [];
  [[0.64, 1.5], [0.76, 1.25], [0.88, 1.0]].forEach(([k, s]) => {
    const y = gy - h * k;
    const half = (w * s) / 2 + w * 0.3;
    parts.push(`M${x - half} ${y} L${x + half} ${y} M${x - half} ${y} L${x - w * 0.12} ${y - h * 0.04} M${x + half} ${y} L${x + w * 0.12} ${y - h * 0.04}`);
    parts.push(`M${x - half} ${y} L${x - half} ${y + h * 0.05} M${x + half} ${y} L${x + half} ${y + h * 0.05}`);
    arms.push([x - half, y + h * 0.05], [x + half, y + h * 0.05]);
  });
  return {d: `<path d="${parts.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`, arms};
}

function wires(a, b, sag, stroke, sw, opacity = 1) {
  return a
    .map((p, i) => {
      const q = b[i];
      if (!q) return '';
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2 + sag;
      return `<path d="M${p[0]} ${p[1]} Q${mx} ${my} ${q[0]} ${q[1]}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
    })
    .join('');
}

function gantry(x, gy, w, h, stroke, sw) {
  const cw = w * 0.05;
  let d = '';
  for (const cx of [x, x + w - cw]) {
    d += `M${cx} ${gy} L${cx} ${gy - h} M${cx + cw} ${gy} L${cx + cw} ${gy - h}`;
    for (let y = gy; y > gy - h; y -= cw * 1.2) d += ` M${cx} ${y} L${cx + cw} ${y - cw * 1.2}`;
  }
  d += ` M${x} ${gy - h} L${x + w} ${gy - h} M${x} ${gy - h + cw} L${x + w} ${gy - h + cw}`;
  for (let bx = x; bx < x + w; bx += cw * 1.4) d += ` M${bx} ${gy - h + cw} L${bx + cw * 1.4} ${gy - h}`;
  for (let k = 1; k <= 3; k++) {
    const ix = x + (w * k) / 4;
    d += ` M${ix} ${gy - h + cw} L${ix} ${gy - h + cw + h * 0.14}`;
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function equipment(x, gy, s, fill) {
  // Transformer: tank, radiator fins, three bushings.
  let g = `<rect x="${x}" y="${gy - s * 0.55}" width="${s}" height="${s * 0.55}" fill="${fill}"/>`;
  for (let i = 0; i < 7; i++) g += `<rect x="${x - s * 0.22 + i * 0}" y="${gy - s * 0.5 + i * s * 0.065}" width="${s * 0.2}" height="${s * 0.04}" fill="${fill}"/>`;
  for (let i = 0; i < 3; i++) g += `<rect x="${x + s * (0.2 + i * 0.28)}" y="${gy - s * 0.95}" width="${s * 0.05}" height="${s * 0.42}" fill="${fill}"/>`;
  return g;
}

const grain = (o) => `
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix type="saturate" values="0"/></filter>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="${o}"/>`;

function landscape({sky, sun, ground, stroke, lamps}) {
  seed = 11;
  const gy = H * 0.7;
  let towers = '';
  let wiresSvg = '';
  const chain = [
    [W * 0.96, gy + 40, 980],
    [W * 0.7, gy + 6, 640],
    [W * 0.52, gy - 8, 420],
    [W * 0.4, gy - 14, 290],
    [W * 0.32, gy - 18, 200],
  ];
  let prev = null;
  chain.forEach(([x, y, h], i) => {
    const t = tower(x, y, h, stroke, Math.max(2, 9 - i * 1.6));
    towers += t.d;
    if (prev) wiresSvg += wires(prev, t.arms, 60 - i * 8, stroke, Math.max(1.2, 3.5 - i * 0.5), 0.85);
    prev = t.arms;
  });
  let yard = '';
  for (let i = 0; i < 4; i++) yard += gantry(W * (0.04 + i * 0.075), gy + 30, W * 0.07, 330 - i * 20, stroke, 5);
  yard += equipment(W * 0.12, gy + 60, 220, ground);
  yard += equipment(W * 0.24, gy + 50, 170, ground);
  let lampSvg = '';
  if (lamps) {
    for (let i = 0; i < 26; i++) {
      const x = W * (0.02 + rnd() * 0.36), y = gy - 40 - rnd() * 300, r = 30 + rnd() * 70;
      lampSvg += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#lamp)"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>
    <radialGradient id="sun" cx="${sun.x}" cy="${sun.y}" r="${sun.r}">${sun.stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ground}"/><stop offset="1" stop-color="#020509"/></linearGradient>
    <radialGradient id="lamp"><stop offset="0" stop-color="#FFE1A8" stop-opacity="0.95"/><stop offset="0.12" stop-color="#FFB547" stop-opacity="0.55"/><stop offset="1" stop-color="#FF9A2E" stop-opacity="0"/></radialGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.7" stop-color="${sky[sky.length - 1][1]}" stop-opacity="0.35"/><stop offset="0.8" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>
  <rect width="${W}" height="${H}" fill="url(#haze)"/>
  ${wiresSvg}${towers}${yard}
  <path d="M0 ${gy + 20} Q ${W * 0.3} ${gy - 10} ${W * 0.6} ${gy + 8} T ${W} ${gy} L ${W} ${H} L 0 ${H} Z" fill="url(#ground)"/>
  ${lampSvg}
  ${grain(0.05)}
</svg>`;
}

function blueprint() {
  const g = [];
  for (let x = 0; x <= W; x += 80) g.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#5FA8FF" stroke-opacity="${x % 400 === 0 ? 0.22 : 0.08}" stroke-width="2"/>`);
  for (let y = 0; y <= H; y += 80) g.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#5FA8FF" stroke-opacity="${y % 400 === 0 ? 0.22 : 0.08}" stroke-width="2"/>`);
  const s = '#DCEBFF';
  let d = '';
  // Two busbars, five bays with breaker, disconnectors and a transformer.
  d += `<line x1="400" y1="420" x2="2800" y2="420" stroke="${s}" stroke-width="9"/><line x1="400" y1="500" x2="2800" y2="500" stroke="${s}" stroke-width="9"/>`;
  for (let i = 0; i < 5; i++) {
    const x = 640 + i * 480;
    d += `<line x1="${x}" y1="420" x2="${x}" y2="1260" stroke="${s}" stroke-width="5"/>`;
    d += `<rect x="${x - 45}" y="620" width="90" height="90" fill="#0B2A52" stroke="${s}" stroke-width="5"/>`;
    d += `<line x1="${x - 40}" y1="800" x2="${x + 30}" y2="860" stroke="${s}" stroke-width="5"/>`;
    d += `<circle cx="${x}" cy="1020" r="70" fill="none" stroke="${s}" stroke-width="5"/><circle cx="${x}" cy="1110" r="70" fill="none" stroke="${s}" stroke-width="5"/>`;
    d += `<text x="${x + 90}" y="680" font-family="DejaVu Sans Mono, monospace" font-size="40" fill="${s}" fill-opacity="0.8">CB-${i + 1}</text>`;
    d += `<text x="${x + 100}" y="1080" font-family="DejaVu Sans Mono, monospace" font-size="40" fill="${s}" fill-opacity="0.8">T${i + 1}</text>`;
  }
  d += `<text x="400" y="360" font-family="DejaVu Sans Mono, monospace" font-size="56" fill="#FFB020">161 kV  BUS A / BUS B</text>`;
  d += `<rect x="2340" y="1440" width="700" height="240" fill="none" stroke="${s}" stroke-opacity="0.6" stroke-width="4"/>`;
  d += `<text x="2370" y="1520" font-family="DejaVu Sans Mono, monospace" font-size="38" fill="${s}" fill-opacity="0.7">SINGLE LINE DIAGRAM</text>`;
  d += `<text x="2370" y="1590" font-family="DejaVu Sans Mono, monospace" font-size="32" fill="${s}" fill-opacity="0.5">PLACEHOLDER  REV 0</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="bg" cx="0.45" cy="0.4" r="0.8"><stop offset="0" stop-color="#123A6B"/><stop offset="1" stop-color="#06162C"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>${g.join('')}${d}${grain(0.06)}</svg>`;
}

const scenes = {
  'substation-sunset': landscape({
    sky: [[0, '#0B1F3A'], [0.35, '#2B2D55'], [0.55, '#7A3E55'], [0.66, '#E2703A'], [0.71, '#FFB45E']],
    sun: {x: 0.62, y: 0.66, r: 0.5, stops: [[0, '#FFF1C9', 1], [0.06, '#FFC46B', 0.85], [0.25, '#FF8A3D', 0.35], [1, '#FF8A3D', 0]]},
    ground: '#0A0F18',
    stroke: '#070B12',
  }),
  'substation-night': landscape({
    sky: [[0, '#02060D'], [0.5, '#071A33'], [0.7, '#123A63']],
    sun: {x: 0.2, y: 0.7, r: 0.6, stops: [[0, '#FFB547', 0.35], [0.4, '#FF9A2E', 0.08], [1, '#FF9A2E', 0]]},
    ground: '#05080E',
    stroke: '#0E1C2E',
    lamps: true,
  }),
  'engineering-plan': blueprint(),
};

await mkdir(out, {recursive: true});
for (const [name, svg] of Object.entries(scenes)) {
  const file = join(out, `${name}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({quality: 86, mozjpeg: true}).toFile(file);
  console.log('wrote', file);
}
