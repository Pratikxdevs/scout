---
wave: 15
plan: 15
depends_on: [2, 12, 14]
requirements: [REQ-16, REQ-17, REQ-22]
type: execute
autonomous: true
---

## Objective
Hardening: push deploy, typecheck, tests, prompt-injection/SSRF checks, README, demo script

## Files
- `README.md`
- `app/README?`
- `.env.example`
- `docs/DEMO.md`

## Tasks
1. npx convex dev --once push (all backend); npx convex env set keys when user provides
2. npm run check + npm test green; fix fallout
3. Add smoke assertion via convex run for unit-ish checks (urls guard, scoring)
4. README: quickstart, env table, How TinyFish is used (search/fetch/agent pointers, file:line), architecture, demo script (9 steps), honest limits
5. Sanity: no secret in client bundle (grep VITE_*)

## Acceptance
- [ ] `npx convex dev --once` push clean
- [ ] npm test + tsc clean
- [ ] README contains TinyFish section + demo script
- [ ] no TINYFISH/LLM keys printed anywhere
