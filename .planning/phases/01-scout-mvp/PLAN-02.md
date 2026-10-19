---
wave: 02
plan: 02
depends_on: []
requirements: [REQ-19, REQ-20]
type: execute
autonomous: true
---

## Objective
Rebrand jobwzrd→Scout + scope cut (remove match/companies/outreach/inbox) + topbar (mobile burger + full-bleed; desktop full-width right)

## Files
- `app/src/App.tsx`
- `app/src/types.ts`
- `app/src/store.tsx`
- `app/src/components/UniversalTopbar.tsx`
- `app/src/components/shell.tsx`
- `app/index.html`
- `app/package.json`
- `app/src/features/* (deletions)`
- `app/src/lib/logger.ts origin.test`

## Tasks
1. Delete feature dirs: match, companies, outreach, inbox; drop routes match/companies/outreach/inbox from Route union + VALID + App.tsx + shell nav + dock defs
2. Rename strings: package name scout-app; index.html title/meta/canonical→ scout.app placeholders; logger service scout-app; Auth.tsx "New to jobwzrd?" → Scout; UniversalTopbar word + aria-labels; Settings export file scout-export.json; NotFound copy; origin.test message
3. UniversalTopbar: path UNI_BEZEL_D full-bleed mobile + full-width desktop; add mobile burger button (hamburger) left; onClick toggles store.sidebarOpen
4. shell.tsx: Sidebar rendered as overlay drawer on mobile when sidebarOpen (backdrop + fixed panel), closing on nav select; keep desktop sidebar in body-row
5. Bell button (was inbox) now goes to pipeline (applications)

## Acceptance
- [ ] `npm run check` passes tsconfig
- [ ] grep -ri jobwzrd src index.html returns only intentional comments
- [ ] routes /match /companies /outreach /inbox → notfound
- [ ] mobile topbar spans viewport edge-to-edge; burger visible < md; opens drawer
