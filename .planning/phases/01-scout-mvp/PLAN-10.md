---
wave: 10
plan: 10
depends_on: [6, 9]
requirements: [REQ-06, REQ-07, REQ-08, REQ-09, REQ-17, REQ-21]
type: execute
autonomous: true
---

## Objective
Qualification + persistence: LLM extraction validation, evidence checks, deterministic scoring, idempotent leads/evidence upsert

## Files
- `app/convex/actions/qualifyLeads.ts`
- `app/convex/lib/scoring.ts`

## Tasks
1. internalAction qualifyLeads: for each fetched page → llm.extractLead; zod validate; evidence check: claim.evidenceExcerpt must be substring (normalized whitespace) of page text else drop claim; drop leads with no claims + no explicit intent
2. score: intent/skillMatch from LLM (0..100 clamp); freshness: publishedAt ≤30d→90, ≤90d→65, ≤365d→35, unknown→0; budgetFit: intersects profile range→100, unknown→0 (never assumed good); sourceReliability: domain classifier (company/ATS 90, job board 65, news/blog 40, low 25)
3. overallScore weighted formula; explain string assembled in code
4. Persist: upsert leads by (userId, canonicalUrl) idempotent (existing → update scores/lastVerifiedAt; keep user CRM status unless dismissed); insert leadEvidence; update run status/resultCount; activity lead_qualified

## Acceptance
- [ ] LLM claim without matching evidence is dropped
- [ ] duplicate canonical URL updates same lead row
- [ ] scores in 0..100; unknown budget → budgetFit 0
- [ ] typecheck passes
