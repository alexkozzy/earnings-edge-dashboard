# Verdict v3 — 2026-05-06

**Result on Hypothesis 1 (hedging): B**
**Result on Hypothesis 2 (model variations): B**

## Summary

Two independent tests, both negative. (1) Five hedging variants H1–H4 all RAISED P&L variance vs the no-hedge baseline H5 by 0.7–4.0% — the wrapper-specified hedge convention (long stock when betting YES) is mechanically incapable of reducing variance because PM-YES + long-stock are positively correlated on the same earnings news (overall +0.16 corr; +0.25 to +0.62 in big-N sectors). (2) Five model variants M1–M5 all failed to beat the Polymarket-implied baseline on log loss, AUC, and Brier; the M1 ablation (drop the price feature) collapses AUC to 0.521, proving the v1 model's engineered features carry no signal independent of price.

The most promising follow-up — and the only genuinely new evidence territory v3 surfaced — is the **inverted hedge direction**: short stock when betting PM-YES, long stock when betting PM-NO. This converts the +0.16 correlation into −0.16 and would shave variance by ~5% with negligible cost. Not edge; just Sharpe improvement at known expected-return cost. Out of scope for the locked v3 protocol.

## Evidence — hedging

| Variant | N | Mean P&L | Stdev | Sharpe (95% CI) | Variance vs H5 | Pass primary? |
|---|---:|---:|---:|---|---:|:---:|
| H1 (naive 50%) | 792 | $2.10 | $144.56 | 0.41 [−1.50, +2.38] | **1.040×** | ❌ |
| H2 (per-market optimal) | 792 | $2.10 | $144.56 | 0.41 [−1.50, +2.38] | **1.040×** | ❌ structurally unsatisfiable (max prior count per ticker = 2 in 9-month window; needed ≥4 → fell back to H1) |
| H3 (sector-bucketed) | 792 | $1.58 | $142.25 | 0.31 [−1.67, +2.26] | **1.007×** | ❌ |
| H4 (conditional 50%) | 792 | $1.99 | $143.39 | 0.39 [−1.52, +2.31] | **1.023×** | ❌ |
| H5 (no-hedge baseline) | 792 | $1.42 | $141.76 | 0.28 [−1.70, +2.21] | 1.000× | comparison point |

Primary threshold: variance ratio ≤ 0.70 AND mean within ±20% of H5 AND Sharpe ≥ 1.5× H5 AND N ≥ 100. **0 of 4 variants pass.** All robustness checks fail for all variants (including H5 baseline) — underlying PM-leg P&L is fat-tail-driven.

**Important caveat:** the protocol I (orchestrator) wrote specified "long stock when PM bet is YES." Standard textbook variance-reduction hedging would use the opposite direction (short stock when YES). Agent B caught this and reported faithfully. The verdict is correct on the test as specified; the natural follow-up question (inverted-direction test) is genuinely new evidence territory and is in the next-session queue.

## Evidence — model variations

| Variant | N | Log loss (CI) | AUC (CI) | Brier (CI) | Beats baseline on all 3? |
|---|---:|---|---|---|:---:|
| Implied (baseline) | 443 | **0.487** | **0.772** | **0.158** | — |
| M1 (logistic, no price) | 443 | 0.586 | 0.521 | 0.198 | ❌ collapses to ~random |
| M2 (RandomForest) | 443 | 0.510 | 0.756 | 0.167 | ❌ loses on all three |
| M3 (HGBC) | 443 | 0.598 | 0.689 | 0.187 | ❌ overfits at this N |
| M4 (k-NN) | 443 | 1.093 | 0.663 | 0.195 | ❌ confident-zero predictions explode log loss |
| M5 (3-feature stacked) | 443 | 0.503 | 0.764 | 0.162 | ❌ best variant; loses on all three (margin < 0.02 on log loss) |

**Verdict B.** Five independent angles corroborate v1: Polymarket-implied price encodes the public signal; richer model classes don't extract residual edge; simpler features don't help. The M1 result is the most diagnostic — without the price feature, the model has no signal of its own.

## Cross-session synthesis

| Session | Hypothesis class | Verdict |
|---|---|---|
| v1 | EPS-surprise model edge over Polymarket prices | **B** |
| v1 | Cross-quarter momentum exploitation | **B** (price already discounts the asymmetry) |
| v1 | Sector-correlation portfolio Kelly | **B** (correlation matrix actively hurt) |
| v2 | Cross-venue Polymarket↔Kalshi arb | **incomplete** (Agent A stalled on Kalshi inventory; never reached backtest) |
| v3 | Hedging variance reduction (wrapper-specified direction) | **B** (mechanically inverted; raises variance) |
| v3 | 5 alternative model classes vs implied baseline | **B** (corroborates v1) |

**The accumulating picture:** every empirically-testable hypothesis on Polymarket prediction markets in this project comes back B. Polymarket's late-stage prices on earnings, econ, and crypto categories are essentially well-calibrated. The original "EPS-surprise edge" thesis is decisively dead.

## Open hypotheses

1. **Inverted-direction hedging** (genuine new territory, ~30 min to test)
2. **Cross-venue arb** (still unfalsified — v2 was incomplete, not negative)
3. **Low-liquidity sub-cell edge** (untested — does the calibration story hold at sub-$5K markets?)
4. **Information-speed arb** (would need sub-12h price fidelity)
5. **Liquidity provision / market making** (structurally what Fogglebet does on sports; could absorb the thesis)

## Files

- `docs/research/v3/PROTOCOL_v3.md` — pre-registered, locked
- `docs/research/v3/HEDGING_BACKTEST.md` — Agent B's full hedging report (with caveats on the directional bug)
- `docs/research/v3/MODEL_VARIATIONS.md` — Agent C's full model-variations report
- `docs/research/v3/WHY_NOT_INFINITE.md` — bounded-session reasoning; future Claude sessions inherit
- `docs/research/v3/SESSION_LOG.md` — chronological event log
- `data/research/v3/strategy_pnl_H{1..5}.csv` — per-bet hedge ledgers
- `data/research/v3/hedging_summary.csv` — one row per hedge variant
- `data/research/v3/model_variations_summary.csv` — one row per model variant
- `data/research/v3/calibration_M{1..5}.csv` — per-variant calibration tables
- `data/research/v3/stock_history/<TICKER>.csv` — 416 ticker stock-history files (yfinance, T-60d to T+10d window)
- `scripts/research_v3_{stock_fetch,hedging,model_variations}.py` — reproducible drivers

## Open questions for the user

1. **Test the inverted hedge direction?** Genuine new evidence territory, ~30 min effort. In the next-session queue (will be listed as the highest-EV v4 alternative if you don't go with the multi-cycle low-liquidity scraper).
2. **Resume v2 cross-venue arb with proper Kalshi infrastructure?** Agent A stalled on inventory both attempts; pre-fetching in orchestrator (the same pattern that worked for v3 stock data) would unblock. ~2 hours total.
3. **Soften the user-facing copy on /stats** that frames this as an EPS-edge product. Three sessions of evidence say the framing isn't supported.

(Note: the next-session queue mentioned in the wrapper was not generated because the user immediately followed v3 with a v4 multi-cycle prompt, which is itself the "next session" choice.)
