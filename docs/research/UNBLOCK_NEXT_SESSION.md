# Unblock next session — shopping list

Per the protocol's terminal step. Numbered list of specific user-actionable items that would unblock further work, with cost and effort estimates. Sorted by EV.

## Priority 1 — High EV, low effort

### 1. Fix the gitignore for `docs/screenshots/`

**Problem:** Agent D found that `docs/screenshots/` is NOT actually gitignored despite `CLAUDE.md` claiming so. The current commit (`3a87ff9`) includes 4 PNG screenshots (~700 KB total). Future Playwright runs will accumulate megabytes per session.

**Fix:** Add to `.gitignore`:
```
docs/screenshots/
```
Or, if some screenshots ARE wanted in version control (e.g. golden references), use a path-specific allow rule:
```
docs/screenshots/*
!docs/screenshots/golden/
```

**Cost:** Free. **Effort:** 2 minutes.

### 2. Schedule a 4-quarter re-evaluation calendar reminder for Q1 2027

**Problem:** Verdict B is the right call on N=2 OOS quarters of earnings + N=66 of CR2/EC2 candidates, but with another 4-6 quarters of data the marginal candidates (CR2 far-OTM crypto NO, EC2 econ drift fade) could clear the N≥80 threshold. Without a reminder, this re-eval will not happen automatically.

**Action:** add a recurring calendar event for **2027-01-15** titled "Earnings Edge: re-run docs/research/PROTOCOL.md backtests" with a link to this repo.

**Cost:** Free. **Effort:** 1 minute.

### 3. Update `/stats` page copy to reflect verdict B

**Problem:** Current /stats and /signal pages frame the project as "harvesting EPS-surprise edge." Verdict B contradicts that framing.

**Action:** soften the copy. Suggested replacement for /stats hero text:
> Calibration tracker for Polymarket earnings-mispricing signals. Verdict from 2026-05-06 backtest: no tradeable edge demonstrated at N≥80. Continuing to log paper bets as data accumulates for Q1 2027 re-evaluation.

The verdict banner Agent D shipped already shows the result programmatically; the page-level copy still claims edge.

**Cost:** Free. **Effort:** 15 minutes (find + replace in `app/stats/page.tsx`, `app/signal/[id]/page.tsx`, possibly `lib/types.ts` schema descriptions).

## Priority 2 — High EV, medium effort

### 4. Build a real Polymarket ↔ Kalshi semantic matcher for cross-venue arb

**Problem:** Agent C produced 26 Kalshi pairs that look matched at the topic level (CPI events, Fed events) but the underlying questions bucket outcomes differently. Example: Polymarket "rate cut by 25 bps after March 2026 meeting" vs Kalshi "rate above 3.50% following March 18 meeting" — both about the same event but with different probability spaces.

**Action:** write a translator that maps a Polymarket question's implied outcome distribution to the Kalshi outcome buckets. Two viable approaches:

- **Manual heuristic:** for Fed-rate questions, parse the threshold and direction; aggregate probabilities across Kalshi buckets. ~1 day.
- **LLM-graded:** for each Polymarket-Kalshi candidate pair, ask Claude (or GPT-4) "are these asking the same probabilistic question? If yes, what's the translation rule?" Run on ~100 candidate pairs at ~3 cents each = ~$3 total cost. ~2-3 days end-to-end.

**Then** re-run CR3 (cross-venue arb) and EC variants on the translated pairs.

**Cost:** ~$3 in LLM calls (LLM approach) or $0 (manual). **Effort:** L (1-3 days). **Plausible upside:** unblocks the only category-spanning strategy not yet falsified.

### 5. Pay for Finnhub key locally OR rotate the Vercel "Sensitive" classification

**Problem:** `FINNHUB_API_KEY` returns empty from `vercel env pull` because of Vercel's Sensitive-classification quirk (documented in STATE.md). Agent A this session and prior could have used Finnhub `/stock/earnings` instead of Alpha Vantage's 25-call/day cap. Currently we have 6.8% feature coverage instead of full coverage.

**Action options:**

- (a) **Reclassify the env var** in Vercel from Sensitive to Encrypted (still safe at rest, but pulls work). Cost: free. Effort: 30 min, then re-test the pull.
- (b) **Add a separate `.env.local`** with the Finnhub key for local dev (gitignored). Cost: free. Effort: 5 min if you already have the key in Vercel; copy-paste it.
- (c) **Pay Finnhub Pro tier** (~$30/mo) for higher rate limits and additional endpoints. Only worth it if (a) or (b) actually leads to model improvements. Recommend: skip until (a)+(b) prove the data is the bottleneck.

**Cost:** $0 (option a/b) or $30/mo (option c). **Effort:** 5-30 min.

### 6. Add Polymarket orderbook depth (`/book` endpoint)

**Problem:** CR1 (spread-narrowing scalp) is blocked because 12h CLOB price-history doesn't expose bid/ask depth. CR1 is potentially the highest-EV crypto strategy if real spreads exist.

**Action:** poll Polymarket CLOB `GET /book?token_id=X` per market at ~30-min cadence for ~1 week. Store depth snapshots; analyze realized spreads. If median spread >5%, CR1 backtest becomes feasible.

**Cost:** free (Polymarket CLOB has no auth). **Effort:** S — write a polling cron + analysis script, ~3-4 hours. Could also be added to the dashboard's Vercel cron.

## Priority 3 — Medium EV, higher effort

### 7. Add IV-rank feed for underlyings (Polygon or Tradier)

**Problem:** Alternative 5 from prior session (volatility-crush hedge) is blocked on IV data. The hypothesis: Polymarket "Miss" bets are functionally long-vol; combining with low-IV-rank underlyings creates a two-signal edge.

**Action options:**
- **Polygon Starter:** $30/mo, includes IV history.
- **Tradier:** $10/mo for delayed quotes (good enough for daily IV-rank).
- **Free fallback:** `yfinance` daily option chains (unofficial, may break). Use for proof-of-concept only.

**Cost:** $10-30/mo. **Effort:** M — once data available, this is a 1-2 day backtest extension.

### 8. Add intraday Polymarket prices (sub-12h)

**Problem:** Prior session (and this one) used `fidelity=720` minutes (12h). Some hypotheses (timing alpha, EC1 within last hour vs last day) need sub-hour resolution.

**Action:** poll CLOB `prices-history?fidelity=60` (1h) for the markets actively tracked. Or `fidelity=15`. Estimate: 1000 markets × 1h × 24 polls/day = 24K calls/day — feasible at Polymarket's rate limits but storage grows fast.

**Cost:** free API. **Effort:** M-L — needs a real polling service, not just one-off scripts. Could be a Vercel cron + GitHub-data-repo writes (the existing pattern).

### 9. Re-evaluate after Q1 2027 (≥8 quarters total)

**Problem:** The current verdict is constrained by N. Two near-miss strategies (CR2, EC2) could plausibly clear primary at higher N. Earnings strategies (S1–S7, E4, E6) are unlikely to flip but worth checking.

**Action:** at Q1 2027 (or 6 months from now, whichever is later):
- Re-run `scripts/research_harvest_finish.py` to refresh the parquet
- Re-run `scripts/research/run_backtests.py` (Agent B's reproducible driver, seed=42)
- Compare strategy_summary.csv to today's snapshot
- Update VERDICT.md with new evidence

**Cost:** ~30 min of compute; no API spend. **Effort:** S if scripts still work; M if they need refresh.

## Priority 4 — Speculative / lower confidence

### 10. CLV-based skill measurement (not P&L)

**Problem:** P&L is high-variance on small N. CLV (closing-line value) — measuring whether your entry price moved toward your bet side by resolution — converges faster.

**Action:** For each historical bet in this session's strategies, refetch CLOB at finer fidelity near resolution and compute the closing-line price. Compute CLV per bet and compare distributions. Strategies with consistently positive CLV (even if P&L is noisy) are more likely to have real edge.

**Cost:** free. **Effort:** M.

### 11. Fix the data-hygiene bugs Agent D (prior session) found

- Class-share ticker regex `\(([A-Z]{1,5})\)` misses BRK.A, UHAL.B, MOG.A. Use `\(([A-Z.]{1,7})\)`. ~1% of dataset impact. **Cost:** free, **effort:** 5 min.
- 5 of the "earnings"-tagged Polymarket markets are MrBeast Twitter-revenue questions. Add a defensive question-text regex (`/beat.*earnings|EPS|quarterly/i`). ~0.6% impact. **Cost:** free, **effort:** 10 min.

These don't change the verdict but should be folded into `scripts/research_harvest_finish.py` for future runs.

## Items not on the shopping list (intentionally)

- **Vercel Pro upgrade for sub-daily cron.** STATE.md still flags this; not relevant to verdict B unless the user pivots to a new edge that needs faster polling.
- **Snapshot writer P0 fix.** Tracked in STATE.md; orthogonal to research direction.

## Summary

The **highest-EV next move** is item #4 (Polymarket↔Kalshi semantic matcher for cross-venue arb): it's the only unfalsified strategy in the protocol, and the manual-translation path is achievable in 1 day. Everything else either (a) costs money for marginal upside on a project that just verdict-B'd, or (b) is a long-horizon recompute (item #9).
