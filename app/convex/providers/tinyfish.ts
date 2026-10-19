"use node";
import { LIMITS } from '../lib/limits';
import { isAllowedFetchable } from '../lib/urls';

/**
 * TinyFish adapters (SPEC §5): Search, Fetch, Agent.
 *
 * Endpoints authenticate with a single `X-API-Key` header sourced from the
 * deployment env. Keys live in a POOL (`TINYFISH_API_KEY`, then
 * `TINYFISH_API_KEY_1…4`): calls rotate through it round-robin, and a 429
 * rotates to the next key before the failure surfaces. Every call is
 * bounded by an AbortSignal timeout and returns classically-shaped
 * failures the actions can retry on (transient) or surface honestly
 * (permanent). No key → PROVIDER_UNCONFIGURED, never a crash.
 */

const SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai';
const FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai';
const AGENT_RUN_ENDPOINT = 'https://agent.tinyfish.ai/v1/automation/run';

/* ---------- key pool (cycled per call, rotates again on 429) ---------- */

const KEY_SLOTS = [
  'TINYFISH_API_KEY', 'TINYFISH_API_KEY_1', 'TINYFISH_API_KEY_2',
  'TINYFISH_API_KEY_3', 'TINYFISH_API_KEY_4',
] as const;

function keyPool(): string[] {
  const out: string[] = [];
  for (const name of KEY_SLOTS) {
    const k = process.env[name];
    if (typeof k === 'string' && k.length >= 16) out.push(k);
  }
  return out;
}

let keyCursor = Math.floor(Math.random() * 100);   // spread cold starts

/** Run one provider call across the key pool: rotate on 429, rethrow
 *  anything else (including the oldest failure when every key is limited). */
async function rotateKeys<T>(attempt: (key: string) => Promise<T>): Promise<T> {
  const pool = keyPool();
  if (pool.length === 0) {
    throw new ProviderError({
      message: 'No TinyFish API key is set on this Convex deployment',
      retryable: false,
    });
  }
  const start = Math.abs(keyCursor++) % pool.length;
  let last: ProviderError | null = null;
  for (let i = 0; i < pool.length; i++) {
    try {
      return await attempt(pool[(start + i) % pool.length]);
    } catch (err) {
      const pe = err instanceof ProviderError ? err : toProviderError(err);
      last = pe;
      if (pe.status === 429 && i < pool.length - 1) continue;   // next key
      throw pe;
    }
  }
  throw last ?? new ProviderError({ message: 'TinyFish call failed', retryable: true });
}

/* ---------- error taxonomy ---------- */

export interface ProviderFailure { message: string; retryable: boolean; status?: number }

export class ProviderError extends Error {
  retryable: boolean;
  status: number | undefined;
  constructor(f: ProviderFailure) {
    super(f.message);
    this.retryable = f.retryable;
    this.status = f.status;
  }
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  return new ProviderError({ message: e instanceof Error ? e.message : 'Unknown provider failure', retryable: true });
}

/** Classify an HTTP status: 429/5xx/transport → retryable. */
function classify(status: number, context: string): ProviderError {
  const transient = status === 429 || status === 425 || status >= 500;
  return new ProviderError({
    message: `TinyFish ${context}: HTTP ${status}`,
    retryable: transient,
    status,
  });
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    return raw.slice(0, 300);
  } catch {
    return '';
  }
}

/* ---------- Search ---------- */

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  publishedAt: number | null;   // metadata date, when the provider gives one
}

export interface SearchOutcome { query: string; hits: SearchHit[] }

type SearchResponseShape = {
  results?: Array<{ title?: unknown; snippet?: unknown; url?: unknown; date?: unknown; published_date?: unknown }>;
  data?: { results?: Array<{ title?: unknown; snippet?: unknown; url?: unknown; date?: unknown; published_date?: unknown }> };
};

/** GET search — SERP enrichment for query planning (≤ provider cap). */
export async function searchWeb(
  query: string,
  opts: { excludeDomains?: string[] } = {},
): Promise<SearchOutcome> {
  return rotateKeys(async (apiKey) => {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set('query', query);
    if (opts.excludeDomains !== undefined && opts.excludeDomains.length > 0) {
      // Provider may cap domains; batches beyond the cap are dropped here.
      url.searchParams.set('excludeDomains', opts.excludeDomains.slice(0, 10).join(','));
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new ProviderError({ message: 'TinyFish search timed out (25s)', retryable: true });
      }
      throw new ProviderError({ message: `TinyFish search unreachable: ${e instanceof Error ? e.message : 'network'}`, retryable: true });
    });
    if (!res.ok) {
      throw classify(res.status, `search (${query.slice(0, 40)}) ${await readErrorBody(res)}`);
    }
    const body = (await res.json()) as SearchResponseShape;
    const raw = body.results ?? body.data?.results ?? [];
    const hits: SearchHit[] = [];
    for (const r of raw) {
      const rawUrl = typeof r.url === 'string' ? r.url : '';
      if (!isAllowedFetchable(rawUrl)) continue;   // SSRF gate at discovery too
      const dateRaw = typeof r.date === 'string' ? r.date : typeof r.published_date === 'string' ? r.published_date : null;
      hits.push({
        url: rawUrl,
        title: typeof r.title === 'string' ? r.title : rawUrl.slice(0, 90),
        snippet: typeof r.snippet === 'string' ? r.snippet.replace(/\s+/g, ' ').slice(0, 400) : '',
        publishedAt: dateRaw === null ? null : toTs(dateRaw),
      });
    }
    return { query, hits };
  });
}

function toTs(s: string): number | null {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/* ---------- Fetch ---------- */

export interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  textMarkdown: string;      // clamped to excerpt budget
}

const vStr = (x: unknown, max: number, fallback = ''): string =>
  typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : fallback;

/** POST fetch ≥1 URL in one call (≤ BATCH_SIZE; can be retried). */
export async function fetchPages(
  urls: readonly string[],
): Promise<{ pages: FetchedPage[]; errors: Array<{ url: string; message: string }> }> {
  if (urls.length === 0) return { pages: [], errors: [] };
  if (urls.length > LIMITS.SEARCH.BATCH_SIZE) {
    throw new ProviderError({ message: 'Fetch batch size exceeded (≤5 URLs/call)', retryable: false });
  }
  return rotateKeys(async (apiKey) => {
    const res = await fetch(FETCH_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ urls, ttl: 0, format: 'markdown' }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new ProviderError({ message: 'TinyFish fetch timed out (60s)', retryable: true });
      }
      throw new ProviderError({ message: `TinyFish fetch unreachable: ${e instanceof Error ? e.message : 'network'}`, retryable: true });
    });
    if (!res.ok) {
      throw classify(res.status, `fetch ${await readErrorBody(res)}`);
    }
    const body = (await res.json()) as {
      results?: Array<{ url?: unknown; final_url?: unknown; title?: unknown; description?: unknown; text?: unknown; markdown?: unknown; content?: unknown }>;
      errors?: Array<{ url?: unknown; error?: unknown; message?: unknown }>;
    };
    const pages: FetchedPage[] = [];
    for (const p of body.results ?? []) {
      const rawUrl = typeof p.url === 'string' ? p.url : '';
      const finalUrl = typeof p.final_url === 'string' ? p.final_url : rawUrl;
      // Redirect re-check (SPEC §9): final_url passes the same gate.
      if (!isAllowedFetchable(finalUrl)) continue;
      const text = firstString(p.markdown, p.content, p.text);
      pages.push({
        url: rawUrl,
        finalUrl,
        title: vStr(p.title, 140),
        description: vStr(p.description, 300),
        textMarkdown: text.slice(0, LIMITS.PAGE.MAX_EXCERPT_CHARS),
      });
    }
    const errors = (body.errors ?? [])
      .map(({ url, error, message }) => ({
        url: typeof url === 'string' ? url : '',
        message: typeof error === 'string' ? error : typeof message === 'string' ? message : 'fetch failed',
      }))
      .filter(e => e.url !== '');
    return { pages, errors };
  });
}

/* ---------- Agent ---------- */

const z = (x: unknown): string => (typeof x === 'string' ? x : '');

/** Narrowly-scoped agent fallback (≤2/run). Returns page-equivalent text. */
export async function runAgent(
  url: string,
  goal: string,
): Promise<FetchedPage> {
  return rotateKeys(async (apiKey) => {
    const res = await fetch(AGENT_RUN_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        url,
        goal: goal.slice(0, 500),
        agent_config: { max_duration_seconds: LIMITS.AGENT.MAX_PROCESS_SECONDS },
      }),
      signal: AbortSignal.timeout((LIMITS.AGENT.MAX_PROCESS_SECONDS + 10) * 1000),
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new ProviderError({ message: 'TinyFish agent timed out', retryable: true });
      }
      throw new ProviderError({ message: `TinyFish agent unreachable: ${e instanceof Error ? e.message : 'network'}`, retryable: true });
    });
    if (!res.ok) {
      throw classify(res.status, `agent ${await readErrorBody(res)}`);
    }
    const body = (await res.json()) as { result?: unknown; output?: unknown; status?: unknown; message?: unknown };
    const text = typeof body.result === 'string' ? body.result
      : typeof body.output === 'string' ? body.output
      : typeof body.message === 'string' ? body.message
      : '';
    if (z(body.status).toLowerCase() === 'failed' || text === '') {
      throw new ProviderError({ message: 'TinyFish agent returned no usable page content', retryable: false });
    }
    return { url, finalUrl: url, title: `Agent: ${goal.slice(0, 60)}`, description: '', textMarkdown: text.slice(0, LIMITS.PAGE.MAX_EXCERPT_CHARS) };
  });
}

/** Utils used above — kept tiny for tree-shaking. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function firstString(...cands: unknown[]): string {
  for (const c of cands) {
    if (typeof c === 'string') return c;
  }
  return '';
}
