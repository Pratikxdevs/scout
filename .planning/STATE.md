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
