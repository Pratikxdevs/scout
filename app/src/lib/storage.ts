/** Versioned, crash-safe localStorage wrapper. Never throws, never logs values. */

const NS = 'jw4:';

function key(k: string): string {
  return NS + k;
}

export function loadStored<T>(k: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key(k));
    if (s == null) return fallback;
    const v = JSON.parse(s) as unknown;
    return v == null ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

export function saveStored(k: string, value: unknown): void {
  try {
    localStorage.setItem(key(k), JSON.stringify(value));
  } catch {
    /* private mode / quota — stay silent, keep running */
  }
}

export function removeStored(k: string): void {
  try {
    localStorage.removeItem(key(k));
  } catch {
    /* ignore */
  }
}

/** Read-once legacy keys from previous releases (unversioned jw2_/jw3_ keys). */
export function loadLegacy<T>(legacyKey: string, fallback: T): T {
  try {
    const s = localStorage.getItem(legacyKey);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
