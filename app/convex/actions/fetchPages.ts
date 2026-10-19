"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { LIMITS } from '../lib/limits';
import { isAllowedFetchable, canonicalUrl } from '../lib/urls';
import { fetchPages, runAgent, ProviderError } from '../providers/tinyfish';

/**
 * Fetch (SPEC §9): bounded batches (≤5 URLs/call, ≤4 batches/run), excerpt
 * clamps, thin-page agent fallback (≤2/run), then hand off to qualify.
 */
export const processFetchBatches = internalAction({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    type Claimed = { _id: Id<'searchTasks'>; payload: { url: string } };
    const run = await ctx.runQuery(api.searchRuns.get, { runId: args.runId });
    if (run === null) return;                      // vanished
    if (run.status !== 'running' && run.status !== 'queued') return;

    let agentsUsed = 0;
    let lastError: string | null = null;
    const failures: string[] = [];

    for (let batchNo = 0; batchNo < LIMITS.SEARCH.MAX_BATCHES_PER_RUN; batchNo++) {
      const still = await ctx.runQuery(api.searchRuns.get, { runId: args.runId });
      if (still === null || still.status === 'cancelled') return;

      const claimed = (await ctx.runMutation(internal.searchTasks.claimFetch, {
        runId: args.runId,
        batchSize: LIMITS.SEARCH.BATCH_SIZE,
      })) as Claimed[];
      if (claimed.length === 0) break;

      const urls = claimed.map(c => c.payload.url).filter(u => isAllowedFetchable(u));
      if (urls.length === 0) {
        for (const c of claimed) {
          await ctx.runMutation(internal.searchTasks.failOrRequeue, {
            taskId: c._id,
            error: 'URL refused by Scout fetch guard',
          });
        }
        continue;
      }

      try {
        const { pages, errors } = await fetchPages(ctx, urls);
        const byUrl = new Map(pages.map(p => [p.finalUrl ?? p.url, p]));

        for (const c of claimed) {
          const raw = c.payload.url;
          const page = byUrl.get(raw);
          if (page !== undefined) {
            const stored = canonicalUrl(page.finalUrl) ?? page.finalUrl;
            let text = page.textMarkdown;
            // Agent fallback for thin pages: content behind JS walls,
            // paywalls, cookie walls. Bounded ≤2 per run, goal is narrow.
            if (text.length < LIMITS.PAGE.MIN_USEFUL_TEXT && agentsUsed < LIMITS.AGENT.MAX_PER_RUN) {
              try {
                const agentPage = await runAgent(ctx, raw, narrowGoal(stored));
                text = agentPage.textMarkdown;
                agentsUsed++;
                await ctx.runMutation(internal.activityLogs.record, {
                  userId: run.userId, searchRunId: args.runId, eventType: 'agent_fallback_used',
                  message: `Agent fallback: ${stored}`,
                });
              } catch (err) {
                const pe = err instanceof Error ? err : new Error('agent failed');
                failures.push(`agent fallback failed: ${pe.message}`);
              }
            }
            await ctx.runMutation(internal.searchTasks.complete, {
              taskId: c._id,
              result: {
                url: raw,
                finalUrl: stored,
                title: page.title,
                textExcerpt: text.slice(0, LIMITS.PAGE.MAX_EXCERPT_CHARS),
              },
            });
          } else {
            const err = errors.find(e => e.url === raw);
            await ctx.runMutation(internal.searchTasks.failOrRequeue, {
              taskId: c._id,
              error: err?.message ?? 'No page content returned',
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown fetch failure';
        lastError = message;
        if (err instanceof ProviderError && !err.retryable) {
          for (const c of claimed) {
            await ctx.runMutation(internal.searchTasks.failOrRequeue, { taskId: c._id, error: message });
          }
          break;   // permanent — stop, let qualify finish with what exists
        }
        for (const c of claimed) {
          await ctx.runMutation(internal.searchTasks.failOrRequeue, { taskId: c._id, error: message });
        }
      }
    }

    await ctx.runMutation(internal.activityLogs.record, {
      userId: run.userId, searchRunId: args.runId, eventType: 'fetch_completed',
      message: agentsUsed > 0 ? `Fetched pages (agent rescued ${agentsUsed})` : 'Fetched pages',
      metadata: (lastError !== null || failures.length > 0)
        ? { lastError, failures: failures.slice(0, 3) }
        : undefined,
    });

    await ctx.scheduler.runAfter(0, internal.actions.qualifyLeads.qualifyRun, { runId: args.runId });
  },
});

function narrowGoal(url: string): string {
  return `Read this page and report the role/lead details as plain text: title, company, what they want, money mentioned, when posted, contact. Page: ${url}`;
}
