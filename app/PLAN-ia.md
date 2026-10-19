# IA PLAN – jobwzrd app is 9 pages, not one (v3: blessed cut)

Revision 2026-10-11 (TASKS T4): the v2 16-route plan is superseded. Six
surfaces were cut and folded — they stay removed:

| Cut route | Folded into |
|---|---|
| #/saved | Find jobs filter (saved toggle) + Applications tabs |
| #/alerts | Notification center + Inbox (hot-reply flags) |
| #/export | Settings JSON export + CSV helpers |
| #/realtime | Dashboard activity bars |
| #/globe | Dashboard region views |
| #/funnels | Dashboard funnel bars |

## Page inventory (9 routes + login/onboarding)

| # | Route | Page | Intent | Key blocks |
|---|---|------|--------|------------|
| 1 | /dashboard | Dashboard | Operate | command deck, metrics, funnel/activity bars, hot-reply flags |
| 2 | /jobs | Find jobs | Operate | filters (URL-synced: ?kw=&loc=&…), feed 25/page, spotlight, saved toggle, AI-search entry · 30 roles (JW-101…JW-130) |
| 3 | /match | AI match rank | Read | on-demand rank, 1–10 + reason chips |
| 4 | /applications | My applications | Operate | cap meter 5/day, status list, saved-jobs rail |
| 5 | /companies | Companies | Operate | list, profile, logs table 5/page |
| 6 | /outreach | Cold outreach | Operate | AI chat composer, 50/day cap, preview + history |
| 7 | /inbox | Inbox | Read | replies with category filters, compose handoff |
| 8 | /settings | Settings | Operate | display/safety, profile, JSON export, diagnostics |
| 9 | /search | AI search | Read | chromeless hero (deliberately chromeless — no shell) |

Plus auth: /login, /signup, /onboarding. Job detail = modal overlay
(not a page — deliberate, keeps list context).

## Navigation system (two surfaces, one truth)

- Desktop ≥1080px: left **Sidebar** (flat order: dashboard, jobs,
  applications, outreach, inbox, settings, companies, match).
- Mobile <1080px: **Dock** (5 slots: Overview, Jobs, Settings, AI-search
  palette action, More-sheet action). Sidebar hidden, dock shown.
- More-sheet + sidebar + dock all derive from one master list in
  `shell.tsx` (`useNavItems`; `useNav`/`useSidebarNav`/`useDock` are views —
  TASKS T5). No drift by construction.
- TopBar keeps: brand, Demo pill, view title, search, AI-search ⌘K,
  theme, bell. Breadcrumb = view title (no separate trail — flat IA).

## Acceptance

- All 9 routes reachable in ≤2 clicks from anywhere (sidebar or dock).
- Desktop shot shows sidebar; mobile-width shot shows dock, no sidebar.
- `Route` union in `types.ts`, `App.tsx` switch, and this doc agree —
  grep for `saved|alerts|export|realtime|globe|funnels` finds no routes.
- tsc + tests + build clean.
