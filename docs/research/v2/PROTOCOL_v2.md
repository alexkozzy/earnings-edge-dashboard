# Cross-Venue Arb Protocol v2 — pre-registered

**Session start:** 2026-05-06T19:15Z (continuation after Verdict B)
**Pre-registered before any backtest results were observed.**
**Locked.** No mid-session modifications.

## Context — what's already known

`docs/research/VERDICT.md` (prior session) is binding input:
- 13 strategies tested across earnings/econ/crypto. Zero passed primary thresholds.
- EC1 lost $105,916 on N=664 — late-stage Polymarket econ pricing is essentially perfectly calibrated.
- **Cross-venue arb (CR3 in prior protocol) is the ONLY unfalsified hypothesis.**
- Prior session's 26 Kalshi pairs in `data/research/kalshi_paired_markets.jsonl` are **structurally unusable for arb**: they topic-match (same event), but bucket-mismatch (different thresholds). Spot-checked example: PM "Will Fed cut 25bps?" paired with Kalshi "Will rate be above 3.50%?". These are correlated but not equivalent.

## Hypothesis under test

The same future event trades on both Polymarket and Kalshi at materially different implied probabilities. After fees + slippage, a hedged cross-venue position captures the spread regardless of resolution direction.

## Why this might exist when other strategies didn't

- Single-venue prices converge to truth (EC1 confirms).
- Cross-venue mispricing requires arb capital to flow between venues, which has frictions: KYC at both, regulatory differences (Polymarket banned for US users), capital lock-up, fee asymmetries (~2% Polymarket taker, ~7% Kalshi maker rebate net). Frictions create persistent spreads.

## Definition of a valid pair (LOAD-BEARING)

A pair (PM_market, KSI_market) is valid for arb if and only if:

1. **Same underlying event** (e.g. same Fed meeting, same CPI release, same election outcome)
2. **Same outcome bucket on the YES side.** "Will rate be cut by 25bps" must match "Will rate be cut by 25bps", NOT "Will rate be above 3.50%". Adjacent buckets are NOT equivalent.
3. **Same resolution date** (within ±2 days for scheduled events; exact for moment-in-time events)
4. **Resolution criteria reduce to the same boolean** for any underlying outcome

The previous session's heuristic (topic + date overlap) is necessary but not sufficient. Add a bucket-equivalence check before scoring.

**Empirically expected pair count:** unclear. The pre-flight reality check showed Polymarket fine-grained buckets vs Kalshi threshold-style markets — they may not match cleanly on most econ events. Single-bucket events (named elections, named price-touch markets) are more likely to yield true matches.

## Strategy variants (max 4 — locked)

1. **S1 — Pure spread capture.** When `|P_poly_yes − P_kalshi_yes| > θ` (test thresholds 4¢, 6¢, 8¢ as ablation), buy YES on the cheap venue + buy NO on the expensive venue (i.e. NO_price = 1 - YES_price). Hold to resolution. Settles to $1 either way; profit = (1 - sum_of_costs) - fees - slippage.
2. **S2 — Single-sided fade.** Bet against the more-extreme venue; assume it'll mean-revert toward the other. Exit at resolution OR when spread closes.
3. **S3 — Time-windowed.** Only enter when spread emerges within 7 days of resolution (forces near-term capital recovery; reduces opportunity cost).
4. **S4 — Liquidity-floor.** Only enter when both venues have ≥ $5K bid depth at the target price.

## Fees + slippage (realistic)

- **Polymarket:** 2% taker fee on order-book matches. Use **200 bps per leg**.
- **Kalshi:** taker fees vary by market; conservative assumption is **700 bps per leg** (the Kalshi rebate structure complicates this; use the worst-case taker rate).
- **Slippage:** **50 bps per leg minimum**. Increase to 200 bps for thin (<$5k 24h-volume) markets.
- **Per-pair total cost:** ≈ 200 + 700 + 50 + 50 = **1000 bps = 10%** of capital deployed per pair as worst-case round-trip cost.

This is high. The strategy needs gross spreads ≥ 11% for net positive return. **Hypothesis is therefore: do gross spreads ≥ 11% exist with sufficient frequency on truly-paired markets?**

## Success thresholds — Verdict A

A strategy passes Verdict A if:
- **N ≥ 50** paired markets with sufficient overlap window for entry
- **Mean per-trade return ≥ 1.5%** after fee + slippage adjustment
- **Sharpe ≥ 1.0**, 95% bootstrap CI lower ≥ **0.40**
- **Max drawdown ≤ 20%**
- All three robustness checks pass at relaxed thresholds (Sharpe ≥ 0.50): ablation, period split, top-decile-stripped

## Verdict mapping

- **Verdict A:** at least one strategy passes primary AND robustness
- **Verdict B:** at least one strategy has N ≥ 50 but fails on Sharpe/CI/drawdown/robustness
- **Verdict C:** no strategy reaches N ≥ 50 due to insufficient high-confidence pairs

## Pairing methodology — locked

**Pass 1 — Heuristic scoring** (every PM × KSI candidate gets a score):
```
score = 0
+3 if same ticker (NVDA × NVDA) OR same named event ("Trump 2024" × "Trump 2024")
+3 if same numeric threshold within 5% tolerance
+2 if resolution dates within 2 days
+2 if topic keyword class matches (Fed/CPI/Jobs/Election/Crypto/etc.)
+1 if exact phrase substring overlap > 20 chars
```
Candidate threshold: score ≥ 5.

**Pass 2 — Bucket-equivalence check (NEW for v2)**:
For each candidate, parse the YES outcome of both questions. Reject if:
- One is a point estimate ("rate cut by 25bps") and the other is a threshold ("rate above 3.50%")
- Numeric thresholds differ by more than the 5% tolerance
- One is a single-event question and the other is a compound conditional ("Cut-Cut-Cut")
This filter is the difference between the previous session's spurious pairs and a real arb dataset.

**Pass 3 — Agent-graded refinement (intra-agent reasoning, no external API)**:
Agent A reads each candidate pair and applies its own judgment to YES/NO/UNCERTAIN whether the questions are arb-equivalent. Cap at 100 pair evaluations to bound effort. Save graded results.

**Output buckets:**
- `high_confidence.jsonl` — Pass 2 passed AND Pass 3 = YES
- `medium_confidence.jsonl` — Pass 2 passed AND Pass 3 = UNCERTAIN
- `rejected.jsonl` — failed Pass 2 OR Pass 3 = NO

**Halt condition:** if `high_confidence.jsonl` < 30, automatic Verdict C — but Agent B still runs exploratory analysis on whatever exists.

## Forbidden in this session

- Adding strategy variants beyond the 4 listed
- Counting medium-confidence pairs in the verdict primary metric
- Reporting per-trade returns without including fee + slippage
- Cherry-picking the spread threshold that maximizes apparent Sharpe (test all three; report all three)
- Treating EC2/CR2 from prior session as positive signals
- Adding pairs found by visual eyeball — only protocol-graded pairs count

## Things explicitly out of scope

- Any backtest of single-venue strategies (covered in prior verdict)
- Any model fitting (covered in prior verdict — model loses to implied price)
- Live trading or deployment

## Order of execution

1. Pre-flight + this PROTOCOL_v2.md commit (~5 min)
2. Agent A: pair acquisition + 3-pass matching (~25 min)
3. Once A delivers ≥ 30 high-confidence pairs: dispatch B (backtest) + C (structural feasibility) in parallel (~30 min each)
4. Synthesis: VERDICT_v2.md (~15 min)
5. UI integration based on verdict outcome (~10 min)

## Reproducibility

All graded pairs + scoring rationale must be saved to `data/research/v2/paired_markets/`. Anyone re-running this protocol must reach the same pair set ±10% within tolerance.
