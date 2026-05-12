# Cycle 1 Protocol — universe-baseline low-liquidity scraper

**Pre-registered before any backtest.** Locked.

## Hypothesis (cycle-specific)

At low Polymarket liquidity (sub-$50K total volume), price calibration may degrade enough that simple price-threshold strategies become +EV after fees. The v1 EC1 finding showed late-stage prices on **mainstream** Polymarket markets are well-calibrated; cycle 1 tests whether that holds at sub-$50K liquidity across 3 categories.

## Cell grid (36 cells = 3 cats × 3 tiers × 4 strategies)

**Categories:** `earnings`, `geopolitics`, `economic_data`
**Liquidity tiers:** `<5K`, `5-15K`, `15-50K` (USD total trading volume)
**Strategies:**

1. **S1 — Fade extremes.** Bet NO if `entry_yes_3d > 0.85`. Bet YES if `entry_yes_3d < 0.15`. Stake $50.
2. **S2 — Mean-reversion drift.** Bet against any directional 3-day price drift ≥ 10pp from T-7d to T-3d. Stake $50.
3. **S3 — Stale-price reversion.** Bet on the cheaper side when entry_yes hasn't moved ≥ 3pp in the prior 3 days. Stake $50.
4. **S4 — Time-decay long-tail.** Bet NO if `entry_yes_3d < 0.15` AND `trading_window_days <= 14`. Stake $50.

## Per-cell outputs

For each of the 36 cells, compute:
- N bets that satisfied the strategy filter
- Win rate (with 95% bootstrap CI)
- Mean P&L per bet (after Polymarket 200 bps fee)
- Total P&L
- Sharpe per-bet, with bootstrap 95% CI on Sharpe
- Max drawdown
- One-sided p-value for "true Sharpe ≤ 0"

Save: `data/research/v4/cycle_1/cells.parquet` (one row per cell with all metrics).

## Robustness checks (only for cells passing primary thresholds)

Per SESSION_CONFIG.md:
- Period split, feature ablation, top-decile strip, liquidity subsplit. All four required.

## Monte Carlo confirmation (only for cells passing primary + robustness)

10,000 trials, 100 bets per trial, $50 stake. Report P&L percentiles.

## Halt-condition per category

If a category has fewer than 80 markets in any tier, the (category × tier × *) cells are flagged data-constrained and excluded from primary-pass count. They still appear in the cells.parquet for transparency.

## Walk-forward integrity

For S2 and S3 (which need price history before T-3d): ensure the price-history lookup uses only data from T-7d to T-3d, never future. For S1 and S4 (point-in-time on entry): trivially walk-forward.

## Subagent dispatch

3 agents per cycle 1 + orchestrator pre-execution:

- **Orchestrator (now):** harvest geopolitics markets via gamma-api (`politics`, `elections`, `world`, `russia-ukraine`, `china`, `israel`, `geopolitics`). Pre-fetch CLOB price-history for them. Add to unified parquet as `category='geopolitics'`. Compute liquidity tiers from `volume_num`. (Avoids the Agent A watchdog-stall pattern.)
- **Agent B:** 36-cell backtest with all metrics.
- **Agent C:** Robustness checks for any primary-passing cells. Monte Carlo confirmation for primary+robustness passers.
- **Agent D:** Creative exploration — what categories/tiers/strategies would best fill cycle 2's "informative gap"? Output: `cycle_1_lessons.md`.

## Stopping for cycle 1

When cells.parquet + RESULTS.md + lessons.md are all written, cycle 1 ends. Orchestrator reads lessons.md and decides cycle 2 direction.
