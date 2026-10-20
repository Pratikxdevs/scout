import { domainClass } from './urls.ts';
import { LIMITS } from './limits.ts';

/**
 * Deterministic scoring (SPEC §10). Weights are code, not model — the LLM
 * supplies semantics (intent, skill overlap verdict, verified budget),
 * the math below is reproducible and honest about unknowns (never assumed
 * good).
 */

export interface ScoreInput {
  intent: 'hiring_now' | 'exploring' | 'not_specific' | 'anti_freelance';
  skillMatchRatio: number;            // 0..1 overlap of ICP skills in page/claims
  publishedAt: number | null;
  budget: { verified: boolean; min: number | null; max: number | null };
  icpBudget: { min: number | null; max: number | null };
  domain: string;
}

export interface ScoreResult {
  intent: number;          // 0..100
  skill: number;
  freshness: number;
  budgetFit: number;
  sourceReliability: number;
  overall: number;
  explanation: string;
}

const INTENT_SCORE: Record<ScoreInput['intent'], number> = {
  hiring_now: 95,
  exploring: 60,
  not_specific: 40,
  anti_freelance: 5,
};

const SOURCE_SCORE: Record<ReturnType<typeof domainClass>, number> = {
  company: 90,
  job_board: 65,
  news: 40,
  community: 35,
  low: 25,
};

export function scoreLead(inp: ScoreInput): ScoreResult {
  const intent = INTENT_SCORE[inp.intent];

  const skill = Math.round(clamp01(inp.skillMatchRatio) * 100);

  let freshness = 0;      // unknown → 0 (SPEC rule)
  if (inp.publishedAt !== null) {
    const ageDays = (Date.now() - inp.publishedAt) / 86_400_000;
    if (ageDays <= 30) freshness = 90;
    else if (ageDays <= 90) freshness = 65;
    else if (ageDays <= 365) freshness = 35;
    else freshness = 10;   // very stale but still real
  }

  // Budget fit ONLY when the page actually stated money (verified).
  let budgetFit = 0;
  if (inp.budget.verified && (inp.budget.min !== null || inp.budget.max !== null)) {
    const lo = inp.budget.min ?? inp.budget.max ?? 0;
    const hi = inp.budget.max ?? inp.budget.min ?? lo;
    const icpLo = inp.icpBudget.min;
    const icpHi = inp.icpBudget.max;
    const overlaps =
      (icpHi === undefined || icpHi === null || lo <= icpHi) &&
      (icpLo === undefined || icpLo === null || hi >= icpLo);
    budgetFit = overlaps ? 100 : 45;   // stated but outside my range → middling
  }

  const sourceReliability = SOURCE_SCORE[domainClass(inp.domain)];

  const overall = Math.round(
    intent * 0.30 +
    skill * 0.25 +
    freshness * 0.20 +
    budgetFit * 0.10 +
    sourceReliability * 0.15,
  );

  return {
    intent, skill, freshness, budgetFit, sourceReliability, overall,
    explanation: explain(inp, { intent, skill, freshness, budgetFit }),
  };
}

function explain(
  inp: ScoreInput,
  s: { intent: number; skill: number; freshness: number; budgetFit: number },
): string {
  const bits: string[] = [];
  bits.push(inp.intent === 'hiring_now' ? 'page says they are hiring now'
    : inp.intent === 'exploring' ? 'page is exploring/fishing rather than hiring'
    : inp.intent === 'anti_freelance' ? 'page is anti-freelance or agency-recruiting'
    : 'page mentions work without concrete intent');
  bits.push(`skill overlap ≈${s.skill}%`);
  bits.push(inp.publishedAt === null ? 'undated' : `posted ${ago(inp.publishedAt)}`);
  bits.push(inp.budget.verified
    ? `budget stated (${inp.budget.min ?? '?'}–${inp.budget.max ?? '?'})`
    : 'no stated budget — do not assume one');
  return bits.join('; ');
}

function ago(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Skill overlap: share of ICP skills found (case-insensitive) in haystack. */
export function skillMatchRatio(skills: string[], haystack: string): number {
  if (skills.length === 0) return 0;
  const hay = haystack.toLowerCase();
  const hits = skills.filter(s => hay.includes(s.toLowerCase())).length;
  return Math.min(1, hits / Math.min(skills.length, LIMITS.PROFILES.SKILLS));
}

/** Claim verification: excerpt must be a substring of the page (SPEC §9). */
export function excerptSupported(page: string, excerpt: string): boolean {
  if (excerpt.length < 12 || excerpt.length > 300) return false;
  const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase().trim();
  const nEx = norm(excerpt);
  return norm(page).includes(nEx);
}
