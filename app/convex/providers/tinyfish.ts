"use node";
import { LIMITS } from '../lib/limits';
import { isAllowedFetchable } from '../lib/urls';
import { relativeDateIn } from '../lib/dates';

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

/** Why we fetch — the provider uses the intent to sharpen extraction. */
const FETCH_PURPOSE = 'Extract the job posting details, stated pay and location for a freelance lead database';

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
export interface SearchOptions {
  /** Restrict results to these domains (the provider ORs them). */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Why we are searching — the provider uses it to sharpen relevance. */
  purpose?: string;
  /** Freshness window in minutes (1 … 5,256,000). */
  recencyMinutes?: number;
  /** Country code for geo-targeted results (e.g. 'IN', 'US'). */
  location?: string | null;
  language?: string;
}

export async function searchWeb(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchOutcome> {
  return rotateKeys(async (apiKey) => {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set('query', query);
    if (opts.includeDomains !== undefined && opts.includeDomains.length > 0) {
      url.searchParams.set('include_domains', opts.includeDomains.slice(0, 10).join(','));
    }
    if (opts.excludeDomains !== undefined && opts.excludeDomains.length > 0) {
      url.searchParams.set('exclude_domains', opts.excludeDomains.slice(0, 10).join(','));
    }
    if (opts.purpose !== undefined && opts.purpose.trim() !== '') {
      url.searchParams.set('purpose', opts.purpose.trim().slice(0, 500));
    }
    if (opts.recencyMinutes !== undefined && opts.recencyMinutes > 0) {
      url.searchParams.set('recency_minutes', String(Math.round(opts.recencyMinutes)));
    }
    if (opts.location !== undefined && opts.location !== null && opts.location.trim() !== '') {
      url.searchParams.set('location', opts.location.trim().slice(0, 4));
    }
    if (opts.language !== undefined && opts.language.trim() !== '') {
      url.searchParams.set('language', opts.language.trim().slice(0, 4));
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
      // The index knows the age ("2 days ago") or the date — use it instead of
      // asking a model to guess a freshness number.
      hits.push({
        url: rawUrl,
        title: typeof r.title === 'string' ? r.title : rawUrl.slice(0, 90),
        snippet: typeof r.snippet === 'string' ? r.snippet.replace(/\s+/g, ' ').slice(0, 400) : '',
        publishedAt: dateRaw === null ? null : (toTs(dateRaw) ?? relativeDateIn(dateRaw)),
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
  /** Every <a href> on the page (when links: true) — on a board page these
   *  ARE the individual postings. */
  links: string[];
  /** The page's own publication date, when the provider detected one. */
  publishedAt: number | null;
  /** Validators for conditional refetches (skip unchanged pages). */
  etag: string | null;
  lastModified: string | null;
  /** Structured payload (agent runs with output_schema). */
  structured?: unknown | null;
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
      body: JSON.stringify({
        urls,
        ttl: 0,                      // prefer live
        format: 'markdown',
        links: true,                 // board pages: the links ARE the postings
        purpose: FETCH_PURPOSE,
        // Boilerplate costs tokens and muddies evidence — drop it before
        // the text reaches the model.
        exclude_selectors: ['.comments', '.newsletter-signup', '.sidebar', 'nav', 'footer', 'header', 'aside', 'script', 'style'],
        per_url_timeout_ms: 100_000,
        include_etag_and_last_modified: true,
      }),
      // The provider allows 110s per URL and a 120s batch ceiling — give the
      // client room to receive clean errors instead of cutting the request.
      signal: AbortSignal.timeout(150_000),
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
      results?: Array<{ url?: unknown; final_url?: unknown; title?: unknown; description?: unknown; text?: unknown; markdown?: unknown; content?: unknown; links?: unknown; published_date?: unknown; etag?: unknown; last_modified?: unknown }>;
      errors?: Array<{ url?: unknown; error?: unknown; message?: unknown; status?: unknown }>;
    };
    const pages: FetchedPage[] = [];
    for (const p of body.results ?? []) {
      const rawUrl = typeof p.url === 'string' ? p.url : '';
      const finalUrl = typeof p.final_url === 'string' ? p.final_url : rawUrl;
      // Redirect re-check (SPEC §9): final_url passes the same gate.
      if (!isAllowedFetchable(finalUrl)) continue;
      const text = firstString(p.markdown, p.content, p.text);
      const links = Array.isArray(p.links)
        ? p.links.filter((l): l is string => typeof l === 'string').slice(0, 120)
        : [];
      const dateRaw = typeof p.published_date === 'string' ? p.published_date : null;
      pages.push({
        url: rawUrl,
        finalUrl,
        title: vStr(p.title, 140),
        description: vStr(p.description, 300),
        textMarkdown: text.slice(0, LIMITS.PAGE.MAX_EXCERPT_CHARS),
        links,
        publishedAt: dateRaw === null ? null : (toTs(dateRaw) ?? relativeDateIn(dateRaw)),
        etag: typeof p.etag === 'string' ? p.etag : null,
        lastModified: typeof p.last_modified === 'string' ? p.last_modified : null,
        structured: null,
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
    const body = (await res.json()) as {
      result?: unknown; output?: unknown; status?: unknown; message?: unknown; error?: unknown;
    };
    // Live contract (verified 2026-10-20): result is NESTED —
    // { run_id, status: 'COMPLETED', result: { result: '<text>', error: null } }.
    // Older/spec shapes kept for safety: flat string result, output, message.
    const nested = (typeof body.result === 'object' && body.result !== null) ? body.result as { result?: unknown; error?: unknown } : null;
    const firstText = (...cands: unknown[]): '' | string => {
      for (const c of cands) if (typeof c === 'string') return c;
      return '';
    };
    const text = firstText(body.result, body.output, nested?.result, body.message);
    // With output_schema the provider returns the PARSED OBJECT as `result`
    // instead of nested text — keep it so callers can use it directly.
    const structured = (typeof body.result === 'object' && body.result !== null && typeof nested?.result !== 'string')
      ? body.result
      : null;
    const agentErr = body.error ?? nested?.error;
    const failed = z(body.status).toLowerCase() === 'failed'
      || text === ''
      || (typeof agentErr === 'string' && agentErr !== '');
    if (failed) {
      const why = typeof agentErr === 'string' && agentErr !== '' ? `TinyFish agent errored: ${agentErr.slice(0, 160)}` : 'TinyFish agent returned no usable page content';
      throw new ProviderError({ message: why, retryable: false });
    }
    return {
      url,
      finalUrl: url,
      title: `Agent: ${goal.slice(0, 60)}`,
      description: '',
      textMarkdown: text.slice(0, LIMITS.PAGE.MAX_EXCERPT_CHARS),
      links: [],
      publishedAt: null,
      etag: null,
      lastModified: null,
      structured,
    };
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
