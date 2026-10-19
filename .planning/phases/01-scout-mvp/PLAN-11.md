---
wave: 11
plan: 11
depends_on: [4, 10]
requirements: [REQ-12, REQ-13]
type: execute
autonomous: true
---

## Objective
Leads + CRM + evidence queries + outreach drafts

## Files
- `app/convex/leads.ts`
- `app/convex/leadEvidence.ts`
- `app/convex/outreachDrafts.ts`
- `app/convex/actions/generateOutreachDraft.ts`

## Tasks
1. leads: listMine (userId, ordered overallScore desc, optional status filter), getWithEvidence (owner check), updateStatus (validate transition any→list; dismissed allowed), dismiss
2. leadEvidence: listForLead owner query
3. outreachDrafts: generate action → llm via provider; upsert one draft/lead/channel email; listForLead, update mutations (drafts only, never send — "sent" reserved manual); approved lock edit

## Acceptance
- [ ] another user’s lead → FORBIDDEN
- [ ] draft approved → update rejected
- [ ] typecheck passes
