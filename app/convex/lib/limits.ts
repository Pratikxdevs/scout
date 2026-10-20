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
    /** Sources a single run may target (one scoped query each). */
    MAX_SOURCES_PER_RUN: 6,
    /** Postings expanded from board-page links per run (one page each). */
    MAX_EXPANDED_LINKS: 8,
    /** Attempts per task (B6). */
    MAX_ATTEMPTS: 2,
    /** Concurrent runs per user. */
    MAX_RUNNING_PER_USER: 5,
  },
  PAGE: {
    /** Excerpt budget stored/passed to LLMs (B4). */
    MAX_EXCERPT_CHARS: 15_000,
    /** Pages below this excerpt char count become agent-fallback candidates.
     *  400 (not 200): ATS "page not found" stubs in a locale are ~211 chars
     *  of boilerplate — below this they get a real agent reading instead. */
    MIN_USEFUL_TEXT: 400,
  },
  AGENT: { MAX_PER_RUN: 2, MAX_PROCESS_SECONDS: 120 },
  QUALIFY: {
    /** Pages scored (one LLM call each) per run — the provider's RPM and
     *  the run's cost budget both live here. */
    MAX_PAGES_PER_RUN: 12,
  },
  PIPELINE: {
    /** Leads you may move to `contacted` per UTC day (caps meter truth). */
    CONTACT_CAP: 25,
  },
  SWEEP: {
    /** Lease window before a stale task may be reclaimed. */
    LEASE_MS: 5 * 60 * 1000,
  },
} as const;
