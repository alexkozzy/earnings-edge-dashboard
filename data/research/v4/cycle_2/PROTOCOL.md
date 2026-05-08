# Cycle 2 Protocol — external-context features vs implied-price baseline

**Pre-registered before any cycle 2 backtest.** Locked.
**Direction selected:** Agent D's pre-registered Direction C (top recommendation in `cycle_1/lessons.md`).

## Why this direction (informative-gap rationale, not cherry-picking)

Cycle 1's aggregate finding: S1 fade-extremes lost $17K across 1,477 bets at sub-$50K liquidity → **low-liquidity Polymarket markets are well-calibrated**. The v1 EC1 finding (high-liquidity well-calibrated) generalizes downward.

The next informative question is: **do external information sources add predictive content beyond what Polymarket's implied price already encodes?** This question's answer changes the project-level verdict regardless of cycle 1's results:

- If YES (external features beat implied baseline on log loss with margin ≥ 0.02): the v1+v3 "Polymarket prices encode all info" finding is overturned at the geo + econ category level. Major positive result.
- If NO: every category and tier we've tested confirms Polymarket prices encode public info. Verdict B at the project level becomes essentially confirmed.

This is NOT "extend the S4 econ <5K cell" (which would be cherry-picking). It's a structurally orthogonal test against the same baseline that v1 + v3 measured.

## Hypothesis under test

For Polymarket binary markets in the geopolitics + economic-data + earnings categories, can a model using:
- GDELT news-tone aggregates over the T-7d → T-3d window
- FRED Geopolitical Risk Index (GPR) snapshot at T-3d
- FRED Economic Policy Uncertainty (EPU) snapshot at T-3d (econ category only)

…beat the implied-price baseline (`outcome_yes_won ~ entry_yes_price_3d`) on out-of-sample log loss with margin ≥ 0.02 across walk-forward quarters?

## Strategy variants (max 4 — locked)

Not "trading strategies"; "information-content models." Each is a binary classifier on `outcome_yes_won`:

**Model X1 — implied baseline.** Uses only `entry_yes_price_3d`. Logistic regression. Reference baseline only — does not pass primary by definition.

**Model X2 — implied + GDELT tone.** Adds `gdelt_avg_tone_t-7d_to_t-3d` and `gdelt_event_count_t-7d_to_t-3d` for the market's question's keyword set. Logistic regression with L2.

**Model X3 — implied + macro context.** Adds `gpr_at_t-3d` (FRED GPR daily) and, for econ category, `epu_at_t-3d` (FRED EPU daily). Logistic regression with L2.

**Model X4 — full stack.** All features from X2 + X3 combined. Logistic regression with L2.

## Inputs

- Universe: the 5,745-market parquet `data/research/v4/cycle_1/all_markets_v4.parquet` filtered to categories {earnings, econ, geopolitics} (skip crypto — no GDELT/FRED feature relevance)
- GDELT: free no-auth REST API at `https://api.gdeltproject.org/api/v2/doc/doc?query=<KEYWORDS>&mode=ToneChart&format=json&timespan=10d`. Fetch per market with question-keyword extraction. Pace 1 req/sec.
- FRED: requires API key (`FRED_API_KEY`). If not present locally, attempt `vercel env pull` first; if still missing, fall back to GDELT-only and document.

## Walk-forward integrity

Same as v1+v3. For each test quarter Q, fit X2/X3/X4 only on rows with `end_date < Q`. OOS predict on Q's rows. Concatenate OOS predictions across all evaluable quarters.

Critical: GDELT tone for a market is measured over its own T-7d → T-3d window — these timestamps are deterministic for a resolved market and don't leak future info as long as the model fitting itself is walk-forward.

## Success thresholds — Verdict A (cell-level)

A model variant (X2/X3/X4) passes Verdict A on a (category × tier) slice if:
- N ≥ 80 OOS predictions in that slice
- Variant's OOS log loss is **lower than X1 (implied baseline)** by margin ≥ **0.02**
- 95% bootstrap CI on log-loss-improvement excludes zero
- Holds in the master verdict's Holm-Bonferroni correction across all (variant × slice) cells (cycle 1's 36 + cycle 2's ~30)

## Out-of-scope for cycle 2

- Live trading
- Rich NLP features beyond GDELT tone (e.g. LLM-extracted sentiment) — too expensive for the wall-clock budget
- Cycle 1's price-threshold strategies (those are evaluated; this cycle tests information content)

## Forbidden

- Adding non-X1/X2/X3/X4 model variants
- Counting the implied-baseline X1 as "passing"
- Cherry-picking the (variant × slice) combo with best apparent gain (Holm-Bonferroni at master verdict guards against this, but the agent must compute and report ALL cells)

## Subagent dispatch

- **Orchestrator (now):** GDELT + FRED data harvest pre-execution. ~30 min for 3000-5000 markets, watchdog-resistant batching.
- **Agent E (cycle 2):** model fitting + walk-forward eval + per-cell metrics. ~45 min.

Only one agent in cycle 2 because the work is tightly coupled (data → fit → eval) and the data harvest is the IO bottleneck (orchestrator handles).

## Halt conditions

- If GDELT returns < 50% market coverage → cycle 2 verdict is C (data-constrained); document specific reasons.
- If FRED key unavailable AND GPR/EPU are essential to the test → revert to GDELT-only X2 model only.
- If wall clock < 90 min remaining → write what we have and proceed to cycle 3 / master verdict.

## Output requirements

- `data/research/v4/cycle_2/feature_data.parquet` — per-market features
- `data/research/v4/cycle_2/cells.parquet` — (variant × category × tier) results with metrics + bootstrap CIs on log-loss improvement
- `data/research/v4/cycle_2/RESULTS.md` — markdown
- `data/research/v4/cycle_2/lessons.md` — pre-registered cycle 3 directions (or "no further useful tests" if exhausted)
