/** TEMPORARY dev probe — runs the REAL hunt pipeline for a synthetic account
 *  so the whole chain (search → fetch → qualify → leads) can be verified
 *  without a browser session. Removed right after. */
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

export const probeRun = mutation({
  args: { query: v.string(), sources: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const runId = await ctx.db.insert('searchRuns', {
      userId: 'probe',
      query: args.query,
      sources: args.sources,
      status: 'queued',
      resultCount: 0,
      queuedAt: now,
    });
    await ctx.db.insert('activityLogs', {
      userId: 'probe', searchRunId: runId, eventType: 'search_created',
      message: `Hunt queued: "${args.query}"`, createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.actions.discovery.startSearch, { runId });
    return { runId };
  },
});

export const probeState = query({
  args: { runId: v.optional(v.id('searchRuns')) },
  handler: async (ctx, args) => {
    const run = args.runId !== undefined ? await ctx.db.get(args.runId) : null;
    const logs = await ctx.db
      .query('activityLogs')
      .filter(q => q.eq(q.field('userId'), 'probe'))
      .take(40);
    const leads = await ctx.db
      .query('leads')
      .filter(q => q.eq(q.field('userId'), 'probe'))
      .take(10);
    const evidence = await ctx.db
      .query('leadEvidence')
      .filter(q => q.eq(q.field('userId'), 'probe'))
      .take(12);
    return {
      run: run === null ? null : {
        status: run.status, resultCount: run.resultCount, failReason: run.failReason ?? null,
        planned: run.plannedQueries ?? null, sources: run.sources ?? null,
      },
      events: logs.map(l => `${l.eventType}: ${l.message}`),
      leads: leads.map(l => ({
        title: l.title,
        company: l.company,
        domain: l.domain,
        score: l.scoreOverall,
        budgetVerified: l.budgetVerified,
        budgetNote: l.budgetNote ?? null,
        type: l.opportunityType ?? null,
        intent: l.intent,
        claims: (l.claims ?? []).slice(0, 4),
        url: l.url,
      })),
      evidence: evidence.map(e => ({
        claim: e.claimKey, value: e.value, excerpt: e.evidenceExcerpt.slice(0, 160),
      })),
    };
  },
});
