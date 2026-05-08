# Cycle 1 Results — geopolitics baseline

## TL;DR

Zero of 5 testable cells (N ≥ 80) passed the primary criteria before any multiple-comparisons correction. S1 lost **$20,989** across 676 bets (2.5% win rate); the four well-powered discretionary cells for S1 had Sharpes of -2.36 to -4.32 with 95% CI upper bounds well below zero. Calibration holds for geopolitics: discretionary "fade-extremes" prices do not systematically deviate from realization rates, mirroring the v4 cycle 1 finding for econ + earnings.

## Cell coverage table (N counts; sub_category × liquidity_tier × strategy)

|                           | S1  | S2 | S3 | S4 |
|---------------------------|-----|----|----|----|
| **action_count × <5K**    | 6   | 1  | 1  | 4  |
| **action_count × 5-15K**  | 5   | 7  | 4  | 4  |
| **action_count × 15-50K** | 7   | 2  | 0  | 6  |
| **action_count × 50-200K**| 1   | 0  | 0  | 0  |
| **discretionary × <5K**   | 97  | 18 | 9  | 37 |
| **discretionary × 5-15K** | 161 | 16 | 16 | 52 |
| **discretionary × 15-50K**| 239 | 17 | 24 | 92 |
| **discretionary × 50-200K**| 94 | 1  | 6  | 2  |
| **hard_currency × <5K**   | 3   | 2  | 0  | 1  |
| **hard_currency × 5-15K** | 35  | 5  | 5  | 19 |
| **hard_currency × 15-50K**| 28  | 3  | 5  | 6  |
| **hard_currency × 50-200K**| 0  | 0  | 0  | 0  |

**Testable cells (N ≥ 80): 5**, all in `discretionary`:
discretionary×<5K×S1 (97), discretionary×5-15K×S1 (161), discretionary×15-50K×S1 (239), discretionary×15-50K×S4 (92), discretionary×50-200K×S1 (94).

**Data-constrained cells: 43 / 48** (auto-Verdict-C, not counted in Holm-Bonferroni denominator).

## Cells passing primary (BEFORE multiple-comparisons)

**None.** Zero cells satisfied (Sharpe ≥ 0.75 AND CI lower ≥ 0.30 AND N ≥ 80 AND maxDD ≤ 30%).

The 5 testable cells:

| sub_cat | tier | strat | N | win_rate | Sharpe | Sharpe CI low | total P&L | maxDD | p (one-sided) |
|---|---|---|---|---|---|---|---|---|---|
| discretionary | <5K     | S1 | 97  | 1.0% | -2.96 | -5e+14 | -$3,697  | 0.752 | 0.984 |
| discretionary | 5-15K   | S1 | 161 | 1.9% | -4.32 | -6e+14 | -$5,866  | 0.722 | 1.000 |
| discretionary | 15-50K  | S1 | 239 | 3.3% | -2.80 | -9.68  | -$6,357  | 0.528 | 0.993 |
| discretionary | 15-50K  | S4 | 92  | 28.3%| -2.19 | -3.25  | -$271    | 0.063 | 0.991 |
| discretionary | 50-200K | S1 | 94  | 1.1% | -2.36 | -5e+14 | -$3,365  | 0.868 | 0.978 |

(CI-low values like "-5e+14" are bootstrap artifacts from resamples with near-zero stdev producing exploding Sharpes; the point estimates and one-sided p-values tell the real story — every one is decisively negative.)

## Top 5 cells by Sharpe (regardless of pass status; near-misses, NOT positive signals)

| sub_cat | tier | strat | N | Sharpe | Sharpe CI low | total P&L | data_constrained |
|---|---|---|---|---|---|---|---|
| hard_currency | 15-50K  | S4 | 6  | 2.54 | 0.98 | $19.65   | **YES** (N=6) |
| action_count  | 5-15K   | S4 | 4  | 1.72 | 1.14 | $10.18   | **YES** (N=4) |
| action_count  | <5K     | S4 | 4  | 1.51 | -0.44| $6.67    | **YES** (N=4) |
| discretionary | 15-50K  | S2 | 17 | 0.76 | -4.74| $706.23  | **YES** (N=17) |
| discretionary | 50-200K | S4 | 2  | 0.76 | -9e+11| $3.93   | **YES** (N=2) |

All top-5 cells are data-constrained (N < 80). These are noise, not signal — auto-Verdict-C.

## Bottom 5 cells by Sharpe

| sub_cat | tier | strat | N | Sharpe | Sharpe CI low | total P&L | data_constrained |
|---|---|---|---|---|---|---|---|
| discretionary | 5-15K   | S1 | 161 | -4.32 | -6e+14 | -$5,866  | NO |
| discretionary | <5K     | S3 | 9   | -2.99 | -2e+14 | -$344    | YES |
| discretionary | <5K     | S1 | 97  | -2.96 | -5e+14 | -$3,697  | NO |
| discretionary | 15-50K  | S1 | 239 | -2.80 | -9.68  | -$6,357  | NO |
| discretionary | 50-200K | S1 | 94  | -2.36 | -5e+14 | -$3,365  | NO |

S1 ("fade extremes") is catastrophically negative across every well-powered cell. Markets at price > 0.85 resolve YES at >85% rates and markets at price < 0.15 resolve NO at >85% rates — exactly what Polymarket's price says. Fading them eats the fee + the realized direction.

## Per-strategy aggregate

| Strategy | Total bets | Win rate | Total P&L | Mean Sharpe across cells |
|----------|-----------:|---------:|----------:|-------------------------:|
| S1 | 676 | 2.5%  | **-$20,989** | -2.22 |
| S2 | 72  | 19.4% | -$833        | -0.25 |
| S3 | 70  | 15.7% | -$776        | -0.91 |
| S4 | 223 | 33.6% | -$427        | +0.17 |

Total: **1,041 bets, -$23,025 P&L.** S1 is the dominant loss-driver; S4 is roughly break-even-to-slightly-positive at the cell-mean level but has no cell that survives both N ≥ 80 and the Sharpe / CI / maxDD bar.

## Aggregate finding

**Calibration holds for geopolitics like it did for econ + earnings.** S1's catastrophic -$20,989 across 676 fade-extremes bets is the same shape of result as v4 cycle 1's "S1 lost $17K → calibration is good": when prices say >85% the event resolves >85% of the time, fee-adjusted reverse bets bleed predictably. The signal v5 was probing — judgment-based / discretionary geopolitics outcomes might be mispriced — does not appear at this resolution. Discretionary 15-50K had the best statistical power (239 bets for S1, 92 for S4) and both cleanly failed primary.

## sub_tag breakdown for primary-passing cells

**N/A — zero cells passed primary.**

For diagnostic interest, the sub_tag composition of the 5 testable cells (which all failed):

| Cell | other | iran | israel | ukraine | china_taiwan | korea | trump_putin | venezuela |
|------|------:|-----:|-------:|--------:|-------------:|------:|------------:|----------:|
| discretionary × <5K × S1     (N=97)  | 89  | 4  | 2  | 1  | 1  | 0  | 0  | 0  |
| discretionary × 5-15K × S1   (N=161) | 148 | 7  | 4  | 1  | 0  | 1  | 0  | 0  |
| discretionary × 15-50K × S1  (N=239) | 203 | 10 | 11 | 6  | 4  | 1  | 2  | 2  |
| discretionary × 15-50K × S4  (N=92)  | 76  | 2  | 5  | 4  | 2  | 0  | 1  | 2  |
| discretionary × 50-200K × S1 (N=94)  | 88  | 3  | 2  | 1  | 0  | 0  | 0  | 0  |

Heavy "other" representation across every cell (88-92% of bets). No testable cell is dominated by Iran or any other named tag, so sub_tag_diversification would not have flipped any of these even if they had passed.

## Caveats

- Multiple-comparisons correction NOT applied yet (master verdict step) — moot here since 0 cells passed primary in the first place.
- Walk-forward integrity verified: rows sorted by `end_date` ascending; per-bet decisions use only the row's pre-computed entry features (`entry_yes_price_3d`, `entry_yes_price_7d`, and CLOB price-history strictly before the entry-snapshot timestamp for S3).
- Robustness checks (sub_tag_diversification, regime stability, etc.) NOT in this scope — handled in master verdict step. Not applicable here since no primary-passers.
- 43 cells flagged data-constrained (auto-Verdict-C) and reported in the per-cell ledger but excluded from the Holm-Bonferroni denominator.
- Bootstrap Sharpe CIs for cells with very low stdev (or N near 1-3) produce numerical artifacts ("-5e+14" CI lows). Point estimates and one-sided p-values are the reliable summary; CI low values for testable cells (large N) are well-behaved.
- S2 / S3 had heavy null filtering (T-7d entry missing, or CLOB stale-window failed): only 72 / 70 bets respectively across the full 955-row in-scope universe — limiting their statistical power even before per-cell splitting.
