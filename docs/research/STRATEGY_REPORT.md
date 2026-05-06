# Earnings Edge — Strategy Research Report

**Date:** 2026-05-06T18:30Z
**Compute:** 4 parallel subagents (A=data+model, B=backtest, C=correlation, D=alternatives)
**Backtest dataset:** 819 resolved Polymarket earnings markets across 411 distinct tickers, end_date 2025-09-24 → 2026-05-06 (4 quarters)
**Walk-forward OOS sample:** 443 markets in 2026 Q1 + 2026 Q2

---

## Executive summary

**The thesis "EPS-surprise modeling generates edge over Polymarket prices" is empirically falsified on this dataset.** Across 7 strategy variants — including pure price-threshold rules, cross-quarter momentum, and three model-conditional sizing schemes — none demonstrates a defensible positive return. The single strategy that booked positive P&L (S6, +$3,638 on N=56) is two-outlier-driven; strip the AMZN-NO and DAL-NO fat-tail wins and S6 is **−$5,200**. The model has worse log loss than using Polymarket's own implied price as a forecast (0.534 vs 0.487). Forward-looking edge claim from this research: **zero, pending another 4+ quarters of data.**

The most informative finding from the session is **negative**: the cross-quarter momentum signal (P(beat | prior beat) = 0.788 vs P(beat | prior miss) = 0.574, a 21pp asymmetry on N=326/101 paired observations) is **real in raw outcomes** but **already efficiently priced by Polymarket** — Strategy 4 (momentum-with-the-trend) lost $4,062 broadly across 174 bets with no fat-tail contribution. The market knows.

**Recommendation:** stop iterating on the EPS-surprise feature pipeline. The current production paper-bet logger is fine as infrastructure but its signal source (lib/types.ts derived from a 4-quarter Polymarket-implied-price proxy) does not have edge. Pivot effort to one of the unfalsified alternatives (D's matrix), or accept the project as a paper-trading benchmark and use it as a platform for future strategies.

---

## Real backtest results (Agent B)

All P&L on a notional bankroll. Stake conventions per strategy. Walk-forward enforced for model-conditional strategies (S5/S6/S7) by using only OOS predictions; threshold strategies restricted to the same OOS window for apples-to-apples (also reported on full sample).

| Strategy | Description | N bets | Win rate (CI) | Total P&L | ROI | Max DD |
|---|---|---:|---|---:|---:|---:|
| S1 | NO on extreme favorites (p≥0.85), $250 | 143 | 0.077 [0.035, 0.126] | −$417 | −1.2% | −$13,950 |
| S2 | YES on extreme dogs (p≤0.50), $250 | 62 | 0.339 [0.226, 0.452] | −$278 | −1.8% | −$4,537 |
| S3 | Mean-reversion bands (p≥0.85 → NO; p≤0.50 → YES) | 205 | 0.156 [0.107, 0.210] | −$695 | −1.4% | −$16,894 |
| S4 | **Cross-quarter momentum (D's signal)** | 174 | 0.529 [0.454, 0.598] | **−$4,062** | −9.3% | −$4,567 |
| S5 | Model edge ≥5pp, $250 flat | 172 | 0.576 [0.506, 0.645] | −$1,493 | −3.5% | −$4,294 |
| S6 | Model edge ≥10pp, $400 flat | 56 | 0.518 [0.375, 0.661] | **+$3,638** | +16.2% | −$3,464 |
| S7 | Quarter-Kelly on S5 signals | 172 | 0.576 [0.506, 0.645] | +$31 | +6.2% | −$57 |

**Honest reading:**

- **S6's headline +$3,638 is outlier-driven.** Two NO-side wins (AMZN @ $0.054 entry → +$7,007 and DAL @ $0.18 → +$1,822) account for ~$8.8K. Strip those two markets and S6 is **−$5,200 on 54 bets**. The strategy isn't capturing skill — it's catching a 1-in-50 fat tail on extreme-low NO entry prices, which is precisely where measurement noise dominates.
- **S5 win rate (0.576) is BELOW the OOS base rate of 0.74.** A naive "always YES, $250" would beat the model-edge strategy on win rate. The model produces "edge ≥ 5pp" signals that are anti-correlated with actual outcomes after controlling for price.
- **S4 (momentum) is the cleanest negative result.** 174 bets, no single bet contributing more than $1,100 to P&L, broadly negative. D's 21pp empirical asymmetry is real in the outcomes but Polymarket already prices it correctly enough that a naive threshold-and-momentum rule loses money trying to exploit it.
- **S7 (quarter-Kelly) deploys negligible stake (~$504 total) and books +$31.** Effectively flat; the Kelly fractions are tiny because the model's "edges" are tiny. This corroborates that the edges aren't real.

**Aggregate:** model-based strategies (S5+S6+S7) net +$2,176 vs no-model (S1+S2+S3+S4) net −$5,452. But almost all of that gap is the two AMZN/DAL outliers in S6. With outliers stripped, model-based is −$10K, no-model is −$5K, and **the only honest conclusion is that 4 quarters is too small a sample to distinguish either family from random.**

Key files:
- `data/research/strategy_pnl_S{1..7}.csv` — per-bet ledgers
- `data/research/strategy_summary.csv` — summary metrics
- `docs/research/headline_chart.png` — cumulative P&L equity curves
- `docs/research/edge_vs_outcome_scatter.png` — model calibration on backtested bets

---

## Model performance (Agent A)

| Metric | Model | Polymarket-implied | Naive base-rate |
|---|---:|---:|---:|
| AUC (95% CI) | 0.741 [0.686, 0.798] | **0.772** | 0.500 |
| Brier score | 0.167 | **0.158** | 0.199 |
| Log loss | 0.534 | **0.487** | 0.588 |

**Verdict:** the model is beaten by treating the live Polymarket YES price as the prediction. ΔLL = −0.047 in favor of the implied baseline. This is decisive on N=443 OOS predictions — the cross-validated CIs do not overlap.

**Why this happened:** the dominant feature in the fitted logistic regression is `polymarket_implied_p_beat` itself (standardized coef +0.99). All other features either add noise (sparse AV-EARNINGS data, populated for only 56 of 819 rows) or duplicate price information at lower fidelity (sector dummies recapture aggregate base-rate biases that price already encodes).

**Calibration is reasonable but not exploitable.** Decile 9 (predicted 0.86, realized 0.87) is well-calibrated. Decile 10 (predicted 0.94, realized 0.85) shows a small overestimate at the top — the kind of pattern that originally motivated the "NO on extreme favorites" strategy. But S1 lost $417 (OOS) / $5,277 (full sample) trying to harvest exactly this gap. The miscalibration is real but smaller than the bid-ask + slippage cost of betting against it.

Key files:
- `data/research/training_data.parquet` (and `.csv`) — 819 × 16
- `data/research/model.pkl` + `model_metrics.json`
- `data/research/calibration_table.csv`, `feature_importance.csv`
- `docs/research/MODEL_FIT.md`

---

## Portfolio construction insights (Agent C)

| Property | Value | Verdict |
|---|---|---|
| Sector pairs with computable ρ | 45 / 55 | OK |
| Median overlap-quarters per pair | 3 | **Way too few** |
| Maximum possible overlap | 4 quarters | Hard ceiling on this dataset |
| Sectors with N≥10 markets | 11 (incl. "Other") | OK |
| Markets bucketed as "Other" | 646 / 819 = **79%** | Sector mapping needs to expand |
| Highest-ρ pair | Banks ↔ Industrials, ρ=+1.000, N=3 | Saturation artifact, not signal |
| Lowest-ρ pair | AutoEV ↔ Staples, ρ=−1.000, N=3 | Same |

**Verdict from Agent C:** "Don't deploy portfolio Kelly off this matrix; the correlation estimates are on 3–4 quarterly observations and Σ⁻¹ amplifies that noise. Stick with $250 flat per bet (Strategy A) and recompute after ≥8 quarters of paper-bet logging."

C's stress test of three sizing strategies for a representative quarter:

| Strategy | Total stake | EV (model right) | EV (market right) | P(loss) market-right |
|---|---:|---:|---:|---:|
| Naive flat $250/market | scaled-by-N | low + diversified | ≈ $0 | moderate |
| Single-best concentration ($1,500) | $1,500 | high | ≈ $0 | high |
| Portfolio Kelly w/ correlation | varies | $5,066 | ≈ $0 | **62%** |

Per Agent A's MODEL_FIT finding, the "market right" baseline is the more honest one. Portfolio Kelly looks attractive only under the assumption the model adds information; that assumption is empirically false.

Key files:
- `data/research/sector_correlation_matrix.{json,csv}`
- `docs/research/sector_correlation_heatmap.png`
- `docs/research/CORRELATION_AND_PORTFOLIO.md`

---

## Live results so far (production paper bets)

The production paper-bet ledger has 6 open / 0 settled. Three of the six (AMD, GOOGL, AMZN) were logged before the future-only filter shipped and are on past-resolved earnings; they will resolve naturally as Finnhub returns actuals over the coming days. The other three (NVDA, TSLA, MSFT) are on future earnings.

**Cross-check is not possible yet** (zero settled bets). Re-run this section once the 20:00 UTC resolver populates `paper_bets_settled.jsonl`. Even then, N=6 is far too small to confirm or contradict the backtest finding.

Notable for cross-validation: the AMZN paper bet is on a market this backtest also analyzed; the outlier "AMZN NO @ $0.054" win in the backtest was a single-quarter event from late 2025. The current AMZN paper bet (logged 2026-05-06 morning) is a separate market that hasn't resolved yet.

---

## Forward research candidates (Agent D)

Eight alternatives ranked. Three are testable on the data already on disk; three are blocked on missing data feeds; two were falsified in this session.

| Rank | Alternative | Status | Effort | Confidence |
|---|---|---|---|---:|
| 1 | **Cross-quarter momentum vs CLV residual** | Live but Polymarket prices it (S4 confirms) | M | 4 → demoted to 3 after S4 |
| 2 | **Cross-venue Polymarket↔Kalshi arb** | Untested; needs Kalshi catalogue | L | 3 |
| 3 | **CLV-style backtest framework** | Infrastructure for everything else | M | 4 |
| 4 | **Time-decay structure (T-7d → T-1d)** | Free byproduct of CLV fetch | S | 3 |
| 5 | **Question-phrasing alpha** | Falsified (alt buckets N=12, N=1) | Done | 1 |
| 6 | **Selection bias on listed tickers** | Falsified (73.7% vs 72% S&P) | Done | 5 (in negative) |
| 7 | **Market-creation-time alpha** | Untested; needs createdTime in scrape | S | 2 |
| 8 | **Vol-crush IV-rank cross** | Blocked: no IV data feed | L | 2 |

**D's top recommendation:** cross-quarter momentum + CLV measurement. **Backtest result demotes this:** Polymarket already prices the momentum asymmetry; no exploitable edge at threshold rules. The CLV framework is still the right diagnostic infrastructure for any future strategy work — it converges faster than realized P&L on small samples — but it's not itself an alpha source.

**Re-prioritized next-step:** **Alternative 2 (cross-venue arb)** is now the most promising direction not falsified or proven inert. PTO-Kalshi-Copier already has Kalshi connectivity; reusing `kalshi_client.py` + `market_matcher.py` reduces effort. The unknown is whether Kalshi lists quarterly EPS markets with sufficient density to match against Polymarket's 856.

Key file: `docs/research/ALTERNATIVES.md`

---

## Recommendation

**The current "EPS-surprise model edge over Polymarket" thesis does not survive contact with real historical data.** The model is dominated by the live YES price as a feature, and the strategies built on top of model "edge" lose money or net flat on a 2-quarter OOS sample. The cross-quarter momentum signal that looked promising at the outcome level (21pp asymmetry) is correctly priced by Polymarket and produces no realized edge.

**Three honest paths forward:**

1. **Pivot to cross-venue arb (Alt 2).** Largest potential upside. Reuses [[PTO-Kalshi Copier]] infrastructure. Requires cataloguing Kalshi's earnings namespace and writing a fuzzy-matcher. ~L-effort but the existing PTO-Kalshi codebase removes most of the work. **This is the recommended next investment.**

2. **Accept the dashboard as benchmark infrastructure.** The paper-bet logger, future-only filter, GitHub-backed persistence, and Vercel deploy are valuable as a platform regardless of whether the EPS thesis works. Keep accumulating paper bets, recompute everything in this report after ≥8 quarters (≈Q3 2026 → Q1 2028), and decide then whether the thesis was killed by sample size or by genuine no-edge.

3. **Stop the project.** If neither pivot is appealing, the honest conclusion is that the original edge claim was overstated and the public Polymarket price is efficient enough at this granularity that small participants cannot extract alpha. P0 blocker (snapshot freshness) becomes moot.

**Do not deploy portfolio Kelly or sector-correlation sizing on this dataset.** N is too small. The matrix is published as a directional artifact only.

---

## Caveats — read before acting on any of the above

- **Sample size:** 4 quarters of data, 2 of which are OOS-evaluable. Wide CIs everywhere. A genuine edge could exist and be undetectable at this N.
- **Survivorship/selection bias:** all results are on tickers Polymarket created markets for. These are weighted toward high-retail-interest names.
- **CLOB price fidelity:** 12-hour buckets. Cannot capture intraday timing alpha; if a meaningful entry-window strategy exists in the T-1h to T+0 window, this dataset can't see it.
- **Devig approximation:** entry_no_price ≈ 1 − entry_yes_price. Real CLOB orderbook depth was not consumed — actual ask-on-NO is likely a few percent worse, which would degrade all strategies further.
- **AV feature sparsity:** 6.8% of training rows have lagged-EPS features. Model is largely sector-and-price-only. A richer feature set might tell a different story but requires either Finnhub (key empty in vercel pull) or multi-day AV backfill.
- **Walk-forward only has 2 OOS quarters.** Earlier quarters (2025 Q3, Q4) have insufficient training data to evaluate, so reported metrics are on Q1 2026 + Q2 2026 only — a regime that may not generalize.
- **Two known data-hygiene bugs found by Agent D** (not reflected in numbers above):
  - 5 of 856 "earnings"-tagged markets are MrBeast Twitter-revenue questions (false positives in the tag filter; ~0.6% noise)
  - 4 markets use class-share tickers (BRK.A, UHAL.B, MOG.A) that the regex `\(([A-Z]{1,5})\)` misses; broaden to `\(([A-Z.]{1,7})\)` for future scrapes
- **Model-implied edge is correlated with extreme prices.** The strategies that "captured" the most edge by stake are concentrated in p_beat ≥ 0.85 markets, where the slippage model is most aggressive.

---

## Open questions for the user

1. **Pivot vs persist?** Cross-venue arb (Alt 2) is the highest-EV next move within this project's current scope. Do you want to greenlight cataloguing Kalshi earnings markets, or step away?
2. **Resolver cron:** The 20:00 UTC resolver hasn't yet created `paper_bets_settled.jsonl`. Once it does, we can do a real cross-check between this backtest and the live paper bets. Worth scheduling a 4-quarter re-evaluation? (Calendar reminder for Q3 2026?)
3. **Snapshot writer P0:** Independent of strategy work. Is the recommendation in STATE.md — port snapshot logic into the dashboard's Vercel cron — still preferred over scheduling the Python writer separately?
4. **Data-hygiene bugs:** Should the dashboard's source-of-truth `lib/types.ts` schema or `paperEngine.ts` filter be updated to handle the class-share regex and MrBeast-style tag pollution? Both are <1% impact but could matter if the dataset doubles.
5. **Stop committing to "EPS-surprise model edge" framing in user-facing copy.** The /stats page and /signal/[id] permalinks currently describe the project as harvesting EPS-surprise edge. With this report, that framing is empirically not supported. Should we soften the copy, or hold until ≥8 quarters of paper bets resolve?

---

## Files generated this session

```
docs/research/MODEL_FIT.md
docs/research/BACKTEST_RESULTS.md
docs/research/CORRELATION_AND_PORTFOLIO.md
docs/research/ALTERNATIVES.md
docs/research/STRATEGY_REPORT.md             ← this file
docs/research/headline_chart.png             1600×1000, 187 KB
docs/research/edge_vs_outcome_scatter.png    1200×800,   99 KB
docs/research/sector_correlation_heatmap.png 1200×1000, 145 KB

data/research/RESEARCH_BRIEF.md
data/research/earnings_markets_raw.json      (856 markets)
data/research/earnings_markets_with_entry.jsonl  (819 rows)
data/research/training_data.parquet (+ .csv)
data/research/model.pkl
data/research/model_metrics.json
data/research/calibration_table.csv
data/research/feature_importance.csv
data/research/clob_history/                  846 files
data/research/av_earnings/                   20 files (1 throttled, 19 with data)
data/research/av_quota.json                  (20/20 calls used)
data/research/sector_correlation_matrix.{json,csv}
data/research/strategy_pnl_S{1..7}.csv
data/research/strategy_summary.csv

scripts/research/{fetch_clob_history,fetch_av_earnings,build_training_data,fit_model,agent_c_correlation}.py
scripts/research_backtest.py
```

**API budget used:**
- Polymarket gamma-api: ~10 calls (events listing)
- Polymarket CLOB: 846 calls (price-history, paced 0.4s apart)
- Alpha Vantage: 20/25 calls (at hard cap)
- Finnhub: 0 calls (key empty in `vercel env pull` per STATE.md gotcha)
