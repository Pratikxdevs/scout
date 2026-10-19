# Scout demo script (KRITICAL HACKS '26)

Run order works line-free in ~4 minutes. Set both provider keys first (`TINYFISH_API_KEY`, `LLM_API_KEY` on the Convex deployment) — without them, run step 3 shows the honest failure path, which is also a demo point.

**Pre-flight (once):**
```bash
cd app && npm run dev                      # :2992
npx convex env set TINYFISH_API_KEY …      # if not set yet
npx convex env set LLM_API_KEY …           # if not set yet
```

1. **Clerk sign-in** — open `http://localhost:2992`, sign in with your test account. The show card under the auth form frames the pitch: *hunt → rank → draft, with evidence.*
2. **Onboarding = ICP** — the 3-step wizard *You / Services / Targeting* (services, industries, keywords, budget range). It autosaves to your Convex profile row — close the tab, sign back in, the row comes back. That's "the source of truth."
3. **Hunt** — dashboard quick-scan or the Jobs "Live search" bar, e.g. *"freelance react dashboard"*, fire it. The banner streams honest progress: queued → search/fetch/score → `Hunt loaded N leads`. Behind the scenes: `searchRuns.search_created → urls_discovered → fetch_completed → lead_qualified` activity rows (open `npx convex dashboard` live if wired to a projector).
4. **Break a claim for me** — pick a lead; the **Evidence** card lists only excerpt-backed claims (the verbatim-quote gate). Explain: *"If the model hallucinated a budget number, it's not here — evidence is stored per claim with its source page."*
5. **Score** — match ring + scoring notes: intent/skill/freshness/budget/source, all math in code, weights visible. Unstated budget never scores as a fit; undated pages never look fresh.
6. **Draft** — "Generate draft": the LLM writes the first-pass email against the page facts; Scout stores it, shows it, and *never sends*. Punchline: *"Scout does the hunting and the writing; the human still owns the send."*
7. **Pipeline** — move the lead through save → contacted → replied → won. The caps meter counts real contacted-today (cap 25) — the same number the backend could enforce.

**If the web is empty:** an empty hunt completes with `No URLs found — the web has no fresh hits for this hunt today.` — say "we never fabricate leads," flip the query, rerun live.

**If LLM key missing:** run fails with `PROVIDER_UNCONFIGURED: LLM_API_KEY is not set on this Convex deployment — scoring skipped.` — honest error, no partial invented results.

**Reset between runs (optional):**
```bash
npx convex dashboard      # or: re-run hunts from a different search phrase
```
