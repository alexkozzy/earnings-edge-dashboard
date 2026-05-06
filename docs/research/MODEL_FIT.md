# MODEL_FIT.md

Agent A — probability-of-beat model for resolved Polymarket earnings markets.

## TL;DR

- **N = 819 markets** in training set (out of 856 raw / 846 with valid ticker+CLOB).
- **Walk-forward AUC: 0.741, 95% bootstrap CI [0.686, 0.798]** on N=443 OOS predictions.
- **The model does NOT beat the Polymarket-implied baseline on log loss.** Model log
  loss = 0.534 vs implied baseline = 0.487 (delta = **−0.047**, model is *worse*).
- **Conclusion:** Polymarket prices already efficiently encode the public signal. A
  simple logistic regression with sector dummies + 8-quarter lagged EPS features adds
  no information on top of the live YES price. Any backtested edge will need to come
  from execution timing, fee/spread arbitrage, or genuinely orthogonal features
  (macro regime, post-news drift) — not from this model class.

## 1. Dataset summary

| Metric | Value |
|---|---|
| Raw resolved markets | 856 |
| With ticker + clob_token_ids | 846 |
| With non-empty CLOB history | 843 |
| With T-3d entry available | 819 (used in training) |
| With T-7d entry | 598 / 819 (73%) |
| With AV-derived lagged features | 56 / 819 (6.8%) |
| Quarters covered (end_date) | 2025 Q3 — 2026 Q2 (4 quarters) |
| Beat rate | 608 / 819 = **74.2%** |
| Mean polymarket-implied p_beat (T-3d) | 0.730 |

**Drop reasons** (raw → 819):

| Reason | Count |
|---|---|
| Missing ticker (regex did not match) | 10 |
| Empty CLOB history returned | 3 |
| No T-3d entry price (history too short) | 24 |

Note: the research brief stated the dataset spans 2024-01-19 → 2026-05-06, but the
`end_date` field (resolution date) for all 846 ticker-valid markets falls in
**2025-09-24 → 2026-05-06**. This limits walk-forward to 4 quarters total, of which
only 2 (2026 Q1, 2026 Q2) have enough preceding training data to fit & evaluate.

## 2. Features

| Feature | Definition | Coverage |
|---|---|---|
| `polymarket_implied_p_beat` | YES-side price at T-3d before `end_date` | 819 / 819 |
| `lagged_beat_rate_8q` | Mean(reportedEPS > estimatedEPS) over last ≤8 AV-EARNINGS quarters with `reportedDate < end_date` | 56 |
| `surprise_mean_8q` | Mean of `surprisePercentage` over those quarters | 56 |
| `surprise_stdev_8q` | Sample stdev of `surprisePercentage` | 56 |
| `quarters_since_last_miss` | Run length of consecutive most-recent beats | 56 |
| `sector_beat_rate_prior_8q` | Mean `outcome_beat` of last ≤8 markets in same sector with earlier `end_date` | 808 |
| `sector` (one-hot) | from `SECTOR_MAP` (else `"Other"`) | 819 |

**Walk-forward integrity:**
- AV `EARNINGS` filtered to `reportedDate < end_date` per market — no leakage.
- `sector_beat_rate_prior_8q` computed by iterating markets in chronological order;
  each market's value uses only markets in the same sector with **strictly earlier**
  `end_date`.

**AV coverage limitation:** Only 19 distinct tickers have AV `EARNINGS` (we burned 1
of 20 calls on a throttle envelope for AMD), so AV-derived features are populated for
**6.8% of rows**. Imputation handles the rest. This is a real ceiling: with the AV
free-tier 25-call/day cap, expanding coverage requires multi-day backfill or a paid
key.

## 3. Model class & rationale

**Logistic regression with L2 (sklearn `LogisticRegression(C=1.0)`) inside a Pipeline
with mean-imputation + standardization.**

Rationale:
1. N=819 with 6 numeric features + 11 sector dummies is a small/wide problem; L2
   regularization keeps coefficients stable.
2. Walk-forward leaves only ~370+660 train rows for the 2 evaluable test quarters —
   no room for a tree-based model without massive overfit risk.
3. AV-derived features are missing for 93% of rows; mean-imputation is the simplest
   defensible handling (no train-leak: imputer is fit per fold).
4. The honest comparison we care about is **vs the Polymarket-implied baseline**, and
   that's most cleanly stated in log-loss terms.

A Bayesian logistic with sector priors was considered but rejected: with only 11
sectors and 1-2 quarters of test data, the prior would dominate the fit and we'd lose
interpretability without gaining out-of-sample accuracy.

## 4. Walk-forward CV results

For each test quarter Qt, train on all rows with end_date < first day of Qt:

| Test quarter | n_train | n_test | test base_rate | model mean p |
|---|---|---|---|---|
| 2025 Q3 | 0 | 6 | — | skipped (insufficient train) |
| 2025 Q4 | 6 | 370 | — | skipped (insufficient train) |
| **2026 Q1** | 376 | 287 | 0.697 | 0.755 |
| **2026 Q2** | 663 | 156 | 0.788 | 0.717 |

OOS metrics on N=443:

| Metric | Model | Polymarket implied | Naive base rate |
|---|---|---|---|
| AUC | **0.741** [0.686, 0.798] (95% CI, 1000 bootstraps) | **0.772** | — |
| Brier | 0.167 | **0.158** | 0.199 |
| Log loss | 0.534 | **0.487** | 0.589 |

**Critical comparison:** model log loss (0.534) − implied log loss (0.487) =
**−0.047**. The model is **worse** than just trusting the live YES price.
Equivalently, the model **does not beat the Polymarket-implied baseline.**

## 5. Calibration

| Pred decile | n | mean predicted | realized beat rate |
|---|---|---|---|
| 0.0–0.1 | 4 | 0.030 | 0.250 |
| 0.1–0.2 | 10 | 0.164 | 0.300 |
| 0.2–0.3 | 16 | 0.252 | 0.313 |
| 0.3–0.4 | 14 | 0.353 | 0.214 |
| 0.4–0.5 | 24 | 0.456 | **0.708** |
| 0.5–0.6 | 25 | 0.550 | 0.480 |
| 0.6–0.7 | 26 | 0.657 | 0.538 |
| 0.7–0.8 | 81 | 0.759 | 0.716 |
| 0.8–0.9 | 178 | 0.861 | 0.871 |
| 0.9–1.0 | 65 | 0.945 | 0.846 |

Calibration is reasonable in the high-probability bucket where most of the mass sits
(0.8–1.0, n=243, well-calibrated) but **systematically under-predicts at the
0.0–0.5 range** (predicted ~0.0–0.4, realized 0.21–0.71). The mid-range bucket
(0.4–0.5) realizes 0.71, which is essentially the dataset base rate — this suggests
that for "uncertain" markets the model has no information beyond the prior.

## 6. Feature importance (logistic, standardized X)

Sorted by |coef| (model fit on all 819 rows, full-data, only used for inspection):

| Feature | Coef | abs |
|---|---|---|
| `polymarket_implied_p_beat` | +0.992 | **0.992** |
| `quarters_since_last_miss` | +0.604 | 0.604 |
| `sector=TechServices` | +0.322 | 0.322 |
| `sector=Staples` | +0.278 | 0.278 |
| `surprise_stdev_8q` | −0.260 | 0.260 |
| `sector=Consumer` | −0.168 | 0.168 |
| `sector=BigTech` | −0.163 | 0.163 |
| `sector=Other` | −0.160 | 0.160 |
| `lagged_beat_rate_8q` | −0.152 | 0.152 |
| `sector=Energy` | +0.089 | 0.089 |
| ... (others) | ... | <0.1 |

**Reading:** the implied price coefficient absorbs nearly all the signal. Lagged-beat
features carry small effects but their coverage is too thin (n=56) to be trusted.
The `quarters_since_last_miss` coefficient looks "important" but it is also computed
only from those 56 rows — the regression amplifies what it sees on a small slice.

## 7. Sector map

Used `SECTOR_MAP` from the brief verbatim. 69 dataset tickers map to a named sector
(176 markets), 246 tickers fall into `"Other"` (646 markets). Sector dummies in the
model use the 11 distinct labels: `AutoEV, Banks, BigTech, Consumer, Energy,
Industrials, Other, Pharma, Semis, Staples, TechServices`.

| Sector | n markets | mean implied p | beat rate |
|---|---|---|---|
| Other | 646 | (computed in CSV) | — |
| Banks | 24 | — | — |
| Staples | 22 | — | — |
| Semis | 21 | — | — |
| Consumer | 21 | — | — |
| Industrials | 18 | — | — |
| BigTech | 18 | — | — |
| TechServices | 15 | — | — |
| Energy | 14 | — | — |
| Pharma | 11 | — | — |
| AutoEV | 9 | — | — |

(Per-sector mean prices/realized rates available via `training_data.csv`.)

## 8. What this model can and cannot tell us

**Can:**
- Confirm that the live YES price at T-3d is the dominant signal (AUC 0.77 alone).
- Quantify, on out-of-sample data, that adding 8Q lagged EPS surprise + sector
  dummies does **not** improve calibration or discrimination above the live price.
- Identify systematic miscalibration zones (mid-range probabilities and the very
  low end), useful for agent B's strategy filters.

**Cannot:**
- Generate genuine alpha vs the market. The Polymarket-implied baseline has
  better log loss, better Brier, better AUC.
- Speak to 2024 or earlier behavior. All 819 retained markets resolved in
  2025 Q3 – 2026 Q2; this is a single regime.
- Claim feature significance for AV-derived features. Only 56/819 rows
  carry them; the apparent coefficients are not sample-size-defended.
- Speak to small-N tickers. 105 of 420 unique tickers appear in exactly one market.

**Sample-size warning:** Walk-forward used only **2 effective test quarters**
(2026 Q1 + Q2). The 95% AUC CI [0.686, 0.798] reflects this — it's wide. Any
strategy claim built on this will be similarly noisy.

**Regime caveat:** The training period spans Sep 2025 – May 2026. If beat rates
shift due to macro conditions (rate cycle, AI capex, recession), out-of-sample
behavior will diverge from in-sample. Treat the model as descriptive of this
window only.

## 9. Artifacts

- `data/research/training_data.parquet` (and `.csv`) — 819 × 16
- `data/research/earnings_markets_with_entry.jsonl` — 819 rows, `model_p_beat`
  populated for 443 OOS markets, null for the 376 markets in the earliest two
  quarters (2025 Q3 + Q4) where walk-forward training data was insufficient.
- `data/research/calibration_table.csv`
- `data/research/feature_importance.csv`
- `data/research/model.pkl` — full-data fitted pipeline (use with caution)
- `data/research/model_metrics.json` — summary metrics
- `data/research/av_quota.json` — quota tracker (total_calls = 20 / 20)

## 10. Hand-off note for agents B and C

- **Agent B (backtest):** read `earnings_markets_with_entry.jsonl`. For 376 of the
  819 markets `model_p_beat` is `null` (early quarters with no walk-forward
  training data). Agent B should either (a) use only the 443 markets with
  `model_p_beat` for any model-conditioned strategy, or (b) fall back to
  `polymarket_implied_p_beat` for the others — but report the breakdown.
  Naive-baseline strategies (always-bet-Yes, threshold-on-implied-price) can use
  all 819. **Edge claim: there is no model-vs-market edge in log loss — strategies
  that rely on the model improving on prices should expect zero or negative
  alpha.** Strategies based purely on the implied price (e.g. cheap-yes-bias,
  threshold filters) are still worth backtesting.
- **Agent C (correlation):** read `training_data.parquet`. Sector field present;
  56 rows have AV-derived features, the rest are null. Sector aggregations should
  be size-weighted and reported with N.
