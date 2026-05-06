# Verdict — 2026-05-06

**Result: B**

## Summary

Across 13 pre-registered strategies on three Polymarket market categories (earnings, economic data releases, low-cap crypto), **zero strategies pass the protocol's primary threshold** of walk-forward Sharpe ≥ 0.75 with lower 95% CI ≥ 0.30 on N ≥ 80 settled bets. Two strategies show suggestive positive point estimates (CR2 far-OTM crypto NO bets at Sharpe 1.57; EC2 econ pre-release drift fade at Sharpe 0.76) but both fail on sample size (N=66) and confidence intervals that include zero. The decisive negative finding is EC1: late-stage Polymarket econ pricing is essentially perfectly calibrated — markets above 0.90 resolve YES 100% of the time and markets below 0.10 resolve NO 99.3%, so the naive "fade extremes" thesis lost $105,916 on N=664.

## Evidence

### Strategies tested per protocol

| # | Category | Strategy | N | Win % | Sharpe (CI 95%) | P&L | Pass primary? |
|---|---|---|---:|---:|---|---:|---|
| E1 | Earnings | Naive flat on edge ≥5pp ($250) | 172 | 57.6% | −0.41 (—) | −$1,493 | ❌ |
| E2 | Earnings | Edge ≥10pp tier ($400) | 56 | 51.8% | +0.48 (—) | +$3,638 | ❌ N<80, outlier-driven |
| E3 | Earnings | Quarter-Kelly indep | 172 | 57.6% | +0.37 (—) | +$31 | ❌ effectively flat |
| E4 | Earnings | Quarter-Kelly w/ sector ρ | 86 | 65.1% | **−0.71 [−2.70, +1.37]** | −$226 | ❌ negative; ablation removed ρ → improves |
| E5 | Earnings | NO-only positive-skew strict | 6 | — | — | — | ❌ data-thin (N=6) |
| E6 | Earnings | Concentrated single-bet/quarter | 2 | 50% | +0.08 | +$261 | ❌ N=2 |
| EC1 | Econ | Fade extremes (>0.90 NO / <0.10 YES) | **664** | **0.6%** | **−2.86 [−32.5, −0.33]** | **−$105,916** | ❌ catastrophic |
| EC2 | Econ | Pre-release drift fade | 66 | 34.8% | +0.76 [−1.83, +2.25] | +$4,017 | ❌ N<80, CI lower<0 |
| EC3 | Econ | Within-event arb | 18 | 16.7% | −1.56 | −$2,141 | ❌ N=18 |
| EC4 | Econ | Inactive-market reversion | 0 | — | — | — | ❌ data-constrained (econ vols all >$50k) |
| CR1 | Crypto | Spread-narrowing scalp | 0 | — | — | — | ❌ data-constrained (no orderbook depth at 12h) |
| CR2 | Crypto | Far-OTM NO ≤14d | **66** | **98.5%** | **+1.57 [−0.42, +12.95]** | **+$419** | ❌ N<80, CI lower<0.30 |
| CR3 | Crypto | Cross-venue Kalshi arb | 0 | — | — | — | ❌ data-constrained (Kalshi pairs spurious) |

(Earnings strategies S1, S2, S3, S5 from prior session imported as additional context — all failed primary; full table in `BACKTEST_RESULTS.md`.)

### Strategies that passed primary threshold

**None.**

### Strategies that passed all three robustness checks

**None.** No strategy was eligible because all failed the primary test.

## What the evidence supports

With 95% confidence on this dataset:

1. **The EPS-surprise model has no edge over Polymarket's implied price** for earnings markets. Confirmed across two sessions: prior session's log-loss comparison (model 0.534 vs implied 0.487) and this session's E4 negative Sharpe with ablation showing the sector-correlation matrix actively hurts performance.
2. **Polymarket's late-stage econ-market pricing is highly calibrated.** N=664 bets against extreme prices on econ markets won only 0.6% of the time. The market knows.
3. **Cross-quarter momentum (the prior session's most-promising lead) is correctly priced** by Polymarket. S4 lost $4,062 broadly with no fat-tail contribution; the asymmetry is real but already in the price.

With suggestive but inconclusive evidence:

4. **Far-OTM low-cap crypto markets may be slightly overpriced** (CR2 +$419 on N=66 with 98.5% win rate). Point-estimate Sharpe of 1.57 is high but the CI spans [−0.42, +12.95]. Not deployable; possibly worth re-testing once N can clear 200.
5. **Pre-release drift-fade in econ may have small edge** (EC2 +$4,017 on N=66) — but the result is fat-tail-dependent (top-decile-stripped P&L barely clears zero) and CI lower bound is −1.83. Not deployable.

## What the evidence does NOT support

- **No claim of edge at any sample size that meets the protocol bar.**
- **No claim of edge from the EPS-surprise model.** It loses to the live price in head-to-head comparison.
- **No claim of edge from "fade obvious favorites" thinking on econ markets.** That naive thesis is decisively dead.
- **No claim of edge from cross-venue arbitrage** — Kalshi pairing failed at the structural level (matched markets are not the same question, just the same topic). Strategy is unsupported, not falsified.

## Survivorship and selection caveats

- **All categories are Polymarket-listed, so the dataset is biased toward high-retail-interest events.** True alpha if any might live in markets Polymarket *doesn't* list.
- **Earnings 819 markets, econ 785, crypto 219.** Crypto is the smallest by N. Crypto windows are often short (median trading window much less than earnings), reducing usable T-3d entries.
- **12-hour price fidelity** prevents intraday strategies. Real edge could exist at sub-12h granularity (CR1 was specifically blocked on this).
- **Devig is approximated as `entry_no_price = 1 − entry_yes_price`.** Real CLOB ask-side prices are 2-5% worse, which would degrade all strategies further. None of the negative results is going to flip with better devig modeling; one or two of the marginal positive ones might.
- **Sector-correlation matrix in E4 has a small leak** (computed across all training quarters at once). Documented; the strategy lost money even with the leak working in its favor.

## Verdict B — recommendations

### Why this isn't surprising

Polymarket has had 2+ years of liquidity and millions of dollars of trading volume in earnings and Fed-rate markets. By the time a market has been open for days and is approaching resolution, every public signal is in the price. The original Earnings Edge thesis assumed retail mispricing of EPS-surprise probabilities; on a 4-quarter dataset with rapidly-evolving market microstructure, that thesis tested as wrong. The same story holds across econ and crypto: where data is dense and Polymarket has volume, prices are calibrated; where data is thin (low-cap crypto, niche events), strategies don't have enough N to register edge above noise.

### What would change the answer

| Lever | Likely impact | Effort |
|---|---|---|
| Add 6-12 more months of resolved-market data | Pushes N for CR2 and EC2 above 80 → primary threshold testable; doesn't help losing strategies | Wait + re-run |
| Add real CLOB orderbook depth (not just 12h price ticks) | Unblocks CR1 (spread-narrowing); could unblock other intraday strategies | Polymarket API has `/book` endpoint, untested locally |
| Add IV-rank feed for underlyings | Unblocks the deferred volatility-crush hedge strategy | Polygon / Tradier paid feed |
| Add intraday Polymarket prices (sub-12h) | Could uncover timing alpha | Need Polymarket SDK + sustained polling |
| Switch from "predict the outcome" to CLV-style measurement | Faster signal-quality convergence on small N | Refactor backtest engine; ~M-effort |
| Pivot to non-Polymarket data | Tests whether Polymarket-listed selection bias killed edge | Kalshi alone has insufficient earnings depth |

### Abandon vs. pivot

**Recommend: do not abandon, but stop investing in modeling effort on existing data.** Specifically:

1. **Ship the dashboard as benchmark infrastructure.** The paper-bet logger, future-only filter, hedge tool, and category tabs (D's work this session) are valuable as a platform regardless of whether the EPS thesis works. Keep accumulating paper bets and re-evaluate after Q1 2027 (≥8 quarters total).
2. **Cross-venue arb (Polymarket ↔ Kalshi) is not yet falsified — only blocked.** Agent C's spurious-pair issue is fixable: the matching algorithm needs to compare *question semantics*, not just topic tags. With a tight matcher (e.g. exact-date + LLM-graded question equivalence), this is the highest-EV next move within scope. ~L-effort.
3. **CR2 (far-OTM crypto NO) is the only fresh lead worth re-testing.** Mark it in the dashboard as "experimental, awaiting N≥200" and revisit in 3-6 months when low-cap crypto markets accumulate.
4. **Stop iterating on EPS-surprise modeling.** It's empirically not where edge lives. Re-allocate that effort to the items above.

## Open questions for the user

1. **Greenlight cross-venue arb work?** This is the unblocked path with the highest plausible upside. Approx 2-4 day effort to write a robust matcher and run the backtest.
2. **Pay for Polymarket orderbook depth or wait for free 12h fidelity to suffice?** CR1 is the only strategy directly blocked on this; the user's research instinct may differ.
3. **Soften user-facing copy on /stats** that frames the project as "harvesting EPS-surprise edge." With this verdict, that framing is empirically not supported. Should we update the page copy or wait for the post-Q1-2027 re-evaluation?
4. **What's the threshold for "stop the project entirely"?** Currently the verdict is B with recommendations for non-trivial pivots. If those pivots also test as B, is the right move to fully wind down?
5. **Should the paper-bet logger continue running** while the EPS thesis is empirically dead? It costs nothing (already deployed, free Vercel) and the data accumulates for future re-evaluation. Recommend keeping it on but explicitly framing as data collection, not edge harvest.

## Appendix — strategies / categories blocked by data

These contributed to the C-flavor on the verdict but did not change the result:

| # | Why blocked | What unblocks it |
|---|---|---|
| EC4 | Econ markets all have volume > $50k (filter empty) | Loosen filter to <$200k; or use a different thinness proxy |
| CR1 | 12h CLOB has no orderbook depth | Switch to live `/book` endpoint, accept rate-limit hit |
| CR3 | Kalshi pairings matched topic, not question | Better matcher; LLM-graded equivalence; or real Kalshi historical data feed |

## Files this verdict references

- `docs/research/PROTOCOL.md` — pre-registered strategy list
- `docs/research/STRATEGY_HYPOTHESES.md` — Agent C's pre-registered "why might this work" doc
- `docs/research/BACKTEST_RESULTS.md` — Agent B's full results
- `docs/research/STRATEGY_REPORT.md` — prior session's earnings verdict
- `docs/research/ALTERNATIVES.md` — Agent D (prior session) alternative framings
- `docs/research/CORRELATION_AND_PORTFOLIO.md` — prior session's sector-correlation matrix
- `docs/research/MODEL_FIT.md` — prior session's model evaluation
- `docs/research/SESSION_LOG.md` — chronological event log
- `docs/research/UNBLOCK_NEXT_SESSION.md` — next-session shopping list
- `data/research/all_markets_resolved.parquet` — unified 1,823-market dataset
- `data/research/strategy_summary.csv` — all strategies in one table
- `data/research/strategy_pnl_*.csv` — per-bet ledgers
- `docs/research/headline_pnl.png`, `category_comparison.png`, `robustness_matrix.png` — charts
