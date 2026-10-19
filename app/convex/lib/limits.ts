/** Limits (SPEC §5 / docs/SCOUT-SPEC.md §"boundaries") — single source of
 *  truth for caps so UI meter + backend reject can never disagree. */
export const LIMITS = {
  PROFILES: { SERVICES: 10, SKILLS: 12, INDUSTRIES: 10, KEYWORDS: 6, EXCLUSION_DOMAINS: 10 },
  SEARCH: {
    /** URLs accepted per run (discovery feeder). */
    MAX_URLS_PER_RUN: 20,
    /** Fetch-task batches per run (each ≤ 5 URLs). */
    MAX_BATCHES_PER_RUN: 4,
    /** URLs per fetch batch. */
    BATCH_SIZE: 5,
    /** Provider search queries per run (planner output cap). */
    MAX_QUERIES_PER_RUN: 3,
    /** Attempts per task (B6). */
    MAX_ATTEMPTS: 2,
    /** Concurrent runs per user. */
    MAX_RUNNING_PER_USER: 5,
  },
  PAGE: {
    /** Excerpt budget stored/passed to LLMs (B4). */
    MAX_EXCERPT_CHARS: 15_000,
    /** Pages below this excerpt char count become agent-fallback candidates. */
    MIN_USEFUL_TEXT: 200,
  },
  AGENT: { MAX_PER_RUN: 2, MAX_PROCESS_SECONDS: 120 },
  SWEEP: {
    /** Lease window before a stale task may be reclaimed. */
    LEASE_MS: 5 * 60 * 1000,
  },
} as const;
