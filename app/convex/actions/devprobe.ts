"use node";

/** TEMPORARY dev probe — shows the RAW extraction output for one fetched
 *  page, so we can see exactly why a page produces no lead. */
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { completeJson } from '../providers/llm';
import { extractLeadSystem, extractLeadUser } from '../lib/prompt';

export const diagnose = internalAction({
  args: { runId: v.id('searchRuns'), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<unknown> => {
    const tasks = (await ctx.runQuery(internal.searchTasks.completedForRun, { runId: args.runId })) as Array<{
      payload: { url: string }; result: { finalUrl: string; title: string; textExcerpt: string } | null;
    }>;
    const pages = tasks.filter(t => t.result !== null);
    const out: unknown[] = [];
    for (const t of pages.slice(0, args.limit ?? 2)) {
      const page = t.result!.textExcerpt;
      const entry: Record<string, unknown> = {
        url: t.payload.url,
        chars: page.length,
        head: page.slice(0, 220).replace(/\s+/g, ' '),
      };
      try {
        const raw = await completeJson<unknown>(ctx, [
          { role: 'system', content: extractLeadSystem() },
          {
            role: 'user',
            content: extractLeadUser({
              profile: { services: ['react developer'], skills: ['react'], industries: ['saas'], minBudget: null, maxBudget: null },
              query: 'freelance react developer',
              excerptMax: 12000,
            }, page),
          },
        ], { maxTokens: 900 });
        const obj = (raw ?? {}) as Record<string, unknown>;
        entry.isWorthScoring = obj.isWorthScoring;
        entry.intent = obj.intent;
        entry.title = obj.title;
        entry.claimCount = Array.isArray(obj.claims) ? obj.claims.length : -1;
        entry.claims = (Array.isArray(obj.claims) ? obj.claims : []).slice(0, 3);
        entry.rawKeys = Object.keys(obj);
      } catch (e) {
        entry.error = e instanceof Error ? e.message.slice(0, 300) : 'unknown';
      }
      out.push(entry);
    }
    return out;
  },
});
