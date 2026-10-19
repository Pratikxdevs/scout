---
wave: 07
plan: 07
depends_on: [3, 4]
requirements: [REQ-02, REQ-11, REQ-16, REQ-17]
type: execute
autonomous: true
---

## Objective
searchRuns + searchTasks data layer: create/get/listMine/cancel, caps, task lifecycle

## Files
- `app/convex/searchRuns.ts`
- `app/convex/searchTasks.ts`

## Tasks
1. searchRuns: create (≤5 running/user → SEARCH_ACTIVE), insert queued + schedule({ fnPath? }) via ctx.scheduler.runAt(now, api.actions.startSearch...) — schedule OUTSIDE mutation via api reference after insert; get/listMine owner queries; cancel mutation: queued|running→cancelled + cancel queued tasks + activity; resultCount incremental update mutation (internal)
2. searchTasks: enqueue(runId,type,payload), claim/updateTaskComplete/TaskFailed helpers (attempts++, lease timestamps), listForRun query; reclaimStale internal mutation for lease-expired tasks
3. Internal (.internalMutation) variants used by actions; public wrappers check ownership

## Acceptance
- [ ] 6th running search → SEARCH_ACTIVE
- [ ] cancel run cancels queued tasks
- [ ] typecheck passes
