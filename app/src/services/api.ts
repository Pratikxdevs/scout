/**
 * Backend API client (Phase 4 plan 04-04). Same-origin `/api/v1/*` in prod;
 * absolute Convex site URL in dev (Vite proxies only /api/auth). Session
 * travels via cookies (credentials: include); every action carries
 * X-Request-Id so a header value finds every related log line.
 *
 * Presentation never imports this directly — services/http.ts wraps it
 * behind the DemoXService interfaces, and the store picks the impl.
 */
import { currentRequestId, logger } from '../lib/logger.ts';

export interface ApiError {
  code: string;
  status: number;
  message: string;
}

function env(name: string): string {
  try {
    // Whole-object access: Vite rewrites the `import.meta.env` token
    // statically in dev and build. (Aliasing `import.meta` first defeats
    // the rewrite and always reads '' — backend silently off in dev.)
    const all = import.meta.env as unknown as Record<string, string | undefined>;
    return all?.[name] ?? '';
  } catch {
    return '';
  }
}

/** True when a backend is configured (Convex URL present). */
export function backendOn(): boolean {
  return env('VITE_CONVEX_URL') !== '';
}

/** Base for /api/v1/*: same-origin in vite dev (proxied, first-party
 * cookies) and in prod (single origin); absolute Convex site URL only for
 * non-dev builds served cross-origin (tests, previews without a proxy). */
export function apiBase(): string {
  try {
    const dev = (import.meta.env as unknown as Record<string, unknown>).DEV === true;
    if (dev) return '';
  } catch {
    /* fall through to the absolute URL */
  }
  const url = env('VITE_CONVEX_SITE_URL');
  // HTTPS-only: the session cookie + bearer identity must never travel
  // over plaintext. Loopback http is allowed for local dev proxying.
  if (url !== '' && !isHttpsApiUrl(url)) {
    logger.error('api-insecure', 'Refusing plaintext API base — use https:// (loopback excepted).', {});
    return '';
  }
  return url;
}

/** Exported for tests. https://, or http:// on loopback only. */
export function isHttpsApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') {
      const host = u.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    }
    return false;
  } catch {
    return false;
  }
}

interface ErrEnvelope {
  ok: false;
  code?: string;
  message?: string;
}

function envelopeCode(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const code = (body as ErrEnvelope).code;
    if (typeof code === 'string' && code !== '') return code;
  }
  return 'INTERNAL';
}

function envelopeMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const msg = (body as ErrEnvelope).message;
    if (typeof msg === 'string' && msg !== '') return msg;
  }
  return '';
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const requestId = currentRequestId();
  let res: Response;
  // Convex identity rides a Bearer JWT, not cookies: session cookies are
  // opaque to ctx.auth (and cross-origin in dev). Lazy import keeps
  // better-auth out of node test graphs.
  let authHeader: Record<string, string> = {};
  try {
    const { getAccessToken } = await import('../lib/authClient.ts');
    const jwt = await getAccessToken();
    if (jwt !== null) authHeader = { Authorization: `Bearer ${jwt}` };
  } catch {
    /* logged out — proceed unauthenticated */
  }
  try {
    res = await fetch(`${apiBase()}/api/v1${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...authHeader,
      },
      ...(init.body !== undefined
        ? { body: JSON.stringify(init.body) }
        : {}),
    });
  } catch {
    logger.warn('api-network', `Network failure: ${path}`, {
      request_id: requestId,
    });
    throw { code: 'NETWORK', status: 0, message: '' } satisfies ApiError;
  }
  let body: unknown = null;
  try {
    body = (await res.json()) as unknown;
  } catch {
    body = null;
  }
  if (!res.ok || (typeof body === 'object' && body !== null && (body as ErrEnvelope).ok === false)) {
    const bodyCode = envelopeCode(body);
    const code =
      bodyCode !== 'INTERNAL'
        ? bodyCode
        : res.status === 401
          ? 'UNAUTHENTICATED'
          : 'INTERNAL';
    const err: ApiError = {
      code,
      status: res.status,
      message: envelopeMessage(body),
    };
    logger.warn('api-error', `API ${res.status} on ${path}`, {
      code,
      request_id: requestId,
    });
    if (res.status === 401) {
      // Cached JWT may have expired early — drop it so the next call
      // refetches instead of replaying a dead token.
      try {
        const { clearAccessToken } = await import('../lib/authClient.ts');
        clearAccessToken();
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
  return body as T;
}

/**
 * Exhaustive server-error → honest user copy. Mirrors server/convex/http.ts
 * statusFor: CAP_REACHED/SEARCH_ACTIVE/DRAFT_LOCKED → 409,
 * UNAUTHENTICATED → 401, NOT_FOUND → 404, INVALID_INPUT → 400, else 5xx.
 * Server messages are already honest action/state copy, so they pass through;
 * only empty/unknown messages fall back to these copies. held(captcha)
 * renders distinctly from caps (T23) — never conflated.
 */
export function toUserMessage(err: unknown): string {
  const e = err as Partial<ApiError> | null;
  const code = typeof e?.code === 'string' ? e.code : 'INTERNAL';
  const serverMsg = typeof e?.message === 'string' ? e.message : '';
  if (serverMsg !== '') {
    // Held states get a distinct prefix even when the server speaks.
    if (code === 'HELD' || /captcha|user.action|needs review/i.test(serverMsg))
      return `Waiting on you: ${serverMsg}`;
    return serverMsg;
  }
  switch (code) {
    case 'NETWORK':
      return "Couldn't reach the server — try again.";
    case 'UNAUTHENTICATED':
      return 'Log in again to continue.';
    case 'NOT_FOUND':
      return 'That item no longer exists.';
    case 'CAP_REACHED':
      return 'Daily cap reached — nothing was submitted.';
    case 'SEARCH_ACTIVE':
      return 'A search is already running — wait for it to finish.';
    case 'DRAFT_LOCKED':
      return 'That draft is already approved — nothing was changed.';
    case 'INVALID_INPUT':
      return 'Check the highlighted fields and try again.';
    case 'INVALID_TRANSITION':
      return "That action isn't available right now — refresh and try again.";
    case 'BODY_TOO_LARGE':
      return 'That was too large to send — try a smaller batch.';
    case 'HELD':
      return 'Waiting on you: complete the browser step — nothing was auto-solved.';
    default:
      return 'Server hiccup — nothing was lost, try again.';
  }
}

export interface Usage {
  applyUsed: number;
  applyCap: number;
  outreachUsed: number;
  outreachCap: number;
  dateKey: string;
}

/** Server-side usage counters (single source of truth for caps display). */
export async function fetchUsage(): Promise<Usage | null> {
  try {
    const body = await apiFetch<Usage & { ok: boolean }>('/usage');
    return {
      applyUsed: body.applyUsed,
      applyCap: body.applyCap,
      outreachUsed: body.outreachUsed,
      outreachCap: body.outreachCap,
      dateKey: body.dateKey,
    };
  } catch {
    return null;
  }
}
