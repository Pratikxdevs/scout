"use node";
import type { ActionCtx } from '../_generated/server';
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal, api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { completeJson, llmKey } from '../providers/llm';
import { draftSystem, draftUser } from '../lib/prompt';
import { LIMITS } from '../lib/limits';
import { fail } from '../lib/errors';

/** Outreach drafts (SPEC §7): drafts only — Scout never sends. */
export const generate = internalAction({
  args: { leadId: v.id('leads'), userId: v.string(), runId: v.optional(v.id('searchRuns')) },
  handler: async (ctx: ActionCtx, args): Promise<Id<'outreachDrafts'>> => {
    if (llmKey(ctx) === null) {
      throw fail('PROVIDER_UNCONFIGURED', 'LLM_API_KEY is not set on this Convex deployment.');
    }
    type EvidenceRow = { sourceUrl: string; claimKey: string; value: string; evidenceExcerpt: string };
    const head = await ctx.runQuery(internal.leads.byIdInternal, { leadId: args.leadId }) as {
      lead: {
        userId: string; title: string; company: string; description: string; budgetVerified: boolean;
      } | null;
      evidence: EvidenceRow[];
    };
    if (head.lead === null) throw fail('NOT_FOUND', 'Lead not found.');
    if (head.lead.userId !== args.userId) throw fail('FORBIDDEN', 'Not your lead.');

    const profile = await ctx.runQuery(api.profiles.getMine, {}) as {
      name?: string; skills?: string[]; minBudget?: number | null; maxBudget?: number | null;
    } | null;
    const budget = (profile?.minBudget ?? null) != null || (profile?.maxBudget ?? null) != null
      ? `${profile?.minBudget ?? '—'}–${profile?.maxBudget ?? '—'} USD`
      : 'flexible';
    const pageFacts = head.evidence.map(e => `${e.claimKey}: ${e.value} (excerpt: “${e.evidenceExcerpt.slice(0, 140)}”)`).join('\n- ');

    const out = await completeJson<{ subject: string; body: string }>(ctx, [
      { role: 'system', content: draftSystem() },
      {
        role: 'user',
        content: draftUser({
          myName: profile?.name ?? 'the sender',
          mySkills: profile?.skills ?? [],
          budget,
          leadTitle: head.lead.title,
          leadCompany: head.lead.company,
          pageText: `The lead (from a source page excerpt): ${head.lead.description}\nFacts: ${pageFacts}`,
          excerptMax: LIMITS.PAGE.MAX_EXCERPT_CHARS,
        }),
      },
    ], { maxTokens: 500 });

    const subject = typeof out.subject === 'string' ? out.subject.slice(0, 160) : '';
    const body = typeof out.body === 'string' ? out.body.slice(0, 4000) : '';
    if (subject === '' || body === '') {
      throw fail('PROVIDER_ERROR', 'Draft came back empty — try again.');
    }
    const draftId = await ctx.runMutation(internal.outreachDrafts.upsertDraft, {
      userId: args.userId,
      leadId: args.leadId,
      channel: 'email',
      subject,
      body,
    }) as Id<'outreachDrafts'>;
    await ctx.runMutation(internal.activityLogs.record, {
      userId: args.userId,
      eventType: 'draft_generated',
      message: `Draft ready for ${head.lead.title}`,
    });
    return draftId;
  },
});

