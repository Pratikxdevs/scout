/**
 * Better Auth client. Same-origin /api/auth/* (Vite proxies to Convex in
 * dev; single origin in prod) so auth cookies stay first-party — cross-site
 * Set-Cookie gets blocked and kills the OAuth callback state. Data calls
 * (/api/v1/*) also run same-origin in dev via the Vite proxy (services/api);
 * identity travels as the short-lived Bearer JWT below.
 */
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // Same-origin (empty base): Vite proxies /api/auth in dev, the container
  // serves it in prod. Never point this cross-origin — first-party cookies.
  baseURL: '',
  plugins: [convexClient()],
});

/**
 * Convex JWT for `Authorization: Bearer` on raw /api/v1 data calls.
 * better-auth session cookies never reach ctx.auth (opaque format, and
 * cross-origin in dev), so every authed data call carries the short-lived
 * JWT instead. Cached for ~10 of its 15 minutes; null when logged out.
 * Never throws — callers proceed unauthenticated.
 */
let cachedToken: string | null = null;
let cachedUntil = 0;

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken !== null && Date.now() < cachedUntil) return cachedToken;
  try {
    const res = (await authClient.convex.token({ fetchOptions: { throw: false } })) as {
      data?: { token?: string } | null;
    };
    const token = res?.data?.token;
    if (typeof token === 'string' && token !== '') {
      cachedToken = token;
      cachedUntil = Date.now() + 10 * 60 * 1000;
      return token;
    }
  } catch {
    /* logged out or backend down — callers go unauthenticated */
  }
  cachedToken = null;
  cachedUntil = 0;
  return null;
}

/** Drop the cached JWT (logout / 401 recovery). */
export function clearAccessToken(): void {
  cachedToken = null;
  cachedUntil = 0;
}

/** Remote sign-out when a backend is configured; no-op in local demo mode. */
export async function authSignOut(): Promise<void> {
  try {
    // Whole-object access so Vite rewrites import.meta.env statically.
    const env = import.meta.env as unknown as Record<string, string | undefined>;
    if (!env?.VITE_CONVEX_URL) return;
    await authClient.signOut();
  } catch {
    /* local state already cleared by the caller */
  }
}

/**
 * Provisions the app-side user row for this session; same-origin only
 * (Vite proxies /api/v1 in dev, nginx in container deploys — one path, no
 * direct-site fallback). Returns true when provisioned. Never throws —
 * callers treat false as "keep going; retried on the next authed action".
 */
export async function ensureSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/auth/ensure', { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return body?.ok === true;
  } catch {
    return false;
  }
}
