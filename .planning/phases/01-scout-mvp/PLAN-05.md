---
wave: 05
plan: 05
depends_on: [3]
requirements: [REQ-03, REQ-04, REQ-05, REQ-15, REQ-21]
type: execute
autonomous: true
---

## Objective
TinyFish provider adapter: search/fetch/agent, runtime validation, timeouts, error taxonomy

## Files
- `app/convex/providers/tinyfish.ts`

## Tasks
1. searchWeb(query, {purpose, location, language, excludeDomains, recencyMinutes?}): GET https://api.search.tinyfish.ai w/ X-API-Key header; zod schema {query, results:{position,site_name,title,snippet,url,date?}[], total_results, page}; 25s AbortSignal.timeout; classify 429/5xx/timeout → transient, 401/400/403 → permanent
2. fetchPages(urls ≤10, {ttl=0, format:"markdown"}): POST https://api.fetch.tinyfish.ai; zod {results[{url,final_url?,title?,description?,text}], errors[{url,error}]}; re-check final_url SSRF guard; 60s timeout
3. runAgent(url, goal, schema?): POST https://agent.tinyfish.ai/v1/automation/run {url, goal, agent_config:{max_duration_seconds:120}, output_schema?}; zod result; 130s timeout; FAILABLE guarded
4. No key → throw PROVIDER_UNCONFIGURED with clean message; never log key

## Acceptance
- [ ] typecheck passes
- [ ] malformed provider JSON → ProviderError (transient-uncategorized) not crash
- [ ] batch >10 urls throws PREFIX batching upstream
