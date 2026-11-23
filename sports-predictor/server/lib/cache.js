// TTL cache with in-flight de-duplication and stale-on-error fallback.
// Optional disk persistence for slow-changing data (season histories).
import fs from 'node:fs';
import path from 'node:path';

export function createCache({ dir } = {}) {
  const store = new Map();
  const inflight = new Map();
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const file = (key) => path.join(dir, key.replace(/[^a-z0-9._-]+/gi, '_') + '.json');

  // swr (stale-while-revalidate): an expired value is returned at once while a
  // refresh runs in the background, so slow sources never block a response.
  async function wrap(key, ttlMs, fn, { persist = false, ttlFn, swr = false } = {}) {
    const now = Date.now();
    let hit = store.get(key);
    if (!hit && persist && dir) {
      try {
        const disk = JSON.parse(fs.readFileSync(file(key), 'utf8'));
        hit = { value: disk.value, exp: disk.exp };
        store.set(key, hit);
      } catch { /* no disk copy */ }
    }
    if (hit && hit.exp > now) return hit.value;
    if (inflight.has(key)) return hit && swr ? hit.value : inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        const entry = { value, exp: Date.now() + (ttlFn ? ttlFn(value) : ttlMs) };
        store.set(key, entry);
        if (persist && dir) fs.writeFile(file(key), JSON.stringify(entry), () => {});
        return value;
      } catch (e) {
        if (hit) return hit.value; // serve stale rather than fail
        throw e;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    if (hit && swr) { p.catch(() => {}); return hit.value; }
    return p;
  }

  const peek = (key) => store.get(key)?.value;
  return { wrap, peek, clear: () => store.clear(), size: () => store.size };
}
