/**
 * Frontend structured logger. Same JSON envelope as server/convex/lib/logger.ts:
 * {ts, level, event, msg, service, env, request_id, session_id, user_id?, ...}.
 *
 * Request IDs: one session id per page load; call startRequest() per user
 * action (search, apply, send) for a dedicated id. currentRequestId() falls
 * back to the session id. The id is included in every line AND the ingest
 * batch response header, so a header value finds every related line.
 *
 * Transport: buffered POST to VITE_LOG_INGEST_URL (the Convex httpAction —
 * a different origin/port from this dev server) every 5s / 20 lines, plus
 * navigator.sendBeacon on pagehide. Failures are silent by design (logging
 * must never break the app). Without an ingest URL: dev mirrors to console,
 * prod buffers in memory only. Debug is off unless env is development.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_PATTERNS = [
  'password', 'passwd', 'pwd', 'token', 'secret', 'authorization', 'cookie',
  'api_key', 'apikey', 'access_key', 'refresh_token', 'private_key', 'session', 'set-cookie',
];

const DEFAULT_PII_FIELDS = [
  'email', 'phone', 'telephone', 'mobile', 'ssn', 'social_security',
  'dob', 'date_of_birth', 'address', 'street', 'credit_card', 'card_number', 'ip_address', 'passport',
];

let extraPiiFields: string[] = [];
export function addPiiFields(fields: string[]): void {
  extraPiiFields = [...extraPiiFields, ...fields];
}

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    SECRET_PATTERNS.some((p) => k.includes(p)) ||
    DEFAULT_PII_FIELDS.some((p) => k.includes(p)) ||
    extraPiiFields.some((p) => k.toLowerCase().includes(p))
  );
}

const MAX_DEPTH = 6;
export function redact<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

export interface LogLine {
  ts: string;
  level: LogLevel;
  event: string;
  msg: string;
  service: string;
  env: string;
  request_id: string;
  session_id: string;
  user_id?: string;
  [key: string]: unknown;
}

interface LoggerConfig {
  env: string;
  ingestUrl: string;
  viewerUrl: string;
}

function readViteEnv(): Record<string, string | undefined> {
  try {
    // Whole-object access so Vite rewrites import.meta.env statically.
    return (import.meta.env as unknown as Record<string, string | undefined>) ?? {};
  } catch {
    return {};
  }
}

let overrides: Partial<LoggerConfig> = {};
export function configureLogger(partial: Partial<LoggerConfig>): void {
  overrides = { ...overrides, ...partial };
}

function config(): LoggerConfig {
  const vite = readViteEnv();
  const raw = overrides.ingestUrl ?? vite.VITE_LOG_INGEST_URL ?? '';
  const viewerRaw = overrides.viewerUrl ?? vite.VITE_LOG_VIEWER_URL ?? '';
  return {
    env: overrides.env ?? vite.VITE_ENVIRONMENT ?? 'development',
    // HTTPS-only: log lines carry redacted-but-sensitive context. Plaintext
    // HTTP is refused everywhere except loopback (local dev proxying).
    ingestUrl: isHttpsUrl(raw) ? raw : '',
    // Live dev viewer (own port, memory-only). Same loopback rule; empty =
    // viewer transport off. Never blocks the ingest path.
    viewerUrl: isHttpsUrl(viewerRaw) ? viewerRaw : '',
  };
}

/** https://, or http:// on loopback only. Anything else is dropped. */
export function isHttpsUrl(url: string): boolean {
  if (url === '') return false;
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

function enabled(level: LogLevel): boolean {
  const { env } = config();
  if (env === 'production') return ORDER[level] >= ORDER.info;
  return true;
}

function makeId(prefix: string): string {
  try {
    const c = (globalThis as Record<string, unknown>).crypto as
      | { randomUUID?: () => string }
      | undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* fall through */
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

const sessionId: string = makeId('sess');
let ambientRequestId: string | null = null;
let ambientUserId: string | undefined;

export function currentRequestId(): string {
  return ambientRequestId ?? sessionId;
}

/** Start a user-action scope; returns its id + a bound logger. */
export function startRequest(label?: string): { requestId: string; label?: string } {
  ambientRequestId = makeId('req');
  if (label !== undefined) {
    logger.debug('request-start', `Started: ${label}`, {});
  }
  return { requestId: ambientRequestId, label };
}

export function endRequest(): void {
  ambientRequestId = null;
}

/** Opaque user binding (hashed id from sentry.ts) — never a raw email. */
export function setLogUserId(id: string | undefined): void {
  ambientUserId = id;
}

type Transport = (lines: LogLine[], ingestUrl: string) => Promise<void>;

let transportOverride: Transport | null = null;
export function setTransport(t: Transport | null): void {
  transportOverride = t;
}

const buffer: LogLine[] = [];

/**
 * Mutation-safe read of the pending ingest buffer (Logs mode renders it).
 * Returns a copy — callers can never drain or reorder the live buffer.
 * Flushing still only happens via flush()/sendBeacon.
 */
export function readBuffer(): LogLine[] {
  return [...buffer];
}
const FLUSH_EVERY_MS = 5000;
const FLUSH_AT_LINES = 20;
let timer: ReturnType<typeof setInterval> | null = null;
let beaconArmed = false;

function defaultTransport(lines: LogLine[], ingestUrl: string): Promise<void> {
  return fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'jobwzrd-app', lines }),
    keepalive: true,
  }).then(
    () => undefined,
    () => undefined, // silent by design
  );
}

function arm(): void {
  if (timer !== null) return;
  try {
    timer = setInterval(() => void flush(), FLUSH_EVERY_MS);
    if (typeof timer === 'object' && 'unref' in timer) (timer as { unref(): void }).unref?.();
  } catch {
    timer = null;
  }
  try {
    const w = window as unknown as {
      addEventListener?: (t: string, f: () => void) => void;
    };
    if (!beaconArmed && typeof w.addEventListener === 'function') {
      beaconArmed = true;
      w.addEventListener('pagehide', () => {
        try {
          const { ingestUrl, viewerUrl } = config();
          if (buffer.length === 0 || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
          const payload = JSON.stringify({ service: 'jobwzrd-app', lines: buffer.splice(0, buffer.length) });
          if (ingestUrl) navigator.sendBeacon(ingestUrl, payload);
          // Live viewer mirror: navigation would otherwise eat the lines
          // (the interval flush never fires before unload).
          if (viewerUrl) {
            navigator.sendBeacon(viewerUrl.replace(/\/$/, '') + '/ingest', payload);
          }
        } catch {
          /* never break unload */
        }
      });
    }
  } catch {
    /* non-DOM runtime (tests) */
  }
}

export function flush(): Promise<void> {
  const { ingestUrl, viewerUrl } = config();
  if (buffer.length === 0 || (!ingestUrl && !viewerUrl)) return Promise.resolve();
  const lines = buffer.splice(0, buffer.length);
  const send = transportOverride ?? defaultTransport;
  const jobs: Promise<unknown>[] = [];
  if (ingestUrl) jobs.push(send(lines, ingestUrl).catch(() => undefined));
  // Live viewer mirror: same lines, fire-and-forget, never breaks ingest.
  if (viewerUrl) {
    jobs.push(
      fetch(viewerUrl.replace(/\/$/, '') + '/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'jobwzrd-app', lines }),
        keepalive: true,
      }).then(
        () => undefined,
        () => undefined, // viewer down = silent (dev tool, not a dependency)
      ),
    );
  }
  return Promise.all(jobs).then(() => undefined);
}

export function stopLogger(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  buffer.length = 0;
}

function emit(level: LogLevel, event: string, msg: string, context: Record<string, unknown>): LogLine | null {
  if (!enabled(level)) return null;
  const { env } = config();
  const line: LogLine = {
    ts: new Date().toISOString(),
    level,
    event,
    msg,
    service: 'jobwzrd-app',
    env,
    request_id: currentRequestId(),
    session_id: sessionId,
    ...redact(context),
  };
  if (ambientUserId !== undefined) line.user_id = ambientUserId;
  const isDev = env === 'development';
  try {
    if (isDev) {
      const text = `[${level}] ${event}: ${msg}`;
      if (level === 'error') console.error(text, context);
      else if (level === 'warn') console.warn(text, context);
      else console.log(text, context);
    } else if (level === 'error') {
      console.error(`[${event}] ${msg}`);
    }
  } catch {
    /* console unavailable — keep buffering */
  }
  buffer.push(line);
  if (buffer.length >= FLUSH_AT_LINES) void flush();
  else arm();
  return line;
}

export const logger = {
  debug: (event: string, msg: string, context: Record<string, unknown> = {}) =>
    emit('debug', event, msg, context),
  info: (event: string, msg: string, context: Record<string, unknown> = {}) =>
    emit('info', event, msg, context),
  warn: (event: string, msg: string, context: Record<string, unknown> = {}) =>
    emit('warn', event, msg, context),
  error: (event: string, msg: string, context: Record<string, unknown> = {}) =>
    emit('error', event, msg, context),
};

