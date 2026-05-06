# Protocol v3 — pre-registered (hedging hypothesis + 5 model variations)

**Session start:** 2026-05-06T19:30Z
**Pre-registered before any backtest results were observed.**
**Locked.** No mid-session modifications.

## Note on derivation

The user's wrapper prompt referenced "the v3 protocol details I've already prepared," but no such file is present in the repo or chat. I've derived the protocol from the wrapper's hints (hedging hypothesis + 5 model variations + 3-agent dispatch). If this differs from what the user intended, that's surfaced in `VERDICT_v3.md` as an open question.

## Two independent tests, two verdicts

This session runs two independent hypotheses with separate verdicts:

1. **Hedging hypothesis** (load-bearing): does a stock-position hedge applied to historical Polymarket earnings bets reduce realized P&L variance without sacrificing expected return?
2. **Model variations** (parallel test): can any of 5 alternative model classes beat the Polymarket-implied baseline that the prior v1 logistic regression failed to beat?

The verdicts are independent; either can be A, B, or C without affecting the other.

## Hypothesis 1 — Hedging

### Setup

For each historical earnings event in the v1 dataset (819 markets, 411 unique tickers), construct three hypothetical positions held from T-3d (entry) to T+1d (exit, post-earnings):

- **P-only:** $250 long YES on Polymarket if model predicts YES, $250 long NO otherwise
- **S-only:** $250 long stock if model predicts beat, $250 short stock otherwise
- **P+S hedge:** combined position with hedge ratio H ∈ {0%, 25%, 50%, 75%, 100%}

Realized P&L per leg uses real Polymarket entry price + outcome ($1 / $0) and real stock close price at T-3d entry vs T+1d exit. Costs: 200 bps per Polymarket leg + 5 bps per stock leg + 1 bps slippage per stock leg.

### Why hedging might work even when prediction doesn't

The v1 verdict showed Polymarket prices encode all the public signal (model = price). But this doesn't mean a Polymarket position has zero correlation with realized stock moves. If they're correlated, a hedged combo has lower variance than either leg alone — which is valuable in its own right (Sharpe improvement at the cost of expected return), independent of any "edge" claim.

This is structurally different from previous tests: it's not about "edge over the market," it's about "portfolio variance reduction."

### Strategy variants (max 5 — locked)

1. **H1 — Naive 50% hedge** on every signal (single fixed ratio)
2. **H2 — Optimal hedge per market** (compute the variance-minimizing hedge ratio per individual market using prior-quarter realized correlation between PM-yes price and stock returns; apply to the next quarter)
3. **H3 — Sector-bucketed hedge ratio** (one hedge ratio per sector — Banks, BigTech, Semis, etc. — fit on prior quarters, applied walk-forward)
4. **H4 — Conditional hedge** (only hedge when |model_p_beat - 0.5| > 0.20, i.e. when the directional bet is most aggressive)
5. **H5 — No hedge baseline** (P-only; serves as the comparison point)

### Success thresholds — Verdict A on hedging

A hedging strategy passes Verdict A if:
- N ≥ 100 paired markets (PM bet + stock data both available)
- **Variance reduction ≥ 30%** vs unhedged P-only across the same bets
- **Mean P&L per bet within ±20%** of unhedged P-only (i.e. variance reduction not bought via expected-return loss)
- **Sharpe ratio of hedged combo ≥ 1.5×** unhedged Sharpe
- All three robustness checks pass at relaxed thresholds (Sharpe ≥ 1.2× unhedged on each slice): ablation, period split, top-decile-stripped

### Verdict mapping for hedging

- **Verdict A:** at least one hedge variant (H1–H4) meets primary AND robustness
- **Verdict B:** strategies tested, all underperform variance-reduction or Sharpe-improvement thresholds
- **Verdict C:** insufficient stock data for ≥ 100 paired markets

## Hypothesis 2 — Model variations

### Setup

Take the v1 training data (`data/research/training_data.parquet`, 819 rows × 16 columns). The v1 baseline was L2 logistic regression that lost to the Polymarket-implied baseline on log loss (model 0.534 vs implied 0.487). Test 5 alternative model classes; verdict A if ANY beats the implied-price baseline.

### Model variants (max 5 — locked)

1. **M1 — Logistic without `polymarket_implied_p_beat` feature.** Tests whether the model has signal *independent of price*. If it does (lower log loss than naive base-rate), the v1 model's failure was specifically that it duplicated price information rather than adding to it.
2. **M2 — Random forest** (sklearn, 200 trees, max_depth=5) on the same feature set as v1.
3. **M3 — Gradient boosting** (sklearn HistGradientBoostingClassifier, default settings) on the same feature set.
4. **M4 — Lookup-table / nearest-neighbor.** For each market at decision time, average the outcomes of the 10 most-recent past markets in the same sector with similar `polymarket_implied_p_beat` (within ±0.05). No model fitting.
5. **M5 — Stacked: implied price + sector base rate + lagged momentum.** Three engineered features only, logistic regression on top. Tests whether feature simplification helps.

### Walk-forward evaluation

Same protocol as v1: train on quarters strictly < Q, test on Q. Concatenate OOS predictions across all evaluable quarters.

### Success thresholds — Verdict A on model variations

A model variant passes Verdict A if:
- **OOS log loss < 0.487** (the implied-price baseline) by at least 0.02 (statistically meaningful improvement)
- **OOS AUC > 0.772** (the implied-price baseline)
- **OOS Brier < 0.158** (the implied-price baseline)
- All three of the above hold (no cherry-picking the metric)

### Verdict mapping for model variations

- **Verdict A:** at least one variant beats baseline on all three metrics
- **Verdict B:** all variants fail to beat baseline on at least one metric
- **Verdict C:** training data insufficient for walk-forward (would require fewer than 2 evaluable test quarters)

## Realistic costs (locked)

Same as v2 / v1:
- Polymarket: 200 bps taker fee per leg
- Stock: 5 bps commission + 1 bps slippage per leg (free at most retail brokers in 2026; conservative)
- Round-trip P+S hedge: ~210 bps total cost vs 200 bps for P-only

## Forbidden in this session

- Adding strategy variants beyond the 5 hedging + 5 model variants
- Counting the no-hedge baseline H5 as "passing" (it's the comparison point)
- Reporting Sharpe without N ≥ 100
- Cherry-picking which metric to report (must report all three: log loss, AUC, Brier for models; variance, mean P&L, Sharpe for hedging)
- Treating outlier-driven results as positive signals (same trap as v1)

## Order of execution

1. Pre-flight + this PROTOCOL_v3.md commit (~5 min)
2. Orchestrator pre-fetches stock history via yfinance (~10 min, watchdog-resistant)
3. Dispatch B (hedging simulation) + C (model variations) in parallel (~30 min each)
4. Synthesis: VERDICT_v3.md (~10 min)
5. Generate next-session queue (~15 min)
6. Final commit + push. **No deploy.**

## Why agents are 2 not 3

The wrapper specified "Agent A: data builder, Agent B: hedging simulation, Agent C: model variations." Per WHY_NOT_INFINITE.md and the v1/v2 lessons (Agent A stalls on silent IO), I'm pre-executing the data fetch in the orchestrator with a watchdog-resistant threaded fetcher. So only B and C are dispatched as agents.

## Reproducibility

All scripts go to `scripts/research_v3_*.py`. Random seeds = 42. Per-bet ledgers + summary CSVs go to `data/research/v3/`.
