import { loadStored, saveStored } from './storage.ts';

const KEY = 'utm';
const KNOWN = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type UtmParams = Partial<Record<(typeof KNOWN)[number], string>> & { first_seen?: string };

/** Parse known utm_* params from a query string (empty object when none). */
export function parseUtm(search: string): UtmParams {
  const out: UtmParams = {};
  try {
    const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    for (const k of KNOWN) {
      const v = p.get(k)?.trim();
      if (v) out[k] = v.slice(0, 200);
    }
  } catch {
    /* malformed query — treat as no params */
  }
  return out;
}

/** Stored attribution (first-touch wins; never overwritten by later visits). */
export function loadUtm(): UtmParams {
  return loadStored<UtmParams>(KEY, {});
}

/**
 * Capture utm_* from the current URL on startup. First touch wins: later
 * visits with different params never overwrite the stored attribution.
 * Returns the stored attribution (possibly empty).
 */
export function captureUtm(search = window.location.search): UtmParams {
  const prev = loadUtm();
  if (prev.utm_source) return prev;
  const cur = parseUtm(search);
  if (!cur.utm_source) return prev;
  const next: UtmParams = { ...cur, first_seen: new Date().toISOString() };
  saveStored(KEY, next);
  return next;
}
