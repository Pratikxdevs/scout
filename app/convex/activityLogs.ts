import { internalMutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireActor } from './lib/actor';

/**
 * activityLogs — append-only, user-scoped audit stream (SPEC §6). Written
 * inside the handlers that change state; read back for the progress UI.
 */
export const record = internalMutation({
  args: {
    userId: v.string(),
    searchRunId: v.optional(v.id('searchRuns')),
    eventType: v.union(
      v.literal('search_created'), v.literal('search_started'),
      v.literal('queries_planned'), v.literal('urls_discovered'),
      v.literal('fetch_completed'), v.literal('qualification_completed'),
      v.literal('lead_qualified'), v.literal('search_completed'),
      v.literal('search_failed'), v.literal('search_cancelled'),
      v.literal('draft_generated'), v.literal('search_row_updated'),
      v.literal('agent_fallback_used'),
    ),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('activityLogs', {
      userId: args.userId,
      searchRunId: args.searchRunId,
      eventType: args.eventType,
      message: args.message,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

/** Activity rows for one run (progress timeline). Owner-checked. */
export const listForRun = query({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    // The join on runId is already filtered by the read: every other row is
    // caller-owned because listForRun queries logs by (run, owner).
    return ctx.db
      .query('activityLogs')
      .withIndex('by_run', (q) => q.eq('searchRunId', args.runId))
      .order('desc')
      .take(50)
      .then(async (rows) =>
        rows.filter(r => r.userId === actor.userId));
  },
});

/** Latest activity across all runs (dashboard feed). */
export const recentMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 50);
    return ctx.db
      .query('activityLogs')
      .withIndex('by_user_time', (q) => q.eq('userId', actor.userId))
      .order('desc')
      .take(limit);
  },
});
