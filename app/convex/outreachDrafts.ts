import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireActor, assertOwned } from './lib/actor';
import { fail } from './lib/errors';

/**
 * outreachDrafts — one email draft per (lead, channel), drafts only.
 * "sent" is explicitly NOT a state here: sending is out of Scout's scope
 * by design (SPEC §7). Approved drafts are locked from edits.
 */
export const upsertDraft = internalMutation({
  args: {
    userId: v.string(),
    leadId: v.id('leads'),
    channel: v.union(v.literal('email')),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (lead === null || lead.userId !== args.userId) {
      throw fail('FORBIDDEN', 'Not your lead.');
    }

    const existing = await ctx.db
      .query('outreachDrafts')
      .withIndex('by_lead_channel', (q) => q.eq('leadId', args.leadId).eq('channel', args.channel))
      .first();
    if (existing !== null) {
      if (existing.status === 'approved') {
        throw fail('INVALID_INPUT', 'Draft approved — locked. Generate a fresh one instead.');
      }
      await ctx.db.patch(existing._id, {
        subject: args.subject, body: args.body, updatedAt: Date.now(), status: 'draft',
      });
      return existing._id;
    }
    const now = Date.now();
    return ctx.db.insert('outreachDrafts', {
      userId: args.userId,
      leadId: args.leadId,
      channel: args.channel,
      subject: args.subject,
      body: args.body,
      status: 'draft',
      generatedAt: now,
      updatedAt: now,
    });
  },
});

/** Read one draft for a lead (owner). */
export const getForLead = query({
  args: {
    leadId: v.id('leads'),
    channel: v.union(v.literal('email')),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const lead = await ctx.db.get(args.leadId);
    assertOwned(lead, actor.userId);
    if (lead === null) return null;
    return ctx.db
      .query('outreachDrafts')
      .withIndex('by_lead_channel', (q) => q.eq('leadId', args.leadId).eq('channel', args.channel))
      .first();
  },
});

/** List drafts (owner) for the drafts surface. */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 60);
    return ctx.db
      .query('outreachDrafts')
      .withIndex('by_user_time', (q) => q.eq('userId', actor.userId))
      .order('desc')
      .take(limit);
  },
});

/** Edit a draft in place unless it's approved. */
export const update = mutation({
  args: { draftId: v.id('outreachDrafts'), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const draft = await ctx.db.get(args.draftId);
    assertOwned(draft, actor.userId);
    if (draft === null) throw fail('NOT_FOUND', 'Draft not found.');
    if (draft.status === 'approved') {
      throw fail('FORBIDDEN', 'Draft approved — locked from edits.');
    }
    await ctx.db.patch(args.draftId, {
      subject: args.subject.slice(0, 160),
      body: args.body.slice(0, 4000),
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** Approve locks a draft permanently (manual send is the user's job). */
export const approve = mutation({
  args: { draftId: v.id('outreachDrafts') },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const draft = await ctx.db.get(args.draftId);
    assertOwned(draft, actor.userId);
    if (draft === null) throw fail('NOT_FOUND', 'Draft not found.');
    await ctx.db.patch(args.draftId, { status: 'approved', updatedAt: Date.now() });
    return true;
  },
});
