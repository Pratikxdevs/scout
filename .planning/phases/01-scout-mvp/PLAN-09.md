---
wave: 09
plan: 09
depends_on: [8]
requirements: [REQ-04, REQ-05, REQ-16, REQ-17]
type: execute
autonomous: true
---

## Objective
Extraction action: bounded fetch batches, excerpts, agent fallback gating

## Files
- `app/convex/actions/fetchPages.ts`

## Tasks
1. internalAction fetchPages: pull run’s queued fetch tasks; process in batches of ≤5 sequential Promise.all per batch (bound 5 batches/run); each URL → fetchPages adapter → excerpt clamp 15k; success → task completed + payload {title, textExcerpt} stored (bounded); failure transient→retry, else agent-fallback candidate
2. Agent fallback: max 2 per run, only when fetch text < 200 chars or annotate-error; goal narrowly scoped; result merged as page content
3. Cancellation check between batches; activity fetch_completed events; schedule qualifyLeads at end

## Acceptance
- [ ] ≤10 URLs → ≤2 batches of 5
- [ ] stale lease reclaim works via reclaimStale
- [ ] empty/blocked pages → agent candidates not heap of failures
- [ ] typecheck passes
