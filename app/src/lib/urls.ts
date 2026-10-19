/** Shared lib barrel — URL safety, storage, validation, perf. No deps. */

/** Allow only http(s) URLs (plus relative). Blocks javascript:, data:, etc. */
export function isSafeHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.trim() === '') return false;
  const v = raw.trim();
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  let u: URL | null = null;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  return u.protocol === 'http:' || u.protocol === 'https:';
}
