import { mutation, internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { requireActor, assertOwned } from './lib/actor';
import { fail } from './lib/errors';

/**
 * leads — the scored output. Idempotent upsert by (userId, canonicalUrl);
 * CRM status always rewritable by the owner; evidence stores claim rows
 * with page excerpts (read-through from public getWithEvidence).
 */
const claimShape = v.object({
  kind: v.string(),
  value: v.string(),
  evidenceExcerpt: v.string(),
  sourceUrl: v.string(),
});

export const upsert = internalMutation({
  args: {
    userId: v.string(),
    runId: v.id('searchRuns'),
    canonicalUrl: v.string(),
    url: v.string(),
    title: v.string(),
    company: v.string(),
    description: v.string(),
    location: v.optional(v.string()),
    opportunityType: v.union(
      v.literal('one_off'), v.literal('short_term'), v.literal('long_term'),
      v.literal('recurrent'), v.literal('unknown'),
    ),
    intent: v.union(
      v.literal('hiring_now'), v.literal('exploring'),
      v.literal('not_specific'), v.literal('anti_freelance'),
    ),
    budgetVerified: v.boolean(),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    budgetNote: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    score: v.object({
      intent: v.number(), skill: v.number(), freshness: v.number(),
      budgetFit: v.number(), sourceReliability: v.number(),
      overall: v.number(), explanation: v.string(),
    }),
    claims: v.array(claimShape),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('leads')
      .withIndex('by_user_url', (q) => q.eq('userId', args.userId).eq('canonicalUrl', args.canonicalUrl))
      .first();

    let leadId: Id<'leads'>;
    if (existing !== null) {
      // Re-runs refresh scores/evidence; the owner's CRM status is theirs
      // and is never reset by a re-run (dismissed stays dismissed).
      await ctx.db.patch(existing._id, {
        runId: args.runId,
        url: args.url,
        title: args.title,
        company: args.company,
        description: args.description,
        location: args.location,
        opportunityType: args.opportunityType,
        intent: args.intent,
        budgetVerified: args.budgetVerified,
        budgetMin: args.budgetMin,
        budgetMax: args.budgetMax,
        budgetNote: args.budgetNote,
        publishedAt: args.publishedAt,
        scoreIntent: args.score.intent,
        scoreSkill: args.score.skill,
        scoreFreshness: args.score.freshness,
        scoreBudgetFit: args.score.budgetFit,
        scoreSourceReliability: args.score.sourceReliability,
        scoreOverall: args.score.overall,
        scoreExplanation: args.score.explanation,
        claims: [],
        lastVerifiedAt: now,
        updatedAt: now,
      });
      leadId = existing._id;
      // Old evidence out — fresh page, fresh claims.
      const old = await ctx.db
        .query('leadEvidence')
        .withIndex('by_lead', (q) => q.eq('leadId', leadId))
        .collect();
      for (const e of old) {
        await ctx.db.delete(e._id);
      }
    } else {
      leadId = await ctx.db.insert('leads', {
        userId: args.userId,
        runId: args.runId,
        canonicalUrl: args.canonicalUrl,
        url: args.url,
        domain: new URL(args.canonicalUrl).hostname.replace(/^www\./, ''),
        title: args.title,
        company: args.company,
        description: args.description,
        location: args.location,
        budgetVerified: args.budgetVerified,
        budgetMin: args.budgetMin,
        budgetMax: args.budgetMax,
        budgetNote: args.budgetNote,
        publishedAt: args.publishedAt,
        opportunityType: args.opportunityType,
        intent: args.intent,
        claims: [],
        scoreIntent: args.score.intent,
        scoreSkill: args.score.skill,
        scoreFreshness: args.score.freshness,
        scoreBudgetFit: args.score.budgetFit,
        scoreSourceReliability: args.score.sourceReliability,
        scoreOverall: args.score.overall,
        scoreExplanation: args.score.explanation,
        crmStatus: 'new',
        lastVerifiedAt: now,
        updatedAt: now,
      });
    }

    for (const c of args.claims) {
      await ctx.db.insert('leadEvidence', {
        leadId,
        userId: args.userId,
        sourceUrl: c.sourceUrl,
        claimKey: c.kind,
        value: c.value,
        evidenceExcerpt: c.evidenceExcerpt,
        createdAt: now,
      });
    }

    await ctx.db.insert('activityLogs', {
      userId: args.userId,
      searchRunId: args.runId,
      eventType: 'lead_qualified',
      message: `Lead qualified: ${args.title}`,
      metadata: { score: args.score.overall },
      createdAt: now,
    });
    await ctx.db.insert('activityLogs', {
      userId: args.userId,
      searchRunId: args.runId,
      eventType: 'qualification_completed',
      message: 'All candidate pages scored',
      createdAt: now,
    });
    return leadId;
  },
});

/* ---------- public reads ---------- */

/** Internal variant for actions (no identity in ctx; caller owner-checks). */
export const byIdInternal = internalQuery({
  args: { leadId: v.id('leads') },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (lead === null) return { lead: null, evidence: [] };
    const rows = await ctx.db
      .query('leadEvidence')
      .withIndex('by_lead', (q) => q.eq('leadId', args.leadId))
      .collect();
    return {
      lead,
      evidence: rows.map(r => ({
        sourceUrl: r.sourceUrl, claimKey: r.claimKey, value: r.value, evidenceExcerpt: r.evidenceExcerpt,
      })),
    };
  },
});

export const listMine = query({
  args: {
    status: v.optional(v.union(
      v.literal('new'), v.literal('saved'), v.literal('contacted'),
      v.literal('replied'), v.literal('won'), v.literal('lost'),
      v.literal('dismissed'),
    )),
    limit: v.optional(v.number()),
    minScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 200);
    const rows = await ctx.db
      .query('leads')
      .withIndex('by_user_score', (q) => q.eq('userId', actor.userId))
      .order('desc')
      .take(limit * 2);
    return rows
      .filter(r => args.status === undefined ? r.crmStatus !== 'dismissed' : r.crmStatus === args.status)
      .filter(r => (args.minScore ?? 0) <= r.scoreOverall)
      .slice(0, limit);
  },
});

/** One lead + its evidence rows (owner-checked for the detail view). */
export const getWithEvidence = query({
  args: { leadId: v.id('leads') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const lead = await ctx.db.get(args.leadId);
    assertOwned(lead, actor.userId);
    if (lead === null) throw fail('NOT_FOUND', 'Lead not found.');
    const evidence = await ctx.db
      .query('leadEvidence')
      .withIndex('by_lead', (q) => q.eq('leadId', args.leadId))
      .collect();
    return { lead, evidence };
  },
});

/** Set CRM status (own leads only; dismissed keeps evidence for honesty). */
export const updateStatus = mutation({
  args: {
    leadId: v.id('leads'),
    status: v.union(
      v.literal('new'), v.literal('saved'), v.literal('contacted'),
      v.literal('replied'), v.literal('won'), v.literal('lost'),
      v.literal('dismissed'),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const lead = await ctx.db.get(args.leadId);
    assertOwned(lead, actor.userId);
    if (lead === null) throw fail('NOT_FOUND', 'Lead not found.');
    await ctx.db.patch(args.leadId, { crmStatus: args.status, updatedAt: Date.now() });
    return true;
  },
});
