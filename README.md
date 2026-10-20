# Scout — the freelance lead radar that shows its evidence

**Scout hunts freelance work on the live web with [TinyFish](https://tinyfish.ai), verifies every claim against the page it came from, scores the fit against your ICP in code, and drafts the outreach — while never sending anything for you.**

Freelancers don't need *more* job posts. They need the *right* ones, with proof. Scout reads the live web with TinyFish (Search → Fetch → Web Agent), keeps only claims whose evidence is a verbatim substring of the page it came from, and refuses to count unknowns as good.

**Stack:** React + Vite · **Convex** (backend, live) · **Clerk** (identity) · **TinyFish** Search + Fetch + Web Agent (discovery & page reading) · **Groq / OpenAI-compatible LLM** (extraction, scoring context, drafts) · `unpdf` + a built-in DOCX parser (resume → ICP)

---

## The problem

A freelancer hunting on Upwork, Fiverr, LinkedIn, Naukri and Reddit spends 2–4 hours a day reading postings to answer one question: *"is this worth replying to?"* Most of the noise is the same three failures:

| Failure | Reality on those boards |
|---|---|
| **Wrong fit** | Title says "React dev", body wants a full-time in-office hire |
| **No budget** | 60–80% of postings never state a rate, range or budget |
| **Stale or fake** | Reposts, evergreen listings, "DM for salary", agencies pretending to be clients |

Job alerts (LinkedIn, Indeed, Jobscan) don't fix this: they filter on *metadata* the poster typed, not on what the page actually says. Scout reads the page and shows the sentence that proves each claim.

---

## TinyFish is the engine — here's exactly where it fits

TinyFish is not a token mention in Scout. It is the only thing that lets Scout read the *open* web (no APIs, no partnerships, no scraping infrastructure), and all three TinyFish surfaces are used in production paths:

| Scout stage | TinyFish API | What it buys us | Verified live |
|---|---|---|---|
| **Hunt discovery** | `GET api.search.tinyfish.ai` | A fresh SERP over the whole web (not one board's API), with `site:` scoping so a hunt can target Upwork / Fiverr / LinkedIn / Naukri / Reddit — and `-site:` exclusion | ✅ `site:upwork.com` → 10/10 upwork.com hits; `-site:reddit.com` → reddit absent |
| **Page reading** | `POST api.fetch.tinyfish.ai` | AI-ready **markdown** of the real page (batch ≤5 URLs, `ttl 0`), which is what the LLM and the evidence gate both read | ✅ 6–12K chars/page from Upwork, LinkedIn, Reddit, Toptal |
| **Thin-page fallback** | `POST agent.tinyfish.ai/v1/automation/run` | When a board renders client-side (or blocks plain fetch), a goal-driven Web Agent reads it like a human: *"list 3 job titles with their location"* | ✅ 7-step agent run on LinkedIn, ~85s, inside our 120s cap |
| **List-page splitter** | `POST agent.tinyfish.ai/v1/automation/run` | Boards that only expose *index* pages (Upwork categories, Y Combinator, Wellfound) are read by the Web Agent and split into **N individual leads**, each with its own evidence excerpt — the scraper replacement | ✅ 9 Upwork board pages → 9 individual gigs in one run |
| **List-page splitter** | `POST agent.tinyfish.ai/v1/automation/run` | Boards that only expose *index* pages (Upwork categories, Y Combinator, Wellfound) are read by the Web Agent and split into **N individual leads**, each with its own evidence excerpt — the scraper replacement | ✅ 9 Upwork board pages → 9 individual gigs in one run |
| **Anti-bot + geo** | `browser_profile: "stealth"`, `proxy_config.country_code` | The agent runs in stealth mode and (optionally) from the ICP's country — the boards that block plain fetches still answer | ✅ stealth agent run on Lever, geo-ready |
| **Intent + scoping** | `purpose`, `include_domains`, `location` | The provider is told *why* we're searching and exactly which domains are in scope, instead of relying on `site:` parsing | ✅ verified: `include_domains` ORs across hosts |
| **Freshness from the index** | `results[].date` | The search index knows the age ("2 days ago") — the freshness score comes from the index, not a model's guess | ✅ |
| **Link expansion** | Fetch `links: true` | On a board page the *links are the postings* — we fetch each one, so a category page becomes N real leads | ✅ 9 Upwork links → 9 gigs |
| *(next)* | Browser Context Profiles / Vault | Reuse a captured login for the boards that need a session (LinkedIn, Naukri) | needs a one-time sign-in |
| *(next)* | Monitor API | Saved searches as scheduled topic/page monitors | planned |

**Why this is the right tool, not a convenient one:** freelance boards have no public API, block scrapers, and change markup weekly. TinyFish gives us a *search* layer (find candidate pages) and a *reading* layer (get clean content) that stays working without maintaining scrapers — which is exactly why a solo team can ship this in a day.

**Provider engineering that came from testing, not docs:**
- A **rotating key pool** (`TINYFISH_API_KEY_1…3`) — round-robin across keys, and a `429` rotates to the next key before the failure surfaces.
- We measured that the documented-looking `excludeDomains` parameter is **silently ignored** by the API, so exclusion is done with the `-site:` operator that genuinely works.
- The Agent response nests its payload (`result.result`) — our parser handles the real shape, plus `status`/`error` fields.

---

## How a hunt works

```
ICP (who you are, what you sell, who you pay)
  │
  ├─▶ PLAN      deterministic: pick sources → one `site:`-scoped query per source
  │             (12 ATS boards · Reddit r/forhire · Freelancer · Upwork · Fiverr · LinkedIn ·
  │              Naukri · Remote OK · YC · Wellfound · WWR + company watchlist)
  ├─▶ SEARCH   TinyFish Search per query → ≤20 canonical, deduped URLs
  ├─▶ FETCH    TinyFish Fetch, ≤5 URLs/call, ≤4 batches/run, markdown text
  │             └─ thin page (<200 chars) → ≤2 Web Agent fallbacks
  ├─▶ QUALIFY  LLM reads the page under an anti-injection prompt
  │             └─ every claim must be a VERBATIM SUBSTRING of that page
  ├─▶ SCORE    pure code: intent 30% · skill 25% · source 15% · freshness 20% · budget fit 10%
  ├─▶ STORE    idempotent upsert by (account, canonical URL) + evidence rows
  └─▶ DRAFT    outreach draft per lead — recorded, never sent
```

**Scoring is code, not vibes.** The LLM never emits a number. It extracts facts; `convex/lib/scoring.ts` does the math and writes the explanation, so two reviewers see the same score for the same page.

**The evidence card is the product.** Open a lead and you get the score, the reason, and the *sentence from the page* behind every claim:

> **Budget · $2,000–$5,000** — "Budget: $2000–$5000 fixed price, 3-week engagement" *(upwork.com/jobs/~abc123)*

---

## Where the leads come from (22 verified sources, no scrapers)

TinyFish's `site:` scoping is what replaces a scraper fleet. Every scope below was
verified live against the provider — one scoped query per source, one opportunity
per result:

| Family | Sources | Shape returned |
|---|---|---|
| **ATS career pages** (12) | Greenhouse `job-boards.greenhouse.io` · Lever `jobs.lever.co` · Ashby `jobs.ashbyhq.com` · Workable `apply.workable.com` · Workday `myworkdayjobs.com` · Recruitee · Teamtailor · Pinpoint · iCIMS · Breezy · Rippling · Gem | `/{company}/jobs/{id}`, `/{company}/{uuid}` — one role, one page |
| **Freelance & boards** (8) | Reddit r/forhire · Freelancer · Upwork · Fiverr · LinkedIn · Naukri · Remote OK · Y Combinator / Wellfound / WWR | individual postings; boards that only expose index pages go through the Web Agent splitter |
| **Company watchlist** (15) | Stripe · Anthropic · Figma · Cloudflare · Datadog · Discord · Robinhood · Duolingo · OpenAI · Notion · Ramp · Cursor · Perplexity · Xsolla · Jobgether | one scoped query per company board: `site:job-boards.greenhouse.io/stripe` |

A URL only becomes a lead if it looks like **one opportunity** (posting-shaped path,
no board home, no locale-prefixed dead link) — everything else is dropped and
counted honestly in the run log.

## Honesty rules (the differentiator)

These are enforced in code, not in copy:

1. **Never send.** Scout records drafts. Sending is the user's action, from their own mailbox.
2. **Never invent.** A budget counts as verified only if a number is actually on the page (regex gate, and the LLM's own "verified" flag is re-checked).
3. **Unsupported claims die.** Every claim must be a substring of the fetched text; anything else is dropped before storage. A lead with no surviving evidence and no concrete intent is not stored at all.
4. **Unknowns never count as good.** No date → 0 freshness. No budget → 0 budget fit. "Maybe" never outranks a stated number.
5. **No invented leads.** An empty hunt finishes as a completed run that says why it was empty.
6. **Bounded by design.** ≤5 hunts in flight, ≤20 URLs/run, ≤5 URLs/fetch call, ≤2 agent fallbacks, daily contact cap — a cost model, not an afterthought.

---

## Bonus: feed Scout your resume

Upload a PDF/DOCX in the onboarding wizard and Scout builds your ICP from it:

```
browser → validate (PDF/DOCX, ≤10 MB) → private storage upload
  → byte-sniff the file → text extraction (unpdf for PDF, built-in ZIP/XML for DOCX)
  → text-only prompt (no OCR — a scanned PDF fails honestly)
  → strict JSON profile (clamped: 40 skills, 6 roles, 8 links, http(s) only)
  → merge into your ICP — ONLY into fields that are still empty
```

Your typing always wins: if you've already typed a field, the AI draft waits behind an explicit **"Apply AI draft"** button.

---

## Screenshots & demo

- **Demo script (4 min):** `docs/SCOUT-DEMO.md` — including the honest "provider unconfigured" path.
- **Screenshots:** `docs/` (add your own captures of: hunt running, evidence card, outreach draft, pipeline).
- **Demo video:** _link to be added (2–3 min) — hunt → evidence → score → draft._

---

## Revenue model

**Who pays:** freelancers who already pay for lead-gen tooling (Teal, Huntr, Jobscan, Simplify.jobs, Contra) and small agencies who need a pipeline, not a job feed.

| Tier | Price | What they get |
|---|---|---|
| **Free** | ₹0 | 3 hunts/day, 20 leads/day, evidence + score, no drafts |
| **Pro** | ₹499/mo (~$6) | Unlimited hunts, 200 leads/day, full outreach drafts, saved pipeline, source preferences |
| **Studio** (agency) | ₹2,499/mo (~$29) | 5 seats, multi-ICP, CSV/CRM export, priority fetch budget |
| **Add-on** | ₹99 per 100 drafts | Extra LLM draft packs (pay only for what you use) |

**Unit economics (estimates at current provider pricing):** one hunt ≈ 1–3 searches + ≤4 fetches + ≤20 LLM calls ≈ **$0.02–0.06** of provider spend. Pro at $6/mo ⇒ >90% gross margin; even a heavy user (10 hunts/day) stays under $2/mo of cost. We never pay for pages the user doesn't read.

**Why it's defensible:** job alerts sell *filters*; we sell *evidence*. A verified budget sentence is what a freelancer actually pays for — the same reason people pay for a good recruiter.

---

## Tech stack & repo map

```
app/
  convex/                    # backend — Convex deployment "zany-dragon-94"
    schema.ts                # users · profiles · searchRuns · searchTasks · leads ·
                             # leadEvidence · outreachDrafts · activityLogs · resumes
    providers/tinyfish.ts    # Search · Fetch(≤5) · Web Agent adapters + key pool
    providers/llm.ts         # OpenAI-compatible JSON calls, rotating key pool, 1 repair retry
    lib/sources.ts           # source registry (upwork/fiverr/linkedin/naukri/reddit/…)
    lib/prompt.ts            # anti-injection page wrapping (<<PAGE_START>> markers)
    lib/scoring.ts           # deterministic weights + verbatim-excerpt verification
    lib/aiProfile.ts         # resume → profile prompt + strict parser
    actions/discovery.ts     # plan → search (source-scoped)
    actions/fetchPages.ts    # fetch batches → agent fallback
    actions/qualifyLeads.ts  # extract → evidence gate → score → upsert
    actions/resumePipeline.ts# resume text extraction → AI profile draft
    resumes.ts               # upload/attach/version/merge for resumes
  src/
    store.tsx                # central state; Convex hooks stream leads → jobs/apps
    features/onboarding/     # 4-step ICP wizard (Personal · Experience · Skills · ICP)
    features/jobs/           # feed + lead detail (evidence card, outreach draft)
    features/search/         # hunt composer + source picker
docs/
  SCOUT-SPEC.md              # product + backend spec
  SCOUT-DEMO.md              # demo script
```

**Tests:** `npm test` → **179** node:test suites — backend logic included (scoring + evidence gate, URL canonicalization + SSRF guard, query planner, source registry, prompt wrapping, error taxonomy, caps, key pools, resume parser, DOCX/PDF gates).

---

## Run it locally

```bash
cd app
npm install
npm run dev            # vite on :2992 — expects .env.local (below)
npm run check          # tsc --noEmit (strict)
npm test               # 179 tests
npx convex dev --typecheck enable --once   # push backend + regenerate types
```

**`app/.env.local`** (client-safe only):
```
VITE_CONVEX_URL=https://zany-dragon-94.convex.cloud
VITE_CONVEX_SITE_URL=https://zany-dragon-94.convex.site
VITE_CLERK_PUBLISHABLE_KEY=pk_test_…      # never a secret key
```

**Deployment env** (`npx convex env set NAME value`):

| Key | Purpose |
|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk instance domain (`https://still-eagle-574.clerk.accounts.dev`) |
| `TINYFISH_API_KEY_1…3` | TinyFish Search/Fetch/Agent auth (pooled + rotated) |
| `LLM_API_KEY` | OpenAI-compatible chat key (Groq: `openai/gpt-oss-120b`) |
| `LLM_MODEL` | `openai/gpt-oss-120b` |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` |
| `LLM_TEMPERATURE` / `LLM_TOP_P` / `LLM_REASONING_EFFORT` | sampling for reasoning models |

**One Clerk step (already done in this deployment):** create a **JWT template named `convex`** with claim `{"aud":"convex"}` and 60s lifetime on the Clerk instance. Convex's Clerk integration calls `getToken({template:'convex'})`; without it, every backend call is `UNAUTHENTICATED`. (Also set `CLERK_JWT_ISSUER_DOMAIN` on the deployment.)

---

## What we verified live (not just "it compiles")

- TinyFish **Search** — `site:` scoping and `-site:` exclusion on all 5 requested boards
- TinyFish **Fetch** — real markdown, 6–12K chars/page, batch of 5
- TinyFish **Web Agent** — 7-step LinkedIn run, ~85s, parsed correctly (this caught a real bug: the payload nests at `result.result`)
- **Groq `openai/gpt-oss-120b`** — resume → strict JSON profile, 1 attempt, correct fields
- **Resume pipeline** — storage → text extraction → AI draft → fill-only-empty profile merge, end to end on the live deployment
- **Key rotation** — a deliberately revoked primary key rotates to the next one and the call still succeeds
- **End-to-end hunt** — real runs produced scored leads with verbatim evidence rows and an outreach draft (wizard → hunt → evidence → draft, exercised in the browser)
- **ATS sources** — Greenhouse/Lever/Ashby/Workable/Recruitee/Teamtailor pages fetched at 2–9K chars with locations, employment types and stated rates ("PLN 110 – PLN 160 per hour")
- **Web Agent splitter** — 9 Upwork board pages → 9 individual gigs, each with its own evidence excerpts
- **Yield after tuning** — 14 pages → 14 leads (100% conversion) once company roles stopped being misread as "not a freelance gig"
- **Fair budgets** — hits are harvested round-robin across sources, so one chatty board can never starve the other five (verified: all six sources represented in a single run)
- **Cost shape** — Search is free to 12,000 req/day and Fetch to 1,000 URLs/day; the wallet only funds what exceeds that (Agent runs are the pricey part, bounded to 2/run)
- **ATS sources** — Greenhouse/Lever/Ashby/Workable/Recruitee/Teamtailor job pages fetched at 2–9K chars with locations, employment types and stated rates ("PLN 110 – PLN 160 per hour")
- **Web Agent splitter** — 9 Upwork board pages → 9 individual gigs with their own evidence excerpts
- **Yield after tuning** — 14 pages → 14 leads (100% conversion) once company roles stopped being misread as "not freelance"

---

## Submission checklist

- [x] Public repo with working code, clear README, visible commits
- [x] TinyFish used meaningfully in Search, Fetch **and** Web Agent paths (explained above)
- [ ] Demo video (2–3 min) — `_link_`
- [ ] Social media post (LinkedIn/X) with screenshots + repo link — `_link_`

**Roadmap for the 24-hour finale:** Browser Infrastructure for session-gated boards, cross-board dedupe of reposted gigs, saved-search alerts, and a shared team pipeline view.
