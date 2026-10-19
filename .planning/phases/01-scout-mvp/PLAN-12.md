---
wave: 12
plan: 12
depends_on: [7, 11]
requirements: [REQ-10, REQ-18, REQ-22]
type: execute
autonomous: true
---

## Objective
Usage/dashboard summary + activity log queries + search status surface

## Files
- `app/convex/usage.ts`
- `app/convex/activityLogs.ts`

## Tasks
1. usage summary query: counts of leads today, saved, pipeline by status, searches run today (caps) — single owner-scoped query
2. activityLogs.listForRun (already) + recentMine(limit) for dashboard feed

## Acceptance
- [ ] dashboard query returns shape {leadsToday, saved, pipeline:[{status,count}], searchesToday}
- [ ] typecheck passes
