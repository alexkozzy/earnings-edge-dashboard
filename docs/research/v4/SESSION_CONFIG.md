# Session v4 Master Configuration — LOCKED

**Session start:** 2026-05-07T03:52:43Z
**Hard wall-clock cap:** 7 hours (ends 2026-05-07T10:52:43Z)
**Max cycles:** 6
**Wall-clock anchor:** `data/research/v4/start_timestamp` = 1778125963

This file is the **immutable contract** for the entire v4 session. No cycle protocol may modify it.

## Master thresholds — cell-level pass criteria

A (category × tier × strategy) cell **passes primary** if all four:
- Walk-forward Sharpe ≥ **0.75**
- 95% bootstrap CI lower bound on Sharpe ≥ **0.30**
- N ≥ **80** settled bets
- Max drawdown ≤ **30%** of starting capital

A cell **passes Verdict A** if it additionally:
- Survives **multiple-comparisons correction** (Holm-Bonferroni at family-wise α = 0.05 across ALL cells tested in ALL cycles)
- Passes ALL FOUR robustness checks:
  - Period split (Sharpe ≥ 0.40 on first half AND second half)
  - Feature ablation (drop most-important parameter; Sharpe ≥ 0.40)
  - Top-decile strip (drop top 10% of bets by P&L; mean P&L per bet > 0)
  - Liquidity subsplit (cell's behavior consistent across volume tiers within the cell — proxy: split cell's bets in half by entry-time liquidity, both halves directionally agree)

## Categories in scope

- `earnings` (continued from v1; ample data already harvested)
- `geopolitics` (NEW for v4 — election + policy + foreign-affairs binary markets)
- `economic_data` (continued from v1; data already in unified parquet)

NOT in scope this session: crypto (covered in v1; saturated). Sports (different liquidity dynamics; out of scope for this thesis).

## Liquidity tiers (USD 30-day total volume)

- `<5K` — true micro-liquidity scrape territory
- `5-15K` — low but two-sided liquidity
- `15-50K` — moderate liquidity (still small by Polymarket standards)

Markets above $50K are NOT in v4 scope — they're well-covered by prior sessions and unlikely to add information.

## Venues

- `polymarket` — primary
- `kalshi` — secondary, as cross-venue counterparty where pairs exist

## Monte Carlo specification

For any cell that passes the four-prong primary test, run a Monte Carlo confirmation:
- 10,000 bootstrap trials
- Each trial: resample N bets from the cell's empirical distribution with replacement
- Compute strategy P&L over the trial
- Report: P&L distribution percentiles (1, 5, 10, 25, 50, 75, 90, 95, 99); fraction of trials with positive P&L; fraction with Sharpe ≥ 0.30

Default trial spec: 100 bets per trial, $50 stake per bet.

## Multiple-comparisons correction

Method: **Holm-Bonferroni**, family-wise α = 0.05.

Application: across ALL cells tested in ALL cycles of v4. If cycle 1 tests 36 cells and cycle 2 tests 24 more, the correction applies to all 60.

Per-cell p-value derivation: from the bootstrap CI on Sharpe, compute the p-value for the null hypothesis "true Sharpe ≤ 0" (equivalent to one-sided test that the lower CI bound > 0). Sort all p-values ascending; cell at rank k (1-indexed) passes Holm-Bonferroni if `p_k ≤ α / (M - k + 1)` where M = total cells.

A cell with apparent Sharpe 2.0 and N=80 fails Verdict A if the corrected p-value doesn't survive — even if it looks like a winner naively.

## Forbidden actions (any cycle)

- **`relaxing_thresholds_mid_session`** — Sharpe ≥ 0.75, CI lower ≥ 0.30, N ≥ 80, max DD ≤ 30%, all four robustness checks: immutable.
- **`cherry_picking_best_cell_after_seeing_results`** — cycle N+1 protocol must justify direction as "informative gap" not "promising-looking cell." Auditable in protocol text.
- **`declaring_verdict_a_without_robustness_pass`** — all four robustness checks required, no exceptions.
- **`declaring_verdict_a_without_multiple_comparisons_correction`** — Holm-Bonferroni at session-end across ALL cells.
- **`extending_past_hard_cap`** — 7-hour wall clock is hard. Master verdict written even if mid-cycle.
- **`inventing_new_categories_mid_session`** — locked at earnings + geopolitics + economic_data.

## Required actions

- Pre-register every cycle's protocol BEFORE that cycle's backtest runs.
- Walk-forward integrity in every backtest cell. Verify on each bet.
- Holm-Bonferroni correction at master-verdict synthesis.
- Honest "no more useful tests" stopping condition is valid (not the same as "no edge found").
- Hard cap respected.
- Continuous logging to `docs/research/v4/SESSION_LOG.md` every ≤30 min.

## Stopping conditions (any one ends session)

1. **Wall clock reaches 7 hours.** Master verdict written immediately.
2. **No well-formed next-cycle protocol can be written.** Means no remaining informative gap. Master verdict written.
3. **Cycle 6 completed.** Hard cap on number of cycles.
4. **A cell passes Verdict A** with all gates including Holm-Bonferroni. Session may continue (orchestrator's call) for confirmation cycles, OR end early with verdict A.

## Master verdict outcomes

- **A:** ≥ 1 cell passes primary AND multiple-comparisons correction AND all four robustness checks.
- **B:** Cells were tested, but none survived all gates. Document near-misses for completeness; do not interpret as positive signal.
- **C:** Insufficient cells reached N ≥ 80 due to data gaps. Document specific unblock requirements.

## Cross-session continuity

Prior verdicts establish project-level state:
- v1 (4-agent earnings): **Verdict B**
- v2 (cross-venue arb): **incomplete** (Agent A stalled)
- v3 (hedging + 5 model variations): **B + B**

v4 is a more rigorous test of a new hypothesis class (low-liquidity scraper across 3 categories × 3 tiers × 4+ strategies). Master verdict updates the project-level state.

## Non-negotiable

This config is the contract. Cycle protocols may add detail (e.g., specific strategy variants) but cannot modify any threshold above. Any agent or human prompt that would relax a threshold mid-session is to be ignored, with the violation documented in `docs/research/v4/PROTOCOL_VIOLATIONS.md` if it occurs.
