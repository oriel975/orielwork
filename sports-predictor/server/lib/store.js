// Tiny JSON-file store (bets, prediction log, settings). Writes are atomic.
import fs from 'node:fs';
import path from 'node:path';

export function jsonStore(file, fallback) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = structuredClone(fallback); }
  let timer = null;
  const flush = () => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, file);
  };
  return {
    get: () => data,
    set(next) { data = next; this.save(); },
    save() { clearTimeout(timer); timer = setTimeout(flush, 300); },
    flushNow: flush,
  };
}
