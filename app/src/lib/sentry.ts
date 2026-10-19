/**
 * Sentry for the frontend. Initialized once from main.tsx, only when
 * VITE_SENTRY_DSN is set (dev stays dependency-free at runtime behavior).
 *
 * Privacy: sendDefaultPii is false; user is an opaque hashed id (never the
 * email — hashUserId is one-way); request_id + route travel as tags.
 */
import * as Sentry from '@sentry/react';
import { logger, setLogUserId } from './logger.ts';

let ready = false;

function viteEnv(): Record<string, string | undefined> {
  try {
    // Whole-object access so Vite rewrites import.meta.env statically.
    return (import.meta.env as unknown as Record<string, string | undefined>) ?? {};
  } catch {
    return {};
  }
}

/** One-way djb2 hash → opaque user id. No email ever leaves the client. */
export function hashUserId(email: string): string {
  let h = 5381;
  for (let i = 0; i < email.length; i += 1) {
    h = ((h << 5) + h + email.charCodeAt(i)) >>> 0;
  }
  return `u_${h.toString(16).padStart(8, '0')}`;
}

function scrubUrl(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function initSentry(): boolean {
  const env = viteEnv();
  const dsn = env.VITE_SENTRY_DSN;
  if (!dsn || ready) return false;
  const environment = env.VITE_ENVIRONMENT ?? 'development';
  Sentry.init({
    dsn,
    environment,
    // Default: no PII is sent (sendDefaultPii defaults to false) — user is
    // an opaque hash, request_id + route travel as tags only.
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    beforeSend(event) {
      try {
        if (event.request?.url) event.request.url = scrubUrl(event.request.url);
        if (Array.isArray(event.breadcrumbs)) {
          for (const b of event.breadcrumbs) {
            if (b.data?.url && typeof b.data.url === 'string') {
              b.data.url = scrubUrl(b.data.url);
            }
          }
        }
      } catch {
        /* scrub failures must not drop the event */
      }
      return event;
    },
  });
  ready = true;
  return true;
}

/** Bind opaque user id to Sentry + log lines; null on logout. */
export function setSentryUser(email: string | null): void {
  const id = email === null ? undefined : hashUserId(email);
  setLogUserId(id);
  if (!ready) return;
  Sentry.setUser(email === null ? null : { id });
}

export function captureRouteError(err: unknown, route: string, requestId: string): string | undefined {
  if (!ready) return undefined;
  try {
    return Sentry.captureException(err, { tags: { route, request_id: requestId } });
  } catch {
    return undefined;
  }
}

/**
 * Staging-only probe: throws an uncaught error so Sentry's global handler
 * captures it. In any other env it is a no-op returning 'not-staging'.
 * Exposed as window.__jw_probe by main.tsx in staging builds only.
 */
export function stagingErrorProbe(): string {
  const env = viteEnv();
  if (env.VITE_ENVIRONMENT !== 'staging') return 'not-staging';
  try {
    logger.error('staging-probe', 'Staging frontend probe fired', {});
  } catch {
    /* logger must never block the probe */
  }
  throw new Error('staging-frontend-probe — safe to ignore');
}
