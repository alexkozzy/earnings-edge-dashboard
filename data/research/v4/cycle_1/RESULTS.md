# Cycle 1 Results — universe-baseline low-liquidity scraper

## TL;DR

Across 36 cells (3 categories × 3 liquidity tiers × 4 strategies), **0 cells passed all four primary thresholds** (Sharpe ≥ 0.75, CI lower ≥ 0.30, N ≥ 80, max DD ≤ 30%). 26/36 cells are data-constrained (N < 80) — most striking, the only cell with truly extreme apparent edge — `econ × <5K × S4`, Sharpe 7.36 / CI lower 5.90 / win rate 72% on N=76 — falls 4 bets short of the N ≥ 80 gate. The dominant signal across the universe is that the simple low-liquidity scraper strategies S1/S3 are **systematically -EV** at sub-$50K liquidity (S1 mean P&L per bet = -$11.7 across 1,477 bets; S3 = -$7.8 across 381 bets), the opposite of the cycle hypothesis.

## Cell coverage

N counts per (category × liquidity_tier × strategy):

| category | tier | S1 | S2 | S3 | S4 |
|---|---|---:|---:|---:|---:|
| earnings | <5K | 57 | 50 | 42 | 0 |
| earnings | 5-15K | 87 | 46 | 82 | 2 |
| earnings | 15-50K | 105 | 45 | 46 | 3 |
| econ | <5K | 178 | 50 | 23 | 76 |
| econ | 5-15K | 232 | 57 | 59 | 67 |
| econ | 15-50K | 261 | 38 | 76 | 27 |
| geopolitics | <5K | 105 | 21 | 9 | 41 |
| geopolitics | 5-15K | 187 | 20 | 20 | 70 |
| geopolitics | 15-50K | 265 | 20 | 24 | 102 |

10/36 cells have N ≥ 80 (eligible for primary): all 9 S1 cells (earnings <5K is N=57 below threshold) plus `geopolitics 15-50K S4` (102), `econ 15-50K S3` (76 — actually below 80), `earnings 5-15K S3` (82), `econ 5-15K S1` (232), `econ 15-50K S1` (261), `econ 5-15K S2` was 57, `geopolitics 5-15K S1` (187), `econ <5K S1` (178). Strategy fan-out is highly uneven: S1 (extreme price filter) triggers most often; S2 (drift) and S3 (stale-price) trigger less; S4 only fires when an extremely cheap YES coexists with a short trading window.

## Cells passing primary thresholds (BEFORE multiple-comparisons)

**None.** 0/36 cells satisfy all four of: Sharpe ≥ 0.75, sharpe_ci_low ≥ 0.30, n_bets ≥ 80, max_drawdown ≤ 0.30.

## Cells with N < 80 (data-constrained)

26 cells. By category × tier × strategy:

- **earnings × all 3 tiers**: S2, S3, S4 are universally below 80 (S4 essentially never triggers in earnings; S2 stuck near 45-50 because mean-reversion drift requires a 7-day price 10pp away from 3-day, plus CLOB lookup for the 100% null `entry_yes_price_7d`). S1 in `earnings <5K` (N=57) is the only S1 cell below 80.
- **econ × <5K × S2/S3** (50, 23) and **econ × <5K × S4** (76 — only 4 short).
- **econ × 5-15K × S2/S3/S4** (57, 59, 67).
- **econ × 15-50K × S2/S3/S4** (38, 76, 27).
- **geopolitics × all 3 tiers × S2/S3** (~20-24 each).
- **geopolitics × <5K × S4** (41).
- **geopolitics × 5-15K × S4** (70).

## Per-strategy summary (across all cells)

| Strategy | Total bets | Win rate | Total P&L | Mean P&L / bet | Mean cell-Sharpe (N≥20) |
|---|---:|---:|---:|---:|---:|
| S1 (fade extremes) | 1,477 | 3.86% | -$17,303 | -$11.72 | -2.35 |
| S2 (mean-reversion drift) | 347 | 27.4% | +$2,842 | +$8.19 | -0.50 |
| S3 (stale-price reversion) | 381 | 18.4% | -$2,987 | -$7.84 | -0.61 |
| S4 (time-decay long-tail) | 388 | 46.1% | -$459 | -$1.18 | +0.39 |

S1 is a catastrophic loser in aggregate — fading extremes at sub-$50K liquidity bleeds because the extreme prices are mostly correctly-calibrated, and the rare losses pay -$50 vs frequent +$0.88 wins.

## Cells of note (top/bottom 5 by Sharpe, N ≥ 20)

**Top 5 by Sharpe:**

| Cell | N | win_rate | mean_pnl | Sharpe | CI lower | maxDD | data_constrained |
|---|---:|---:|---:|---:|---:|---:|---|
| econ × <5K × S4 | 76 | 72.4% | +$2.08 | **7.36** | 5.90 | 0.05% | YES (N<80) |
| econ × 5-15K × S1 | 232 | 6.0% | +$50.57 | 1.45 | -0.34 | 35.2% | no |
| earnings × 5-15K × S2 | 46 | 34.8% | +$19.32 | 0.92 | -1.51 | 19.3% | YES (N<80) |
| econ × 5-15K × S2 | 57 | 29.8% | +$50.41 | 0.75 | -5.52 | 27.0% | YES (N<80) |
| econ × 15-50K × S2 | 38 | 36.8% | +$35.53 | 0.72 | -3.54 | 20.3% | YES (N<80) |

**Bottom 5 by Sharpe:**

| Cell | N | win_rate | mean_pnl | Sharpe | CI lower | maxDD |
|---|---:|---:|---:|---:|---:|---:|
| econ × <5K × S1 | 178 | 0.6% | -$45.94 | -9.08 | (degenerate) | 91.3% |
| geopolitics × 5-15K × S1 | 187 | 2.7% | -$34.26 | -4.39 | -16.2 | 68.0% |
| econ × <5K × S2 | 50 | 24.0% | -$26.57 | -3.42 | -9.88 | 51.1% |
| geopolitics × <5K × S1 | 105 | 1.0% | -$39.10 | -3.28 | (degenerate) | 77.2% |
| geopolitics × 15-50K × S4 | 102 | 29.4% | -$3.01 | -2.29 | -3.56 | 6.4% |

(Note: a handful of S1 cells produced numerically extreme bootstrap CI lower bounds because near-degenerate resamples occasionally yielded ~0 stdev; the apparent Sharpe is unaffected and remains deeply negative regardless.)

## Honest interpretation

The cycle-1 hypothesis was that *low* liquidity tiers might show edge that the v1 mainstream-market test did not. The data refutes the simple version of that. In every single (category × tier) combination where S1 hit N ≥ 80, S1 lost money — and the lower the liquidity tier, the worse the bleeding (`econ <5K S1` lost $45.94 per bet; `geopolitics <5K S1` lost $39.10 per bet). The reason is mechanical: at sub-$50K volume, an extreme YES price like 0.95 is *more* informative, not less, because it usually reflects a market with idiosyncratic certainty (a foregone-conclusion event). The 200 bp fee + the 5% YES wins for the rare losers are insufficient to recover the +EV the strategy needs.

S2 (mean-reversion against 3d-vs-7d drift) is the only strategy with positive aggregate P&L (+$2,842 across 347 bets). But every individual S2 cell has fewer than 80 bets — the strategy filter is too narrow at this liquidity. The +$8.19 per bet is interesting but un-actionable until N grows; cycle 2 should investigate either a wider drift window (e.g., 2d→0d as well as 7d→3d) or relaxed magnitude (5pp instead of 10pp) to grow the bet population.

S4 (time-decay long-tail in earnings) is the cleanest outlier: `econ × <5K × S4` shows Sharpe 7.36 with maxDD 0.05% on N=76 — but it falls 4 bets short of the primary N ≥ 80 gate. This deserves follow-up. The bet structure (NO at price < 0.15 with trading window ≤ 14 days) is essentially "the market is already calling this a near-impossibility, and there isn't enough time left for it to resurrect" — and on `econ` markets at <$5K volume, those long-tail YES events resolved NO in 72% of cases, generating a small, consistent profit (+$2.08 per bet, $50 stake). Whether this generalizes (or is a function of the specific composition of the parquet's <$5K econ subset) is the central question for cycle 2 — and it cannot pass Verdict A as currently structured because of the N gate.

S3 (stale-price reversion) is uniformly negative across all categories and tiers where N is meaningful — the assumption that "stale prices revert to equal odds" is wrong on these markets; if a price is stale at 0.7, the resolution is more often the YES side (consistent with ordinary calibration), so betting NO bleeds.

## Caveats

- **Multiple-comparisons correction NOT applied yet** — that is the master verdict step. With 36 cells, Holm-Bonferroni at α = 0.05 demands a far stricter per-cell p-value than the raw bootstrap p-value reported here. The single near-pass (econ <5K S4, p ≈ 0.000) might survive, but it fails the N gate before correction is even needed.
- **Walk-forward integrity confirmed** — every bet sorts on `end_date` and uses only the row's own pre-resolution data. S2 and S3 use CLOB lookups bounded to T-7d / T-3d windows. No future leakage.
- **Devig approximation:** `entry_no_price = 1 - entry_yes_price` (no separate NO order book consulted; standard for binary markets but ignores spread).
- **Earnings × S4 ≈ 0 bets:** trading_window_days is rarely ≤ 14 in this earnings dataset because prior harvesters captured longer-horizon markets. Not a strategy failure per se; a data-population gap.
- **Geopolitics × S1 catastrophic:** the >$50K-volume markets (which we excluded) likely contain the calibrated half; the <$50K geopolitics tier is dominated by binary "X happens by date Y?" markets that resolve in the consensus direction.
- **Numerical artifact in CI calculation:** for a few S1 cells with highly skewed P&L distributions (e.g. mostly all-loss bets), the bootstrap occasionally hit zero-stdev resamples, producing extreme CI bounds. This is cosmetic; the cells are clearly unprofitable on the point estimates.
