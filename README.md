# Scout — AI freelance lead hunter

Scout hunts freelance leads on the open web (powered by [TinyFish](https://tinyfish.ai)), verifies every claim against the page it came from, scores the fit against your ICP in code, and drafts outreach — while never sending anything for you.

**Stack:** React + Vite · Convex (backend) · Clerk (identity) · TinyFish Search/Fetch/APIs (discovery + page reading) · OpenAI-compatible LLM (extraction + drafts).

---

## Quickstart

```bash
cd app
npm install
npm run dev            # vite on :2992 — expects .env.local (below)
```

Required in `app/.env.local` (client-safe values only):

```
VITE_CONVEX_URL=https://zany-dragon-94.convex.cloud
VITE_CONVEX_SITE_URL=https://zany-dragon-94.convex.site
VITE_CLERK_PUBLISHABLE_KEY=pk_test_…          # never a secret key
```

Deployment env (set with `npx convex env set`):

| Key | Purpose |
|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk dev instance domain (`https://still-eagle-574.clerk.accounts.dev`) |
| `TINYFISH_API_KEY` | Search/Fetch/Agent auth (`X-API-Key`) |
| `LLM_API_KEY` | OpenAI-compatible chat key (missing → hunts fail honestly with `PROVIDER_UNCONFIGURED`) |
| `LLM_MODEL` *(opt)* | default `gpt-4o-mini` |
| `LLM_BASE_URL` *(opt)* | default `https://api.openai.com/v1` (Groq/OpenRouter/vLLM all work) |

**Clerk dashboard (one manual step):** add a **Convex** JWT template to the still-eagle-574 instance so Convex can verify Clerk tokens (issuer + signing key). Without it, backend calls return `UNAUTHENTICATED`.

## How a hunt works (SPEC §5–§12)

1. **Plan** — deterministic (no LLM): your hunt text + ICP → ≤3 search queries.
2. **Search** — TinyFish Search (~SERP) per query, one retry on transient errors, SSRF-guarded, deduped by canonical URL, capped at 20 URLs.
3. **Fetch** — TinyFish Fetch (≤5 URLs/call, ≤4 batches/run); pages below 200 chars get ≤2 narrow Agent fallbacks.
4. **Qualify** — LLM extracts semantics from each page with an anti-injection system prompt; **claims survive only if the excerpt is a verbatim substring of the page**; budgets count as "verified" only if a number is actually on the page.
5. **Score** — pure code: intent 30% · skill 25% · freshness 20% · budget fit 10% · source 15%. Unknowns never count as good (undated → 0 freshness, unstated budget → 0 fit).
6. **Store** — idempotent upserts by `(user, canonicalUrl)`; evidence rows keep the excerpt + source URL for every stored claim.

## Honest boundaries (by design)

- **Scout never sends email.** Drafts are records; sending is yours.
- **No invented leads.** Empty hunt → completed run with a plain explanation.
- **Claim gate.** Unsupported LLM assertions are dropped before they reach you.
- **No proxy crawl.** Fetch/Agent calls carry the SSRF guard (`isAllowedFetchable`), re-checked after redirects.

## Repo map

```
app/
  convex/                 # backend (zany-dragon-94 deployment)
    schema.ts             # users/profiles/searchRuns/searchTasks/leads/leadEvidence/outreachDrafts/activityLogs
    providers/tinyfish.ts # Search · Fetch(≤5) · Agent(graph-120s) adapters + error taxonomy
    providers/llm.ts      # OpenAI-compatible JSON calls, one repair retry
    lib/prompt.ts         # <<PAGE_START>> anti-injection wrapping
    lib/scoring.ts        # deterministic weights + excerpt verification
    actions/              # discovery → fetchPages → qualifyLeads; generateOutreachDraft
    searchRuns.ts         # create/cancel + state-machine mutations (≤5 in flight)
    searchTasks.ts        # fetch task lifecycle, leases, retries (≤2 attempts)
    leads.ts              # idempotent upsert + owner-scoped reads + CRM status
    usage.ts              # caps meter truth (models/hunts/pipeline/contacted-today)
  src/
    store.tsx             # central state; Convex hooks feed leads→jobs/apps reactively
    features/             # profile · search · jobs(+detail/evidence/drafts) · applications · settings
    services/             # demo-mode services + legacy api taxonomy tests
```

## Scripts

- `npm run dev` — vite dev server (:2992)
- `npm run check` — `tsc --noEmit`, strict
- `npm test` — node:test suites (119 tests)
- `npx convex dev --typecheck enable --once` — push backend + generated types
- `npx convex dashboard` — inspect deployment data

See `docs/SCOUT-SPEC.md` for the full product/backend spec and `docs/SCOUT-DEMO.md` for the hackathon demo script.
