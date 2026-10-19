/**
 * URL normalization + SSRF guards (SPEC §9 / PLAN-w05). Used at discovery
 * AND re-checked on every fetch's final_url (redirects don't sneak in).
 */
const BLOCK_HOST_PATTERNS: RegExp = /(^|\.)(localhost|local|internal|intranet|([a-z0-9-]+\.test)|([a-z0-9-]+\.localhost)|([a-z0-9-]+\.localdomain))$/i;
const PRIVATE_IPHOST_RE = /^(127\.|0\.0\.0\.0(|\.[0-9]+)*$|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|f[cd]|fe80:)/i;
const NON_FETCHABLE_SCHEME_RE = /^https?:$/i;

/** Strip tracking params, hashes, trailing slash; lowercase host. */
export function canonicalUrl(raw: string): string | null {
  const u = tryParse(raw);
  if (u === null) return null;
  u.hash = '';
  const params = Array.from(u.searchParams.keys());
  for (const k of params) {
    if (/^utm_/i.test(k) || k === 'ref' || k === 'fbclid' || k === 'gclid') u.searchParams.delete(k);
  }
  const qs = u.searchParams.toString();
  let path: string = u.pathname.replace(/\/+$/, '');
  if (path === '') path = '/';
  return `${u.protocol}//${u.host}${path}${qs ? `?${qs}` : ''}`;
}

/** Reject near-anything not https(s) or aimed at private infrastructure. */
export function isAllowedExternal(raw: string): boolean {
  const u = tryParse(raw);
  if (u === null) return false;
  if (!NON_FETCHABLE_SCHEME_RE.test(u.protocol)) return false;
  if (u.username || u.password) return false;
  if (u.port !== '' && ![80, 443, 8080, 8443].includes(Number(u.port))) return false;
  const host = u.hostname.toLowerCase();
  if (host === '') return false;
  if (BLOCK_HOST_PATTERNS.test(host)) return false;
  if (PRIVATE_IPHOST_RE.test(host)) return false;
  if (!host.includes('.') && !host.includes(':')) return false; // bare host
  return true;
}

/** Pin to https only (fetch targets + final_url after redirect). */
export function isAllowedFetchable(raw: string): boolean {
  const u = tryParse(raw);
  return u !== null && u.protocol === 'https:' && isAllowedExternal(raw);
}

function tryParse(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/** Domain class for source-reliability scoring (SPEC §12). */
export function domainClass(host: string): 'company' | 'job_board' | 'news' | 'community' | 'low' {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (/(upwork|freelancer|toptal|guru|fiverr|peopleperhour|contra)\./.test(h)) return 'job_board';
  if (/(news|blog|medium|substack|dev\.to|blogspot|wordpress)/.test(h)) return 'news';
  if (/(upvoty|yt\.be|\.reddit|twitter|linkedin|facebook|x\.com)/.test(h)) return 'community';
  if (/\.(io|dev|com|net|org)$/.test(h)) return 'company';
  return 'low';
}
