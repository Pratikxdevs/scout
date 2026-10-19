/**
 * Minimal observability: error ring buffer + perf marks. No PII — stores only
 * error names/messages (truncated) and route/page timings. No network, no deps.
 */
import { loadStored, saveStored } from './storage';

const ERR_KEY = 'errlog';
const MAX = 20;

export interface ErrorEntry {
  at: string;
  name: string;
  message: string;
  route: string;
}

function now(): string {
  return new Date().toISOString();
}

export function reportError(err: unknown, route: string): void {
  try {
    const e = err as { name?: unknown; message?: unknown };
    const entry: ErrorEntry = {
      at: now(),
      name: typeof e?.name === 'string' ? e.name.slice(0, 60) : 'Error',
      message: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
      route: route.slice(0, 40),
    };
    const prev = loadStored<ErrorEntry[]>(ERR_KEY, []);
    saveStored(ERR_KEY, [entry, ...prev].slice(0, MAX));
  } catch {
    /* never break the app for telemetry */
  }
}

export function readErrors(): ErrorEntry[] {
  return loadStored<ErrorEntry[]>(ERR_KEY, []);
}

export function clearErrors(): void {
  saveStored(ERR_KEY, []);
}

/** One-shot LCP-ish + long-task counters via PerformanceObserver (best effort). */
export function observePerf(): void {
  try {
    if (typeof PerformanceObserver === 'undefined') return;
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.entryType === 'largest-contentful-paint') {
          performance.mark('jw:lcp', { detail: Math.round(e.startTime) });
        }
      }
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* unsupported browser — fine */
  }
}
