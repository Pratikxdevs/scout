---
wave: 01
plan: 01
depends_on: []
requirements: [REQ-14, REQ-15]
type: execute
autonomous: true
---

## Objective
Convex scaffold: Clerk auth config, zod, deployment env, schema, codegen push

## Files
- `app/convex/auth.config.ts`
- `app/convex/schema.ts`
- `app/package.json`
- `app/.env.local`
- `.env (convex deployment)`

## Tasks
1. npm i zod @clerk/react (or the package the clerk init installed) in app/
2. Create convex/auth.config.ts: provider { domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "", applicationID: "convex" }; export default satisfies AuthConfig
3. npx convex env set CLERK_JWT_ISSUER_DOMAIN <clerk domain> (from Clerk keys; pending user)
4. Update app/.env.local to dev deployment wandering-pheasant-940 (VITE_CONVEX_URL / VITE_CONVEX_SITE_URL)
5. Write convex/schema.ts: users + profiles + searchRuns + searchTasks + leads + leadEvidence + outreachDrafts + activityLogs with spec validators/indexes
6. npx convex dev --once --typecheck disable to generate _generated types and push

## Acceptance
- [ ] convex/auth.config.ts exports Clerk provider config (applicationID "convex")
- [ ] npx convex codegen exits 0 and app/convex/_generated/* exists
- [ ] node -e require file schema compiles under convex typecheck
