---
wave: 08
plan: 08
depends_on: [5, 7]
requirements: [REQ-03, REQ-10, REQ-16, REQ-17, REQ-21]
type: execute
autonomous: true
---

## Objective
Discovery action: query planner → TinyFish Search → normalize/reject/dedupe→ candidate tasks

## Files
- `app/convex/actions/startSearch.ts`
- `app/convex/actions/discoverUrls.ts`

## Tasks
1. internalAction startSearch: verify user+run; status queued→running; planQueries(profile, query, sources) ≤3 strings; loop queries → searchWeb; normalize via lib/urls; excludeDomains from profile; cap 20 urls; insert fetch tasks in one batch; activity urls_discovered; if zero → completed resultCount 0; then schedule fetchPages
2. Cancellation + transient retry (≤2 attempts) per query w/ backoff 2s/6s

## Acceptance
- [ ] run with zero results → completed (resultCount 0), not failed
- [ ] disallowed/SSRF URLs skipped and logged
- [ ] typecheck passes
