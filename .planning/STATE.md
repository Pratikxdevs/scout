# STATE.md — SCOUT

**Current phase:** Phase 1 — Scout MVP (15 waves)
**Status:** Ready to execute
**Deployment:** wandering-pheasant-940 (dev)
**Branch:** main
**Locked decisions:**
- Backend = Convex modular monolith in `app/convex/`; auth = **Clerk** (`@clerk/clerk-react` + `convex/react-clerk`; Convex JWT template named `convex`; identity = `ctx.auth.getUserIdentity()` subject). Better Auth is OUT.
- Frontend = existing React app; no redesign; rebrand to Scout; pages cut: match, companies, outreach (page), inbox.
- TinyFish = raw documented REST (search/fetch/agent) with runtime validation; no SDK dependency.
- LLM = one configurable provider (openai-compatible default; anthropic/gemini branches), server-side key only.
- Demo must use real TinyFish/LLM responses; demo/offline mode only when backend env missing.
**Open items:** TINYFISH_API_KEY + LLM_API_KEY not yet provided by user (blocked only live demo, not the build).

## Progress log (restarted 2026-10-20)
- Convex project recreated fresh: scout / zany-dragon-94 (dev). Env: VITE_CONVEX_URL / VITE_CONVEX_SITE_URL.
- Clerk app still-eagle-574 wired (publishable key in .env.local; CLERK_JWT_ISSUER_DOMAIN set on deployment).
- Clerk frontend swap committed (7e79d42): ConvexProviderWithClerk + AuthBridge; SignIn/SignUp hash-routing pages.
- Backend foundation committed (6b9241b): users.ensure, profiles.save/getMine, activityLogs, libs (actor/errors/urls/limits).
- TODO user: create "convex" JWT template in Clerk dashboard for still-eagle-574 (tokens must carry audience "convex").
- NEXT waves: 05 TinyFish adapter → 06 LLM adapter → 07 runs/tasks → 08 discovery action → 09 fetch action → 10 qualify action → 11 leads/outreach → 12 usage → 13-15 frontend + wiring.

### Progress — waves 5–15 executed (2026-10-20)
- Wave 5–6: providers/tinyfish.ts (Search/Fetch/Agent + error taxonomy), providers/llm.ts (JSON + repair retry), lib/prompt.ts (PAGE_START anti-injection). Commit 961ef48 (with 7–12).
- Wave 7–10: searchRuns create/cancel + internal state machine; searchTasks claim/complete/failOrRequeue (lease, ≤2 attempts); actions/discovery planner (≤3 queries, ≤20 URLs, retry/backoff), fetchPages (≤4 batches, thin-page Agent fallback ≤2), qualifyLeads (evidence-substring gate, budget-verify regex, deterministic scoring math).
- Wave 11–12: leads idempotent upsert + listMine/getWithEvidence/updateStatus (byIdInternal for action-chain), outreachDrafts (internal upsertDraft + public read/edit/approve), usage.summary (contactedToday + CONTACT_CAP=25 → caps meter), generateOutreachDraft action (public draftForMe wrapper).
- Wave 13: store.tsx rewired to Convex hooks (leads→jobs/apps reactive mapping, hunts via searchRuns.create + live run streaming, honest usage mapping, logout clears account footprint, users.ensure on login). Commit 1a01f79.
- Wave 14: JobDetail evidence card (verbatim-excerpt claims) + outreach draft card (draftForMe); scheduled actions moved to internal reads (Convex identity does NOT propagate into run*) — critical correctness fix. profiles.rowFor + searchRuns.getInternal added. Commit 6c48424.
- Wave 15: README.md + docs/SCOUT-DEMO.md; final check: tsc clean, 119/119 tests, backend pushed (cp10), vite boot 200.

Requires user action: Clerk dashboard → add "convex" JWT template on still-eagle-574; TINYFISH_API_KEY + LLM_API_KEY via `npx convex env set`.
