---
wave: 04
plan: 04
depends_on: [3]
requirements: [REQ-01, REQ-14]
type: execute
autonomous: true
---

## Objective
users.ensure + Profile service: getMine/save with ICP validation

## Files
- `app/convex/users.ts`
- `app/convex/profiles.ts`
- `app/convex/lib/validation.ts`

## Tasks
1. users.ts ensure(): upsert users by clerkId (subject) with email/name claims; returns _id
2. profiles.ts: v.object fields per spec; save mutation validates min≤max budget, dedups arrays, upserts by userId; getMine query returns profile or null (owner-scoped)
3. onboardingCompleted flag on profiles for wizard routing

## Acceptance
- [ ] getMine without auth → UNAUTHENTICATED
- [ ] save twice doesn't duplicate rows (upsert)
- [ ] budget min>max → INVALID_INPUT
