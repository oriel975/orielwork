// Optional password protection (HTTP Basic Auth) for when the app is exposed
// on the internet. Enabled by setting APP_PASSWORD; any username is accepted.
import crypto from 'node:crypto';

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function checkBasicAuth(header, password) {
  if (!password) return true;
  const m = /^Basic\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  let decoded;
  try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return crypto.timingSafeEqual(digest(decoded.slice(i + 1)), digest(password));
}
