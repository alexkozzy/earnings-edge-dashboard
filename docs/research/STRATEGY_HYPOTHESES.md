# Strategy Hypotheses — pre-registered, blind to results

**Author:** Agent C
**Date:** 2026-05-06
**Status:** Written BEFORE `BACKTEST_RESULTS.md` was opened or any per-strategy CSV was inspected. This document is the pre-registration of intent for the 13 strategies locked in `PROTOCOL.md`. Confidence ratings are deliberately conservative; the prior session's earnings work strongly informs my expectations for E-strategies, but I have no information on EC- or CR- strategies beyond first principles and the data-availability sheet.

Why this document exists: a strategy that "works" on backtest can be (a) capturing a real, durable, mechanism-driven edge or (b) overfit noise that happened to align with the rule. Pre-registering the *mechanism* and the *expected sign* lets the orchestrator distinguish between the two when results land. A strategy I rated 4/5 confidence that prints +1.5 Sharpe is a different beast than one I rated 1/5 that prints +1.5 Sharpe — the second is almost certainly noise.

ASSUMPTIONS I'M MAKING (surfaced for the orchestrator to reject if wrong):

1. The "model_edge" referenced in E1–E4 is the same model from the prior session (a logistic regression dominated by `polymarket_implied_p_beat` itself, with sparse Alpha-Vantage EPS features). The prior report shows this model is *worse* than just using the implied price — meaning any "edge" it produces is largely synthetic.
2. The earnings backtest re-uses the same 819-market dataset. No new earnings data was harvested.
3. The econ + crypto datasets (785 + 219 markets) were just landed by Agent A and have NOT been seen by any model — these are first-look strategies on fresh data, which is a more honest pre-registration setting than for earnings.
4. Slippage modeling is consistent with prior session: entry_no_price ≈ 1 − entry_yes_price, no orderbook depth consumed. Real fills will be worse, especially in thin crypto.
5. "Walk-forward" is enforced by Agent B per `PROTOCOL.md`. I'm not auditing that — Agent B owns it.

---

## E1 — Naive flat-stake on model_edge ≥ 5pp ($250)

**Hypothesis:** Markets where the EPS-surprise model disagrees with Polymarket's implied price by ≥ 5 percentage points are systematically mispriced; betting the model side at flat $250/market produces positive Sharpe.

**Mechanism:** Behavioral — retail anchors on recent guidance, sell-side analyst consensus, and the prior earnings beat/miss; the model sees through to historical surprise distribution. *Or* informational — model picks up sector-level base rates that retail under-weights.

**Expected sign:** Sharpe near zero, very slightly negative. The prior session's S5 (this exact strategy) booked −$1,493 on N=172 OOS bets with 0.576 win rate — below the 0.74 OOS base rate, which is the giveaway: the model says YES on markets that pay off below average, meaning the "edge ≥ 5pp" filter is selecting precisely the markets where the implied price is *correct* and the model is wrong. This is a result imported from the prior session, not freshly run.

**Failure mode:** Sharpe ≥ +0.30 on N≥80 with broad (not outlier-driven) win-rate above the base rate of YES outcomes. Would falsify my belief that the model is dominated by the implied-price feature.

**Confidence pre-results (1-5):** 1 — high conviction this fails. The prior session already showed it.

### Decision rule

```
for each market m in OOS window:
    p_market = entry_yes_price_3d(m)
    p_model  = model.predict_proba(features(m))[1]
    edge = p_model - p_market
    if abs(edge) >= 0.05:
        side = YES if edge > 0 else NO
        stake = 250  # flat
        bet(m, side, stake, entry_price=p_market if side==YES else 1-p_market)
```

---

## E2 — Edge-tier sized ($400 / $250 / $100 by edge magnitude)

**Hypothesis:** The model's edge magnitude is monotone-informative — bigger gaps mean bigger mispricings — so concentrating stake at higher edge tiers produces positive Sharpe even if a flat-stake version doesn't.

**Mechanism:** If any signal exists in the model, it should be loudest at extreme edge values where the implied-price feature gets overwhelmed by other features.

**Expected sign:** Slightly negative. Prior session's S6 (≥10pp at $400) printed +$3,638 headline but stripping 2 fat-tail wins (AMZN-NO, DAL-NO) leaves it at −$5,200. So the *concentrated-tier* version specifically benefits from one very-low-price NO entry that paid 18× — which is a measurement-noise artifact in extreme-low-price entries, not skill. The expected Sharpe is therefore close to zero but with a wide CI driven by re-occurrence (or absence) of those fat-tail outcomes in the test window.

**Failure mode:** Robustness check 3 (top-decile stripped) leaves the strategy still positive on mean P&L. If it does, fat tails aren't the whole story and tiered sizing is recovering real signal.

**Confidence pre-results (1-5):** 1 — believe this fails the robustness checks even if the headline is positive. Outliers are doing all the work.

### Decision rule

```
for each market m in OOS window:
    edge = abs(model_p(m) - p_market(m))
    if   edge >= 0.10: stake = 400
    elif edge >= 0.05: stake = 250
    else:              stake = 100
    if edge >= 0.05:  # threshold to bet at all
        bet(m, side=sign(model_edge), stake=stake)
```

---

## E3 — Quarter-Kelly independent (0.25× Kelly per market)

**Hypothesis:** Sizing each bet by a fractional Kelly fraction matched to per-market edge produces tighter risk-adjusted returns than flat sizing, especially when the underlying edges are small.

**Mechanism:** Kelly maximizes log-wealth growth rate; quarter-Kelly is the standard defensive haircut. If the model's edge magnitude has *any* informational content, Kelly should harvest it efficiently.

**Expected sign:** Near zero. Prior session's S7 (this strategy) booked +$31 on tiny aggregate stake (~$504). The Kelly fractions came out near zero because the model's edges came out near zero, which is itself a tell that the model isn't producing real edge. Sharpe likely near zero with extremely thin sample, possibly N<80 effective.

**Failure mode:** Sharpe ≥ 0.40 on N≥80 with non-trivial total stake (> $5K). Would mean Kelly is finding edge that flat-stake masks.

**Confidence pre-results (1-5):** 1 — Kelly with garbage edges produces tiny stakes; tiny stakes produce zero PnL; zero PnL is *consistent with* a no-edge hypothesis. This will look "flat" not "negative", which is honest.

### Decision rule

```
for each market m:
    p_model = model_p(m); p_market = entry_yes_price_3d(m)
    edge    = p_model - p_market
    if abs(edge) < 0.05: skip
    side = YES if edge > 0 else NO
    p_win = p_model if side==YES else (1 - p_model)
    odds_decimal = 1 / (p_market if side==YES else 1 - p_market)  # b = odds-1
    b = odds_decimal - 1
    f_kelly = (p_win * (b+1) - 1) / b   # standard Kelly
    f = max(0, 0.25 * f_kelly)          # quarter-Kelly, no shorts
    stake = f * bankroll
    bet(m, side, stake)
```

---

## E4 — Quarter-Kelly with sector correlation (NEW)

**Hypothesis:** Modeling sector co-movement (banks rise/fall together; tech-AI moves as a bloc) and discounting per-bet Kelly fractions by correlation-implied effective N produces materially better Sharpe than independent Kelly.

**Mechanism:** Independent Kelly assumes uncorrelated bets. If two bank stocks both have model edge ≥ 5pp on a CPI-driven session, their PnLs are correlated — independent Kelly over-bets the joint exposure. Correlation-adjusted Kelly shrinks each fraction by an effective-N factor.

**Expected sign:** Lower total stake than E3, slightly higher per-bet Sharpe in theory, but Agent C's correlation matrix from the prior session was built on *3 quarterly observations per pair* — Σ⁻¹ of that is essentially noise. The realized effect on this 4-quarter dataset should be approximately the same as E3 (near-zero PnL) but with even thinner stakes due to correlation penalty.

**Failure mode:** Strategy produces *better* Sharpe than E3 with a meaningfully different bet portfolio. Would mean the correlation matrix has true signal at this N — which I doubt.

**Confidence pre-results (1-5):** 2 — slightly more confident this fails *cleanly* (i.e. produces null result) than E3. The mechanism is sound but the data depth is insufficient.

### Decision rule

```
Σ = sector_correlation_matrix  # from prior session, 11×11
for each market m in OOS window:
    base_kelly = quarter_kelly(m)   # same as E3
    sector(m) = sector_lookup(ticker)
    correlated_open = sum(open_bets where sector_corr(s, sector(m)) > 0.4)
    eff_n = 1 + correlated_open      # naive effective-bet shrinkage
    stake = (base_kelly / eff_n) * bankroll
    bet(m, side, stake)
```

---

## E5 — NO-only on positive-skew (mkt_p > 0.80, model_p < 0.65)

**Hypothesis:** Markets priced as overwhelming favorites (≥ 80% YES) where the model strongly disagrees (model says < 65% YES) are systematically over-favored; betting NO at low prices captures asymmetric upside (small price, large payoff) and the residual probability of an "obvious" miss.

**Mechanism:** Behavioral — retail anchors on positive sell-side narrative ("this company always beats") and ignores the small but real miss probability. The model, seeing sector-level miss rates, prices the tail more soberly. NO-side payoff structure (cost 0.05–0.20, return 1.00 if right) is the asymmetric-bet form factor that benefits most from any genuine miscalibration in the high-price tail.

**Expected sign:** Negative Sharpe. Prior session's S1 (a relaxed variant: NO on p≥0.85, no model filter) lost $417 OOS / $5,277 full sample. The stricter model-conditional version may be slightly less bad because the "model_p < 0.65" filter screens out p≥0.85 markets where the model also says ≥85% — but the prior model is dominated by implied-price, so model_p on a 0.90-priced market will rarely be below 0.65 unless features explicitly contradict, which means this strategy will fire on a small, weird subset of bets dominated by data-quirk corner cases.

**Failure mode:** Top-decile-stripped subset still has positive mean PnL. Means the strategy is spread across many small wins, not 1–2 lottery hits.

**Confidence pre-results (1-5):** 1 — high conviction this loses money. The Decile 10 calibration finding from the prior session showed ~9pp overestimate at the top, but bid-ask + slippage cost on NO entries at $0.05–0.15 entries averages worse than that miscalibration. The mechanism exists; the friction kills the trade.

### Decision rule

```
for each market m in OOS window:
    p_market = entry_yes_price_3d(m)
    p_model  = model_p(m)
    if p_market > 0.80 and p_model < 0.65:
        side = NO
        entry_no = 1 - p_market   # devig approximation
        stake = 250
        bet(m, side=NO, entry_price=entry_no, stake=stake)
```

---

## E6 — Concentrated single-bet per quarter (NEW)

**Hypothesis:** The model's ranking is informative even if its absolute edges aren't — picking the single highest-model-edge market per quarter and betting it large produces positive Sharpe over the 4-quarter window because rank is preserved even when calibration is noisy.

**Mechanism:** Even if a logistic regression has poor Brier score, its argmax(edge) ranking can still capture the *most* mispriced market in a quarter — because rank-based metrics are robust to calibration errors. With 4 quarters → 4 bets, this is a tiny-N strategy testing whether rank-of-edge has any signal.

**Expected sign:** Wide-CI noise. With N = 4 (one bet per quarter), there's no statistical power. The strategy will *headline* either very positive or very negative depending on whether the top-edge market in each quarter happened to be one of the AMZN-style fat-tail wins. Win rate is uninformative at N=4.

**Failure mode:** N≥80 threshold automatically triggers Verdict B/C (data-constrained). Even if Sharpe is positive, the protocol disqualifies it.

**Confidence pre-results (1-5):** 1 — this strategy *cannot* pass the protocol's N≥80 threshold by construction (4 quarters × 1 bet = 4 bets). It's a sanity check that rank-based concentration doesn't accidentally beat the diversified strategies. Whatever it prints is largely noise.

### Decision rule

```
for each quarter q in OOS window:
    candidates = [m for m in OOS_markets if m.quarter == q]
    if not candidates: continue
    m_best = argmax(candidates, key=lambda x: abs(model_edge(x)))
    side = YES if model_edge(m_best) > 0 else NO
    stake = 1500   # concentrated
    bet(m_best, side, stake)
```

---

## EC1 — Fade extremes (econ; bet against side priced > 0.90 or < 0.10 within 24h, $250)

**Hypothesis:** As economic-data resolution approaches (≤ 24h), retail piles into the side that "looks obvious" given consensus expectations, pushing prices to extremes that overshoot the true probability; fading that side produces positive Sharpe.

**Mechanism:** Behavioral — proximity to resolution amplifies the urge to "lock in" a perceived sure thing. Market makers widen spreads near resolution, and uninformed flow becomes a larger share of volume. *Plus* — for econ data specifically, the resolution event itself is binary and stochastic (CPI prints with measurement noise; Fed surprises happen). Pricing > 90% within 24h leaves only the ~10% true-uncertainty tail unhedged.

**Expected sign:** Positive Sharpe in the 0.4–0.8 range. Two reasons: (a) the prior literature on prediction-market overshoots near resolution is well-documented (Manski 2006, Wolfers/Zitzewitz on Iowa Electronic Markets); (b) econ data has genuine release-day variance — CPI ±10bp surprises happen. The 1−0.90 = 10% NO-side payoff structure makes one win cover ~10 losses.

**Failure mode:** Sharpe ≤ 0 across N≥80, OR win rate on NO bets < 12% (close to inverse of average entry price). Would mean Polymarket prices the resolution-day risk efficiently and the "obvious overshoot" is fictional.

**Confidence pre-results (1-5):** 3 — moderate. The mechanism is plausible and well-documented in academic prediction-market literature, but Polymarket-econ has more institutional flow than I'd guess (macro hedge funds, journalists, bored quants), which competes away the retail overshoot. Also: for "Fed cuts in 2023" priced at 0.006 (per the dataset sample), the math is brutal — a 600/1 odds bet that needs to hit 1-in-167 to break even. Many of the dataset's >0.90 markets are probably similarly extreme, where transaction friction kills any tiny calibration miss.

### Decision rule

```
for each market m in econ OOS:
    if m has CLOB price within 24h of close:
        p_24h = clob_price_at(m, t=close - 24h)
        if p_24h > 0.90:
            bet(m, side=NO, entry=1-p_24h, stake=250)
        elif p_24h < 0.10:
            bet(m, side=YES, entry=p_24h, stake=250)
```

---

## EC2 — Pre-release drift fade (measure 7d→1d drift; bet against)

**Hypothesis:** Markets exhibit a hype-driven drift in the week before an econ release — prices move systematically in the direction of consensus speculation — and revert at release as actual data prints with high variance. Fading the 7d→1d drift produces positive Sharpe.

**Mechanism:** Information clustering — econ markets see narrative-driven flow as commentators and Twitter analysts converge on a view ("September CPI will print hot because gas prices..."). The convergence pushes price one way, but the actual release has a true-randomness component that doesn't respect the narrative. This is a classic news-fade pattern.

**Expected sign:** Slightly positive Sharpe (0.2–0.5). The drift signal is real in many traditional asset classes (FX, equities) around macro releases; the question is whether Polymarket has enough liquidity for it to manifest. With econ markets averaging higher volume than crypto, this should be measurable. But: 7d→1d drift on weekly-resolution markets has limited dynamic range — prices can only move so far in a week — so the magnitude of the fade-edge will be capped.

**Failure mode:** No relationship between 7d→1d drift sign and fade PnL. Means Polymarket's pre-release price discovery is efficient and the drift IS the new information, not noise to fade.

**Confidence pre-results (1-5):** 2 — somewhat skeptical. News-fade works on liquid 24h markets but Polymarket-econ has fewer data points per market and the "drift" in question may just be true Bayesian updating that I shouldn't be fading. Strong prior that the prior session's lesson — "Polymarket already prices known signals" — generalizes from earnings to econ.

### Decision rule

```
for each market m in econ OOS:
    p_7d = clob_price_at(m, t=close - 7d)
    p_1d = clob_price_at(m, t=close - 1d)
    if p_7d is None or p_1d is None: skip
    drift = p_1d - p_7d
    if abs(drift) < 0.05: skip   # not a real drift
    side = NO if drift > 0 else YES   # fade the move
    entry = p_1d if side == YES else (1 - p_1d)
    bet(m, side, entry, stake=250)
```

---

## EC3 — Within-event arb (linked binary buckets, sum ≠ 1)

**Hypothesis:** For econ events with multiple linked binary markets (e.g. CPI bucketed as "0.0–0.2%", "0.2–0.4%", "0.4–0.6%", ...), the sum of YES prices across buckets should equal 1.0. Buying the cheap side of any bucket where the sum is ≠ 1 is arbitrage.

**Mechanism:** Pure pricing inefficiency from market segmentation — different buckets have different liquidity, different flow, and prices don't auto-arbitrage because the markets are technically distinct. Classic linked-market arb.

**Expected sign:** Positive Sharpe IF the linked markets exist and are well-grouped. Arbs of this form are typically 0.5–2% gross-of-fees opportunities, and on Polymarket fees are minimal, so pure-arb Sharpe should be high (1.0+) with low variance.

**BUT — major data-availability concern:** I don't see a `linked_event` column in the unified parquet. Without a way to group the 785 econ markets into "this CPI release" vs "that CPI release", this strategy is *not implementable on the available dataset* — Agent B would need to do fuzzy event-clustering on questions like "Will CPI YoY print 2.5–3.0%?" + "Will CPI YoY print 3.0–3.5%?" — which is itself a hard NLP problem on free-text questions.

**Failure mode:** Strategy reports N < 30 → auto-flagged data-constrained per protocol. OR strategy reports 0 valid arb opportunities — meaning either the linked-market structure doesn't exist on Polymarket econ, or the clustering didn't find them.

**Confidence pre-results (1-5):** 2 — *if* linked markets exist and Agent B finds them, the math is unforgiving and arbs near 1% gross are highly likely; *if* the data structure doesn't support clustering (which is what I expect), this strategy is N=0 and gets a "data-constrained" verdict.

### Decision rule

```
events = cluster_econ_markets_by_release_date_and_metric(econ_markets)
# e.g. group all "CPI YoY March 2026" bucket markets together
for each event E with ≥3 linked buckets:
    for each market m in E at entry time:
        prices[m] = entry_yes_price_3d(m)
    s = sum(prices.values())
    if abs(s - 1.0) > 0.05:    # ≥5pp arb opportunity
        if s > 1.05: bet NO on most-overpriced m, stake=250
        if s < 0.95: bet YES on cheapest m, stake=250
```

---

## EC4 — Inactive-market reversion (low volume + price flat ≥ 3d, take cheap side)

**Hypothesis:** Markets with low recent volume and price stagnant for ≥ 3 days have stale prices that haven't absorbed new information; betting the cheap side at these stale prices captures mean reversion when the market eventually re-prices.

**Mechanism:** Liquidity-driven inefficiency — when nobody is trading a market, the last-traded price persists even as the underlying probability evolves with new information. The market-maker doesn't update because there's no flow forcing them to. Eventually an informed trader notices and corrects, paying the stale-price taker.

**Expected sign:** Slightly positive Sharpe (0.2–0.5) IF you can identify "cheap side" reliably. The signal is highest in the lowest-volume tail of econ markets — where there's the most stagnation but also the worst liquidity to exit.

**Big caveat:** "cheap side" is ambiguous — at p=0.20, NO is the cheap side (entry $0.80) but cheap side ≠ correct side. The strategy requires a separate "fair value" anchor. Without one, it degenerates to "always bet NO on low-priced markets" which has obvious selection bias toward markets that ended up resolving NO (=yes, by construction; the market is low-priced *because* it's expected to resolve NO).

**Failure mode:** Sharpe near zero or negative — would mean stale prices on average ARE the correct prices, just with no new info to update them. (Which is plausible: an econ market with no volume for 3 days may be one where the consensus is clear and there's nothing left to trade on.)

**Confidence pre-results (1-5):** 2 — the mechanism is real but the implementation choice ("cheap side") has selection-bias problems. Likely produces a weak signal that doesn't survive robustness checks.

### Decision rule

```
for each market m in econ OOS:
    vol_48h = volume_in_window(m, [close-48h, close])
    px_3d = [clob_price_at(m, t=close-i*12h) for i in 6..0]  # 3 days of 12h buckets
    if max(px_3d) - min(px_3d) > 0.02: skip  # not flat
    if vol_48h > 1000: skip  # not inactive
    p = px_3d[-1]
    side = YES if p < 0.5 else NO
    stake = 250
    bet(m, side, entry=(p if side==YES else 1-p), stake=stake)
```

---

## CR1 — Spread-narrowing scalp (enter on bid-ask > 5%, exit at < 2%)

**Hypothesis:** Crypto/low-cap markets with wide bid-ask spreads (>5%) have spreads that systematically narrow as time passes and information arrives; entering at mid-price during a wide-spread period and exiting when the spread narrows captures the spread-compression.

**Mechanism:** Inventory-management — market makers price wide when their inventory is unbalanced or when uncertainty is high. As more trades happen, inventory rebalances and spreads narrow. A patient trader entering at mid during wide periods captures (spread_t0 − spread_t1)/2 per round-trip.

**MAJOR CAVEAT:** This is the strategy I most expect to be *unimplementable on the available data*. The unified parquet has `entry_yes_price_3d`, `entry_yes_price_1d`, `entry_yes_price_late` (mid prices, presumably) but NOT bid/ask spreads at any timestamp. Without bid/ask, "enter on spread > 5%" is undefined. Agent B would need to either (a) reconstruct bid/ask from CLOB book history (which I'm not sure was harvested) or (b) substitute "low volume" as a proxy for "wide spread" — which changes the strategy entirely.

**Expected sign:** If implementable: positive Sharpe (0.5+) on a small-N high-edge subset. If implemented via volume proxy: near-zero to slightly negative — volume is correlated with spread but not synonymous, so the proxy strategy is just betting on illiquid markets, which has its own biases.

**Failure mode:** N<30 (data unavailable) or near-zero Sharpe with proxy. Both lead to data-constrained verdict.

**Confidence pre-results (1-5):** 2 — high confidence the *mechanism* exists, low confidence it's measurable on this dataset.

### Decision rule

```
for each market m in crypto OOS (volume<50k):
    book = clob_orderbook_at(m, t=entry)  # may not exist in dataset
    if book is None: skip (or use volume<5k as proxy)
    spread = book.ask - book.bid
    mid    = (book.ask + book.bid) / 2
    if spread / mid > 0.05:
        # enter at mid, both YES and NO sides simultaneously? or choose direction?
        # naive: buy YES at ask=mid+spread/2, hope to sell at later mid
        enter at mid; track until spread narrows to < 0.02 of mid; exit at then-mid
```

---

## CR2 — Time-decay fade on far-OTM markets (BTC>X with spot >20% away, T<14d → bet NO)

**Hypothesis:** "Will BTC hit $X by date" markets where current spot is > 20% away from $X and resolution is within 14 days are systematically overpriced as lottery tickets; betting NO captures the time-decay edge as price rolls toward $0.

**Mechanism:** Behavioral — retail buys lottery tickets at non-rational expected values because the payoff structure (small entry, large win) is exciting. The expected value of a 14-day BTC move ≥ 20% implies a true probability typically <10% (BTC realized vol ~60% annualized → 14-day vol ~16%, so ≥20% move is a >1σ event with probability ~16% if symmetric). YES prices on these markets often sit at 5–15%, which is roughly fair *or slightly underpriced*. NO at $0.85–0.95 has tiny edge per trade but high win rate.

**Expected sign:** Marginally positive Sharpe (0.2–0.5) on high-frequency small wins, BUT massive tail risk — a single 14-day BTC rally that hits an OTM strike wipes out 5–10 small wins. With only 219 crypto markets in the dataset and a date range of Aug 2024 → Dec 2025 (one bull-market chunk), there's serious risk that one ETH or BTC rally event blows out the whole strategy in this exact window.

**Failure mode:** Period split fails — first half of the data has positive Sharpe, second half has a single rally that wipes out gains (or vice versa). Robustness-by-period check catches this.

**Confidence pre-results (1-5):** 2 — high confidence in the cross-sectional mechanism, low confidence the 219-market sample window doesn't include 1–2 disaster bull-rally events that dominate. The robustness-by-period check is the likely killer.

### Decision rule

```
for each market m in crypto OOS:
    if not "Will <COIN> hit $<X> by <date>" pattern: skip
    coin, strike, deadline = parse(m.question)
    spot = lookup_spot_price(coin, t=entry)  # need a spot price source
    days_to_resolve = (deadline - entry).days
    if days_to_resolve > 14: skip
    if abs(spot - strike) / spot < 0.20: skip  # not far-OTM
    p_yes = entry_yes_price_3d(m)
    if p_yes > 0.30: skip  # not "lottery ticket" priced
    side = NO
    entry_no = 1 - p_yes
    stake = 250
    bet(m, side, entry_no, stake)
```

---

## CR3 — Cross-venue arb to Kalshi

**Hypothesis:** Polymarket and Kalshi list parallel markets on the same underlying event (e.g. "BTC > $100K by Dec 31") with different pricing due to user-base differences and liquidity-pool segmentation; buying the cheap side on one venue and selling on the other captures the spread.

**Mechanism:** Pure liquidity-pool segmentation — Kalshi is US-regulated, attracts a different demographic (older, more institutional, more rule-following) than Polymarket (offshore, crypto-native, more degen). The two pools' marginal traders disagree on probabilities, and there's no hedger arb-ing the gap because most participants only have an account on one venue.

**Expected sign:** Positive Sharpe (1.0+) IF parallel markets exist and matching is feasible — arbs are nearly risk-free if you can hold both sides to resolution. The classic concern is *capital efficiency* (need bankroll on both venues) and *resolution-source mismatch* (the two venues might use different oracles, leading to non-arb cases where one resolves YES and the other NO).

**MAJOR DATA-AVAILABILITY CONCERN:** Per Part 2 of my mandate, Kalshi auth is empty in the local config (`api_key: ""` in `pto-kalshi-copier/config.yaml`, `kalshi.pem` is 0 bytes). The public `api.elections.kalshi.com` market-listing endpoint *is* reachable without auth, and I'm running a pairing script against it now. Outcome unknown at write-time.

**Expected number of parallel markets:** Best guess 0–20 well-matched pairs in the date range. Kalshi's "settled" universe is heavily political (election markets) plus sports plus a small number of crypto/econ. Most Polymarket econ markets ("Fed cut by Jan 31?") have Kalshi analogues, but date alignment is fuzzy because Polymarket's `end_date` is Polymarket's resolution timestamp, not the underlying event date — so my matching heuristic (within 7 days, same topic) may miss many genuine pairs or admit spurious ones.

**Failure mode:** N < 30 paired markets with both-venue prices captured at the same entry timestamp → data-constrained per protocol. This is the most likely outcome.

**Confidence pre-results (1-5):** 3 — the *mechanism* is essentially guaranteed real (it's an arb of segmented user bases), and the prior session's STRATEGY_REPORT.md *recommended this strategy specifically* as the highest-EV unfalsified direction. But the data-availability constraint on Kalshi side will dominate; my best guess is N too small to reach Verdict A on this run, with a note that the next session should harvest Kalshi properly.

### Decision rule

```
pairs = match_polymarket_kalshi(category in {econ, crypto})  # Part 2 output
for each pair (poly_m, kalshi_m):
    p_poly  = entry_yes_price_3d(poly_m)
    p_kalshi = kalshi_entry_yes_price(kalshi_m)
    if abs(p_poly - p_kalshi) < 0.03: skip   # below transaction cost
    if p_poly < p_kalshi:
        # buy YES on Polymarket, sell YES on Kalshi (= buy NO on Kalshi)
        bet(poly_m, YES, p_poly, stake=250)
        bet(kalshi_m, NO, 1 - p_kalshi, stake=250)
    else:
        bet(poly_m, NO, 1 - p_poly, stake=250)
        bet(kalshi_m, YES, p_kalshi, stake=250)
    # hold to resolution; PnL = (sum of contracts won) - (sum of stake)
```

---

## Summary table — pre-result expectations

| # | Strategy | Expected sign | Confidence | Dominant failure mode |
|---|---|---|---:|---|
| E1 | Naive flat 5pp edge | Slightly negative | 1 | Imported result (S5) — already lost $1.5K |
| E2 | Edge-tier sized | Near zero, fat-tail driven | 1 | Top-decile-strip robustness fails |
| E3 | Quarter-Kelly indep | Near zero | 1 | Stakes too small to matter |
| E4 | Quarter-Kelly w/ correlation | Near zero | 2 | Same as E3, less stake |
| E5 | NO-only positive-skew | Negative | 1 | Slippage > miscalibration |
| E6 | Concentrated single-bet | Random | 1 | N=4 fails N≥80 threshold |
| EC1 | Fade extremes | +0.4 to +0.8 Sharpe | 3 | Markets too efficient near resolution |
| EC2 | Pre-release drift fade | +0.2 to +0.5 | 2 | Drift IS info, not noise |
| EC3 | Within-event arb | High Sharpe IF data | 2 | Linked-event clustering not implementable |
| EC4 | Inactive-market reversion | Weak positive | 2 | "Cheap side" has selection bias |
| CR1 | Spread-narrowing scalp | Conditional positive | 2 | bid/ask data not available |
| CR2 | Far-OTM time-decay | +0.2 to +0.5, fat-tail risk | 2 | Period-split fails on rally |
| CR3 | Cross-venue Kalshi arb | High Sharpe IF data | 3 | N too small (Kalshi auth limited) |

---

## Hypothesis I most expect to fail (despite intuition pulling otherwise)

**EC1 — Fade extremes.** I rated it 3/5 confidence, the highest in this list, because the academic literature on prediction-market overshoots near resolution is robust (Iowa Electronic Markets, Manski 2006, Wolfers/Zitzewitz). But the prior session's central lesson — "Polymarket already prices known signals correctly enough that retail-grade strategies can't extract alpha" — applies as forcefully to econ markets as to earnings. If Polymarket's earnings markets don't have a fadeable retail-overshoot at p≥0.85 (S1 lost money), there's no obvious reason econ markets should at p≥0.90. The retail demographic might even be more sophisticated on econ ("CPI traders" skew quanty) than on earnings ("WSB EPS gamblers"), making the overshoot smaller.

If EC1 prints +Sharpe, I'd attribute that to the math of the >0.90 threshold (1−0.90 = 10% NO entry → one win pays 10×) producing positive expectation as long as the true probability of "obvious YES" miss is even slightly above the implied 10% — in which case EC1 is essentially an all-econ-markets short-vol strategy, not actually about retail overshoots. Either way, the *mechanism* I pre-registered (retail overshoots) is probably not what's driving any positive PnL.

## Hypothesis I least expect to be a clean signal

**E6 — concentrated single-bet per quarter** is automatically disqualified by the protocol's N≥80 threshold (4 quarters → 4 bets), so its result is uninterpretable from the start.

## Note on EC3 and CR1 implementability

Per the data-availability sheet, the unified parquet has only mid-style entry prices and no orderbook depth or linked-event clustering. EC3 and CR1 are likely to be reported by Agent B as "data-constrained, N<30" rather than as fair backtests. That's a feature of the pre-registration: I'm flagging up-front that these two strategies' results, whichever way they print, are not informative about the underlying hypothesis.

## What would change my mind

If E5 (NO-only positive-skew) prints Sharpe ≥ 0.4 with positive top-decile-stripped mean, I would update toward "Polymarket's high-price tail genuinely has miscalibration and the prior S1 loss was idiosyncratic to that strategy's looser threshold." That would be the single most-surprising positive result; I rated it 1/5 confidence specifically because the prior session explicitly tested a relaxed version and lost.

If CR3 (cross-venue arb) prints with N≥30 paired markets, I would update strongly toward "this project's next 6 months should be cross-venue arb, not strategy-level alpha." That's the recommended next step from the prior session's STRATEGY_REPORT.md, and getting empirical paired-market data here is the highest-leverage outcome from this session even if the Sharpe number is mediocre.
