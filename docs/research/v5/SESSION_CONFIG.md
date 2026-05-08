# Session v5 Master Configuration — LOCKED

**Session start:** 2026-05-08T04:13:08Z
**Hard wall-clock cap:** 7 hours (ends 2026-05-08T11:13:08Z)
**Wall-clock anchor:** `data/research/v5/start_timestamp` = 1778213588
**Max cycles:** 6
**Target category (primary):** geopolitics
**Target category (secondary):** orchestrator decides in cycle 1 SCOPE_DECISION.md

This file is the **immutable contract** for v5. No cycle protocol modifies it.

## Cell-level pass criteria (primary)

A (sub_category × tier × strategy) cell **passes primary** if all four:
- Walk-forward Sharpe ≥ **0.75**
- 95% bootstrap CI lower bound on Sharpe ≥ **0.30**
- N ≥ **80** settled bets
- Max drawdown ≤ **30%** of starting capital

A cell **passes Verdict A** if it additionally:
- Survives **Holm-Bonferroni** correction at family-wise α = 0.05 across ALL cells in ALL cycles
- Passes ALL FOUR robustness checks:
  - **period_split** (Sharpe ≥ 0.40 on first half AND second half)
  - **sub_tag_diversification** (cell remains valid after dropping the most-represented sub_tag — e.g. if Iran-themed dominates, cell must still pass with Iran dropped)
  - **top_decile_strip** (drop top 10% of bets by P&L; mean P&L per bet > 0)
  - **regime_split** (cell holds in both pre-2026-Q1 and 2026-Q1+ subsets, or comparable)

## Liquidity tiers (USD 30-day total volume)

- `<5K`, `5-15K`, `15-50K`, `50-200K` (NEW: includes a moderate tier above v4's 50K cap)

## Sub-categories (within geopolitics)

- `hard_currency` — markets with monetary or measurable underlying (e.g. "Will US sanctions hit X by date?", "Will Y export volume cross Z?")
- `discretionary` — judgment-based outcomes (e.g. "Will leaders meet?", "Will agreement be signed?")
- `action_count` — countable events (e.g. "Will N missiles be fired?", "Will N protests occur?")

Classification rule documented in cycle 1 by Agent A.

## Sub-tags (within geopolitics)

- `iran`, `ukraine`, `china_taiwan`, `israel`, `venezuela`, `cuba`, `yemen`, `syria`, `korea`, `trump_putin`, `other`

Sub-tag selection threshold: include sub-tags where N ≥ max(30, 0.05 × total_universe_size). Anti-cherry-picking: `sub_tag_diversification` robustness check requires every passing cell to remain valid after dropping the most-represented sub_tag.

## Monte Carlo

- 10,000 trials
- 100 bets per trial
- $50 stake per bet

## Multiple-comparisons correction

- Method: **Holm-Bonferroni**
- Family-wise α = **0.05**
- Applied across ALL cells in ALL cycles at master verdict

## Budgets (locked)

- LLM grading: **500 calls / $15** (used for resolution-criteria ambiguity test in cycle 1, and for cross-venue semantic pairing in cycles 2+ if pursued)
- Alpha Vantage: ≤ 20 calls (continuing v1+ session-wide cap)
- LLM usage tracked in `data/research/v5/llm_cache/usage.json`. Halt LLM calls if approaching cap.

## Deploy at session end (locked YES)

After master verdict written:
1. `npm run build` must pass
2. Playwright screenshots at desktop/tablet/mobile must be regression-free
3. Verdict-banner UI must match actual verdict — must NOT overstate
4. Push to main, run `vercel --prod --yes`, smoke test

If build fails or screenshots reveal regressions: do NOT deploy. Document in DEPLOYMENT.md, surface to user.

## Forbidden actions

- `relaxing_thresholds_mid_session` — Sharpe ≥ 0.75, CI lower ≥ 0.30, N ≥ 80, max DD ≤ 30%, four robustness: immutable
- `cherry_picking_best_cell` — every cycle's protocol must justify direction by "informative gap" not "promising-looking"
- `declaring_verdict_a_without_robustness` — all four checks required, no exceptions
- `declaring_verdict_a_without_correction` — Holm-Bonferroni at master verdict
- `extending_past_hard_cap` — wall clock is hard
- `testing_only_iran_themed_markets` — sub_tag_diversification must hold
- `deploying_a_ui_that_overstates_verdict` — banner copy must match the actual A/B/C result

## Required actions

- Pre-register every cycle's protocol BEFORE that cycle's backtest runs
- Walk-forward integrity in every backtest cell, verified per bet
- Holm-Bonferroni correction at master synthesis
- Honest "no more useful tests" stopping is valid (not the same as "no edge found")
- Hard cap respected
- Continuous logging to `docs/research/v5/SESSION_LOG.md` every ≤ 30 min
- Activity-feed scraper decision (Agent C, cycle 1) is data-driven not speculative
- Cycle 1 includes a SCOPE_DECISION.md that picks geopolitics-only or +Kalshi or +economy with explicit justification

## Reuse from prior sessions

- v4 already harvested 35,067 raw geopolitics markets (`data/research/v4/cycle_1/geopolitics_markets.jsonl`) and CLOB price-history for ~3,750 of them (`data/research/v4/cycle_1/geopolitics_clob/` + `geopolitics_lowvol_clob/`). v5 cycle 1 reuses this rather than re-harvesting.
- v5 `markets/universe.parquet` will be derived from this prior harvest with the new sub_category + sub_tag classification overlaid.

## Cross-session continuity

| Session | Hypothesis | Verdict |
|---|---|---|
| v1 | EPS-modeling + 13 strategies × earnings/econ/crypto | **B** |
| v2 | Cross-venue Polymarket↔Kalshi arb | **incomplete** (Agent A stalled) |
| v3 | Hedging + 5 model variations | **B + B** |
| v4 | Low-liquidity scraper × 3 categories × 3 tiers | **incomplete** (cycle 1 done; cycle 2 paused) |
| v5 | Geopolitics-focused multi-cycle | **TBD** |

## Stopping conditions

1. Wall clock = 7 hours → master verdict written immediately
2. No well-formed next-cycle protocol → "no more useful tests" stop, master verdict
3. Cycle 6 completed
4. A cell passes Verdict A with Holm-Bonferroni — orchestrator's call to continue (confirmation cycles) or end early
