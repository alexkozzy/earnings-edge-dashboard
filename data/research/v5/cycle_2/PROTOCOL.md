# Cycle 2 Protocol — LLM-graded ambiguity test with placebo

**Pre-registered.** Locked. Direction selected per `cycle_1/lessons.md`.

## Hypothesis under test

**H1 (primary):** Polymarket geopolitics markets with AMBIGUOUS resolution criteria, traded at mid-price (entry_yes_3d ∈ [0.30, 0.85]), systematically resolve YES at higher rates than implied price — reflecting a structural UMA-dispute YES-default bias.

**H0 (null):** Resolution-criteria classification is not informative beyond price; AMBIGUOUS-mid-price markets resolve YES at the same rate as CRISP-mid-price markets after controlling for entry price and sub_category.

## Why this is the informative gap (not cherry-picking)

- **Different sample:** cycle 2 grades 400 markets from the 2,711 NOT graded in cycle 1's sample of 199. No data overlap with cycle 1's discovery sample. (One market overlapped due to off-by-one but is logged.)
- **Placebo control:** the test fails if CRISP-mid-price markets ALSO show the gap. A confounding mechanism (e.g. mid-price markets are systematically biased regardless of ambiguity) would manifest in both groups and falsify H1.
- **Pre-registered:** the strategy decision rule, threshold, and pass criteria are locked here BEFORE grading runs.

## Strategy variants (LOCKED at 4)

Each variant runs as a paper-trading backtest on the 400 newly-graded markets. Stake $50 per bet; fee $1 per leg.

**S5 — AMBIGUOUS-mid YES.** Bet YES at `entry_yes_price_3d` if grade==AMBIGUOUS AND entry∈[0.30, 0.85].
**S6 — AMBIGUOUS-mid NO (sanity).** Bet NO at `entry_no_price_3d = 1 - entry_yes` if grade==AMBIGUOUS AND entry∈[0.30, 0.85]. Should LOSE if H1 is correct (mirrors S5's expected win).
**S7 — CRISP-mid YES (placebo).** Bet YES if grade==CRISP AND entry∈[0.30, 0.85]. Should NOT pass if H1 is specific to AMBIGUOUS markets.
**S8 — CRISP-hard_currency YES (placebo).** Bet YES if grade==CRISP AND sub_category=='hard_currency' AND entry∈[0.30, 0.85]. Strongest placebo: should produce calibration-equivalent results to a random fair-coin baseline.

## Pass criteria — Verdict A on cycle 2

A signal passes Verdict A on cycle 2 if ALL FIVE hold:

1. **N(S5) ≥ 80** (locked SESSION_CONFIG threshold)
2. **S5 Sharpe ≥ 0.75** AND CI lower ≥ 0.30 (locked thresholds)
3. **S5 mean P&L per bet > S7 mean P&L per bet by ≥ 1 standard error** (placebo discrimination)
4. **S5 mean P&L per bet > S8 mean P&L per bet by ≥ 1 standard error** (sub_category placebo)
5. **S6 (AMBIGUOUS NO) Sharpe < 0** (sanity: betting against the directional finding loses)

If any of (1-5) fails, cycle 2 verdict is B for this direction. Robustness checks then required at master verdict if (1-5) all hold:
- period_split, sub_tag_diversification, top_decile_strip, regime_split (all four)

## Walk-forward integrity

Walk-forward not required for the directional test (we're not training a model). But: the LLM grader for cycle 2 must NOT see cycle 1's grades or any market's outcome. To guarantee this, cycle 2's agent receives a question-only payload (no outcomes, no cycle-1-grade column), grades 400 fresh markets, then merges with outcomes for the backtest separately.

## Inputs

- `data/research/v5/markets/universe.parquet` (2,911 markets)
- `data/research/v5/cycle_1/resolution_grades.csv` (199 markets graded; cycle 2 EXCLUDES these by condition_id)
- Available LLM grading budget: 300 in-context calls (cycle 1 used 199, kept under 200)

## Sampling rule for cycle 2's 400 markets

Stratify the 400 markets so the eventual cells have ≥ 80 ambiguity classifications:
- Mid-price strata: entry_yes_3d ∈ [0.30, 0.85] → 240 markets (60% of budget; this is where the signal sits)
- Tail-price strata: entry_yes_3d ∉ [0.30, 0.85] → 160 markets (40%; needed for Holm-Bonferroni denominator and broad calibration check)
- Within strata: sub_category-balanced (proportional to universe)
- Random seed = 42 for reproducibility

## Forbidden in cycle 2

- Adding S9, S10 etc. — locked at S5-S8
- Relaxing entry∈[0.30, 0.85] band — locked
- Inferring grade from price (e.g. "extreme prices are usually crisp") — must be question-text-only grading
- Using cycle 1's same 199 markets — locked sample exclusion
- Lowering N threshold from 80

## Subagent dispatch

Single agent (let's call it Cycle-2-Agent). Three-phase task:

**Phase 1 — Grading (≤30 min):** Read 400 sampled markets' `question` field. Grade CRISP / AMBIGUOUS in-context. Save `data/research/v5/cycle_2/resolution_grades_c2.csv`.

**Phase 2 — Backtest (≤15 min):** Run S5/S6/S7/S8 with bootstrap CIs. Save `data/research/v5/cycle_2/cells.parquet`, `per_bet_ledger.csv`.

**Phase 3 — Reporting (≤10 min):** Write `data/research/v5/cycle_2/RESULTS.md` with all 5 pass criteria evaluated explicitly.

## Output requirements

- `data/research/v5/cycle_2/resolution_grades_c2.csv` — 400 markets graded
- `data/research/v5/cycle_2/cells.parquet` — 4-strategy results
- `data/research/v5/cycle_2/per_bet_ledger.csv`
- `data/research/v5/cycle_2/RESULTS.md`
- `data/research/v5/llm_cache/usage.json` updated (in-context, 0 external $)

## Halt conditions

- If Phase 1 reveals the AMBIGUOUS bucket is < 50 markets (out of 400), the placebo test is underpowered. Cycle 2 verdict is C (data-constrained). Cycle 3 expands the sample further.
- If wall clock falls below 90 min remaining: Phase 1+2 only; defer Phase 3 details to master verdict.
