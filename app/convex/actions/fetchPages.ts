"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { LIMITS } from '../lib/limits';
import { isAllowedFetchable, canonicalUrl } from '../lib/urls';
import { fetchPages, runAgent, ProviderError } from '../providers/tinyfish';
import { hostAllowed, isPostingUrl, resolveSources, type HuntSource } from '../lib/sources';

/** The source a URL belongs to (run-scoped). */
function sourceFor(sources: readonly HuntSource[], url: string): HuntSource | null {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  for (const s of sources) {
    if (s.hosts.some(h => host === h || host.endsWith('.' + h))) return s;
  }
  return null;
}

/**
 * Fetch (SPEC §9): bounded batches (≤5 URLs/call, ≤4 batches/run), excerpt
 * clamps, thin-page agent fallback (≤2/run), then hand off to qualify.
 */
export const processFetchBatches = internalAction({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    type Claimed = { _id: Id<'searchTasks'>; payload: { url: string } };
    const run = await ctx.runQuery(internal.searchRuns.getInternal, { runId: args.runId });
    if (run === null) return;                      // vanished
    if (run.status !== 'running' && run.status !== 'queued') return;

    // A scoped run fetches only its sources' pages (defense in depth: the
    // discovery filter already dropped off-source hits).
    const sources = resolveSources(run.sources).slice(0, LIMITS.SEARCH.MAX_SOURCES_PER_RUN);
    let agentsUsed = 0;
    let lastError: string | null = null;
    const failures: string[] = [];
    // Board pages (Upwork categories, YC, Wellfound) list the postings as
    // LINKS. We expand them into real fetch tasks — one page per posting —
    // instead of burning an agent run to read the list.
    const expanded: { url: string; canonicalUrl: string; title?: string }[] = [];
    const seenUrls = new Set<string>();

    for (let batchNo = 0; batchNo < LIMITS.SEARCH.MAX_BATCHES_PER_RUN; batchNo++) {
      const still = await ctx.runQuery(internal.searchRuns.getInternal, { runId: args.runId });
      if (still === null || still.status === 'cancelled') return;

      const claimed = (await ctx.runMutation(internal.searchTasks.claimFetch, {
        runId: args.runId,
        batchSize: LIMITS.SEARCH.BATCH_SIZE,
      })) as Claimed[];
      if (claimed.length === 0) break;

      for (const c of claimed) seenUrls.add(c.payload.url);
      const urls = claimed.map(c => c.payload.url)
        .filter(u => isAllowedFetchable(u))
        .filter(u => hostAllowed(u, sources));
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
        const { pages, errors } = await fetchPages(urls);
        const byUrl = new Map(pages.map(p => [p.finalUrl ?? p.url, p]));

        for (const c of claimed) {
          const raw = c.payload.url;
          const page = byUrl.get(raw);
          if (page !== undefined) {
            // Board page → the postings are its links.
            const src = sourceFor(sources, raw);
            if (src !== null && src.listPage === true && expanded.length < LIMITS.SEARCH.MAX_EXPANDED_LINKS) {
              for (const link of page.links) {
                if (expanded.length >= LIMITS.SEARCH.MAX_EXPANDED_LINKS) break;
                if (!isAllowedFetchable(link)) continue;
                if (!hostAllowed(link, sources)) continue;
                if (!isPostingUrl(link, src)) continue;
                const cu = canonicalUrl(link);
                if (cu === null || seenUrls.has(cu)) continue;
                seenUrls.add(cu);
                expanded.push({ url: link, canonicalUrl: cu });
              }
            }
            const stored = canonicalUrl(page.finalUrl) ?? page.finalUrl;
            let text = page.textMarkdown;
            // Agent fallback for thin pages: content behind JS walls,
            // paywalls, cookie walls. Bounded ≤2 per run, goal is narrow.
            if (text.length < LIMITS.PAGE.MIN_USEFUL_TEXT && agentsUsed < LIMITS.AGENT.MAX_PER_RUN) {
              try {
                const agentPage = await runAgent(raw, narrowGoal(stored));
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

    if (expanded.length > 0) {
      await ctx.runMutation(internal.searchTasks.enqueueFetch, {
        runId: args.runId,
        userId: run.userId,
        tasks: expanded.map(e => ({ url: e.url, canonicalUrl: e.canonicalUrl, title: e.title })),
      });
      await ctx.runMutation(internal.activityLogs.record, {
        userId: run.userId, searchRunId: args.runId, eventType: 'urls_discovered',
        message: `Expanded ${expanded.length} posting${expanded.length === 1 ? '' : 's'} from board pages`,
        metadata: { expanded: expanded.length },
      });
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
