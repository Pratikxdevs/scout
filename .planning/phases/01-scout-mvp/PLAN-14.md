---
wave: 14
plan: 14
depends_on: [13]
requirements: [REQ-01, REQ-12, REQ-13, REQ-18]
type: execute
autonomous: true
---

## Objective
Frontend wiring 2: Leads list, Lead detail (evidence/claims/draft), Pipeline CRM, Profile/Onboarding, Settings

## Files
- `app/src/features/jobs/Jobs.tsx`
- `app/src/features/jobs/JobDetail.tsx`
- `app/src/features/applications/Applications.tsx`
- `app/src/features/onboarding/Onboarding.tsx`
- `app/src/features/settings/Settings.tsx`

## Tasks
1. Jobs page: react to leads.listMine, map lead→Job card (title, company, desc, location, budget string if verified, matchScore, url, published, type map opportunityType; evidence link), filters adapted (kw/loc/type/source; salary→budget)
2. JobDetail: lead detail — evidence list (sourceUrl cards w/ excerpts+claims), score explanation chips, intent badge, save/dismiss, CRM select, draft generate/edit (disabled w/o backend or profile)
3. Applications → Pipeline: statuses new/saved/contacted/replied/won/lost/dismissed rail + kanban-lite list; lead sourceUrl links
4. Onboarding: simplify to ICP form (name, email, services, skills, targetIndustries, targetLocations, budget range, keywords, excluded domains) → profiles.save; remove resume/enrichment steps
5. Settings: profile editor same fields; keep dark/colorway prefs

## Acceptance
- [ ] lead card→detail→evidence flow works against Convex
- [ ] draft edit persists after refresh
- [ ] status changes reflect in Pipeline
- [ ] typecheck passes
