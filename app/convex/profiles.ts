import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireActor } from './lib/actor';
import { fail } from './lib/errors';
import { LIMITS } from './lib/limits';

/** Field validators shared by save. */
const profileFields = {
  name: v.string(),
  email: v.string(),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  summary: v.optional(v.string()),
  services: v.array(v.string()),
  skills: v.array(v.string()),
  industries: v.array(v.string()),
  keywords: v.optional(v.array(v.string())),
  exclusionDomains: v.optional(v.array(v.string())),
  minBudget: v.optional(v.number()),
  maxBudget: v.optional(v.number()),
  workSetup: v.optional(v.union(
    v.literal('Remote'), v.literal('Hybrid'), v.literal('On-site'),
  )),
};

const arr = (list: string[] | undefined, cap: number, what: string): string[] => {
  if (!list) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const clean = item.trim();
    if (clean === '') continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= cap) break;
  }
  if (list.length > cap * 2) {
    throw fail('INVALID_INPUT', `Too many ${what}.`);
  }
  return out;
};

/** Upsert the caller's ICP. OWNER-scoped by construction (identity in JWT). */
export const save = mutation({
  args: {
    ...profileFields,
    onboardingCompleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    if (args.name.trim() === '') {
      throw fail('INVALID_INPUT', 'Name is required.');
    }
    if (!args.email.includes('@') || args.email.length > 200) {
      throw fail('INVALID_INPUT', 'Valid email is required.');
    }
    if (args.minBudget !== undefined && args.maxBudget !== undefined
        && args.minBudget > args.maxBudget) {
      throw fail('INVALID_INPUT', 'Budget minimum cannot exceed the maximum.');
    }
    const now = Date.now();
    const row = {
      userId: actor.userId,
      name: args.name.trim().slice(0, 120),
      email: args.email.trim().slice(0, 200),
      city: args.city?.trim().slice(0, 80) ?? undefined,
      country: args.country?.trim().slice(0, 80) ?? undefined,
      summary: args.summary?.slice(0, 600) ?? undefined,
      services: arr(args.services, LIMITS.PROFILES.SERVICES, 'services'),
      skills: arr(args.skills, LIMITS.PROFILES.SKILLS, 'skills'),
      industries: arr(args.industries, LIMITS.PROFILES.INDUSTRIES, 'industries'),
      keywords: arr(args.keywords, LIMITS.PROFILES.KEYWORDS, 'keywords'),
      exclusionDomains: arr(args.exclusionDomains, LIMITS.PROFILES.EXCLUSION_DOMAINS, 'excluded domains')
        .map(d => d.toLowerCase().replace(/^www\./, '')),
      minBudget: args.minBudget,
      maxBudget: args.maxBudget,
      workSetup: args.workSetup,
      onboardingCompleted: args.onboardingCompleted,
      updatedAt: now,
    };
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('userId', actor.userId))
      .first();
    if (existing !== null) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert('profiles', row);
  },
});

/** The caller's ICP, or null pre-onboarding. */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);
    return ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('userId', actor.userId))
      .first();
  },
});
