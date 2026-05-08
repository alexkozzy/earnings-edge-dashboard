# Cycle 3 Results — FRED GPR feature test

## TL;DR

**Verdict B on cycle 3 direction.** Neither V2 (implied + GPR) nor V3 (implied + GPR + GPR_change + sub_category) beats the implied-price baseline by the required 0.02 log-loss margin. V2 improvement: -0.0020 log loss (CI excludes zero: NO). V3 improvement: -0.0057 log loss (CI excludes zero: NO).

## Walk-forward results

| Variant | N OOS | Log loss | AUC | Brier | Δ log loss vs V1 | 95% CI on Δ | Pass Verdict A? |
|---|---:|---:|---:|---:|---|---|---|
| V1 | 2836 | 0.2403 | 0.9494 | 0.0704 | 0.000 (ref) | — | NO |
| V2 | 2836 | 0.2423 | 0.9480 | 0.0711 | -0.0020 | [-0.0046, +0.0005] | NO |
| V3 | 2836 | 0.2459 | 0.9431 | 0.0719 | -0.0057 | [-0.0101, -0.0019] | NO |

## Pass criteria evaluation

Per PROTOCOL.md, a variant passes Verdict A iff:
- N OOS >= 80
- Log loss improvement vs V1 >= 0.02
- Bootstrap CI on improvement excludes zero (lower bound > 0)
- Holm-Bonferroni at master verdict

### V2
- N OOS: 2836 (PASS)
- Improvement: -0.0020 (FAIL >= 0.02 threshold)
- 95% CI on improvement: [-0.0046, +0.0005]
- Lower CI bound > 0: NO

### V3
- N OOS: 2836 (PASS)
- Improvement: -0.0057 (FAIL >= 0.02 threshold)
- 95% CI on improvement: [-0.0101, -0.0019]
- Lower CI bound > 0: NO

## Honest interpretation

FRED GPR Index measures aggregate geopolitical risk; intuition would predict it shifts the prior on YES outcomes for geopolitics markets (e.g. higher GPR → higher chance of crisis-resolution events). On the 2911-market geopolitics universe with walk-forward fitting, GPR features add essentially no information beyond the implied price. The Polymarket implied price has already absorbed any GPR signal of relevance to specific resolved events.

This corroborates v3 Hypothesis 2's finding that model variants on EPS-internal features failed to beat the implied baseline. Both internal (EPS surprise history) and external (GPR macro context) features fail to add signal beyond price.

## Caveats

- Walk-forward by quarter; only quarters with prior train data >= 50 evaluated
- GPR is a single time-series — coarse signal; ticker-specific or theme-specific news features (GDELT) would be a stronger test, but data acquisition is rate-limited
- 100% GPR coverage achieved; no missingness
- L2 logistic regression; tree-based models would only add signal if non-linear interactions exist between price and GPR — unlikely given price is itself an aggregate of all available info
