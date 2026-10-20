import { ConvexError } from 'convex/values';

/**
 * Scout error taxonomy (SPEC §10). Every handler rejects with exactly one
 * of these codes — the frontend maps them to honest human copy (SPEC §11).
 */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CAP_REACHED'
  | 'SEARCH_ACTIVE'
  | 'PROVIDER_UNCONFIGURED'
  | 'PROVIDER_ERROR'
  | 'INTERNAL';

/** One ConvexError payload shape across the whole backend.
 *  (type alias, not interface — Convex's Value constraint needs the
 *  implicit index signature that only aliases get). */
export type ScoutFailure = {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
};

export function fail(code: ErrorCode, message: string, retryable = false): ConvexError<ScoutFailure> {
  return new ConvexError<ScoutFailure>({ code, message, retryable });
}

/** Typed rethrow helper for provider adapters (classified upstream). */
export function isScoutFailure(e: unknown): e is ConvexError<ScoutFailure> {
  return e instanceof ConvexError && typeof (e as ConvexError<ScoutFailure>).data?.code === 'string';
}

/** Map a provider failure (TinyFish / LLM) onto the Scout taxonomy.
 *  The message the user sees is the provider's own wording — the code is
 *  what the frontend switches on. */
export function providerFailure(e: unknown, what: string): ConvexError<ScoutFailure> {
  const err = e as { message?: unknown; retryable?: unknown; status?: unknown };
  const message = typeof err?.message === 'string' && err.message !== ''
    ? err.message
    : `${what} failed`;
  const retryable = err?.retryable === true || (typeof err?.status === 'number' && err.status >= 500);
  return fail('PROVIDER_ERROR', message, retryable);
}

/** A provider that isn't configured (missing key) — never a silent retry. */
export function unconfigured(what: string, detail: string): ConvexError<ScoutFailure> {
  return fail('PROVIDER_UNCONFIGURED', `PROVIDER_UNCONFIGURED: ${detail} — ${what} skipped.`);
}
