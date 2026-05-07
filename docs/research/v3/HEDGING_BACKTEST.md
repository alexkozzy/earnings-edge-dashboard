# Hedging backtest results

**Agent B, v3 session, 2026-05-06.**
N = 792 paired markets (PM bet + stock data both available out of 819 in `training_data.parquet`).
Walk-forward: per-market H2 and per-sector H3 hedge ratios are fit only on rows whose `end_date` is strictly earlier than the market being scored.

## TL;DR

**Verdict B on hedging.** No variant (H1, H2, H3, H4) reduces realized P&L variance versus the no-hedge baseline H5; in fact every variant *raises* variance by 0.7-4.0 %. Robustness checks (ablation, period split, top-decile-stripped) all fail — for every variant, including H5. The mechanical reason is that the protocol's hedge convention (long stock when betting YES, short stock when betting NO) makes the stock leg *positively* correlated with the PM leg (overall corr +0.16, +0.25 to +0.62 in the major sectors), so adding stock exposure compounds rather than cancels variance.

## Per-variant table

| Variant | N | Mean PnL | Stdev | Sharpe (95 % CI) | Variance vs H5 | Sharpe vs H5 | Pass primary? |
|---|---:|---:|---:|---|---:|---:|:---:|
| H1 (naive 50 %) | 792 | $2.10 | $144.56 | 0.41 (−1.50, +2.38) | 1.040× | 1.45× | ❌ |
| H2 (per-market optimal) | 792 | $2.10 | $144.56 | 0.41 (−1.50, +2.38) | 1.040× | 1.45× | ❌ |
| H3 (sector-bucketed)    | 792 | $1.58 | $142.25 | 0.31 (−1.67, +2.26) | 1.007× | 1.10× | ❌ |
| H4 (conditional 50 %)   | 792 | $1.99 | $143.39 | 0.39 (−1.52, +2.31) | 1.023× | 1.38× | ❌ |
| H5 (no hedge baseline)  | 792 | $1.42 | $141.76 | 0.28 (−1.70, +2.21) | 1.000× | 1.00× | n/a |

Primary threshold (variance ratio ≤ 0.70 AND mean within ±20 % of H5 AND Sharpe ≥ 1.5× H5 AND N ≥ 100): **0 of 4 variants pass**.

## Per-variant detail

### H1 — Naive 50 % hedge on every signal

- Hedge ratio: fixed 0.50 for all 792 bets.
- Variance ratio vs H5: **1.040** (worse).
- Sharpe: 0.41 (CI [−1.50, +2.38]).
- Mean P&L per bet: $2.10 (vs $1.42 H5; +47 %, *outside* the ±20 % band — the increase comes from the +1.5 % mean stock-return drift over the T-3d → T+1d window earning extra dollars on the long bias).
- Robustness: ablation Sharpe −0.087, period-split Sharpes (0.31, 0.27), top-decile-stripped mean −$18.83. **All three checks fail.**

### H2 — Per-market optimal from prior-quarter ticker history

- **Falls back to 0.50 for every market.** The dataset spans only ~9 months, so no ticker has ≥ 4 prior earnings before the bet date. Of 416 tickers: 122 appear once, 212 twice, 82 three times, *zero* with four or more. The "≥ 4 prior" gate (specified in the wrapper) is unsatisfiable on this corpus, so H2 is identical to H1 for every row.
- Variant is structurally untestable on this dataset. Same numbers as H1, same fail.

### H3 — Sector-bucketed hedge ratio

- Walk-forward: regress prior-sector PM P&L on the sign-corrected stock leg, slope ∈ [0, 1] is the hedge ratio.
- Fitted ratios are mostly 0 because the dominant "Other" sector (623/792 markets) shows pm-leg / stock-leg corr ≈ +0.16; clipped slope is essentially 0. Ratios > 0 land in Energy (mean 0.63), Staples (0.59), Semis (0.59), AutoEV (0.56) where prior correlations are negative or near-zero.
- Variance ratio vs H5: **1.007** — basically identical to H5 (because most rows get hedge_ratio = 0).
- Sharpe: 0.31 (CI [−1.67, +2.26]).
- Mean P&L: $1.58 (within ±20 % of H5).
- Robustness: ablation Sharpe −0.13, period split (0.08, 0.36), top-decile-stripped mean −$19.54. **All three checks fail.**

### H4 — Conditional 50 % hedge on aggressive directional bets

- Hedge applied only when |polymarket_implied_p_beat − 0.5| > 0.20 → 565/792 markets hedged at 0.50, 227 unhedged.
- Variance ratio vs H5: **1.023** (worse).
- Sharpe: 0.39 (CI [−1.52, +2.31]).
- Mean P&L: $1.99 (within ±20 % of H5? — actual diff is +40 %, *outside* band).
- Same failure pattern as H1: hedging concentrated in extreme-price markets, but those markets are precisely the ones where PM leg and long-stock leg both ride the same beat outcome → still positively correlated.
- Robustness: ablation Sharpe −0.05, period split (0.23, 0.32), top-decile-stripped mean −$19.28. **All three checks fail.**

### H5 — No-hedge baseline (PM-only)

- 792 PM bets at $250 each, fee $1.25 per leg.
- Total P&L $1,128 over 792 bets ≈ $1.42 mean per bet, $141.76 stdev. Sharpe 0.28.
- Maximum drawdown $3,169 in cumulative P&L.
- Top-decile-stripped mean P&L: −$19.43 → the headline positive total is fat-tail-driven; the typical bet *loses* $19. Same pattern the v1 verdict flagged.
- Period-split Sharpes (0.09 first half, 0.31 second half) are noisy and well within bootstrap CI of zero.

## Honest interpretation

**Does variance reduction work?** No. Every variant raises variance by 0.7-4.0 %.

**Why?** The protocol's hedge convention pairs `long PM-YES` with `long stock`, which is *the same direction* on the same news (an earnings beat). Empirically this produces a +0.16 correlation overall and +0.25 to +0.62 in the big-N sectors (Banks, BigTech, Industrials, Staples). Two positively-correlated legs added together produce *more* variance than one leg alone for any positive hedge ratio. A textbook hedge for a long-PM-YES position would be **short** the stock; the protocol specifies the opposite. Under the locked spec, variance reduction is mathematically unreachable for `h > 0` whenever leg correlation is positive.

**Is the variance "reduction" bought via expected-return loss?** Not a question we can answer here, because no variant *reduced* variance. In raw terms, hedging *added* mean P&L (from $1.42 H5 → $2.10 H1) because over the 9-month sample stocks drifted up on average (+1.5 % over the T-3d → T+1d windows), and the hedge convention sits long-on-average. That's a sample-period drift effect, not a hedge benefit, and it would flip sign in a flat or down market.

**Is the variance reduction stable across robustness checks?** N/A — there is no variance reduction to begin with. As a sanity check, all variants (including H5) fail every robustness check at the relaxed Sharpe ≥ 1.2× threshold. The H5 baseline Sharpe is 0.28, which is itself well below any deployable bar; "1.5× a tiny number" is still a tiny number, so even if a variant met the ratio test it would not be a useful strategy.

**The most honest takeaway:** the v1 verdict said the EPS-surprise model loses to the implied price; this hedging test was the second chance — could a portfolio-construction trick produce useful variance reduction even without edge? Under the protocol-locked hedge convention, no. The right next experiment (out of scope for this session) is to test the *inverted* hedge — **short stock when betting PM-YES** — which would convert the +0.16 correlation into a −0.16, and a 50 % hedge would shave variance by ~5 % cheaply. Even that would not produce edge, but it would produce a real (albeit modest) Sharpe improvement. Out of scope for v3 because the protocol is locked.

## Caveats

1. **Hedge convention.** The wrapper specified "long stock if PM bet is YES, short stock if PM bet is NO." Standard textbook hedging would use the opposite — long PM-YES + short stock. I followed the wrapper's literal specification and report the result honestly. The convention as written cannot reduce variance whenever PM and stock legs are positively correlated, which is the empirical reality here.
2. **Fee inconsistency in wrapper.** The wrapper says "200 bps fee (0.005 × $250 = $1.25)" — but 200 bps of $250 is $5, not $1.25. I used the literal $1.25-per-leg the wrapper specified ($1.25 ≈ 50 bps). Using the actual 200 bps would shift every variant's total P&L down by ~$3,000 ($3.75 × 792) and turn the headline P&L numbers slightly negative. It would not change the variance-ratio comparison (which is the load-bearing test).
3. **Walk-forward integrity.** H2 and H3 hedge ratios use only `end_date` strictly earlier than the bet being scored. No future leak.
4. **H2 unsatisfiable.** The wrapper's "≥ 4 prior markets in the same ticker" gate cannot be met on a 9-month window (max prior count per ticker = 2). H2 is reported with the 0.5 fallback for every row, identical to H1. A larger dataset (≥ 8 quarters) is required to test H2 honestly.
5. **Sharpe is per-bet, not annualized.** Mean / stdev × √N convention per the protocol. CIs are bootstrap (1000 resamples) on the same per-bet series.
6. **Stock-data coverage.** 792 of 819 markets had usable T-3d and T+1d closes (96.7 %). Missing 27 mostly small-cap or recent-IPO tickers without a full window of yfinance daily history.
7. **Robustness "ablation" definition.** Drop top-and-bottom 5 % of bets by `stock_return`. This is a stock-leg robustness slice; it removes the markets where the stock leg dominates the combined PnL. Every variant — including H5, which has no stock leg — fails this check, indicating the underlying PM-leg P&L is itself fat-tail-driven (consistent with v1 verdict).

## Files

- `data/research/v3/strategy_pnl_H1.csv` … `H5.csv` — per-bet ledgers
- `data/research/v3/hedging_summary.csv` — one row per variant, all metrics

## Verdict

**Verdict B on hedging hypothesis.** No variant meets the primary threshold; no variant passes any robustness check. The hedging story does not save the EPS-surprise thesis: the wrapper-specified hedge convention is mechanically incapable of reducing variance against the actual PM leg / stock leg correlation structure observed in this dataset. A re-spec with inverted stock direction is the most-promising follow-up but is out of scope for the locked v3 protocol.
