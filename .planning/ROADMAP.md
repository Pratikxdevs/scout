# ROADMAP — SCOUT

**Project:** Scout (was: jobwzrd / Jobangle) — AI-Powered Freelance Lead Discovery & Qualification
**Team:** KRITICAL HACKS '26
**Source of truth:** docs/SCOUT-SPEC.md (v1.0)

## Phase 1: Scout MVP — build entire backend + frontend, then wire

**Goal:** Authenticated users can search permitted public web sources with TinyFish, receive real validated lead records with evidence, scores and explanations, save/dismiss/status them through CRM states, and generate personalized outreach drafts — all running on Convex + TypeScript with the existing React app rebranded to Scout.

**Requires (external, blocking for live demo only — not for build):** `TINYFISH_API_KEY`, one LLM key (`LLM_API_KEY`).
**Dev deployment:** `pratik-gupta:scout-hack:development` → `https://wandering-pheasant-940.convex.cloud`

### Plans (15 waves — serial execution, wave N = PLAN-NN)

| Wave | Plan | Objective |
|---|---|---|
| 1 | 01 | Convex scaffold: Clerk auth config, zod, deployment env, schema, codegen push |
| 2 | 02 | Frontend rebrand jobwzrd→Scout + scope cut (remove match/companies/outreach/inbox pages) + topbar (mobile burger + full-bleed, desktop full-width) |
| 3 | 03 | Shared backend lib: actor/ownership, errors, URL guard (SSRF), normalization, dedup, limits |
| 4 | 04 | Profile service: getMine/save + ICP validation |
| 5 | 05 | TinyFish provider adapter: search/fetch/agent, runtime validation, timeouts, error taxonomy |
| 6 | 06 | LLM provider adapter: one configurable provider, JSON extraction, bounded repair retry, injection hardening |
| 7 | 07 | searchRuns + searchTasks data layer: create/get/list/cancel, caps, task lifecycle helpers |
| 8 | 08 | Discovery action: query planner → TinyFish Search → normalize/reject/dedupe → candidate tasks |
| 9 | 09 | Extraction action: bounded fetch batches, excerpts, agent fallback gating |
| 10 | 10 | Qualification + persistence: LLM extraction validation, evidence checks, deterministic scoring, idempotent leads/evidence upsert |
| 11 | 11 | Leads + CRM + evidence queries + outreach drafts (generate action, list, update) |
| 12 | 12 | Dashboard/usage summary + activity log queries + search status surface |
| 13 | 13 | Frontend wiring 1: Convex service layer (scout.ts), store backend mode, search flow + progress states |
| 14 | 14 | Frontend wiring 2: Leads list, Lead detail (evidence/claims/draft), Pipeline CRM, Profile/Onboarding, Settings |
| 15 | 15 | Hardening: push deploy, typecheck, tests, prompt-injection/SSRF checks, README, demo script |
