# Session log — multi-category research

Append-only. Every ~15 min an entry.

## [18:45] orchestrator | session start
- Prior session's earnings verdict imported.
- Pre-flight: pushed prior commit (b42bc3d). New dirs created: data/research/{gamma_markets,clob_history/econ,clob_history/crypto,backtest_results,diag}.
- Reality check: econ ~700 unique closed binary markets, crypto ~250 low-cap. Both clear N≥30 threshold.
- PROTOCOL.md written + committed (b51fa52). LOCKED.

## [18:50] orchestrator | dispatching Agent A
- Mandate: harvest econ + crypto Polymarket markets, fetch CLOB price history, save unified parquet.
- Earnings data NOT re-fetched — reuse prior session's data/research/clob_history/<id>.json + earnings_markets_with_entry.jsonl.

## [14:48] orchestrator | harvest complete
- Agent A stalled on the silent CLOB fetch loop (~7 min of network IO without stdout). Watchdog killed it.
- Replaced with `scripts/research_harvest_finish.py` running in orchestrator (parallel-thread CLOB fetcher with progress prints every 50 markets).
- Result: 1,823 unified markets across earnings (819 carry-forward) / econ (785) / crypto (219). All clear N≥80.
- Outcome split: 951 NO, 872 YES. Crypto skew: more NO than earnings.

## [14:50] orchestrator | dispatching B + C + D in parallel
- B owns strategy implementations inline (decouple from C).
- C: pre-results hypotheses + Kalshi check.
- D: UI category tabs + verdict-banner skeleton.
- Verdict synthesis is orchestrator's after B/C finish.

## [19:00] Agent D | done

**Workstreams completed:**
- D2 (category sub-tabs) — DONE. New `components/CategoryTabs.tsx` + `components/CategoryPlaceholder.tsx`. `app/page.tsx` now reads `?category=earnings|econ|crypto` (default earnings, non-breaking). `/api/signals` accepts `?category=` param: returns the existing future-only earnings snapshot for `earnings`, returns empty signals + `placeholder_message` for `econ`/`crypto`.
- D4 (verdict banner) — DONE. New `lib/verdict.ts` reads `docs/research/VERDICT.md` server-side, parses `Result: A/B/C` marker (case-insensitive, optional bold). Falls back to `pending` if file missing or marker absent. New `components/VerdictBanner.tsx` renders top-of-`/stats` with the spec'd colour map (A=emerald, B=zinc, C=amber, pending=blue).
- D1 (visual matches) — SKIPPED. Both reference images still missing on disk (verified `find ~ -name "reference_polymarket*"`). Note appended to `docs/research/VISUAL_DIFF.md`.

**Build status:** GREEN. `npm run build` produces 18 routes, 0 errors, 0 warnings.

**Screenshots:** `docs/screenshots/2026-05-06T18-59-10-085Z/category-tabs/`
- `home-earnings-1440.png` — sub-tabs visible, signals render (4 signals, edge chart, controls, card grid)
- `home-econ-1440.png` — placeholder card "Econ data — research-only, not yet wired"
- `home-crypto-1440.png` — placeholder card for crypto
- `stats-verdict-1440.png` — blue "Verdict: pending" banner at top of /stats

**HTTP smoke test on localhost:3331:** `/`, `/?category=econ`, `/?category=crypto`, `/stats` all 200. `/api/signals?category=econ` returns structured placeholder JSON.

**Out of scope / left alone:** `lib/types.ts`, `lib/paperEngine.ts`, `app/api/cron/*`, `vercel.json`, all prior-session research artifacts (`STRATEGY_REPORT.md`, `BACKTEST_RESULTS.md`, etc.).

**Nothing blocked.** Verdict banner auto-upgrades from "pending" to A/B/C the moment orchestrator writes `docs/research/VERDICT.md` — no further D-side work needed.

## [15:04] Agent B | done
- **Strategies run:** E4, E6, EC1, EC2, EC3, CR2 (8 of 13 protocol strategies — 4 imported from prior session, EC4/CR1/CR3 skipped data-constrained, strict variant of earnings #5 N<30).
- **Skipped (with reason):**
  - EC4: filter `volume_num < $50k` empty for econ (min econ vol = $99,756). Documented.
  - CR1: 12h CLOB has no bid/ask depth. Unimplementable.
  - CR3: Agent C's `kalshi_paired_markets.jsonl` contains spurious topic-matched pairs (tennis markets paired with Fed-rate Polymarket questions). Unusable.
  - Strict earnings #5: predicate (mkt_p > 0.80 AND model_p < 0.65) yields N≈6 OOS. Below floor.
- **Strategies passing primary threshold:** None. Closest was CR2 (Sharpe +1.57 point, but N=66<80 and lower-CI=−0.42<0.30); EC2 (Sharpe +0.76, but N=66<80 and lower-CI=−1.83).
- **Strategies passing all 3 robustness checks:** None (no strategy was even eligible — primary failed).
- **Headline finding:** EC1 (fade-extremes on econ markets) is decisively falsified — markets >0.90 resolve YES 100% of the time, markets <0.10 resolve NO 99.3%. Lost $106k on N=664. CR2 (far-OTM crypto NO) has the best point-estimate Sharpe of all 13 strategies but cannot pass primary at N=66; promising candidate for re-test in 6-12 months.
- **Verdict implied:** B (all combos with N≥80 fail at least one threshold) with C-flavor for CR1, CR3, EC4 data gaps.
- Files: `BACKTEST_RESULTS.md` (3,649 words), 6 per-bet CSVs in `data/research/`, `agent_b_summary.json`, reproducible driver `scripts/research/run_backtests.py`.

## [15:05] Agent C | done

- **Hypotheses count:** 13 (E1-E6, EC1-EC4, CR1-CR3) in `docs/research/STRATEGY_HYPOTHESES.md`. Word count 5124. Pre-registered blind to results — `BACKTEST_RESULTS.md` and per-strategy CSVs were not opened, and Agent B's results entry above (which appeared after my hypotheses were locked) was not read until after writing was complete.
- **Kalshi pairing status:** PARTIAL — 26 econ pairs (17 CPI, 8 Fed, 1 BTC), 0 crypto pairs. Built via public `api.elections.kalshi.com` events endpoint (no auth needed). Used `series_ticker` queries on `KXFED`, `KXFEDDECISION`, `KXCPI`, `KXBTCD`, `KXETHD` rather than the full `/markets` listing (which is dominated by sports parlays and produced spurious topic-keyword false positives in my first attempt — that earlier version is what Agent B saw and correctly rejected).
- **CR3 data verdict:** Pre-registered as data-constrained for crypto (Polymarket "hit $X by date" doesn't structurally align with Kalshi daily-close). Econ side has 26 pairs but they're heavily *bucket-mismatched* — a Polymarket "rate cut by 25 bps" question matches a Kalshi "rate above 3.50%" market by date+topic, which means cross-venue arb requires bucket-probability translation, not direct price comparison. CR3 should be treated as N<30 effective for direct arb on this dataset.
- **Top hypothesis I most expect to fail:** EC1 (Fade extremes on econ markets near resolution). Rated 3/5, my highest confidence positive. Academic literature on prediction-market overshoots supports it, but the prior session's central lesson — Polymarket prices known signals correctly enough for retail strategies to lose — applies forcefully here too. Econ-trader demographic is plausibly more sophisticated than earnings retail.
- **Honest pre-reg notes that survived to backtest:** EC3 (within-event arb) and CR1 (spread-narrowing scalp) were flagged unimplementable on the available dataset (no linked-event clustering, no bid/ask spread snapshots). EC4 (inactive-market reversion) was flagged for "cheap side" selection bias.
- **Files written:** `docs/research/STRATEGY_HYPOTHESES.md`, `data/research/kalshi_paired_markets.jsonl` (26 lines, JSON-per-line), `scripts/research/agent_c_kalshi_pair.py`.

## [15:08] orchestrator | synthesis complete
- VERDICT.md written: **Result B (no tradeable edge)** with C-flavor on CR1/CR3/EC4 data gaps.
- Two near-miss candidates documented: CR2 (far-OTM crypto NO, Sharpe 1.57 / N=66) and EC2 (econ drift fade, Sharpe 0.76 / N=66).
- Decisive negative: EC1 lost $105,916 on N=664. Polymarket econ pricing is essentially perfectly calibrated.
- 3 charts generated: headline_pnl, category_comparison, robustness_matrix.
- UNBLOCK_NEXT_SESSION.md written. Top-EV next move: Polymarket↔Kalshi semantic matcher for cross-venue arb (~1-day effort).
- D's verdict-banner auto-upgrades from "pending" to "B" once VERDICT.md lands in the deploy bundle.
