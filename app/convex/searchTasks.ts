import { internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { requireActor, assertOwned } from './lib/actor';
import { fail } from './lib/errors';
import { LIMITS } from './lib/limits';

/**
 * searchTasks — work items inside a run. Actions claim → run → complete.
 * Public list is owner-checked so progress reads are FORBIDDEN-proof.
 */
type TaskPayload = {
  url?: string;
  canonicalUrl?: string;
  title?: string;
  publishedAt?: number | null;
  finalUrl?: string;
  textExcerpt?: string;
};

/** Insert fetch tasks for a run (batch ≤ BATCH_SIZE × batches). */
export const enqueueFetch = internalMutation({
  args: {
    runId: v.id('searchRuns'),
    userId: v.string(),
    tasks: v.array(v.object({
      url: v.string(),
      canonicalUrl: v.string(),
      title: v.optional(v.string()),
      publishedAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    if (args.tasks.length > LIMITS.SEARCH.MAX_URLS_PER_RUN) {
      throw fail('INVALID_INPUT', 'Batch exceeds URL cap');
    }
    const now = Date.now();
    const ids = [];
    for (const t of args.tasks) {
      ids.push(await ctx.db.insert('searchTasks', {
        runId: args.runId,
        userId: args.userId,
        type: 'fetch',
        payload: t,
        status: 'queued',
        attempts: 0,
        maxAttempts: LIMITS.SEARCH.MAX_ATTEMPTS,
        createdAt: now,
        updatedAt: now,
      }));
    }
    return ids;
  },
});

/** Claim a slice of queued fetch tasks → running (lease set). */
export const claimFetch = internalMutation({
  args: { runId: v.id('searchRuns'), batchSize: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queued = await ctx.db
      .query('searchTasks')
      .withIndex('by_run_status', (q) => q.eq('runId', args.runId).eq('status', 'queued' as const))
      .collect();
    const slice = queued.slice(0, Math.max(1, Math.min(args.batchSize, LIMITS.SEARCH.BATCH_SIZE)));
    for (const t of slice) {
      await ctx.db.patch(t._id, {
        status: 'running',
        attempts: t.attempts + 1,
        leaseUntil: now + LIMITS.SWEEP.LEASE_MS,
        updatedAt: now,
      });
    }
    return slice.map(t => ({ _id: t._id, payload: t.payload as TaskPayload, attempts: t.attempts + 1 }));
  },
});

/** Running queued-count snapshot for progress UI (cheap aggregate). */
export const progress = query({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    assertOwned(run, actor.userId);
    if (run === null) return null;
    const tasks = await ctx.db
      .query('searchTasks')
      .withIndex('by_run_status', (q) => q.eq('runId', args.runId))
      .collect();
    const c = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const t of tasks) c[t.status] = (c[t.status] ?? 0) + 1;
    return { runStatus: run.status, tasks: c, total: tasks.length };
  },
});

/** Completed (accepted) tasks for a run — read by the qualify action. */
export const completedForRun = internalQuery({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) =>
    (await ctx.db
      .query('searchTasks')
      .withIndex('by_run_status', (q) => q.eq('runId', args.runId).eq('status', 'completed' as const))
      .collect())
      .slice(0, LIMITS.SEARCH.MAX_URLS_PER_RUN)
      .map(t => ({ _id: t._id, payload: t.payload as { url: string }, result: t.result as { finalUrl: string; title: string; textExcerpt: string } | null })),
});

/** Task list for a run (owner). Bounded — 20 fetch tasks per run max. */
export const listForRun = query({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    assertOwned(run, actor.userId);
    return ctx.db
      .query('searchTasks')
      .withIndex('by_run_time', (q) => q.eq('runId', args.runId))
      .take(40);
  },
});

export const complete = internalMutation({
  args: { taskId: v.id('searchTasks'), result: v.any() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw fail('INTERNAL', 'Task vanished');
    await ctx.db.patch(args.taskId, {
      status: 'completed',
      result: args.result,
      updatedAt: Date.now(),
    });
  },
});

/** Attempted failure: requeue until attempts hit max, then fail. */
export const failOrRequeue = internalMutation({
  args: { taskId: v.id('searchTasks'), error: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw fail('INTERNAL', 'Task vanished');
    const now = Date.now();
    if (task.attempts < task.maxAttempts && task.status === 'running') {
      await ctx.db.patch(args.taskId, {
        status: 'queued',
        error: args.error,
        leaseUntil: undefined,
        updatedAt: now,
      });
      return 'requeued';
    }
    await ctx.db.patch(args.taskId, {
      status: 'failed',
      error: args.error,
      leaseUntil: undefined,
      updatedAt: now,
    });
    return 'failed';
  },
});

/** Internal: cancel queued tasks for a cancelled run (called by cancel). */
export const cancelQueued = internalMutation({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const queued = await ctx.db
      .query('searchTasks')
      .withIndex('by_run_status', (q) => q.eq('runId', args.runId).eq('status', 'queued' as const))
      .collect();
    for (const t of queued) {
      await ctx.db.patch(t._id, { status: 'cancelled', error: 'Search cancelled', updatedAt: Date.now() });
    }
    return queued.length;
  },
});
