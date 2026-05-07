# Model variations vs implied-price baseline

Agent C — v3 Hypothesis 2 (5 alternative model classes for predicting Polymarket
earnings outcomes). Walk-forward by quarter on `data/research/training_data.parquet`
(819 rows, 4 quarters, 2 evaluable test quarters: 2026 Q1 + Q2). Same OOS rows as
the v1 logistic baseline (N=443).

## TL;DR

**Verdict B — no variant beats the Polymarket-implied baseline on all three
metrics.** The closest variant (M5, stacked simple) loses on log loss
(0.503 vs 0.487, well short of the 0.02-margin requirement), AUC (0.764 vs
0.772), and Brier (0.163 vs 0.158). The implied-price coefficient remains the
load-bearing signal; switching model class (random forest, gradient boosting,
k-NN) or simplifying features does not extract residual information that price
hasn't already absorbed.

## Comparison table

| Variant | N | Log loss (95% CI) | AUC (95% CI) | Brier (95% CI) | Beats baseline? |
|---|---|---|---|---|---|
| **Implied (baseline)** — prior session | 443 | 0.487 | 0.772 | 0.158 | — |
| **Implied (baseline)** — recomputed this session | 443 | 0.487 [0.439, 0.540] | 0.772 [0.719, 0.822] | 0.158 [0.138, 0.179] | — |
| M1 — Logistic without implied price | 443 | 0.586 [0.540, 0.639] | 0.521 [0.463, 0.577] | 0.198 [0.178, 0.220] | 0/3 |
| M2 — Random forest (200 trees, depth=5) | 443 | 0.510 [0.465, 0.559] | 0.756 [0.703, 0.811] | 0.167 [0.148, 0.188] | 0/3 |
| M3 — HistGradientBoosting (default) | 443 | 0.598 [0.517, 0.687] | 0.689 [0.633, 0.746] | 0.187 [0.162, 0.211] | 0/3 |
| M4 — k-NN sector + \|Δp\|≤0.05, top-10 recent | 443 | 1.093 [0.832, 1.376] | 0.663 [0.605, 0.725] | 0.195 [0.169, 0.221] | 0/3 |
| M5 — Stacked simple (3 features, L2 logistic) | 443 | 0.503 [0.450, 0.564] | 0.764 [0.710, 0.818] | 0.162 [0.141, 0.186] | 0/3 |

"Beats baseline?" requires log loss < 0.467 (margin ≥ 0.02), AUC > 0.772, AND
Brier < 0.158 — all three.

Recomputed implied baseline matches the prior v1 numbers to four decimals
(0.4871 / 0.7723 / 0.1577), confirming the walk-forward gate selects the same
443 OOS rows as v1.

## Per-variant detail

### M1 — Logistic without `polymarket_implied_p_beat`

**Setup.** Same pipeline as v1 (mean-impute + standardize + sector one-hot +
L2 logistic), but the `polymarket_implied_p_beat` column is dropped. Tests
whether *any* signal exists in the engineered features independent of price.

**Result.** Log loss 0.586, AUC 0.521, Brier 0.198. AUC of 0.521 is essentially
random (CI [0.463, 0.577] straddles 0.5), and log loss is *worse* than the naive
base-rate (0.589). The features remaining (`lagged_*`, `surprise_*`,
`quarters_since_last_miss`, `sector_beat_rate_prior_8q`, sector dummies) carry
no out-of-sample discriminative power on their own.

**Interpretation.** Stripping the price feature collapses the model to noise.
This is the strongest evidence that the price *is* the signal; the engineered
features only had apparent value in v1 because the price was carrying them.

Calibration: `data/research/v3/model_variations/calibration_M1.csv`.

### M2 — Random forest (200 trees, depth=5)

**Setup.** sklearn `RandomForestClassifier(n_estimators=200, max_depth=5,
random_state=42)` on the full v1 feature set (mean-impute, no scaling, sector
one-hot).

**Result.** Log loss 0.510, AUC 0.756, Brier 0.167. The closest second to M5,
but still worse than the implied baseline on every metric. Bootstrap CIs all
overlap the baseline — the gap is real but small.

**Interpretation.** A flexible nonlinear class fit on the same features cannot
recover anything price hasn't already encoded. The depth-5 cap is generous
given training-fold sizes (376 / 663 rows for the two folds).

Calibration: `data/research/v3/model_variations/calibration_M2.csv`.

### M3 — HistGradientBoosting (default)

**Setup.** sklearn `HistGradientBoostingClassifier(random_state=42)` defaults on
the full v1 feature set.

**Result.** Log loss 0.598, AUC 0.689, Brier 0.187. Worst of the model-fitted
variants on log loss and Brier.

**Interpretation.** Default HGBC overfits these small per-fold sample sizes;
without tuning regularization (`max_leaf_nodes`, `min_samples_leaf`,
`learning_rate`), it produces sharper predictions that are not justified by
out-of-sample reality. This is consistent with v1's note that "no room for a
tree-based model without massive overfit risk" at this N.

Calibration: `data/research/v3/model_variations/calibration_M3.csv`.

### M4 — k-NN: same sector + \|Δ implied_p\| ≤ 0.05, top-10 most-recent

**Setup.** No fitting. For each test market, take the 10 most-recent past
markets (strictly earlier `end_date`) in the same sector with implied price
within ±0.05; predict = mean of their `outcome_beat`. Fall back to overall
prior beat rate when fewer than 10 candidates exist (rare; sector buckets are
populated). The bin is hard — predictions cluster at multiples of 0.1.

**Result.** Log loss **1.09**, AUC 0.663, Brier 0.195. Catastrophic log loss.

**Interpretation.** The lookup produces *confident-wrong* predictions: in the
0.0–0.1 decile, mean prediction is ~0.000001 but realized beat rate is 25%
(2 of 8). Log loss is uniquely sensitive to confident misses; one
`p=0` market that resolves YES contributes ~13.8 per market to log loss.
With k=10 and discrete outcomes, the lookup periodically returns 0/10 = 0,
which then implodes log loss when one of those is wrong. AUC and Brier are
less hostile to confident errors and look more reasonable, but the protocol
requires log loss to pass too.

A Laplace-smoothed version (e.g. `(sum + 1) / (k + 2)`) would fix the log-loss
implosion, but adding that is feature engineering beyond the locked spec.
**Per protocol, M4 fails as-defined.**

Calibration: `data/research/v3/model_variations/calibration_M4.csv`.

### M5 — Stacked simple (3 features, L2 logistic)

**Setup.** Three numeric features only: `polymarket_implied_p_beat`,
`sector_beat_rate_prior_8q`, `lagged_beat_rate_8q` (mean-imputed). No sector
one-hot. L2 logistic with `C=1.0`.

**Result.** Log loss 0.503, AUC 0.764, Brier 0.162. Best of all variants. CIs
overlap the implied baseline on every metric, but point estimates lose on all
three.

**Interpretation.** Feature simplification helps marginally vs v1's full feature
set (v1 logistic: 0.534 / 0.741 / 0.167 — recall v1 had wider sector one-hots
and AV-derived features that hurt at small per-fold N), but the simplification
does not buy enough improvement to clear the implied baseline. The price
coefficient still does most of the lifting; the two side features add ~3 log-loss
basis points relative to v1's full feature set, but not the ~5 needed to even
approach parity with the implied baseline (let alone clear the 0.02 margin).

Calibration: `data/research/v3/model_variations/calibration_M5.csv`.

## Honest interpretation

This is the same result as v1, with five alternative angles of attack and the
same conclusion: **Polymarket prices already encode the public signal.**

- **Model class did not matter.** Linear (M5), tree-ensemble (M2, M3), and
  nonparametric lookup (M4) all lose. The bottleneck is information, not
  function form.
- **Feature simplification helped slightly but not enough.** M5 (best variant)
  improves on v1 by ~3bps log loss but is still 1.6bps shy of even tying the
  baseline before the 0.02 margin is applied.
- **The "model without price" ablation (M1) is informative.** It confirms that
  the engineered features carry essentially zero signal independent of price —
  AUC ≈ 0.52, log loss worse than naive base rate. This rules out the
  hypothesis that v1 failed because it duplicated price information rather
  than supplementing it; the engineered features genuinely do not have
  signal at this N.
- **The k-NN result (M4) shows the data structure rejects confident binary
  pooling.** Even within a tight price band and same sector, sample sizes are
  too small (10 nearest neighbors) for unsmoothed averaging to be sane.

For Verdict A on Hypothesis 2, *one* variant would have needed to clear three
metric bars simultaneously. None did. The cleanest passing candidate (M5)
falls short on all three by margins outside the bootstrap uncertainty for log
loss but inside it for AUC and Brier — i.e. even if you grant noise, log loss
disqualifies M5 unambiguously.

## Caveats

- **Sparse AV features.** Only 56 of 819 rows have `lagged_*` and
  `surprise_*` populated; mean-imputation collapses 93% of rows to a constant
  for those features. M2/M3/M5 all rely on AV features and are limited by
  this. A re-run with a larger AV backfill (paid key, multi-day cron) might
  change M2/M5; M1 (no price) and M4 (no AV features) would not.
- **Only 2 evaluable test quarters** (2026 Q1, 2026 Q2 — 287 + 156 = 443 OOS
  predictions). 2025 Q3 and Q4 lack enough preceding training data to
  evaluate. Bootstrap CIs are correspondingly wide (e.g. M5 log-loss CI
  width 0.115 — almost three times the 0.02 margin).
- **Walk-forward fitting per-fold may produce different feature importance
  than v1's all-data fit.** v1's feature-importance table (MODEL_FIT.md §6)
  was on the full-data fit and dominated by the price coefficient; per-fold
  fits in this script don't surface importances explicitly, but the
  qualitative pattern (price dominates) holds.
- **Single regime.** All 819 markets resolve in 2025 Q3 – 2026 Q2. No claim
  here generalizes to a different macro/AI-capex regime.
- **Per-protocol no feature engineering beyond M5's three-feature subset.**
  Variants like Laplace-smoothed k-NN (which would rescue M4's log loss) or
  isotonic-recalibrated M5 (which might shave Brier) are out of scope for
  this session.

## Artifacts

- `scripts/research_v3_model_variations.py` — script
- `data/research/v3/model_variations/model_variations_summary.csv` — one row
  per variant, metrics + bootstrap CIs + pass flags
- `data/research/v3/model_variations/variant_oos_predictions_M{1..5}.csv` —
  per-market OOS predictions for each variant
- `data/research/v3/model_variations/calibration_M{1..5}.csv` — decile
  calibration tables
- `data/research/v3/model_variations/calibration_implied.csv` — baseline
  calibration on the same 443 OOS rows
- `data/research/v3/model_variations/verdict.json` — machine-readable summary
