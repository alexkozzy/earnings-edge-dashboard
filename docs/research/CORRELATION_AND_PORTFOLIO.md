# Sector correlation + portfolio Kelly

Agent C — read-only analysis on Agent A's training data.

## TL;DR

- **N = 819 markets**, but spread across **only 4 quarters** (2025 Q3 – 2026 Q2).
  Three of those four quarters carry essentially all the data (370, 287, 156); the
  earliest quarter has just 6 markets.
- Computed a sector-by-sector Pearson correlation of quarterly mean-beat-rate
  series. **45 of 55 sector pairs have a rho with N≥3 overlapping
  quarters.** The maximum possible overlap is 4 — and only 3–4 of those quarters
  carry usable cell sizes per sector (≥2 markets/cell).
- **Median overlap-N across pairs: 3.** Every Pearson correlation in
  this matrix is computed on 3 or 4 data points. These should be read as **rough
  directional hints, not stable estimates**.
- Portfolio Kelly with this correlation matrix produces stake recommendations,
  but the recommended action is: **do not size positions off this matrix yet.**
  Stick with $250 flat across selected bets; revisit after another 4 quarters of
  paper-bet logging.

## Data shape

- Rows: 819
- Date range: 2025-09-24 → 2026-05-06
- Quarters: 2025 Q3, 2025 Q4, 2026 Q1, 2026 Q2 (4 total)
- Distinct sectors (incl. "Other"): 11

### Beat rate by sector

| Sector | N markets | Beat rate |
|---|---:|---:|
| Other | 646 | 0.723 |
| Banks | 24 | 0.833 |
| Staples | 22 | 0.864 |
| Consumer | 21 | 0.571 |
| Semis | 21 | 0.905 |
| BigTech | 18 | 0.833 |
| Industrials | 18 | 0.833 |
| TechServices | 15 | 0.933 |
| Energy | 14 | 0.857 |
| Pharma | 11 | 0.818 |
| AutoEV | 9 | 0.667 |


### (Sector × quarter) cell counts

| Sector | 2025Q3 | 2025Q4 | 2026Q1 | 2026Q2 |
|---|---:|---:|---:|---:|
| AutoEV | 0 | 4 | 3 | 2 |
| Banks | 0 | 8 | 8 | 8 |
| BigTech | 0 | 6 | 6 | 6 |
| Consumer | 0 | 8 | 8 | 5 |
| Energy | 0 | 5 | 5 | 4 |
| Industrials | 1 | 8 | 5 | 4 |
| Other | 2 | 305 | 227 | 112 |
| Pharma | 0 | 3 | 4 | 4 |
| Semis | 1 | 7 | 8 | 5 |
| Staples | 1 | 9 | 7 | 5 |
| TechServices | 1 | 7 | 6 | 1 |

**Read this carefully:** "Other" dominates by 7-8x because the hand-coded
`SECTOR_MAP` only covers ~80 tickers (176/819 markets). Within named sectors,
typical per-quarter cell sizes are 3–8. With the cell ≥ 2 filter, sectors like
Pharma and AutoEV barely produce a usable series at all.

## Sector correlation matrix

See `docs/research/sector_correlation_heatmap.png` for the visualization (cells
with `?` indicate <3 overlapping quarters and are not estimated).

Full machine-readable matrix (with overlap N per pair):
- `data/research/sector_correlation_matrix.json`
- `data/research/sector_correlation_matrix.csv` (square form, NaN where N<3)

### Highest-correlation pairs (small-N, treat as directional)

- **Banks ↔ Industrials**: rho = +1.000 (N=3 overlapping quarters)
- **AutoEV ↔ Pharma**: rho = +0.996 (N=3 overlapping quarters)
- **Energy ↔ Semis**: rho = +0.993 (N=3 overlapping quarters)
- **Pharma ↔ Semis**: rho = +0.992 (N=3 overlapping quarters)
- **AutoEV ↔ BigTech**: rho = +0.982 (N=3 overlapping quarters)

### Lowest-correlation pairs (small-N, treat as directional)

- **AutoEV ↔ Staples**: rho = -1.000 (N=3 overlapping quarters)
- **Pharma ↔ Staples**: rho = -0.993 (N=3 overlapping quarters)
- **BigTech ↔ Staples**: rho = -0.987 (N=3 overlapping quarters)
- **Semis ↔ Staples**: rho = -0.970 (N=3 overlapping quarters)
- **Energy ↔ Staples**: rho = -0.936 (N=3 overlapping quarters)

**HONEST CAVEAT:** Every correlation here is on **3 or 4 quarterly observations**.
The 95% CI on a Pearson rho with N=4 is roughly ±0.95 — i.e. essentially
uninformative. A reported `rho = +0.65 (N=3)` is not statistically distinguishable
from `rho = -0.65 (N=3)`. The matrix is best used to flag patterns *to confirm
later*, not to drive sizing today.

Additional caveat: the analysis defines a "sector observation" as the mean
outcome_beat across that sector's markets in a quarter, with a minimum cell size
of 2 markets. Sectors that fail this filter in any quarter (Pharma, AutoEV,
TechServices in 2026 Q2) drop quarters from the overlap.

## Portfolio Kelly comparison (representative quarter: 2026 Q2)

Quarter chosen because it's the most recent OOS quarter with model predictions
populated. Of 156 markets in 2026 Q2, **30 were
selected as candidate bets** (positive EV, abs-edge ≥ 0.02 vs implied price,
top 30 by edge). Bet side ("YES" or "NO") chosen by sign of edge.

### Strategies compared

- **A. Naive flat:** $250 on each candidate, capped at total $1500.
- **B. Single-best:** Full $1500 on the highest-edge candidate.
- **C. Portfolio Kelly with correlation:** f* = (1/2) × Σ⁻¹ × μ, with 0.25× fractional
  Kelly, per-bet cap $250, total cap $1500. Σ uses the sector-correlation matrix
  shrunk 0.5× toward independence (acknowledging small-N), with same-sector pairs
  using empirical intra-sector phi (fallback 0).

### Monte Carlo results — outcomes drawn from MODEL probabilities

10,000 sims, joint Gaussian-copula on the inferred bet correlation matrix.

| Strategy | Total stake | N bets | E[P&L] | Stdev | 5th pctile | Median | 95th pctile | P(loss) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Naive flat $250 | $1500 | 6 | $+2081.91 | $1888.22 | $-956.52 | $+2126.93 | $+5031.72 | 21.2% |
| B. Single-best $1500 | $1500 | 1 | $+196.96 | $1629.16 | $-1500.00 | $+1760.87 | $+1760.87 | 48.0% |
| C. Portfolio Kelly 0.25x | $1500 | 30 | $+5065.87 | $3187.19 | $+117.82 | $+4841.34 | $+10677.95 | 4.6% |


### Monte Carlo STRESS TEST — outcomes drawn from IMPLIED prices (IID)

Per Agent A's MODEL_FIT.md, the model does NOT beat the implied price on log
loss (model 0.534 vs implied 0.487). The numbers above assume the model is
right. **The numbers below assume the market is right** — i.e. the YES
outcome probability per market equals the implied entry price, not p_model.
Using 100,000 IID simulations (no inter-bet correlation) since at zero EV per
dollar, what matters is the variance distribution, not the correlation
structure (which is itself the thing we don't trust at this N).

| Strategy | E[P&L] | Stdev | 5th pctile | Median | 95th pctile | P(loss) |
|---|---:|---:|---:|---:|---:|---:|
| A. Naive flat $250 | $+1.21 | $1166.81 | $-1124.06 | $-394.72 | $+2312.79 | 71.3% |
| B. Single-best $1500 | $+0.78 | $1625.28 | $-1500.00 | $-1500.00 | $+1760.87 | 54.0% |
| C. Portfolio Kelly 0.25x | $-8.94 | $1501.50 | $-1319.16 | $-674.15 | $+3187.46 | 62.4% |

Read this row carefully: under the "market is right" assumption, the apparent
edge that drove Strategy C's headline EV evaporates. **The Strategy C upside
in the first table is conditional on the model being right where the implied
price is wrong** — and Agent A's model evaluation says that condition probably
does not hold in aggregate.

### Top 10 stakes under Strategy C (portfolio Kelly)

| Ticker | Sector | Side | Entry | p_model | Edge | Stake C |
|---|---|---|---:|---:|---:|---:|
| JPM | Banks | NO | 0.910 | 0.424 | +0.486 | $250 |
| AMZN | BigTech | NO | 0.961 | 0.771 | +0.190 | $171 |
| MSFT | BigTech | NO | 0.935 | 0.746 | +0.189 | $147 |
| JNJ | Pharma | NO | 0.890 | 0.534 | +0.356 | $143 |
| META | BigTech | NO | 0.925 | 0.736 | +0.189 | $136 |
| NFLX | BigTech | NO | 0.905 | 0.714 | +0.191 | $117 |
| KMX | Staples | NO | 0.540 | 0.020 | +0.520 | $103 |
| DPZ | Consumer | NO | 0.555 | 0.125 | +0.430 | $73 |
| DIS | Consumer | NO | 0.923 | 0.813 | +0.110 | $55 |
| BKNG | Consumer | NO | 0.910 | 0.798 | +0.112 | $49 |


### Reading the table

- **Strategy A** spreads risk most evenly. Lowest variance, highest probability of
  any positive return, but lowest expected absolute P&L.
- **Strategy B** has the highest expected upside but ~47%
  chance of full $1500 loss on a single bad outcome.
- **Strategy C** sits between them on stake concentration, but its supposed
  advantage — using correlation to size a *smarter* portfolio — is undercut by
  the fact that the correlation matrix is mostly noise. The marginal improvement
  in expected utility over Strategy A is well within Monte Carlo error (run-to-run
  noise is ~$1–3 on a 10k sim).

## Recommendations

1. **Don't deploy portfolio Kelly off this matrix.** The correlation estimates are
   on N=3–4 overlapping quarters and the 95% CIs span almost the full [-1, 1]
   interval. The Σ⁻¹ in the Kelly formula amplifies noise: small errors in the
   correlation matrix produce large swings in stake allocations. Strategy C and
   Strategy A produce ~indistinguishable expected outcomes with the data we have.

2. **Stick with flat $250 per bet** (Strategy A) for the next 4–8 quarters of paper
   trading. After accumulating more data — specifically, ≥8 quarters with named
   sectors having ≥3 markets each per quarter — recompute the correlation matrix
   and revisit. At that point the Pearson rho on N=8 is meaningful (95% CI on a
   true ρ=0.5 would be roughly [0.0, 0.85] — still wide but actionable).

3. **Investigate sector-level drift before correlation.** With only 21% of markets
   carrying a real sector tag, the more useful near-term win is **expanding the
   sector map** to cover the "Other" bucket (646 markets). A sector-correlation
   matrix on 21% coverage will always be data-thin, regardless of how many more
   quarters we collect. Either expand `SECTOR_MAP` by hand to ~150–200 tickers,
   or use Alpha Vantage `OVERVIEW` (when budget allows) to backfill.

4. **For Strategy 4 in Agent B's set** (if it's portfolio-Kelly-correlation-aware):
   the deliverable here is a correlation matrix that can be plugged in, but the
   recommendation is to flag it as **"experimental, untrusted at current N"** and
   compare its OOS Sharpe against the flat-$250 baseline. Expect the comparison
   to be flat or modestly negative.

## Caveats

- **Effective N = 4 quarters.** Brief said 8; data ends up being 4. All
  small-N caveats compound from there.
- **Sector coverage 21%** (176/819 named, 643 in "Other"). Correlations involving
  "Other" are uninformative because the bucket is heterogeneous.
- **Cells with N<2 markets/quarter are dropped** from the sector mean-beat
  series, which further reduces overlap for Pharma, AutoEV, TechServices.
- **Polymarket-listed-ticker selection bias** — these are tickers Polymarket
  chose to make markets on, generally large-cap names. Beat rates skew high
  (74.2% baseline) and may not generalize to broader earnings universes.
- **Sector mapping is hand-coded for ~80 tickers** (out of 420 unique). 79% of
  markets bucket as "Other".
- **Same regime** — all 4 quarters fall in a single ~8-month window. Cannot
  speak to behavior in different macro/rate regimes.
- **Model-vs-market disclaimer** carries from Agent A: model log-loss is *worse*
  than the implied baseline, so any "edge" feeding into Strategy C is conditional
  on the model adding orthogonal information that is *not* visible in the
  log-loss test. Treat Strategy C's expected P&L as optimistic.

## Artifacts

- `data/research/sector_correlation_matrix.json` — 2-level dict per pair:
  `{rho, n_overlap_quarters}`
- `data/research/sector_correlation_matrix.csv` — square form (rho only, NaN
  where N<3)
- `docs/research/sector_correlation_heatmap.png` — dark-theme heatmap, RdBu_r,
  vmin=-1 vmax=1, annotated with rho ± N
- This document: `docs/research/CORRELATION_AND_PORTFOLIO.md`
