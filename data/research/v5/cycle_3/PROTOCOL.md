# Cycle 3 Protocol — external-feature test (FRED GPR)

**Pre-registered before any cycle 3 backtest.** Locked.
**Direction:** Direction C from cycle 1 lessons.md (orthogonal to cycle 2's ambiguity-grade direction).

## Why this direction (informative-gap rationale)

Cycle 2 confirmed an in-data signal (AMBIGUOUS-mid YES bias) but failed N≥80. The natural temptation is to expand N — explicitly forbidden by the wrapper as cherry-picking.

Cycle 3 instead tests a **structurally different** question: do off-Polymarket information signals (FRED Geopolitical Risk Index) add information content beyond the implied price baseline for geopolitics markets?

This question's answer changes the project-level verdict regardless of cycle 2's outcome:
- If YES (GPR-augmented model beats implied baseline on log loss with margin ≥ 0.02): an orthogonal source of edge exists. Combined with cycle 2's directional signal, the case for "geopolitics has exploitable structure" strengthens.
- If NO: even external macro context doesn't beat the price. v3's "Polymarket prices encode public info" generalizes to off-Polymarket signals too.

## Hypothesis

For geopolitics markets, can a logistic regression model using:
- `entry_yes_price_3d` (the implied baseline)
- `gpr_at_t-3d` (FRED Geopolitical Risk Index, daily, free .xls)
- `gpr_change_t-7d_to_t-3d` (4-day GPR change capturing escalation/de-escalation regime)
- `sub_category` one-hot

…beat a baseline of `outcome_yes ~ entry_yes_price_3d` only on out-of-sample log loss with margin ≥ 0.02?

## Strategy variants (LOCKED at 3)

Same convention as v3 Hypothesis 2 — these are information-content models, not trading strategies:

**Model V1 — implied baseline.** Single feature `entry_yes_price_3d`. Logistic regression. Reference; does not pass primary by definition.

**Model V2 — implied + GPR.** Adds GPR snapshot at T-3d. Logistic regression with L2.

**Model V3 — implied + GPR + sub_category.** Adds GPR change + sub_category one-hots. Logistic regression with L2.

## Walk-forward integrity

For each test quarter Q in geopolitics universe, fit V2/V3 only on rows with `end_date < Q`. OOS predict on Q's rows. Concatenate OOS predictions across all evaluable quarters. Same protocol as v3.

GPR data is keyed by date — for a market resolving 2026-03-01, use GPR's value on 2026-02-26. No future leakage as long as the model fitting is walk-forward.

## Pass criteria — Verdict A on cycle 3

A model variant (V2 or V3) passes Verdict A on this cycle if ALL hold:
- N ≥ 80 OOS predictions (master threshold)
- Variant's OOS log loss is **< implied baseline** by margin ≥ **0.02**
- 95% bootstrap CI on log-loss-improvement excludes zero
- Holds in master verdict's Holm-Bonferroni correction across all v5 cells

## Inputs

- `data/research/v5/markets/universe.parquet` (2,911 markets)
- FRED GPR Index: `https://www2.bc.edu/matteo-iacoviello/gpr_files/data_gpr_daily_recent.xls` (daily back to 1900; verified accessible by Agent C in cycle 1)

## Forbidden

- Adding V4/V5 model variants — locked at 3
- Reporting any one of {log loss, AUC, Brier} alone — must report all three; only log loss is the pass criterion
- Treating V3 with sub_category dummies as "feature engineering" beyond protocol — these are baked into the protocol

## Subagent dispatch

- **Orchestrator (now):** download GPR daily file, join to universe.parquet on `(end_date - 3 days)`. Output: `data/research/v5/cycle_3/feature_data.parquet`. ~5 min.
- **Single agent (Cycle-3-Agent):** model fit + walk-forward + 3-metric eval + bootstrap. ~25 min.

## Halt conditions

- If GPR file unreachable: cycle 3 verdict is C (data-constrained); document. Cycle 4 picks orthogonal direction or master verdict.
- If GPR data only goes back to 1900 but universe has all post-2024 dates: NOT a halt; just a coverage check (every market should have a GPR value).
- If wall clock < 60 min remaining when this cycle completes: master verdict immediately.

## Output requirements

- `data/research/v5/cycle_3/feature_data.parquet` — universe with GPR features joined
- `data/research/v5/cycle_3/cells.parquet` — V1/V2/V3 metrics with bootstrap CIs
- `data/research/v5/cycle_3/RESULTS.md`
