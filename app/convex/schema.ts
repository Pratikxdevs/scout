import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Scout schema (SPEC §6). Seven core tables + activity log.
 *
 * Ownership rule: every user-scoped row carries userId (the Clerk subject)
 * and every public read path owner-checks it (FORBIDDEN otherwise).
 * Dedup rule: leads upsert by (userId, canonicalUrl).
 */
export default defineSchema({
  /** Clerk identity mirror — created lazily on first authed call. */
  users: defineTable({
    clerkId: v.string(),            // identity.subject (user_xxx)
    email: v.string(),
    name: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  }).index('by_clerk_id', ['clerkId']),

  /** The user's ICP — what they sell + who they sell it to (SPEC §2). */
  profiles: defineTable({
    userId: v.string(),             // users.clerkId
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
    onboardingCompleted: v.boolean(),
    updatedAt: v.number(),
  }).index('by_user_id', ['userId']),

  /** One hunt. Lifecycle: queued → running → completed|failed|cancelled. */
  /**
   * Resume → AI profile draft (SPEC §3). One active row per account
   * (isActive) — a new upload supersedes the old version and its bytes are
   * deleted. The AI draft fills only EMPTY profile fields.
   */
  resumes: defineTable({
    userId: v.string(),             // Clerk subject
    storageId: v.id('_storage'),    // the uploaded bytes (private)
    fileName: v.string(),
    mimeType: v.string(),           // PDF_MIME | DOCX_MIME
    sizeBytes: v.number(),
    version: v.number(),
    extractedText: v.optional(v.string()),
    extractedTextStorageId: v.optional(v.id('_storage')),
    extractedProfile: v.optional(v.any()),   // sanitized AI draft
    extractionStatus: v.union(
      v.literal('pending'), v.literal('processing'),
      v.literal('completed'), v.literal('failed'),
    ),
    stage: v.optional(v.string()),  // reading | ai_queued | ai_wait | ai_running | ready | failed
    failureReason: v.optional(v.string()),
    aiAttempts: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_is_active', ['userId', 'isActive']),

  searchRuns: defineTable({
    userId: v.string(),
    query: v.string(),              // free-text the user asked
    plannedQueries: v.optional(v.array(v.string())),  // ≤3 after planning
    sources: v.optional(v.array(v.string())),         // future surfaces
    status: v.union(
      v.literal('queued'), v.literal('running'),
      v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
    ),
    failReason: v.optional(v.string()),
    failCode: v.optional(v.string()),
    resultCount: v.number(),
    batchSize: v.optional(v.number()),                // actual pages fetched
    queuedAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
  })
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_time', ['userId', 'queuedAt']),

  /** Work items inside a run: discover | fetch | qualify stages. */
  searchTasks: defineTable({
    runId: v.id('searchRuns'),
    userId: v.string(),             // denormalized for cheap owner checks
    type: v.union(v.literal('discover'), v.literal('fetch'), v.literal('qualify')),
    payload: v.any(),               // validated by the stage action
    status: v.union(
      v.literal('queued'), v.literal('running'),
      v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
    ),
    attempts: v.number(),           // max 2 per REPLAN B6
    maxAttempts: v.number(),
    error: v.optional(v.string()),
    result: v.optional(v.any()),    // bounded, stage-specific
    leaseUntil: v.optional(v.number()),               // stale-lease reclaim
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_run_status', ['runId', 'status'])
    .index('by_run_time', ['runId', 'createdAt'])
    .index('by_lease', ['status', 'leaseUntil']),

  /** A qualified freelance-lead posting, upsert by (userId, canonicalUrl). */
  leads: defineTable({
    userId: v.string(),
    runId: v.optional(v.id('searchRuns')),
    canonicalUrl: v.string(),
    url: v.string(),
    domain: v.string(),
    title: v.string(),
    company: v.string(),
    description: v.string(),
    location: v.optional(v.string()),
    budgetVerified: v.boolean(),    // only true when a Claim carries it
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    budgetNote: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    opportunityType: v.optional(v.union(
      v.literal('one_off'), v.literal('short_term'), v.literal('long_term'),
      v.literal('recurrent'), v.literal('unknown'),
    )),
    intent: v.union(
      v.literal('hiring_now'), v.literal('exploring'),
      v.literal('not_specific'), v.literal('anti_freelance'),
    ),
    claims: v.array(v.string()),    // deduped claim ids → see leadEvidence
    /** Cross-board dedupe key (normalized title + company). */
    fingerprint: v.optional(v.string()),
    scoreIntent: v.number(),        // 0..100
    scoreSkill: v.number(),         // 0..100
    scoreFreshness: v.number(),     // 0..100
    scoreBudgetFit: v.number(),     // 0..100 (0 when unverified — SPEC §10)
    scoreSourceReliability: v.number(),  // 0..100
    scoreOverall: v.number(),       // 0..100 weighted
    scoreExplanation: v.string(),   // assembled server-side, never LLM
    crmStatus: v.union(
      v.literal('new'), v.literal('saved'), v.literal('contacted'),
      v.literal('replied'), v.literal('won'), v.literal('lost'),
      v.literal('dismissed'),
    ),
    lastVerifiedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_score', ['userId', 'scoreOverall'])
    .index('by_user_url', ['userId', 'canonicalUrl'])   // dedup anchor
    .index('by_user_fingerprint', ['userId', 'fingerprint'])  // cross-board dedupe
    .index('by_user_status', ['userId', 'crmStatus'])
    .index('by_user_time', ['userId', 'lastVerifiedAt']),
  // NOTE: every index here is (userId, …) — the do-order rule for owner scans.

  /** Per-claim evidence; dropped server-side if the excerpt isn't in the page. */
  leadEvidence: defineTable({
    leadId: v.id('leads'),
    userId: v.string(),
    sourceUrl: v.string(),
    claimKey: v.string(),           // role | budget | intent | skill | other
    value: v.string(),
    evidenceExcerpt: v.string(),    // substring of the fetched page text
    createdAt: v.number(),
  })
    .index('by_lead', ['leadId'])
    .index('by_user', ['userId']),

  /** Drafts only — sending is out of scope (SPEC §7). One per lead+channel. */
  outreachDrafts: defineTable({
    userId: v.string(),
    leadId: v.id('leads'),
    channel: v.union(v.literal('email')),
    subject: v.string(),
    body: v.string(),
    status: v.union(v.literal('draft'), v.literal('approved')),
    generatedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_lead_channel', ['leadId', 'channel'])
    .index('by_user_time', ['userId', 'generatedAt']),

  /** Append-only, user-scoped — feeds progress UI + honest audit trail. */
  activityLogs: defineTable({
    userId: v.string(),
    searchRunId: v.optional(v.id('searchRuns')),
    eventType: v.union(
      v.literal('search_created'), v.literal('search_started'),
      v.literal('queries_planned'), v.literal('urls_discovered'),
      v.literal('fetch_completed'), v.literal('qualification_completed'),
      v.literal('lead_qualified'), v.literal('search_completed'),
      v.literal('search_failed'), v.literal('search_cancelled'),
      v.literal('draft_generated'), v.literal('search_row_updated'),
      v.literal('agent_fallback_used'),
    ),
    message: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_user_time', ['userId', 'createdAt'])
    .index('by_run', ['searchRunId']),
});
