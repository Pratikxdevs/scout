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
