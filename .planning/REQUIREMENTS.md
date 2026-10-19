# REQUIREMENTS — SCOUT MVP

REQ-01 Freelancer profile & ICP create/edit (server-backed, one profile per user)
REQ-02 User-initiated lead searches (query + source categories)
REQ-03 TinyFish Search integration for URL discovery
REQ-04 TinyFish Fetch integration for page extraction (bounded batches)
REQ-05 Optional TinyFish Agent fallback for difficult pages (≤2/run, gated)
REQ-06 LLM structured extraction with runtime schema validation + bounded repair retry
REQ-07 Deduplication by canonical URL (no duplicate leads per user)
REQ-08 Evidence + source URL storage (leadEvidence w/ claims)
REQ-09 Explainable scoring: intent 40% / skill 30% / freshness 15% / budget 10% / source 5%; unknowns handled explicitly
REQ-10 Search progress + failure states (queued/running/completed-with-zero/failed/cancelled)
REQ-11 Persistent lead storage in Convex (7 tables exactly)
REQ-12 Saved leads + CRM statuses (new/saved/contacted/replied/won/lost/dismissed)
REQ-13 Personalized outreach draft generation (drafts only; never auto-sent)
REQ-14 Auth: require identity, derive from ctx, ownership on every op, no client-supplied userId
REQ-15 Secrets server-side only (TINYFISH_API_KEY, LLM_API_KEY)
REQ-16 Limits: ≤5 concurrent fetch batches/run, ≤20 URLs/run, ≤3 queries/run, ≤2 retryable attempts, ≤5 running searches/user
REQ-17 Cancellation + stale-task recovery
REQ-18 Frontend states: no-profile / ready / queued / searching / fetching / qualifying / partial / completed+results / completed+zero / failed / cancelled
REQ-19 Rebrand jobwzrd → Scout; remove out-of-scope pages (match, companies, outreach page, inbox)
REQ-20 Topbar: mobile burger icon opening sidebar drawer, full-bleed left+right; desktop full width right extension
REQ-21 Security: SSRF guard (block localhost/private/non-http), untrusted page content can't override instructions
REQ-22 Reactive subscriptions (no repeated polling), results survive refresh
