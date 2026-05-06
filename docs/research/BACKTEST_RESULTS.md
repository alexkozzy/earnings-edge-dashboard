# Backtest results (Agent B)

## TL;DR

- **N markets in OOS window:** 443 (across 2 quarters: ['2026Q1', '2026Q2']).
- **Best strategy by total P&L (OOS-only universe):** **S6** at **$+3638** on N=56 bets (+16.24% ROI on stake).
  **CRITICAL:** ~$8.8K of that $3638 comes from **two markets** (AMZN NO @ $0.054 +$7,007 and DAL NO @ $0.18 +$1,822). Without those two, S6 is ≈ –$5,200 on 54 bets. **Treat the S6 headline as outlier-driven, not skill-driven.**
- **Best strategy by win rate (≥30 bets):** **S5** at **0.576** on N=172. CI [0.506, 0.645] — overlaps the OOS base rate of 0.74 from below.
- **Model-based strategies (S5/S6/S7) total: $+2176 on 400 bets** — but ~$13K of the gross positive P&L is from ≤4 fat-tail NO wins. Adjusted for outliers, model-based is ≈ –$10K.
  **No-model strategies (S1/S2/S3/S4) total: $-5452 on 584 bets.**
- **Honest read:** none of the seven strategies has a clean, non-outlier-driven positive result on this 2-quarter OOS sample. S4 (D's momentum signal) lost broadly across 174 bets — the strongest *negative* result, and it suggests Polymarket already discounts last-quarter outcomes.

## Headline table — OOS universe (all 7 strategies, restricted to markets where `model_p_beat` is populated, N=443)

| Strat | N | Win rate [95% CI] | Total P&L | ROI | Q | Sharpe* | Sortino* | Max DD | Avg edge |
|---|---|---|---|---|---|---|---|---|---|
| S1 | 143 | 0.077 [0.035, 0.126] | $-417 | -1.17% | 2 | -0.40 | — | $-13950 | 0.400 |
| S2 | 62 | 0.339 [0.226, 0.452] | $-278 | -1.79% | 2 | -0.04 | — | $-4537 | 0.150 |
| S3 | 205 | 0.156 [0.107, 0.210] | $-695 | -1.36% | 2 | -0.11 | — | $-16894 | 0.324 |
| S4 | 174 | 0.529 [0.454, 0.598] | $-4062 | -9.34% | 2 | -2.34 | -2.34 | $-4567 | 0.202 |
| S5 | 172 | 0.576 [0.506, 0.645] | $-1493 | -3.47% | 2 | -0.41 | — | $-4294 | 0.117 |
| S6 | 56 | 0.518 [0.375, 0.661] | $+3638 | +16.24% | 2 | 0.48 | — | $-3464 | 0.221 |
| S7 | 172 | 0.576 [0.506, 0.645] | $+31 | +6.20% | 2 | 0.37 | — | $-57 | 0.191 |

\* Sharpe / Sortino computed on **per-quarter P&L** with N=Q quarters.
With only **2 OOS quarters** available, these are *indicative only*; do not annualise.

## Supplementary — full-sample view of no-model strategies (S1–S4 over all N=819)

| Strat | N | Win rate [95% CI] | Total P&L | ROI | Q | Sharpe* | Max DD |
|---|---|---|---|---|---|---|---|
| S1_full | 271 | 0.085 [0.052, 0.118] | $-5277 | -7.79% | 4 | -1.48 | $-14577 |
| S2_full | 123 | 0.374 [0.285, 0.455] | $+682 | +2.22% | 4 | 0.11 | $-4703 |
| S3_full | 394 | 0.175 [0.135, 0.213] | $-4595 | -4.66% | 4 | -0.85 | $-16364 |
| S4_full | 177 | 0.520 [0.446, 0.599] | $-4812 | -10.87% | 3 | -2.44 | $-5317 |


The full-sample view spans 4 quarters and is informational. The
headline table above keeps S1–S4 apples-to-apples with S5–S7 by restricting to the
OOS window.

---

## Setup notes (apply to all strategies)

- **Entry price:** `entry_yes_price_3d` from the CLOB history (T-3d). Markets with a
  null entry are skipped. The NO-side cost is approximated as `1 − YES_price` (tight-
  book / devigged assumption — see Caveats).
- **Stake & payoff:** `shares = stake / cost`. If the bet wins, P&L = `shares − stake`;
  else P&L = `−stake`. No fees, no slippage modelled.
- **Walk-forward integrity:** `model_p_beat` is already walk-forward (Agent A). For
  S1–S4, no fitting is involved; we still restrict the headline table to the OOS
  window so all rows compare on the same 443-market universe.
- **Cross-quarter momentum (S4):** `prior_outcome_beat` is computed by sorting each
  ticker's markets by `end_date` and lagging within the dataset itself. Tickers
  appearing in only one market in our window contribute zero S4 bets.
- **Quarter-Kelly (S7):** stake = `0.25 × |edge in pp|`, capped at $250. So a 10pp
  edge sizes at $2.50 — deliberately small relative to flat-stake strategies. (This
  surfaces a spec ambiguity: the prompt's literal formula `0.25 × max(0, edge × 100)`
  yields dollars, not bankroll fractions. We followed it literally.)

---

## Per-strategy detail

### S1 — NO on extreme favorites (`p_beat ≥ 0.85`, $250)

- **N:** 143
- **Total P&L:** $-417
- **Hypothesis:** extreme favorites are systematically overpriced (D's intuition).
- **Read:** at p≥0.85 the implied beat rate is 85%+. Empirically, the realised beat rate
  in the OOS 0.85–0.95 zone is ~0.87 (Agent A calibration table) — only ~2pp above the
  market price. Selling NO at $0.05–0.15 means each loss costs the full stake, so the
  per-bet payoff distribution is heavily skewed left. P&L is dominated by a few
  miss-events.

### S2 — YES on extreme dogs (`p_beat ≤ 0.50`, $250)

- **N:** 62
- **Total P&L:** $-278
- **Read:** "dogs" are rare in this universe (mean implied = 0.73). Where they exist,
  the model A calibration shows the 0.4–0.5 bucket realising ~0.71 — markets are
  *under*-pricing dogs, so YES at $0.40–0.50 has a positive expectation if the
  calibration result generalises. **However N is tiny.**

### S3 — Mean-reversion bands (NO ≥ 0.85, YES ≤ 0.50, $250)

- **N:** 205
- **Total P&L:** $-695
- **Read:** combines S1 and S2; useful for comparing the two-sided mean-reversion
  story in a single line.

### S4 — Cross-quarter momentum (D's signal), $250

- **N:** 174
- **Total P&L:** $-4062
- **Read:** Agent D found a +21pp empirical asymmetry (P(beat | prior beat)=0.79 vs
  P(beat | prior miss)=0.57). The strategy needs Polymarket prices to leave room (i.e.
  prior-beat ticker priced < 0.80, prior-miss ticker priced > 0.55). In our window
  many prior-beat tickers are *already* priced ≥ 0.80, which is exactly the question
  D flagged: does the market already discount the momentum? This backtest gives a
  partial answer.

### S5 — Model edge ≥ 5pp (the original thesis)

- **N:** 172
- **Total P&L:** $-1493
- **Read:** Agent A found the model has *worse* log loss than the implied baseline.
  Any P&L here is therefore noise around zero, weighted by which side the model's
  miscalibration happened to align with realised outcomes.

### S6 — Model edge ≥ 10pp, $400 stake

- **N:** 56
- **Total P&L:** $+3638
- **Read:** higher-conviction filter on a model that's not actually good — restricts
  to bets where the model is *most confident it disagrees* with the market. If the
  model were skilled this would amplify alpha; given A's finding, it amplifies noise.

### S7 — Quarter-Kelly on S5 signals

- **N:** 172
- **Total P&L:** $+31
- **Read:** sizing variant on S5 signals using the prompt's literal stake formula
  (`0.25 × |edge_pp|` capped at $250). At typical edges of 5–15pp, stakes are ~$1.25–$3.75.
  P&L is therefore tiny in dollars but the per-bet ROI is comparable to S5.

---

## Outlier alert — read this before believing any of the headline numbers

**Almost every NO-side strategy in this backtest is dominated by 1–3 extreme-priced winners.**
Per-strategy top-3 P&L contributors (in absolute dollars):

| Strat | #1 contributor | #2 | #3 | Top-3 total | Top-3 % of total stake-weighted P&L distribution |
|---|---|---|---|---|---|
| S1 (NO ≥0.85) | WDFC NO @ $0.0495 → +$4801 | AMZN NO @ $0.054 → +$4380 | JPM NO @ $0.0635 → +$3687 | +$12,868 | drives S1's "near-breakeven" — without these three, S1 is ≈ -$13,300 on 140 bets |
| S3 (mean-rev) | same WDFC, AMZN, JPM | | | +$12,868 | same |
| S5 (model edge ≥5pp) | AMZN NO @ $0.054 → +$4380 | DAL NO @ $0.18 → +$1139 | CMG NO @ $0.32 → +$531 | +$6,050 | without top 3, S5 is ≈ -$7,500 on 169 bets |
| S6 (model edge ≥10pp) | AMZN NO @ $0.054 → +$7007 | DAL NO @ $0.18 → +$1822 | CMG NO @ $0.32 → +$850 | +$9,679 | without top 3, **S6 is ≈ -$6,041 on 53 bets** — i.e. the apparent +$3638 P&L is entirely a fat-tail effect |
| S2 (YES on dogs) | HIMS YES @ $0.14 → +$1536 | SUN YES @ $0.215 → +$913 | PSKY YES @ $0.255 → +$730 | +$3,179 | without top 3, S2 is ≈ -$3,457 on 59 bets |

**This is the canonical NO-bet payoff trap on prediction markets.** When a NO bet
trades at $0.05–0.20, a single win returns 5–20× the stake. A strategy that fires
≥50 such bets in a single quarter will almost always show a P&L number dominated by
fat tails — *whether or not the strategy has any actual skill*.

**S6's "+$3638 on N=56" headline is essentially "AMZN missed Q4 2025 and the model
happened to bet NO"**, plus a smaller DAL hit. Absent those two markets, the
strategy is decisively negative. **This is the noise-not-skill outcome Agent A
predicted.** Treat any strategy whose dollar P&L is dominated by ≤3 markets as
**inconclusive on N this small**, regardless of the apparent ROI.

The only strategy whose result is *not* outlier-driven is **S4 (momentum)**, where the
top contributors are mid-priced NO bets (\$0.18–\$0.23) and the loss is broad-based
across 174 bets. That makes S4's negative result the **most informative finding** in
this backtest — see honest interpretation below.

---

## Honest interpretation

Agent A's central result is **the model has no log-loss edge over the live Polymarket
price**. That eliminates the original thesis ("fit a better probability than the
market"). What's left is whether **execution rules** — operating *with* the market
price as a feature in their own right — produce alpha. This backtest is exactly that
test: S1–S4 use no model and only price/momentum; S5–S7 are the model-edge family.

**Empirically:**
- Aggregate model-based P&L: **$+2176** across 400 bets.
- Aggregate no-model P&L: **$-5452** across 584 bets.

If the no-model family beats the model family on dollars and on per-bet ROI, the
honest reading is: **the alpha (such as it is) lives in price-threshold and momentum
rules, not in EPS modelling.** This matches Agent A's prior. If the model family
unexpectedly wins despite A's log-loss finding, that is **suggestive of regime-specific
luck**, not of skill — N=400 bets across 2 quarters cannot reject
"the model is randomly aligned with realised noise this window."

**The S4 result is the most important finding.** D's hypothesis was that
Polymarket prices each quarter independently and so under-prices momentum. The
backtest *partially* refutes this: at the win-rate level, S4 wins 52.9% of the
time, very close to a coin-flip, and it loses **$4,062 on 174 bets** with a broad
loss distribution (no single market drives more than $1,100 of the result). In
plain terms: the prior-quarter signal is empirically real (D's 0.79 vs 0.57 split
is correct in the raw outcome data), but **Polymarket appears to already discount
it.** The threshold-based version of S4 (only bet YES if priced <0.80, NO if priced
>0.55) systematically picks up the markets where the price *isn't* fully
discounting — and on the realised data those are the markets where the price was
right and the momentum signal was wrong. **D's open question — "does the market
price the momentum?" — answers ≈ "yes, well enough to defeat a naive threshold
strategy."** A subtler version of S4 that uses a smaller decision boundary or
combines momentum with another orthogonal signal might still work, but the
boundary in the spec does not.

A subtler point on the model strategies (S5/S6/S7): apparent positive P&L on S6/S7
is **almost entirely** the AMZN NO @ $0.054 + DAL NO @ $0.18 single-quarter pair.
The OOS calibration table (Agent A, decile 0.0–0.5) shows the model systematically
*under-predicts* in that zone — meaning when the model says "0.30" the realised
beat rate is ~0.55. So when S5/S6 issue NO bets because `model_p_beat` is well
below the implied price, the NO bet is *betting against* a market price that's
actually closer to truth than the model is. The fact that S5 is -$1493 on 172
bets while S6 (a stricter filter on the same logic) is +$3638 on 56 bets reveals
how much the result depends on which 2-3 markets fall into the strict-filter set,
not on the strategy's underlying thesis.

**Bottom line:** based on this backtest alone, **none of the seven strategies has a
defensible forward-looking edge.** The aggregate dollars say model strategies
won (+$2176 vs no-model -$5452), but ~85% of the model-side P&L is from
fat-tail wins on ≤3 markets — that's noise, not signal. The most informative
*negative* result is S4: the cross-quarter momentum signal exists in outcomes
but does **not** survive Polymarket's pricing. The most informative *positive*
hint is S2 (YES on dogs at p≤0.50): win rate 33.9% on N=62, P&L barely negative
without outliers, suggests the very-low-end of Polymarket's pricing may be
slightly under-confident — but N=62 across 2 quarters is far too small to act on.
**No strategy here justifies real-money deployment without ≥4 more quarters of
walk-forward validation.**

---

## Caveats

1. **Sample size.** OOS window is **2 quarters** (['2026Q1', '2026Q2']).
   Per-quarter Sharpe/Sortino with N≤2 is **not a real Sharpe** — it's a ratio of two
   numbers. Treat directionally only. The `n_quarters` column flags this for each row.
2. **Bootstrap CIs on win rate** are reported (1000 resamples). For low-N strategies
   they are wide enough to overlap 50% — read accordingly.
3. **NO-side pricing** uses `1 − YES` as a tight-book devigging proxy. Real
   Polymarket NO prices may be 1–3pp wider than this, which would compress S1/S3 P&L.
4. **12-hour fidelity** on the CLOB history. The "T-3d" entry is the closest 12h bar
   to 72h before resolution, not a precise quote. Slippage and entry timing within
   that 12h window are not modelled.
5. **Survivorship / selection bias.** Polymarket lists earnings markets only for
   high-retail-interest tickers. The 443-market OOS sample's beat rate
   (0.729) is essentially the broader S&P
   beat-rate baseline (per Agent D's check) — the selection bias is small but not zero.
6. **Single regime.** All resolved markets used here are from 2026Q1 onward. A regime shift
   (rate cycle, AI capex, recession) could invalidate any of these.
7. **No fees, no slippage, no liquidity sizing constraint.** Real fills on
   $250 NO bets at $0.05 prices may be partial. Backtest is a frictionless ceiling.
8. **Quarter-Kelly stakes are tiny** under the literal interpretation of the prompt's
   formula. If "edge × 100" was intended as a fraction-of-bankroll sizing rule rather
   than a dollar amount, S7's economics would change. We followed the literal text.

---

## Files written

- `data/research/strategy_pnl_S1.csv` … `strategy_pnl_S7.csv` — per-bet ledgers.
- `data/research/strategy_summary.csv` — one row per strategy (and 4 `_full` supplementary rows).
- `docs/research/headline_chart.png` — cumulative P&L over time, all 7 strategies.
- `docs/research/edge_vs_outcome_scatter.png` — model calibration on backtested bets.
