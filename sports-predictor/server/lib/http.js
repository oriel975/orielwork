// Small fetch wrapper: timeout, retry on 5xx/429, JSON parsing, per-host pacing.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) SportEdge/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map();

export async function fetchJson(url, { headers = {}, timeout = 15000, retries = 2, minIntervalMs = 0, withHeaders = false } = {}) {
  const host = new URL(url).host;
  if (minIntervalMs) {
    const wait = (lastHit.get(host) || 0) + minIntervalMs - Date.now();
    lastHit.set(host, Date.now() + Math.max(0, wait));
    if (wait > 0) await sleep(wait);
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: ctrl.signal });
      if (res.ok) {
        const text = await res.text();
        try { const data = JSON.parse(text); return withHeaders ? { data, headers: res.headers } : data; } catch { throw Object.assign(new Error(`Invalid JSON from ${host}`), { status: 502 }); }
      }
      const err = Object.assign(new Error(`HTTP ${res.status} from ${host}`), { status: res.status, headers: res.headers });
      if (res.status < 500 && res.status !== 429) throw err;
      lastErr = err;
    } catch (e) {
      lastErr = e;
      if (e.status && e.status < 500 && e.status !== 429) throw e;
    } finally {
      clearTimeout(timer);
    }
    let backoff = 500 * (attempt + 1);
    if (lastErr?.status === 429) {
      const ra = Number(lastErr.headers?.get?.('retry-after'));
      backoff = Number.isFinite(ra) && ra > 0 ? Math.min(90, ra) * 1000 : 12000 * (attempt + 1);
      if (minIntervalMs) lastHit.set(host, Date.now() + backoff); // pause the whole host
    }
    if (attempt < retries) await sleep(backoff);
  }
  throw lastErr;
}

// Resolves with the promise's value, or with fallback() if it takes longer than ms.
// The timer is cleared as soon as the promise settles, so fallback runs only on a real timeout.
export function withTimeout(promise, ms, fallback) {
  let timer;
  const t = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback()), ms); });
  return Promise.race([promise.finally(() => clearTimeout(timer)), t]);
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}
