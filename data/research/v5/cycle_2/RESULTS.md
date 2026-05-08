# Cycle 2 Results — LLM-graded ambiguity test with placebo

## TL;DR

Of the 5 pre-registered pass criteria, **3 of 5 hold**. Criteria 1 (N(S5) ≥ 80) and 2 (Sharpe ≥ 0.75 with CI lower ≥ 0.30) **fail**: the AMBIGUOUS-mid cell only contains 40 markets (cycle-1 grading rate of 22% AMBIGUOUS doesn't deliver the 80-bet threshold from a 240-mid sample). The directional placebo discrimination (criteria 3, 4, 5) all pass cleanly — S5 outperforms both placebos by >1 SE and S6 (NO bets on the same set) loses badly. **Verdict A FAILS** on locked criteria, but the directional pattern is strong (S5 win rate 82.5%, mean PnL +$28.24/bet, +25pp realized-vs-predicted gap on a fresh sample). Verdict on this direction: **B (directionally consistent with H1, but cell underpowered per pre-registered N threshold)**.

## Phase 1 — grading distribution

400 markets graded (CRISP / AMBIGUOUS), zero overlap with cycle 1's 199.

**By band × grade:**

| band | AMBIGUOUS | CRISP | total |
|---|---|---|---|
| mid (entry∈[0.30, 0.85]) | 40 | 200 | 240 |
| tail (entry∉[0.30, 0.85]) | 39 | 121 | 160 |

**By sub_category × grade (full sample):**

| sub_category | AMBIGUOUS | CRISP | total |
|---|---|---|---|
| discretionary | 76 | 265 | 341 |
| hard_currency | 3 | 37 | 40 |
| action_count | 0 | 19 | 19 |

**By band × sub_category × grade:**

| band | sub_category | AMBIGUOUS | CRISP |
|---|---|---|---|
| mid | discretionary | 38 | 161 |
| mid | hard_currency | 2 | 25 |
| mid | action_count | 0 | 14 |
| tail | discretionary | 38 | 104 |
| tail | hard_currency | 1 | 12 |
| tail | action_count | 0 | 5 |

Overall AMBIGUOUS rate: 79/400 = 19.8% (vs cycle 1's 22.1% — consistent within sampling noise). AMBIGUOUS continues to concentrate in `discretionary` (sole carrier of any meaningful AMBIGUOUS volume), as seen in cycle 1.

**Halt-condition check:** total AMBIGUOUS = 79 ≥ 50, so the protocol's underpowered-data halt (Verdict C trigger) does NOT fire. The placebo test runs.

## Phase 2 — backtest results

Stake $50, fee $1 per leg. Bootstrap CIs from 1000 resamples, seed=42.

| Strategy | N | win_rate | win_rate 95% CI | mean PnL | total PnL | std PnL | SE_mean | Sharpe | Sharpe 95% CI | max DD |
|---|---|---|---|---|---|---|---|---|---|---|
| **S5** AMBIG-mid YES | 40 | 0.825 | [0.700, 0.925] | +28.24 | +1129.48 | 44.78 | 7.08 | 0.631 | [0.297, 1.078] | -87.21 |
| **S6** AMBIG-mid NO | 40 | 0.175 | [0.075, 0.300] | -31.72 | -1269.00 | 44.53 | 7.04 | -0.713 | [-1.714, -0.306] | -1218.00 |
| **S7** CRISP-mid YES (placebo) | 200 | 0.570 | [0.495, 0.635] | +3.52 | +704.12 | 52.83 | 3.74 | 0.067 | [-0.081, 0.201] | -660.25 |
| **S8** CRISP-hard_currency-mid YES (placebo) | 25 | 0.440 | [0.240, 0.640] | -11.45 | -286.20 | 49.10 | 9.82 | -0.233 | [-0.821, 0.163] | -344.52 |

Read: AMBIGUOUS-mid YES bets won 33/40 in this sample. Predicted YES rate (avg entry price) ≈ 55%; realized 82.5% — gap of **+27.5pp**, even larger than cycle 1's +25-47pp pocket-finding. Mean PnL is +$28.24/bet, ~8× S7's +$3.52 and far above S8's -$11.45.

S6 (NO on the same 40 markets) is the mirror sanity check: -$31.72/bet, Sharpe -0.71. If H1 were wrong (i.e. ambiguous markets weren't biased YES), S6 would be ~zero. It's deeply negative, consistent with H1.

## Phase 3 — five-criterion evaluation

| # | Criterion | Computed value | Threshold | Pass? |
|---|---|---|---|---|
| 1 | N(S5) ≥ 80 | N(S5) = **40** | ≥ 80 | **NO** |
| 2 | S5 Sharpe ≥ 0.75 AND CI lower ≥ 0.30 | Sharpe = **0.631**, CI lower = **0.297** | ≥ 0.75 AND ≥ 0.30 | **NO** (Sharpe 0.631 < 0.75; CI lower 0.297 < 0.30 by 0.003) |
| 3 | mean_S5 − mean_S7 ≥ 1 × SE_combined(S5,S7) | diff = **+24.72**, SE_comb = **8.01**, ratio = **3.09×** | ≥ 1 × SE | **YES** |
| 4 | mean_S5 − mean_S8 ≥ 1 × SE_combined(S5,S8) | diff = **+39.69**, SE_comb = **12.11**, ratio = **3.28×** | ≥ 1 × SE | **YES** |
| 5 | S6 (AMBIGUOUS NO) Sharpe < 0 | Sharpe(S6) = **-0.713** | < 0 | **YES** |

**Total: 3 of 5 pass.**

SE_combined formula: sqrt(SE_mean(S5)^2 + SE_mean(other)^2). For criterion 3: sqrt(7.08^2 + 3.74^2) = 8.01. For criterion 4: sqrt(7.08^2 + 9.82^2) = 12.11.

## Verdict on cycle 2 direction

**B — directionally consistent with H1 but pre-registered N/Sharpe thresholds not met.**

The signal is in fact strong: S5 vastly outperforms both placebos (3.09× SE on S7, 3.28× SE on S8), the NO mirror on the same set loses badly (-31.7/bet, Sharpe -0.71), and the +27.5pp realized-vs-predicted gap is consistent with cycle 1's +25-47pp finding on a completely fresh sample. The directional hypothesis (UMA-resolver YES-default on ambiguous criteria) survives this placebo-controlled test directionally.

What fails is statistical power: AMBIGUOUS-mid markets are only ~17% of the 240 mid-band markets in this universe (cycle 1 had ~22%, cycle 2 has 40/240 = 16.7%). To get N(S5) ≥ 80 we'd need to grade ~480 mid-band markets (≈800 total to maintain the 60/40 mid/tail split), which would consume roughly the full remaining LLM-grading budget. Verdict A is **not** met as locked.

## sub_tag composition of S5's bets

| sub_tag | n | mean_pnl | wins |
|---|---|---|---|
| other | 25 | +30.28 | 22/25 |
| iran | 11 | +20.55 | 8/11 |
| israel | 2 | +65.32 | 2/2 |
| ukraine | 2 | +7.82 | 1/2 |

S5 is **not** dominated by Iran-cluster contamination (Alt 1 confound). 25/40 (62.5%) of S5 bets are sub_tag='other' and they carry the highest per-bet PnL (+$30.28). The Iran subset alone is +$20.55/bet on N=11 — also positive but less so. Israel and Ukraine are too small-N to interpret. The sub_tag_diversification robustness check would PASS for the directional test (no single sub_tag concentration risk).

By sub_category: discretionary 38/40 (mean +$27.68), hard_currency 2/40 (mean +$38.73). The signal lives where the AMBIGUOUS labels live (discretionary), as predicted in Alt 4 of cycle 1.

## Caveats

- **In-context grading is single-grader** (Cycle-2-Agent). Inter-rater reliability not measured. A second grader could disagree on borderline cases — particularly "drops out" timing, "release files" verification, "create a new political party" interpretation.
- **Pattern-augmented grading.** I systematized the rubric using regex patterns derived from cycle 1's grade conventions plus my in-context judgment on edge cases. This is more reproducible than free-form grading but mechanizes some borderline calls; the practical effect was probably *more* CRISP labels than a free-form pass would assign (i.e. conservative on AMBIGUOUS).
- **Sample size for AMBIGUOUS-mid** (N=40) is below the locked ≥80 threshold. This is the proximate reason cycle 2 doesn't pass Verdict A; expanding the grading sample would directly address it.
- **Walk-forward not applicable** — directional/calibration test, not a fitted model.
- **Placebo design worked as intended:** S7 (CRISP-mid) showed +$3.52/bet — substantially smaller than S5's +$28.24, well within "no-edge" territory after fees. S8 (CRISP-hard_currency-mid) was actively negative at -$11.45/bet. A confounder that affects mid-price markets regardless of grade would have shown up in S7; it didn't.
- **CI lower bound on S5 Sharpe is 0.297, vs threshold 0.30.** The criterion fails by 0.003 — this is a knife-edge result driven by N=40 sample variance. With N=80 the same effect size would likely clear the bar. Raised in caveats explicitly because the threshold is locked and 0.297 < 0.30 — does not pass.
- **One off-by-one note from cycle 1:** cycle 1 lessons mentioned a single market overlap. Cycle 2's overlap with cycle 1 is 0 (verified in code), so this cycle is fully fresh.
