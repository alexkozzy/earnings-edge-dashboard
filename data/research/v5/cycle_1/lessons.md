# Cycle 1 → Cycle 2 lessons (orchestrator-owned)

Written by orchestrator after all three cycle 1 agents landed. Locks the cycle 2 direction with explicit "informative gap" justification.

## Cycle 1 evidence (three independent tracks)

| Agent | Finding | Implication |
|---|---|---|
| B (backtest) | 0/5 testable cells pass primary; S1 fade-extremes loses across all 4 well-powered discretionary cells (Sharpes -2.36 to -4.32) | Geopolitics is well-calibrated; v1+v3+v4 finding extends to a 4th category |
| C (activity feed) | Whale-follow strategy rejected on N=1402 large trades (39.5% direction-hit; -0.22pp 1h fwd; CI [-0.37, -0.07]) | Whales are FADED by the orderbook; not exploitable as a standalone strategy |
| D (LLM ambiguity) | AMBIGUOUS mid-price markets: realized 34.1% vs predicted 29.6% (+4.4pp gap); concentrated at p∈[0.30, 0.85] where AMBIGUOUS resolved YES at >75% (+25 to +47pp gap) | A specific structural bias surfaces — UMA-resolver dispute discretion may default to YES |

## Cycle 2 candidate directions (informative gaps, not cherry-picks)

### Direction A — Expand LLM ambiguity grading + placebo control [D's recommendation]
**Question it answers:** Is the +25-47pp gap on AMBIGUOUS-mid-price markets real or N=25 noise?
**Why informative:** A real ambiguity-driven YES bias is a category-level pricing inefficiency that v1-v4 didn't test. A null result here closes the "Polymarket has any pricing inefficiency" question across 5 sessions of evidence.
**Why NOT cherry-picking:** Tests a fresh sample (different markets than cycle 1's 200) AND uses an explicit placebo (CRISP-hard_currency must NOT pass; if it does, the test is contaminated).
**Effort:** M (400 in-context grades + backtest + bootstrap CIs)
**Pass criteria:** AMBIGUOUS strategy P&L > CRISP-placebo P&L by ≥1 SE post-Holm-Bonferroni across all v5 cells.

### Direction B — Order-flow overlay on S1/S4 [C's recommendation]
**Question it answers:** Does adding a "skip if recent whale flow concurs with my bet direction" filter improve S1's catastrophic loss to merely break-even?
**Why informative:** Tests whether order-flow signals contain residual information after price.
**Why NOT cherry-picking:** S1 already failed Verdict A in cycle 1; adding a filter doesn't rehabilitate the strategy unless it's a structural improvement.
**Effort:** M (reuse cycle 1's 1041-bet ledger + join order-flow features)
**Pass criteria:** Filtered-S1 must materially reduce drawdown without expected-return loss.

### Direction C — News-tone features (GDELT + GPR) [secondary]
**Question it answers:** Do external news features beat the implied-price baseline on log loss for geopolitics markets?
**Why informative:** Mirror of v3's M1-M5 model variations, but with off-Polymarket information.
**Effort:** M-L (per-market GDELT lookups + walk-forward eval)
**Why deprioritized for cycle 2:** weaker prior than D's specific finding; can be cycle 3 if cycle 2 closes ambiguously.

## Selected direction

**Cycle 2 = Direction A.** Explicit reasoning:

1. **D's mid-price gap is the only positive signal across 5 sessions of evidence.** A clean rejection or confirmation has the highest information value at the project level.
2. **The mechanism is testable** (UMA dispute → YES default). If the gap is real, the strategy generalizes to any platform using UMA-style oracles.
3. **D's recommendation specified a placebo control**, which is the discipline that distinguishes legitimate testing from p-hacking.
4. **Cost is bounded** (300 LLM grading calls remaining of 500-call budget; 400 grades are in-context inference, ~$0 external).

## Anti-recommendations (cycle 2 must NOT do)

Per the wrapper's "informative gap not promising-looking" rule, cycle 2 must reject these tempting paths:

- ❌ "Test cycle 1's near-miss S4 cells in geopolitics at higher N" — same trap as v1's CR2/EC2
- ❌ "Add strategies S5-S10 to cycle 1's grid" — cherry-picking
- ❌ "Re-grade D's same 200 markets with stricter prompts" — same data, not informative
- ❌ "Skip the placebo control because the AMBIGUOUS finding is so strong" — exactly the discipline failure WHY_NOT_INFINITE warned about
- ❌ "Lower the N threshold from 80 to 30 because the AMBIGUOUS bucket is small" — threshold relaxation forbidden by SESSION_CONFIG
