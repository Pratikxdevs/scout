import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';

/**
 * Ownership gate used by every user-scoped handler (SPEC §12). The Clerk
 * subject is the canonical userId everywhere downstream.
 */
export interface Actor {
  userId: string;          // Clerk subject, e.g. user_2abc… (identity.tokenIdentifier split)
  email: string;
  name: string;
}

export async function requireActor(ctx: QueryCtx): Promise<Actor>;
export async function requireActor(ctx: MutationCtx): Promise<Actor>;
export async function requireActor(ctx: QueryCtx | MutationCtx): Promise<Actor> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw fail('UNAUTHENTICATED', 'Sign in to use Scout.');
  }
  return {
    userId: identity.subject,
    email: identity.email ?? '',
    name: identity.name ?? '',
  };
}

/** Owner check for a row fetched inside a user-scoped handler. */
export function assertOwned(row: { userId: string } | null, userId: string): { userId: string } {
  if (row === null) {
    throw fail('NOT_FOUND', 'Not found.');
  }
  if (row.userId !== userId) {
    throw fail('FORBIDDEN', 'This row belongs to a different account.');
  }
  return row;
}
