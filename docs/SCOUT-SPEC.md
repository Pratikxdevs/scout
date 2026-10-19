# SCOUT — Project Implementation Specification (v1.0, canonical)

## 1. Project Definition

Scout is an AI-powered lead discovery application that helps freelancers and independent developers find potential clients who may need their services.

A user defines the services they offer, their technical skills, target industries, preferred locations, and budget requirements. Scout searches permitted public web sources, extracts relevant opportunities, evaluates their relevance, and presents a ranked list of potential clients with supporting evidence.

For every lead, Scout answers five questions:

1. What is the opportunity?
2. Why might this person or business need my services?
3. What evidence supports this conclusion?
4. How well does the opportunity match my skills and preferences?
5. What should I do next?

**Primary workflow:** profile → search request → permitted sources → live progress → TinyFish discovery/fetch → normalize/dedupe → LLM structured extraction → validation + explainable scores → ranked results in existing frontend → open lead, review evidence, save, generate outreach draft → track in CRM pipeline.

## 2. Scope

**MUST:** Freelancer profile/ICP; user searches; TinyFish Search/Fetch; optional Agent fallback; LLM structured extraction; dedup; evidence+URL storage; intent/skill scoring; progress + failure states; persistent Convex storage; saved leads + CRM statuses; outreach draft generation; auth/authorization/API-key security; search limits, bounded concurrency, retries, cancellation; clear frontend↔backend interface.

**OUT:** autonomous sending, auto-proposals, marketplace auto-login, LinkedIn/Upwork scraping, proxy pools/anti-bot evasion, custom browser automation, multi-agent LLM chains, vector DBs/embeddings, Redis/Kafka/BullMQ/K8s, separate backends, scheduled scraping, billing/team accounts, auto follow-ups, frontend redesign.

## 3. Stack

Frontend: existing React app. Backend: Convex + TypeScript (modular monolith in `app/convex/`). DB: Convex tables. Background: Convex scheduler + bounded actions. Web: TinyFish Search/Fetch/Agent. AI: one configurable LLM provider. Auth: **Clerk** (decided 2026-10-20). Validation: Convex validators + TypeScript (+ zod for provider/LLM outputs).

Env (server-side only): `TINYFISH_API_KEY`, `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `CLERK_JWT_ISSUER_DOMAIN`. Frontend: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`.

## 4. Backend architecture

Modules: Auth/Authorization · Profile Service · Search Orchestrator (Query Planner, TinyFish adapters, URL normalizer) · Lead Qualification Service (LLM extraction, schema validation, dedup, scoring) · Lead+CRM Service · Outreach Draft Service · Activity Logging · Convex DB.

Actions handle external API calls; queries/mutations never make external network requests.

Code org:
```
convex/
  schema.ts
  users.ts profiles.ts searchRuns.ts searchTasks.ts leads.ts leadEvidence.ts
  outreachDrafts.ts activityLogs.ts
  actions/ startSearch.ts discoverUrls.ts fetchPages.ts qualifyLeads.ts generateOutreachDraft.ts
  lib/ actor.ts validation.ts scoring.ts urls.ts normalization.ts dedupe.ts errors.ts limits.ts logging.ts
  providers/ tinyfish.ts llm.ts
```

## 5. Database schema (7 tables)

- **profiles**: userId, name, skills[], services[], targetIndustries[], targetLocations[], minBudget?, maxBudget?, currency?, keywords[], excludedDomains[], portfolioUrls[], createdAt, updatedAt. Index by_userId. Budget min ≤ max.
- **searchRuns**: userId, query, profileId?, sources[], status(queued|running|completed|failed|cancelled), resultCount, errorMessage?, startedAt?, completedAt?, createdAt. Indexes by_userId, by_userId_and_createdAt.
- **searchTasks**: userId, searchRunId, taskType(search|fetch|agent|qualify), status(same enum), source?, payload?, attempts, nextAttemptAt?, leaseExpiresAt?, resultCount, errorMessage?, createdAt, updatedAt. Indexes by_searchRunId, by_status_and_nextAttemptAt.
- **leads**: userId, canonicalUrl, title, companyName?, description?, opportunityType(freelance|contract|business|other), location?, budgetMin?, budgetMax?, currency?, publishedAt?, lastVerifiedAt?, intentScore, skillMatchScore, overallScore, scoreExplanation, status(new|saved|contacted|replied|won|lost|dismissed), createdAt, updatedAt. Indexes by_userId, by_userId_and_status, by_userId_and_canonicalUrl, by_userId_and_overallScore.
- **leadEvidence**: userId, leadId, searchRunId, sourceUrl, sourceType, excerpt?, claims[{field,value,evidenceExcerpt,confidence}], fetchedAt, confidence?. Indexes by_leadId, by_searchRunId, by_userId.
- **outreachDrafts**: userId, leadId, channel(email|platform|other), subject?, body, status(draft|approved|sent|discarded), createdAt, updatedAt. Indexes by_userId, by_userId_and_leadId.
- **users**: (Clerk) clerkId (subject), email, name, createdAt, updatedAt, searchCountToday etc. Index by_clerkId.

Unknown budgets/dates stay null. Scores 0–100. Leads per-user only.

## 6. TinyFish integration (verified 2026-10-20 docs)

- **Search** `GET https://api.search.tinyfish.ai?query=…` `X-API-Key` header → `{query, results[{position,site_name,title,snippet,url,date?}], total_results, page}`. ≤30 req/min. `purpose`, `location`, `language`, `include_domains`/`exclude_domains` supported.
- **Fetch** `POST https://api.fetch.tinyfish.ai {urls[≤10], format:'markdown', ttl:0}` → `{results[{url,final_url,title,description,language,format,text}], errors[{url,error}]}`. Per-URL failures ride inside 200.
- **Agent** `POST https://agent.tinyfish.ai/v1/automation/run {url, goal, output_schema?, agent_config:{max_duration_seconds}}` → `{run_id, status:'COMPLETED'|'FAILED', result, error}`. Async variant exists (`/run-async` + `GET /v1/runs/{id}` + cancel) — MVP uses sync `/run` with timeout.

Adapter contract: `searchWeb(query, options)`, `fetchPages(urls)`, `runAgent(url, goal)`; read key from env; validate responses at runtime; normalize errors (transient vs permanent); enforce timeouts + payload limits; never log keys.

## 7. Pipeline

1. **Create** auth user → validate → load profile → insert searchRun(queued) + initial task → schedule.
2. **Discovery** ≤3 focused queries → TinyFish Search → validate/normalize → reject disallowed URLs → dedupe → candidate fetch tasks (≤20 URLs).
3. **Extraction** batches of ≤5 URLs → TinyFish Fetch ttl 0 → normalize → sufficient evidence? else Agent fallback (≤2 pages) → record status.
4. **Qualification** per page: LLM → structured JSON `{title, companyName?, description, opportunityType, location?, budgetMin?, budgetMax?, currency?, publishedAt?, buyingIntent, intentScore, skillMatchScore, overallScore, scoreExplanation, claims[{field,value,evidenceExcerpt,confidence}]}` → zod-validate (≤1 repair retry) → evidence check (excerpt must exist in fetched text) → deterministic final score computed in app code.
5. **Scoring** `overallScore = 0.40·intent + 0.30·skill + 0.15·freshness + 0.10·budgetFit + 0.05·sourceReliability`; unknown data → explicit 0 / neutral handling, never assumed good.
6. **Persistence** idempotent upsert on (userId, canonicalUrl) → leads + leadEvidence + task/run status + activity events → reactive frontend query.

## 8. Limits & failure handling

≤5 concurrent fetch batches/run · ≤20 URLs/run · ≤3 queries/run · ≤2 retryable attempts w/ backoff+jitter · bounded timeouts · ≤5 running searches/user · SSRF guard (block localhost/private/non-https) · cancellation between stages (late results ignored) · lease/stale-task recovery.

## 9. API contracts (Convex functions)

profiles.getMine/save · users.ensure · searchRuns.create/get/listMine/cancel · searchTasks.listForRun · leads.listMine/getWithEvidence/updateStatus/dismiss · outreachDrafts.generate/update/listForLead · activityLogs.listForRun · usage summary query. All user-facing ops verify identity + ownership. Frontend subscribes via Convex reactive queries.

## 10. Security

Require auth; derive identity from ctx.auth; ownership checks; validate all inputs + provider responses; URL allowlist (https public web only); SSRF blocked; page content untrusted (prompt-injection hardening); drafts only (never send); per-user search caps; secrets never client-side or logged.

## 11. Frontend states

no-profile · ready · queued · searching · fetching · qualifying · partial · completed+results · completed+zero · failed(recoverable) · cancelled. Lead card: title/company, description, source link, overall score + explanation, intent class, skill-match, budget if verified, date if known, last-verified, save/dismiss/open. Detail: evidence, claims, unresolved info, draft. Never present inferred budget/unverified deadline as confirmed fact.

## 12. Acceptance

Profile CRUD ✓ Search→results ✓ TinyFish Search/Fetch real ✓ Agent gated ✓ LLM validated ✓ every lead has source URL ✓ scores+explanations visible ✓ no dupes ✓ reactive status ✓ persist across refresh ✓ save/dismiss/status ✓ drafts generate/edit ✓ bounded retries ✓ no endless retries ✓ cancel stops work ✓ stale recovery ✓ validated provider responses ✓ unknown stays unknown ✓ keys never client-side ✓ ownership ✓ SSRF rejected ✓ no page-content instruction override ✓ demo scenario (profile→search→discover→open→evidence→scores→save→draft→refresh persists) with REAL provider responses.

## 13. Rebrand + topbar (user addenda 2026-10-20)

- Rename jobwzrd → Scout (titles, copy, package name, meta, logger service, tests).
- Remove out-of-scope pages: match, companies, outreach page, inbox (drafts live in lead detail).
- Topbar: mobile = burger icon opens sidebar drawer, topbar full-bleed left+right; desktop = topbar fully extends to the right.
