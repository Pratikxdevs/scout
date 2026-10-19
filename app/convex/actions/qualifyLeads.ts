"use node";
import type { ActionCtx } from '../_generated/server';
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal, api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { LIMITS } from '../lib/limits';
import { excerptSupported, scoreLead, skillMatchRatio } from '../lib/scoring';
import { completeJson, LlmError, llmKey } from '../providers/llm';
import { extractLeadSystem, extractLeadUser } from '../lib/prompt';
import { domainClass } from '../lib/urls';

const u = (x: unknown, max: number): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Extracted LLM shape (post-parse, untrusted): every field re-validated. */
interface Extracted {
  isWorthScoring: boolean;
  company: string; title: string;
  intent: 'hiring_now' | 'exploring' | 'not_specific' | 'anti_freelance';
  opportunityType: 'one_off' | 'short_term' | 'long_term' | 'recurrent' | 'unknown';
  budget: { verified: boolean; min: number | null; max: number | null; note: string };
  location: string;
  publishedAt: string;
  claims: Array<{ kind: string; value: string; evidenceExcerpt: string }>;
  skillMatchNote: string;
}

/**
 * Qualify (SPEC §10): completed fetch tasks → LLM extraction → claim
 * verification → deterministic scoring → idempotent lead upsert. Claims
 * without supporting page evidence are dropped; pages with no claims and
 * no concrete intent are skipped. Code owns all math and explanations.
 */
export const qualifyRun = internalAction({
  args: { runId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(api.searchRuns.get, { runId: args.runId });
    if (run === null) return;
    if (run.status === 'cancelled' || run.status === 'failed') return;

    if (llmKey(ctx) === null) {
      // Honest stop — scoring without a model would invent matches.
      await ctx.runMutation(internal.searchRuns.setFailed, {
        runId: args.runId,
        code: 'PROVIDER_UNCONFIGURED',
        message: 'LLM_API_KEY is not set on this Convex deployment — scoring skipped.',
      });
      return;
    }

    const tasks = (await ctx.runQuery(internal.searchTasks.completedForRun, { runId: args.runId })) as Array<{
      _id: Id<'searchTasks'>; payload: { url: string }; result: { finalUrl: string; title: string; textExcerpt: string } | null;
    }>;
    const pages = tasks.filter((t): t is {
      _id: Id<'searchTasks'>; payload: { url: string }; result: { finalUrl: string; title: string; textExcerpt: string };
    } => t.result !== null && typeof t.result.textExcerpt === 'string');
    if (pages.length === 0) {
      await ctx.runMutation(internal.searchRuns.completeZeroResult, {
        runId: args.runId,
        reason: 'No usable page content survived the fetch stage — try different words.',
      });
      return;
    }

    const profile = await ctx.runQuery(api.profiles.getMine, {}) as {
      services?: string[]; skills?: string[]; industries?: string[];
      minBudget?: number | null; maxBudget?: number | null;
    } | null;
    const icp = {
      services: profile?.services ?? [],
      skills: profile?.skills ?? [],
      industries: profile?.industries ?? [],
      minBudget: profile?.minBudget ?? null,
      maxBudget: profile?.maxBudget ?? null,
    };

    let leadsWritten = 0;
    for (const t of pages) {
      try {
        const ok = await qualifyOne(ctx, t, icp, run.userId, args.runId);
        if (ok) leadsWritten++;
      } catch (err) {
        if (err instanceof LlmError && err.retryable) {
          // bounded: qualification retry-once inside completeJson already runs;
          // deeper retries belong to the limits — skip to the next page.
        }
      }
    }

    await ctx.runMutation(internal.searchRuns.setResultCount, { runId: args.runId, resultCount: leadsWritten });
    await ctx.runMutation(internal.searchRuns.setCompleted, { runId: args.runId });
  },
});

async function qualifyOne(
  ctx: ActionCtx,
  task: { _id: Id<'searchTasks'>; payload: { url: string }; result: { finalUrl: string; title: string; textExcerpt: string } },
  icp: { services: string[]; skills: string[]; industries: string[]; minBudget: number | null; maxBudget: number | null },
  userId: string,
  runId: Id<'searchRuns'>,
): Promise<boolean> {  const extract = await completeJson<Extracted>(ctx, [
    { role: 'system', content: extractLeadSystem() },
    {
      role: 'user',
      content: extractLeadUser({
        profile: icp,
        query: 'freelance search',
        excerptMax: LIMITS.PAGE.MAX_EXCERPT_CHARS,
      }, task.result.textExcerpt),
    },
  ], { maxTokens: 900 });

  if (typeof extract !== 'object' || extract === null || extract.isWorthScoring === false) return false;

  const page = task.result.textExcerpt;
  // Evidence gate (SPEC §9): claim survives only with a resourced excerpt.
  const claims = (Array.isArray(extract.claims) ? extract.claims : [])
    .filter(c => excerptSupported(page, typeof c?.evidenceExcerpt === 'string' ? c.evidenceExcerpt : ''))
    .slice(0, 5)
    .map(c => ({
      kind: KINDS.has(c.kind) ? c.kind : 'other',
      value: u(c.value, 240),
      evidenceExcerpt: u(c.evidenceExcerpt, 300),
      sourceUrl: task.result.finalUrl,
    }));

  const intent = INTENTS.has(extract.intent) ? extract.intent : 'not_specific';
  if (claims.length === 0 && intent === 'not_specific') return false;

  if (claims.some(c => c.kind === 'budget') || extract.budget?.verified === true) {
    // keep LLM-shaped budget only when the page itself showed a number
    verifyBudget(extract, page);
  }

  const score = scoreLead({
    intent,
    skillMatchRatio: skillMatchRatio(
      icp.skills,
      `${extract.title ?? ''} ${extract.company ?? ''} ${extract.skillMatchNote ?? ''} ${claims.map(c => c.value).join(' ')} ${page.slice(0, 4000)}`,
    ),
    publishedAt: toDate(extract.publishedAt),
    budget: {
      verified: extract.budget?.verified === true,
      min: numOrNull(extract.budget?.min),
      max: numOrNull(extract.budget?.max),
    },
    icpBudget: { min: icp.minBudget, max: icp.maxBudget },
    domain: hostname(task.result.finalUrl),
  });

  await ctx.runMutation(internal.leads.upsert, {
    userId,
    runId,
    canonicalUrl: new URL(task.result.finalUrl).toString(),
    url: task.payload.url,
    title: u(extract.title, 140) || task.result.title.slice(0, 140) || 'Untitled lead',
    company: u(extract.company, 120) || hostname(task.result.finalUrl),
    description: u(extract.skillMatchNote, 600),
    location: u(extract.location, 120),
    opportunityType: TYPES.has(extract.opportunityType) ? extract.opportunityType : 'unknown',
    intent,
    budgetVerified: extract.budget?.verified === true,
    budgetMin: numOrNull(extract.budget?.min) ?? undefined,
    budgetMax: numOrNull(extract.budget?.max) ?? undefined,
    budgetNote: u(extract.budget?.note, 80),
    publishedAt: toDate(extract.publishedAt) ?? undefined,
    score,
    claims,
  });
  return true;
}

const KINDS = new Set(['intent', 'budget', 'skill', 'location', 'timeline']);
const INTENTS = new Set(['hiring_now', 'exploring', 'anti_freelance']) as Set<string>;
const TYPES = new Set(['one_off', 'short_term', 'long_term', 'recurrent']);

/** LLM may hallucinate the verified flag — require a number ON THE PAGE. */
function verifyBudget(extract: Extracted, page: string): void {
  if (extract.budget?.verified !== true) return;
  const lo = numOrNull(extract.budget?.min);
  const hi = numOrNull(extract.budget?.max);
  if (lo === null && hi === null) {
    extract.budget = { verified: false, min: null, max: null, note: '' };
    return;
  }
  const pageHasNumber = /[$€£]\s?\d{2,7}|\d{2,7}\s?(k|km|k\/|hr|hour|\/h)/i.test(page);
  if (!pageHasNumber) extract.budget = { verified: false, min: null, max: null, note: '' };
}

function numOrNull(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10_000_000) return x;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x.replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function toDate(s: string | undefined): number | null {
  if (typeof s !== 'string' || s === '') return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function hostname(url: string): string {
  try {
    const u2 = new URL(url);
    void u2;
    return url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  } catch {
    return domainClassSafeName(url);
  }
}

function domainClassSafeName(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}
