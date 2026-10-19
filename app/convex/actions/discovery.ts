"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { canonicalUrl } from '../lib/urls';
import { LIMITS } from '../lib/limits';
import { searchWeb, toProviderError } from '../providers/tinyfish';

/** Query planner lives at the bottom of this module — deterministic. */
export const startSearch = internalAction({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.searchRuns.getInternal, { runId: args.runId });
    if (run === null) return;               // gone
    if (run.status !== 'queued') return;    // cancelled while queued

    await ctx.runMutation(internal.searchRuns.setRunning, { runId: args.runId });

    const profile = await ctx.runQuery(internal.profiles.rowFor, { userId: run.userId }) as
      { services?: string[]; industries?: string[]; keywords?: string[] } | null;
    const plan = planQueries(run.query, profile);
    await ctx.runMutation(internal.searchRuns.setPlanned, { runId: args.runId, plannedQueries: plan });

    // Provider per planner query; one retry per query on transient errors.
    const candidates = new Map<string, { url: string; title: string; publishedAt: number | null }>();
    const failures: string[] = [];
    for (const [idx, planQuery] of plan.entries()) {
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const { hits } = await searchWeb(planQuery);
          for (const h of hits) {
            const cu = canonicalUrl(h.url) ?? '';
            if (cu === '' || !cu.startsWith('https://')) continue;
            if (candidates.size >= LIMITS.SEARCH.MAX_URLS_PER_RUN) break;
            if (!candidates.has(cu)) candidates.set(cu, { url: h.url, title: h.title, publishedAt: h.publishedAt });
          }
          break; // this planner query worked — no retry needed
        } catch (err) {
          const pe = toProviderError(err);
          failures.push(pe.retryable && attempt === 0
            ? `retrying “${planQuery}”: ${pe.message}`
            : `search “${planQuery}” failed: ${pe.message}`);
          if (!pe.retryable || attempt === 1) break;
          await sleep(2000 * (idx + 1));   // gentle jittered backoff
        }
      }
    }

    if (candidates.size === 0) {
      const reason = failures.length > 0
        ? `No URLs found — ${failures[0]}`
        : 'No URLs found — the web has no fresh hits for this hunt today.';
      await ctx.runMutation(internal.searchRuns.completeZeroResult, { runId: args.runId, reason });
      return;
    }

    await ctx.runMutation(internal.searchTasks.enqueueFetch, {
      runId: args.runId,
      userId: run.userId,
      tasks: [...candidates.values()].slice(0, LIMITS.SEARCH.MAX_URLS_PER_RUN).map(p => ({
        url: p.url,
        canonicalUrl: canonicalUrl(p.url) ?? p.url,
        title: p.title,
        publishedAt: p.publishedAt ?? undefined,
      })),
    });
    await ctx.runMutation(internal.activityLogs.record, {
      userId: run.userId, searchRunId: args.runId, eventType: 'urls_discovered',
      message: `Found ${candidates.size} candidate page${candidates.size === 1 ? '' : 's'}`,
      metadata: { queries: plan },
    });

    // Handoff: batches processed by the fetch action.
    await ctx.scheduler.runAfter(0, internal.actions.fetchPages.processFetchBatches, { runId: args.runId });
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Deterministic query planner — cheap (no LLM), honest, sits on the ICP. */
export function planQueries(query: string, profile: {
  services?: string[]; industries?: string[]; keywords?: string[];
} | null): string[] {
  const q = (query ?? '').trim();
  const year = new Date().getFullYear();
  const service = profile?.services?.[0];
  const industry = profile?.industries?.[0];
  const keyword = profile?.keywords?.[0];

  const out = [
    `"${q}" ${year}`,
    service ? `freelance ${service} ${industry ?? ''} ${q}`.replace(/\s+/g, ' ').trim() : `freelance ${q} ${industry ?? ''}`.replace(/\s+/g, ' ').trim(),
    keyword ? `${keyword} ${year}` : `${q} project budget "$"`,
  ];
  return out.slice(0, LIMITS.SEARCH.MAX_QUERIES_PER_RUN);
}
