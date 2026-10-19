---
wave: 13
plan: 13
depends_on: [1, 4, 7]
requirements: [REQ-02, REQ-18, REQ-22]
type: execute
autonomous: true
---

## Objective
Frontend wiring 1: Convex service layer (scout.ts), store backend mode, search flow + progress states

## Files
- `app/src/services/scout.ts`
- `app/src/store.tsx`
- `app/src/features/search/SearchHome.tsx`

## Tasks
1. services/scout.ts: ConvexHttpClient wrapper w/ Clerk token via useConvexClient? (prefer: ConvexProviderWithClerk so react hooks get auth automatically); imperative fns: createSearch(query,sources), cancelSearch(id), getUserProfile/saveProfile, listMine leads (via useQuery in components), generateDraft, updateLeadStatus
2. store: replace better-auth imports with Clerk hooks (useAuth/useUser/clerk); liveSearch states map to spec states (queued/running: searching|fetching|qualifying by task counts / completed / failed / cancelled); runSearch (demo noop when no backend)
3. SearchHome: create run → subscribe searchRuns.get + tasks counts; render progress; on complete → segues to leads list

## Acceptance
- [ ] SearchHome states all 11 representable
- [ ] no /api/v1 fetch used for scout flows
- [ ] typecheck passes
