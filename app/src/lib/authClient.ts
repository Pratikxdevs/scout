/**
 * Legacy auth-service shim (interim).
 *
 * Clerk replaced Better Auth (Dec 2026 ride — `ConvexProviderWithClerk`
 * handles auth for the Convex client). The imperative fetch layer
 * (`services/api.ts`) still asks this module for a Bearer token; until it
 * is fully replaced by `services/scout.ts` (Wave 13), it gets a clean
 * "not signed in via this bridge" answer and every legacy call stays
 * neutralized without 401 storms.
 */
export const authClient = {
  /** Marker only — the real session lives in Clerk + ConvexProviderWithClerk. */
  kind: 'clerk-shim',
} as const;

export async function ensureSession(): Promise<boolean> {
  return false; // no better-auth session to refresh
}

export async function authSignOut(): Promise<void> {
  // Store logout routes to /login; the AuthBridge handles Clerk sign-out.
}

export async function getAccessToken(): Promise<string | null> {
  return null; // legacy fetch layer not authed through this path anymore
}

export async function clearAccessToken(): Promise<void> {
  // nothing cached since the bridge took over
}
