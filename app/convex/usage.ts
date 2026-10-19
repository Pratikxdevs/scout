import { query } from './_generated/server';
import { v } from 'convex/values';
import { requireActor } from './lib/actor';
import { LIMITS } from './lib/limits';

/**
 * usage — one owner-scoped query that answers "how much have I used today"
 * for the caps meter: leads saved, pipeline rows, hunts run today vs limit.
 */
export const summary = query({
  args: { since: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const since = args.since ?? startOfToday();

    const pipelineByStatus = { new: 0, saved: 0, contacted: 0, replied: 0, won: 0, lost: 0, dismissed: 0 };
    let pipelineTotal = 0;
    let topScore: number | null = null;
    let leadsSavedToday = 0;

    const leads = await ctx.db
      .query('leads')
      .withIndex('by_user_score', (q) => q.eq('userId', actor.userId))
      .take(250);
    for (const l of leads) {
      pipelineByStatus[l.crmStatus] = (pipelineByStatus[l.crmStatus] ?? 0) + 1;
      if (l.crmStatus !== 'dismissed') pipelineTotal++;
      topScore = topScore === null ? l.scoreOverall : Math.max(topScore, l.scoreOverall);
      if (l.lastVerifiedAt >= since) leadsSavedToday++;
    }

    const hunts = await ctx.db
      .query('searchRuns')
      .withIndex('by_user_status', (q) => q.eq('userId', actor.userId).eq('status', 'running' as const))
      .collect();
    const queued = await ctx.db
      .query('searchRuns')
      .withIndex('by_user_status', (q) => q.eq('userId', actor.userId).eq('status', 'queued' as const))
      .collect();
    const huntsToday = await ctx.db
      .query('searchRuns')
      .withIndex('by_user_time', (q) => q.eq('userId', actor.userId))
      .take(60);

    return {
      leadsSavedToday,
      pipelineTotal,
      pipelineByStatus,
      topScore,
      huntsInFlight: hunts.length + queued.length,
      huntsToday: huntsToday.filter(r => r.queuedAt >= since).length,
      huntLimitPerUser: LIMITS.SEARCH.MAX_RUNNING_PER_USER,
    };
  },
});

function startOfToday(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
