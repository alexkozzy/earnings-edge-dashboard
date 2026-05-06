# Research Protocol — pre-registered

**Session start:** 2026-05-06T18:45Z (continuation of earlier 4-agent session)
**Pre-registered before any backtest results were observed.**
**Locked.** No mid-session modifications.

## Continuation context (read first)

This session extends the earlier research session whose verdict for **earnings markets** is already published in `docs/research/STRATEGY_REPORT.md`. To avoid wasted compute:

- **Earnings strategies S1–S7 from the prior session are not re-run.** Their results are imported as-is into the verdict evidence table.
- **Two earnings strategies in this protocol's earnings list (#4 sector-correlation Kelly, #6 concentrated single-bet) were NOT in the prior 7.** Those are new and will run.
- Strategies #1, #2, #3, #5 in the earnings list have direct prior-session analogues (S5, S6, S7, and a variant of S1) — results imported.

## Hard constraints

- **Walk-forward integrity:** for each bet, training window strictly < `entry_decision_time`. Verified per bet.
- **N ≥ 80 settled bets** for any Verdict A claim.
- **Three robustness checks** required for Verdict A: feature ablation, period split, top-decile-stripped subset.
- **Pre-registered protocol locked** — additions during the session are marked `EXPLORATORY` and excluded from the verdict.
- **Alpha Vantage budget remaining today: ≤ 5 calls** (20 already burned in prior session; resets midnight UTC). Reserved for econ-data lookups only if essential.
- **Finnhub locally unavailable** (`FINNHUB_API_KEY` empty in `vercel env pull` per STATE.md gotcha). All earnings auxiliary features come from prior session's cached AV data or are skipped.
- **No deploy** until orchestrator confirms.

## Market categories in scope

| Category | Source | Pre-flight count | N-feasibility |
|---|---|---:|---|
| **Earnings** | gamma-api `tag_slug=earnings` (closed) | 856 raw / 819 used (prior) | ✅ ample |
| **Economic data releases** | gamma-api tags: `fed`, `inflation`, `cpi`, `jobs`, `fomc`, `economy` (closed, binary, dedup) | ~700 unique | ✅ ample |
| **Crypto / low-cap** | gamma-api tags: `crypto`, `bitcoin`, `ethereum` (closed, binary, `volumeNum < 50000`) | ~250 low-cap | ✅ ample |

Filters applied:
- Closed = true
- Binary outcomes (`len(outcomes) == 2`)
- For crypto: `volumeNum < 50000` to isolate the "scalping thin markets" thesis the user wants tested
- For econ: no volume filter (econ markets cluster around scheduled releases — interest is broader)
- Drop markets with no CLOB price history at T-3d entry

## Strategy variants (max 6 per category — locked)

### Earnings (6 — first 5 imported from prior session)

| # | Strategy | Status |
|---|---|---|
| 1 | Naive flat-stake on model_edge ≥ 5pp ($250) | Imported (prior S5) |
| 2 | Edge-tier sized ($400 on edge≥10pp, $250 on 5–10pp, $100 on <5pp) | Imported (prior S6 is the ≥10pp $400 slice) |
| 3 | Quarter-Kelly independent (0.25× Kelly) | Imported (prior S7) |
| 4 | Quarter-Kelly with sector correlation | **NEW — runs this session** |
| 5 | NO-only on positive-skew (mkt_p > 0.80, model_p < 0.65) | Imported (prior S1 is a relaxed variant; this strategy is stricter — also runs as new) |
| 6 | Concentrated single-bet per quarter (highest model_edge) | **NEW — runs this session** |

### Economic data (4 — fewer because hypothesis space is narrower)

| # | Strategy | Hypothesis |
|---|---|---|
| 1 | **Fade extremes** — bet against side priced > 0.90 OR < 0.10 within 24h of resolution, $250 stake | Retail piles into "obvious" outcomes near resolution; markets overshoot |
| 2 | **Pre-release drift fade** — measure 7d→1d price drift; bet against the drift direction | Hype pre-release; revert at release |
| 3 | **Within-event arb** — for events with multiple linked binary markets (e.g. CPI bucket 0.0-0.2%, 0.2-0.4%, ...), bet on the bucket where sum of complementary markets ≠ 1 | Pricing inefficiency across linked markets |
| 4 | **Inactive-market reversion** — bet on markets with low volume in last 48h whose price hasn't moved in ≥3 days, taking the cheaper side | Stale prices in thin markets |

### Crypto / low-cap (3)

| # | Strategy | Hypothesis |
|---|---|---|
| 1 | **Spread-narrowing scalp** — enter when bid-ask > 5%, exit when narrows to < 2% | Inefficient liquidity; thin books |
| 2 | **Time-decay fade on far-OTM markets** — bet NO on "Will BTC hit $X by date" markets where current spot is >20% away from $X and time-to-resolution < 14d | OTM lottery tickets are systematically overpriced |
| 3 | **Cross-venue arb to Kalshi** (if Kalshi has a parallel market) | Liquidity-pool spread |

**Note on cross-venue arb:** if Kalshi auth fails or parallel-market matching yields N<30, this strategy is auto-flagged data-constrained for the verdict.

## Success thresholds (immutable for this session)

A strategy **passes the primary test** if:
- Walk-forward Sharpe ≥ **0.75**
- Lower 95% bootstrap CI on Sharpe ≥ **0.30**
- N ≥ **80** settled bets
- Max drawdown ≤ **30%** of starting bankroll

A strategy **passes Verdict A** if it passes the primary test AND all three robustness checks at relaxed-but-positive thresholds (Sharpe ≥ 0.40 on each robustness slice).

Robustness checks:
1. **Ablation:** drop the strategy's most-important parameter (e.g. drop the model edge entirely, or relax the volume filter); does Sharpe ≥ 0.40 hold?
2. **Period split:** Sharpe ≥ 0.40 on first half AND Sharpe ≥ 0.40 on second half of the data
3. **Top-decile-stripped:** drop the top 10% of bets by P&L; does the rest still produce mean P&L per bet > 0?

## Verdict mapping

- **Verdict A** if any (strategy × category) combo passes both primary AND all three robustness checks
- **Verdict B** if all combos with N ≥ 80 fail at least one threshold
- **Verdict C** if too many combos have N < 80 due to data gaps that explain the absence of result

## Forbidden in this session

- Adding strategies beyond the 13 listed above (max 6 per category enforced)
- Reporting one cherry-picked metric per strategy
- Calling a strategy "working" when N < 80
- Ranking strategies on the same data used to fit them and presenting that as evidence
- Running any robustness check selectively to make a strategy look better
- Deploying anything to production

## Logging convention

All progress logs go to `docs/research/SESSION_LOG.md` with `## [HH:MM] <action>` entries every ~15 min.

## Order of execution

1. Pre-flight + this PROTOCOL.md commit (~5 min)
2. Agent A: discover + harvest econ + crypto market data (~25 min)
3. Once A's data lands, dispatch B (backtest), C (strategy implementations + Kalshi check), D (UI tabs + verdict banner) in parallel (~30–40 min)
4. Orchestrator synthesis: `VERDICT.md` + 3 charts (~15 min)
5. Final commit + push. **No deploy.**
6. Write `UNBLOCK_NEXT_SESSION.md` shopping list

## Open questions deferred to UNBLOCK_NEXT_SESSION.md

Items that need user action and don't block this session:
- FRED API key (if needed for econ-feature engineering)
- Coinbase / CoinGecko key (if needed for crypto-underlying features)
- Pop the AV cap by paying for a higher tier
- Kalshi API auth refresh (if used for cross-venue arb)
