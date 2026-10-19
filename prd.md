# Jobangle — PRD v0.1

> **One search. Every live job. Applications done.**
>
> Jobangle is an AI job-hunt copilot that finds live roles across the open web and company career pages, verifies that they are still open, tailors your application without inventing experience, and completes the application form in a real browser with your approval.

**Status:** draft for KRITICAL HACKS '26 · **Last updated:** 20 Oct 2026

---

## 1. Decision summary

Build the **last mile** of job search, not another job board.

- The unified job search is the entry point, not the moat.
- The differentiator is: **verified live listings + honest resume tailoring + a real browser agent that fills the application.**
- TinyFish is the execution layer: **Search** for discovery, **Fetch** for extraction, **Agent** for dynamic/long-tail pages, **Browser** for deterministic form filling and a live browser view.
- Do **not** make bulk scraping of LinkedIn or Naukri the core product. It is technically fragile and contractually hostile. Use them as discovery/deep-link surfaces and build the reliable core on public company career pages and permitted feeds.
- Demo must show a real TinyFish run, a real application form being filled, and a human approval step before submission.

---

## 2. The problem

Job seekers do not have a search problem. They have an **application and trust** problem.

- They search across LinkedIn, Naukri, Instahyre, Wellfound, company career pages, and group chats.
- The same job appears on multiple sites with different titles, stale dates, and broken apply links.
- A large share of listings are ghost or low-intent jobs. In 2026, 39.3% of job seekers called fake/fraudulent/ghost jobs their main job-search problem, and 42.8% said it is sometimes hard to tell whether a listing is real ([iHire 2026 report via HR Dive](https://www.hrdive.com/news/ghost-jobs-and-fake-applicants-have-created-a-hiring-trust-gap/831871/)).
- Greenhouse data reported by the WSJ put ghost jobs at roughly **19% of postings** in Q2 2026 ([Allwork.Space summary](https://allwork.space/2026/08/nearly-1-in-5-job-ads-may-be-fake-ghost-jobs)).
- Every company uses a different ATS: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, or a homegrown portal. The last mile is repetitive form filling and rewriting the same cover letter.
- 57.5% of applicants say one of their biggest frustrations is applying and never hearing back ([iHire](https://www.hrdive.com/news/ghost-jobs-and-fake-applicants-have-created-a-hiring-trust-gap/831871/)).

**The insight:** the job boards stop at “Apply.” The highest-friction, highest-value moment is *after* the click. That is where an agent belongs.

---

## 3. Target user

**Primary:** early-career tech and knowledge workers in India (0–5 years), applying to 20–100+ roles in a search cycle.

Why this segment:

- High application volume, high repetition, low willingness to pay for another job board.
- Unique ATS per company, so a browser agent is genuinely useful.
- Strong India distribution: Naukri reports **10 crore+ registered jobseekers**, **20 lakh daily active users**, and **7 lakh+ businesses** ([Naukri recruiter page](https://www.naukri.com/recruit/buy-resume-database-access-packages)).
- India is projected to add about **1.28 crore jobs in 2026** ([foundit, Dec 2025](https://www.ptinews.com/press-release/hiring-surges-23-in-2025-as-india-prepares-for-a-1-28-crore-job-expansion-in-2026-foundit-insights-tracker/3201842)).

**Secondary (later):** career switchers, bootcamp graduates, and recruiters who want verified, high-intent applicants.

---

## 4. Product thesis

### 4.1 One-liner

> **Jobangle finds the jobs worth applying to and does the application busywork — with you in control of the final submit.**

### 4.2 Three pillars

1. **Live web, not a stale database**
   TinyFish Search finds jobs across the open web; Fetch renders the actual page; Agent handles career sites that need clicks. Every card shows where it came from and when it was last verified.

2. **Honest tailoring**
   The resume rewrite is evidence-based. Jobangle quotes the exact resume line behind every suggested bullet and shows missing skills. It never invents employers, dates, degrees, or metrics.

3. **Application autopilot with a human brake**
   The agent fills the real form in a cloud browser, using the user’s saved answers. The user reviews the filled form and clicks **Approve & submit**. No blind mass-spam.

### 4.3 What we are not

- Not a LinkedIn/Naukri scraper.
- Not a mass auto-apply bot.
- Not a resume hallucination machine.
- Not a recruiter ATS in the 24-hour MVP.

---

## 5. MVP scope

### Must ship

- Landing/dashboard with job search: role, location, experience, remote.
- Resume upload/paste and lightweight profile extraction.
- TinyFish Search across multiple query families:
  - company career pages / ATS pages
  - public job boards
  - LinkedIn/Naukri public search results as **discovery links only** (see §8)
- TinyFish Fetch of selected result pages with `ttl: 0` for live checks.
- TinyFish Agent on at least one dynamic career page that Fetch alone cannot handle.
- Normalized job cards with:
  - title, company, location, remote/hybrid, salary if disclosed
  - source + original URL
  - last verified timestamp
  - match score with 2–3 reasons and 1–3 gaps
- Job detail view with:
  - evidence-based match explanation
  - tailored professional summary / 3 resume bullets
  - short “why this role” note
  - **no fabricated claims**
- “Apply with Jobangle” flow:
  - TinyFish Browser/Agent opens the real application page
  - fills name, email, phone, links, resume upload, and standard questions
  - live browser preview embedded in the UI
  - user reviews and approves submission
- Application tracker: saved, tailoring, ready, applied, follow-up.
- TinyFish run trace panel: steps, status, latency, estimated cost. This makes the integration visible and explainable to judges.
- Demo mode with seeded jobs and a controlled sandbox application page, so the demo works even if a third-party site changes or blocks a run.
- README, architecture diagram, 2–3 minute demo video, social post.

### Should ship

- Dedupe by canonical apply URL + company/title/location fingerprint.
- Dead-link/closed-listing detection with a visible “live check” badge.
- Follow-up message draft (recruiter note) after application.
- Cost meter per run.
- Mobile-responsive UI.

### Will not ship in the MVP

- Real email inbox sync.
- Recruiter-side dashboard / sourcing.
- Payments.
- Fully autonomous submission at scale.
- Bulk scraping of LinkedIn/Naukri.
- Multi-user auth and team accounts.

---

## 6. The demo narrative

**Goal:** a judge should understand the product in 20 seconds and see TinyFish doing real work in 60 seconds.

1. **0:00 — Problem.** “Eight tabs. A hundred applications. Most jobs are stale or fake. The boards stop at Apply.”
2. **0:15 — Search.** Paste resume, search “AI/ML engineer, Bengaluru, 0–3 years, remote-friendly.”
3. **0:25 — TinyFish works.** Show the live panel:
   - Search: multiple queries across career pages and boards.
   - Fetch: rendering a JavaScript-heavy job page.
   - Agent: opening a career portal and extracting structured roles.
4. **0:50 — Unified results.** Job cards show source, freshness, salary, match score, gaps. Dedupe removes the same role from three sources.
5. **1:10 — Tailor.** Open a match. Show the evidence mapping: “You built a RAG pipeline at X; this role asks for retrieval evaluation.” Show a gap honestly.
6. **1:30 — Apply.** Click “Apply with Jobangle.” Live browser opens the real form, fills fields, attaches resume. User reviews and clicks submit.
7. **2:00 — Tracker.** Application logged, follow-up drafted.
8. **2:15 — Why TinyFish.** “Search, Fetch, Agent, and Browser are four different jobs. TinyFish gives us one API key and one execution layer for all of them.”
9. **2:30 — Repo + social post CTA.**

**Reliability plan:** `DEMO_MODE=1` uses seeded results and a local sandbox form if TinyFish or a third-party site fails. The demo still shows a real TinyFish run in the “live” panel when available. The README explains both paths.

---

## 7. TinyFish integration

### 7.1 Why each API is used

| TinyFish API | Jobangle use | Why it is meaningful |
|---|---|---|
| **Search** | Discover job pages and company career portals; query variants for role/location/site. | Finds fresh URLs beyond a static database. |
| **Fetch** | Render and extract job descriptions, salary, location, apply URL; live-check a listing with `ttl: 0`. | Handles JS-heavy pages and returns clean markdown/JSON for the matcher. |
| **Agent** | Navigate a career site with filters/clicks; extract jobs from a long-tail portal; fill an application form when the DOM is unpredictable. | Does the multi-step work a scraper cannot. |
| **Browser** | Deterministic Playwright/CDP sessions for known ATS forms, plus a live browser preview for the user. | Gives control, speed, and a transparent “watch it work” demo. |

This is not a token mention: removing TinyFish breaks discovery, extraction, application completion, and the live demo.

### 7.2 Orchestration flow

```text
User query + resume
        │
        ▼
TinyFish Search (parallel query families)
        │
        ▼
Rank + dedupe candidate URLs
        │
        ├──► TinyFish Fetch (batch, ttl: 0)
        │       └──► structured job extraction
        │
        └──► TinyFish Agent (only for dynamic / blocked / multi-step pages)
                └──► output_schema jobs[]
        │
        ▼
Normalize + fingerprint + match + verify
        │
        ▼
Job cards + evidence + tailored application
        │
        ▼
TinyFish Browser / Agent fills application
        │
        ▼
Live preview + user approval + submit
        │
        ▼
Tracker + run trace + cost estimate
```

### 7.3 Implementation notes

- Use the official SDKs: `npm install @tiny-fish/sdk@latest` or `pip install -U tinyfish`.
- Keep the TinyFish API key **server-side only**.
- Use `output_schema` for every extraction. Top level must be an object; arrays go inside an object field (`jobs[]`).
- Avoid unsupported schema keywords: `additionalProperties`, `const`, `oneOf`, `example`.
- Use `/run-async` + polling for long runs. Use `/run-sse` only if the deployment supports long-lived streams. This avoids serverless timeout failures.
- Embed `streaming_url` in an iframe for the live browser preview. It is read-only.
- Use `browser_profile: "stealth"` only where the site permits automated access. Do not use it to defeat a login wall or a site that explicitly prohibits automation.
- Control cost with `agent_config.max_steps` (e.g. 20–40) and `max_duration_seconds` (e.g. 120–240).
- Always check the `COMPLETE` event's result for failure signals, not just `status === COMPLETED`.
- Store `run_id`, steps, `streaming_url`, result, and error for the trace panel and README screenshots.

### 7.4 Cost model (public pricing, Oct 2026)

From [TinyFish pricing](https://www.tinyfish.ai/pricing):

- Search: **free** within rate limits (30 req/min; 500/hour on PAYG).
- Fetch: **free** within limits (150 URLs/min; 1,000/day on PAYG).
- Agent: **$0.016 per step**.
- Browser: **$0.002 per minute**; 5 concurrent sessions on PAYG.
- New accounts: $8 free wallet (the hackathon link advertises $13).

Approximate INR at ₹88/$:

- 20-step Agent run: **~₹28**.
- 20-minute Browser session: **~₹3.5**.
- A Browser-first application: **~₹3–8** including LLM tokens and infra.
- A long-tail Agent application: **~₹15–30**.

**Architecture implication:** use Browser + deterministic Playwright for known ATS forms; reserve Agent for unknown sites. This keeps the marginal cost low enough for a consumer subscription.

---

## 8. LinkedIn / Naukri: feasibility and policy

### 8.1 What is technically possible

- **LinkedIn public job search** pages are accessible without login and show title, company, location, posting age, and links to public job pages. I verified this with a standard web fetch on 20 Oct 2026.
- **LinkedIn job detail pages** may show the description and an external apply link, but often hit an auth wall, rate limit, or login prompt.
- **Naukri** returned **HTTP 403** to a standard fetch in my test. It uses aggressive anti-bot measures and dynamic pages.
- **TinyFish Agent with stealth + residential proxy** will likely get further than a plain fetch on some public pages. It is not guaranteed, and it does not make the activity permitted.

### 8.2 What the rules say

- **LinkedIn User Agreement** prohibits using software, scripts, robots, or other automated means to scrape or copy the Services, including profiles and other data. LinkedIn's `robots.txt` says automated access without express permission is strictly prohibited, except for approved crawlers. See [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) and [robots.txt](https://www.linkedin.com/robots.txt).
- **Naukri Terms** explicitly prohibit using automated means to crawl or scrape content and prohibit circumventing technical methods used to exclude robots. See [Naukri Terms & Conditions](https://www.naukri.com/termsconditions).
- Publicly available data can still be subject to contract, privacy, and database rights. This is not legal advice; for a production product, get counsel and permission.

### 8.3 Product decision

**Do not build a mirrored LinkedIn/Naukri database. Do not demo bulk scraping.**

Use them in three limited ways:

1. **Discovery links:** TinyFish Search may return public LinkedIn/Naukri URLs. Show the title/snippet with clear attribution and open the original in a new tab. Do not persist a full mirrored copy.
2. **Company-source-of-truth:** resolve the same role to the employer's career page/ATS and fetch that page. The employer page is fresher and more likely to be permitted.
3. **User-authorized action (post-MVP):** if a user explicitly connects their own account/session, a single user-initiated application assist may be possible. This is still ToS-sensitive; do not put it in the core demo or promise it.

**Positioning:** “Jobangle searches the open web, including public listings from LinkedIn and Naukri, then takes you to the source of truth and completes the application.” This is honest, useful, and much safer than “we scrape everything.”

---

## 9. Architecture

### 9.1 Recommended stack

- **Frontend/backend:** Next.js (App Router) + TypeScript + Tailwind. If the provided frontend is Vite/React, keep the UI and add a small Fastify/Express API.
- **Database:** SQLite + Drizzle/Prisma for the demo; Postgres/Neon/Supabase for deploy.
- **TinyFish:** `@tiny-fish/sdk` server-side.
- **LLM:** one provider for structured matching/tailoring. Use JSON schema/structured outputs. Keep prompts evidence-bound.
- **File parsing:** `unpdf` or `pdf-parse` for resume text; store raw text + extracted profile.
- **PDF output:** start with copy/download as text; add `@react-pdf/renderer` if time.
- **Deploy:** Vercel for UI/API; use async TinyFish runs + polling to avoid serverless timeouts. A small Render/Fly worker is an alternative if SSE is required.

### 9.2 API contract

```text
POST /api/search
  { query, location, experience, remote, resumeId }
  -> { searchId, jobs[], runs[] }

GET /api/search/:id
  -> { status, jobs[], progress[] }

POST /api/jobs/:id/tailor
  -> { summary, bullets[], evidence[], gaps[], coverNote }

POST /api/jobs/:id/apply
  -> { applicationId, tinyfishRunId, streamingUrl }

GET /api/applications/:id
  -> { status, steps[], streamingUrl, result, costEstimate }

POST /api/applications/:id/approve
  -> { submitted: true }
```

### 9.3 Data model

```text
users        id, name, email, resume_text, profile_json, prefs_json
jobs         id, source, source_url, apply_url, title, company, location,
             remote, salary_min, salary_max, currency, description,
             posted_at, fetched_at, live_status, fingerprint
matches      id, user_id, job_id, score, reasons_json, gaps_json,
             tailored_summary, tailored_bullets_json, cover_note, status
applications id, user_id, job_id, status, tinyfish_run_id, streaming_url,
             started_at, completed_at, cost_estimate, error
runs         id, type, tinyfish_run_id, request_json, result_json,
             steps_json, error, created_at
```

### 9.4 Matching approach

For the MVP, do not train a model. Use a deterministic + LLM hybrid:

1. Extract must-have skills, nice-to-haves, seniority, location, and work mode from the JD.
2. Extract evidence from the resume with line references.
3. Compute coverage: must-have coverage (60%), nice-to-have (20%), seniority/location fit (20%).
4. Ask the LLM for a short explanation and gaps, constrained to the extracted evidence.
5. Store the evidence lines with each claim; the UI shows “based on: …”.

This is explainable, fast, and avoids the “AI lied on my resume” failure mode.

### 9.5 Failure handling

- TinyFish failure → retry once, then show a graceful “couldn’t verify” card with the source link.
- Third-party site blocks → fall back to Fetch, then to a search snippet + deep link.
- Agent takes too long → cancel and show partial results.
- No API key / rate limit → demo mode with seeded data and a clear banner.
- Application form changes → Browser-first known ATS, Agent fallback; never silently submit a half-filled form.

---

## 10. Revenue model

### 10.1 Pricing

| Plan | Price | What the user gets | Why it works |
|---|---|---|---|
| **Free** | ₹0 | 5 live matches/day, 2 tailored applications/month, tracker | Acquisition and demo. Low marginal cost because Search/Fetch are free. |
| **Jobangle Pro** | **₹299/month** or **₹1,999/year** | Unlimited discovery, 15 application assists/month, live verification, follow-up drafts | Below LinkedIn Premium Career (~₹999/month in India, per secondary reports) and focused on outcomes. |
| **Application Pack** | **₹199 for 10** | 10 application assists, valid 60 days | Lets users pay per outcome without a subscription. ~₹20/application. |
| **Recruiter / employer** | **₹2,999 per role/month** or **₹99 per verified application** | Verified, high-intent applicants; no stale listings | Compare Naukri job posting plans starting around ₹400–₹2,500 + GST. |
| **Sponsored/featured role** | ₹499–₹1,499 per role | Targeted placement in matching results | Native, low-friction upsell. |

### 10.2 Unit economics

| Cost line | Browser-first application | Agent-heavy application |
|---|---:|---:|
| TinyFish Browser (4 min) | ~₹0.70 | — |
| TinyFish Agent (20 steps) | — | ~₹28 |
| LLM tokens (match + tailor + form answers) | ~₹1–3 | ~₹1–3 |
| Infra/storage | ~₹0.50 | ~₹0.50 |
| **Estimated marginal cost** | **~₹3–5** | **~₹30–32** |
| Price per assisted application (Pro at 15/mo) | ~₹20 | ~₹20 |
| Gross margin | ~75–85% | negative at list price |

**Therefore:** the product must be Browser-first. Agent runs are reserved for long-tail sites and priced separately or capped. A 15-application Pro plan at ₹299 is viable if at least ~80% of applications use Browser/deterministic flows. The Application Pack at ₹199/10 remains profitable for Browser-first flows; Agent-heavy usage needs a fair-use cap (e.g. 20% of runs) or a higher pack.

### 10.3 Market evidence

- Naukri: 10 crore+ registered jobseekers, 20 lakh DAU, 7 lakh+ businesses ([Naukri](https://www.naukri.com/recruit/buy-resume-database-access-packages)).
- Naukri employer plans: free posting, ₹400 standard, ₹850 classified, ₹1,650 hot vacancy; SMB plan ₹2,500 + GST for 2 postings ([Naukri/PTI](https://www.ptinews.com/press-release/from-free-to-premium-how-naukri-supports-business-hiring-needs/3296645), [Internshala comparison](https://internshala.com/blog/employer-job-posting-cost-comparison)).
- LinkedIn Premium Career India: reported around ₹999/month ([Digitalthoughtz](https://digitalthoughtz.com/2026/03/07/linkedin-premium-cost-india)); US list is $29.99–$39.99/month.
- India online recruitment market: estimated ~$2.8B in 2026, ~150M registered users ([Industry Research](https://www.industryresearch.biz/market-reports/online-recruitment-market-108847)). Treat as directional, not audited.

**Revenue story for judges:** start with B2C subscriptions and application packs; add recruiter “verified application” pricing once supply/demand liquidity exists. The B2B price is anchored to Naukri’s ₹400–₹2,500 posting economics, but sold on verified intent rather than impressions.

---

## 11. Judging alignment (100 points)

| Criterion | Points | How Jobangle scores |
|---|---:|---|
| Working GitHub project | 20 | Public repo, working demo, README with setup + architecture, visible commits starting now, screenshots, fallback demo mode. |
| TinyFish integration | 20 | Search + Fetch + Agent + Browser, each with a clear job; live browser preview; run trace; README section “How TinyFish is used” with code pointers. |
| Social media post | 10 | 60–90s screen-recorded demo, problem → product → TinyFish → repo link. Post on X/LinkedIn; public. |
| Technique | 10 | Typed API contract, structured outputs, async runs, retries, dedupe, validation, cost controls, graceful fallbacks. |
| Innovation and idea | 20 | Last-mile application agent + live verification + evidence-only tailoring. Not “another job board.” |
| Impact and usefulness | 10 | Real India early-career pain; time saved per application; reduces ghost-job waste. |
| Revenue model | 10 | Freemium + Pro + packs + recruiter verified applications; unit economics and competitor anchors. |
| **Total** | **100** | Target: 90+. |

**Biggest scoring risk:** looking like a generic AI job board. The demo must show the application being filled in a real browser and the live TinyFish trace. If we only show search results, we lose the innovation and TinyFish points.

---

## 12. Build plan (order of operations)

### Phase 0 — lock the demo (30 min)

- Confirm frontend stack, TinyFish key, LLM key.
- Freeze the one-sentence pitch and the 3-minute demo script.
- Create the public repo and commit this PRD.

### Phase 1 — skeleton (1–2 h)

- App shell, search bar, job card, job detail, tracker.
- Env validation, TinyFish server client, error boundary, demo-mode flag.
- Seed 12 real jobs from public company career pages.

### Phase 2 — discovery + extraction (3–4 h)

- `/api/search`: TinyFish Search query families.
- `/api/search`: TinyFish Fetch batch, `ttl: 0`, markdown.
- LLM extraction to `jobs[]` schema; normalize/dedupe.
- Match score + evidence/gaps.
- UI wiring + loading/progress states.

### Phase 3 — agent + apply (3–4 h)

- TinyFish Agent run on one dynamic career page.
- Browser session + Playwright fill for a sandbox application page.
- Store steps and streaming URL; embed live preview.
- Approval step, tracker update.

### Phase 4 — polish + submission (2–3 h)

- Tailoring UI with evidence citations.
- Fallback/error states; cancel button.
- README, architecture diagram, screenshots.
- 2–3 minute demo recording (use OBS or Loom).
- Social post with video + repo link.
- Submit on Unstop.

### If time is extremely tight

Ship in this order: **search + fetch + unified cards + evidence-based tailoring + sandbox browser fill + live trace + README/demo video.** Drop auth, email sync, recruiter dashboard, and real third-party submissions.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| TinyFish latency (Agent 15–60s) | Async runs + polling; show progress; cache normalized jobs; pre-warm demo data. |
| Third-party site blocks or changes | Source links + graceful fallback; use company ATS pages; sandbox form for the live demo. |
| ToS/legal exposure from LinkedIn/Naukri | Discovery links only; no bulk mirror; no login-wall circumvention; document policy in README. |
| Resume hallucination | Evidence-only prompts; quote resume lines; show gaps; human approval. |
| Auto-apply spam / account bans | Human-in-the-loop; per-user daily caps; no blind bulk submit; respect site rules. |
| Serverless timeout | `/run-async` + polling; avoid long SSE on hobby plans. |
| No API keys at demo time | `DEMO_MODE` with seeded jobs and a local sandbox form; still show a recorded real run. |
| Frontend integration mismatch | Lock the API contract first; keep UI components independent of backend. |
| Deadline today | Ruthless scope: demo the wedge, not the whole portal. |

---

## 14. Open questions (need answers before build)

1. **Frontend stack:** Next.js, Vite/React, or something else? Can you share the folder/zip, or should I scaffold the app shell?
2. **TinyFish key:** Do you have one? If not, sign up now via the hackathon link and put `TINYFISH_API_KEY` in `.env.local`.
3. **LLM key:** OpenAI, Gemini, Anthropic, OpenRouter, or none? Matching/tailoring needs one.
4. **Deadline:** Are we submitting today (20 Oct)? How many hours do we have, and how many people?
5. **Positioning:** Do you agree with pivoting from “unified job portal” to “job search + application copilot”? This is the recommended path.
6. **Target user:** early-career tech in India, or a broader audience?

---

## 15. References

- TinyFish docs: [Agent](https://docs.tinyfish.ai/agent-api) · [Fetch](https://docs.tinyfish.ai/fetch-api) · [Search](https://docs.tinyfish.ai/search-api) · [Browser](https://docs.tinyfish.ai/browser-api) · [Live preview](https://docs.tinyfish.ai/live-preview) · [Pricing](https://www.tinyfish.ai/pricing)
- LinkedIn: [User Agreement](https://www.linkedin.com/legal/user-agreement) · [robots.txt](https://www.linkedin.com/robots.txt)
- Naukri: [Terms & Conditions](https://www.naukri.com/termsconditions)
- Ghost jobs: [HR Dive / iHire 2026](https://www.hrdive.com/news/ghost-jobs-and-fake-applicants-have-created-a-hiring-trust-gap/831871/) · [Allwork.Space / WSJ](https://allwork.space/2026/08/nearly-1-in-5-job-ads-may-be-fake-ghost-jobs)
- India market: [Naukri recruiter page](https://www.naukri.com/recruit/buy-resume-database-access-packages) · [foundit 2026](https://www.ptinews.com/press-release/hiring-surges-23-in-2025-as-india-prepares-for-a-1-28-crore-job-expansion-in-2026-foundit-insights-tracker/3201842)
- Pricing anchors: [Naukri/PTI](https://www.ptinews.com/press-release/from-free-to-premium-how-naukri-supports-business-hiring-needs/3296645) · [Internshala comparison](https://internshala.com/blog/employer-job-posting-cost-comparison) · [LinkedIn Premium India](https://digitalthoughtz.com/2026/03/07/linkedin-premium-cost-india)
