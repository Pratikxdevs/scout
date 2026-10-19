---
wave: 03
plan: 03
depends_on: [1]
requirements: [REQ-14, REQ-21]
type: execute
autonomous: true
---

## Objective
Shared backend lib: actor/ownership, errors, URL guard (SSRF), normalization, dedup, limits

## Files
- `app/convex/lib/actor.ts`
- `app/convex/lib/errors.ts`
- `app/convex/lib/urls.ts`
- `app/convex/lib/normalization.ts`
- `app/convex/lib/dedupe.ts`
- `app/convex/lib/limits.ts`
- `app/convex/lib/logging.ts`
- `app/convex/activityLogs.ts`

## Tasks
1. lib/actor.ts: requireUserId(ctx) via ctx.auth.getUserIdentity() → {userId: identity.subject, email, name}; throw ConvexError UNAUTHENTICATED when none
2. lib/errors.ts: ConvexError factory codes INVALID_INPUT/UNAUTHENTICATED/NOT_FOUND/FORBIDDEN/CAP_REACHED/SEARCH_ACTIVE/PROVIDER_ERROR/INTERNAL
3. lib/urls.ts: canonicalUrl(url) strip hash/utm/tailslash case-normalize; isAllowedExternal(url) https-only, hostname not localhost/private-IP, blocklisted suffixes; SAME for redirects (final_url re-checked)
4. lib/limits.ts: MAX 20 URLs/run, 5 batches/run, 3 queries/run, 2 attempts, 5 running searches/user, page excerpt budget 15k chars
5. lib/logging.ts + activityLogs.ts: record(ctx,{userId,searchRunId,eventType,message,metadata}) and listForRun query (owner-checked)

## Acceptance
- [ ] npx convex dev --once typechecks
- [ ] unit: private IP + http + non-host URLs rejected by isAllowedExternal
- [ ] dedupe: same canonical → one entry
