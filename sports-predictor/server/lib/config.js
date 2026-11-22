// Loads .env (no dependency) and exposes runtime configuration.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  // When set, every page and API call asks for this password (HTTP Basic Auth).
  password: process.env.APP_PASSWORD || '',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  keys: {
    oddsApi: process.env.ODDS_API_KEY || '',
    apiFootball: process.env.APIFOOTBALL_KEY || '',
    tsdb: process.env.THESPORTSDB_KEY || '123',
  },
  // Model weight when blending with the de-vigged market (0..1).
  modelWeight: Number(process.env.MODEL_WEIGHT || 0.3),
};
