import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { requireActor, assertOwned } from './lib/actor';
import { fail } from './lib/errors';
import { resolveSources } from './lib/sources';
import { LIMITS } from './lib/limits';

/**
/**
 * searchRuns — one hunt. create requests + orchestrates via scheduler;
 * state transitions are internal (actions drive them). Public read paths
 * owner-check (FORBIDDEN on someone else's run).
 */
export const create = mutation({
  args: {
    query: v.string(),
    /** Optional source scoping (upwork, fiverr, linkedin, naukri, reddit…). */
    sources: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const q = args.query.trim();
    if (q.length < 3 || q.length > 200) {
      throw fail('INVALID_INPUT', 'Search is 3–200 characters.');
    }
    const running = await ctx.db
      .query('searchRuns')
      .withIndex('by_user_status', (iq) => iq.eq('userId', actor.userId).eq('status', 'running' as const))
      .collect();
    const queued = await ctx.db
      .query('searchRuns')
      .withIndex('by_user_status', (iq) => iq.eq('userId', actor.userId).eq('status', 'queued' as const))
      .collect();
    if (running.length + queued.length >= LIMITS.SEARCH.MAX_RUNNING_PER_USER) {
      throw fail('SEARCH_ACTIVE', `You already have ${LIMITS.SEARCH.MAX_RUNNING_PER_USER} hunts in flight. Wait or cancel one.`);
    }
    const sources = resolveSources(args.sources).slice(0, LIMITS.SEARCH.MAX_SOURCES_PER_RUN);
    const runId = await ctx.db.insert('searchRuns', {
      userId: actor.userId,
      query: q,
      sources: sources.length > 0 ? sources.map(s => s.key) : undefined,
      status: 'queued',
      resultCount: 0,
      queuedAt: Date.now(),
    });
    await ctx.db.insert('activityLogs', {
      userId: actor.userId, searchRunId: runId, eventType: 'search_created',
      message: `Hunt queued: “${q}”`, createdAt: Date.now(),
    });
    // Chain the pipeline; actions drive state from here.
    await ctx.scheduler.runAfter(0, internal.actions.discovery.startSearch, { runId });
    return runId;
  },
});

/** Public read: one run, owner-checked. */
export const get = query({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    assertOwned(run, actor.userId);
    return run;
  },
});

/** Internal read for scheduled actions (no identity) — callers own-scope
 *  by passing the run's userId onward from the row itself. */
export const getInternal = internalQuery({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => ctx.db.get(args.runId),
});

/** Public read: my recent runs, newest first. */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 30);
    return ctx.db
      .query('searchRuns')
      .withIndex('by_user_time', (q) => q.eq('userId', actor.userId))
      .order('desc')
      .take(limit);
  },
});

/** Cancel: queued|running → cancelled; queued tasks fold to cancelled too. */
export const cancel = mutation({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    assertOwned(run, actor.userId);
    if (run === null) throw fail('NOT_FOUND', 'Hunt not found.');
    if (run.status !== 'queued' && run.status !== 'running') {
      throw fail('INVALID_INPUT', 'Hunt already settled.');
    }
    if (run.status === 'queued') {
      const queued = await ctx.db
        .query('searchTasks')
        .withIndex('by_run_status', (q) => q.eq('runId', args.runId).eq('status', 'queued' as const))
        .collect();
      for (const t of queued) {
        await ctx.db.patch(t._id, { status: 'cancelled' as const, error: 'Search cancelled', updatedAt: Date.now() });
      }
    }
    await ctx.db.patch(args.runId, {
      status: 'cancelled' as const,
      canceledAt: Date.now(),
      finishedAt: Date.now(),
    });
    await ctx.db.insert('activityLogs', {
      userId: actor.userId, searchRunId: args.runId, eventType: 'search_cancelled',
      message: 'Hunt cancelled by you', createdAt: Date.now(),
    });
  },
});

/* ---------- internal transitions (action-owned) ---------- */

export const setRunning = internalMutation({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const mid = await ctx.db.get(args.runId);
    if (mid === null) throw fail('INTERNAL', 'Run vanished');
    if (mid.status === 'cancelled') return;
    await ctx.db.patch(args.runId, { status: 'running', startedAt: Date.now() });
  },
});

export const setPlanned = internalMutation({
  args: { runId: v.id('searchRuns'), plannedQueries: v.array(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { plannedQueries: args.plannedQueries });
  },
});

export const setResultCount = internalMutation({
  args: { runId: v.id('searchRuns'), resultCount: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { resultCount: args.resultCount });
  },
});

export const setCompleted = internalMutation({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) throw fail('INTERNAL', 'Run vanished');
    if (run.status === 'cancelled') return;
    await ctx.db.patch(args.runId, { status: 'completed', finishedAt: Date.now() });
    await ctx.db.insert('activityLogs', {
      userId: run.userId, searchRunId: args.runId, eventType: 'search_completed',
      message: `Hunt completed — ${run.resultCount} lead${run.resultCount === 1 ? '' : 's'}`,
      createdAt: Date.now(),
    });
  },
});

export const setFailed = internalMutation({
  args: { runId: v.id('searchRuns'), code: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) throw fail('INTERNAL', 'Run vanished');
    if (run.status === 'cancelled') return;
    await ctx.db.patch(args.runId, {
      status: 'failed', failCode: args.code, failReason: args.message, finishedAt: Date.now(),
    });
    await ctx.db.insert('activityLogs', {
      userId: run.userId, searchRunId: args.runId, eventType: 'search_failed',
      message: `Hunt failed: ${args.message}`, createdAt: Date.now(),
    });
  },
});

export const completeZeroResult = internalMutation({
  args: { runId: v.id('searchRuns'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) throw fail('INTERNAL', 'Run vanished');
    if (run.status === 'cancelled') return;
    await ctx.db.patch(args.runId, { status: 'completed', finishedAt: Date.now() });
    await ctx.db.insert('activityLogs', {
      userId: run.userId, searchRunId: args.runId, eventType: 'search_completed',
      message: args.reason ?? 'Hunt completed with no fresh leads found',
      createdAt: Date.now(),
    });
  },
});
