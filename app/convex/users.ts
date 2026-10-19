import { mutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { requireActor } from './lib/actor';

/**
 * users.ensure — lazy Clerk identity mirror (SPEC §6). Public: called
 * by the client after sign-in; reads the JWT identity itself, so callers
 * never pass ids. Safe to call repeatedly (rate-limited lastSeen patch).
 */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', actor.userId))
      .first();
    if (existing !== null) {
      if (now - existing.lastSeenAt > 60_000) {
        await ctx.db.patch(existing._id, { lastSeenAt: now });
      }
      return existing._id;
    }
    return ctx.db.insert('users', {
      clerkId: actor.userId,
      email: actor.email,
      name: actor.name || undefined,
      createdAt: now,
      lastSeenAt: now,
    });
  },
});

/** Internal lookup used by owner checks elsewhere. */
export const getByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .first(),
});
