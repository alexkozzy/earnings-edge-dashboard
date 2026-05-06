# ALTERNATIVES — Agent D dreaming pass

Generated 2026-05-06. Eight alternative framings of the Earnings Edge thesis,
ranked-and-justified at the end. Empirical sanity checks against
`data/research/earnings_markets_raw.json` (N=856 resolved markets) inline
where feasible.

**Headline empirical finding from feasibility checks:** the dataset shows
strong **cross-quarter momentum**: P(beat | prior beat) = 0.788 vs
P(beat | prior miss) = 0.574 (N=326 / N=101 paired observations). That ~21pp
gap is the most actionable signal I found while writing this document.
Recommendation at the end leans on it.

---

### Alternative 1: CLV-style backtest framework

**Hypothesis:** Measure signal quality by whether Yes-price moved toward
our side between entry (T-3d) and just-before-resolution (T-1h) — Fogglebet's
CLV applied to Polymarket.
**Why it might be edge:** N is small (856 across 8 quarters); realised P&L
is too noisy to fit on. CLV converges faster — every market produces a
signed CLV regardless of outcome.
**What data tests it:** `clob.polymarket.com/prices-history?market=<token>&fidelity=60`
per market. Median 15 points/market at `fidelity=720`; refetch at 60 for a
clean closing print.
**What's missing right now:** `data/research/clob_history/` is empty. ~856
CLOB calls needed.
**Effort:** M.
**Confidence:** 4 — well-established framework with proven analog.
**Connection:** [[Fogglebet]]'s P&L narrative runs on CLV; see
`~/Dropbox/claude shenanigans/schema.md` field `clv` and
[[multiplicative-devigging]]. This is "Fogglebet playbook on a new dataset."

### Alternative 2: Time-decay structure of earnings markets

**Hypothesis:** Yes-price drifts systematically as earnings approach (e.g.
hype-driven uptick T-7d→T-2d, then mean-revert T-2d→T-0). If predictable,
a calendar-only strategy works without any EPS modeling.
**Why it might be edge:** Behavioral — retail crowd attention concentrates
in the final 48h. Market-makers know this and may set wider spreads earlier.
**What data tests it:** Same CLOB price-history endpoint. Bucket prices by
days-to-resolution (T-7, T-5, T-3, T-1, T-0); compute average drift across
markets, conditioned on final outcome.
**What's missing right now:** Same CLOB fetch as Alt 1 — once that's done
this is a free byproduct.
**Effort to test:** S given Alt 1's data.
**Confidence:** 3 — plausible but I haven't seen this specific effect
documented; could just be noise.
**Connection:** None direct. New framing.

### Alternative 3: Cross-venue arbitrage Polymarket ↔ Kalshi

**Hypothesis:** Identical earnings events list on both venues; spread
between devigged probabilities is harvestable.
**Why it might be edge:** Different liquidity pools and retail bases.
[[PTO-Kalshi Copier]] already connects to Kalshi.
**What data tests it:** Enumerate Kalshi's earnings `series_ticker` (likely
`EARN-*`; unverified). Fuzzy-match by ticker+quarter+date.
**What's missing right now:** Kalshi earnings namespace not catalogued.
`pto-kalshi-copier/src/kalshi_client.py` is liftable.
**Effort:** L — second-venue scraping infra.
**Confidence:** 3 — something exists, magnitude unknown.
**Connection:** Direct reuse of [[PTO-Kalshi Copier]] `kalshi_client.py` +
`market_matcher.py` (fuzzy event matching solved there).

### Alternative 4: Selection bias on Polymarket-listed tickers

**Hypothesis:** Polymarket creates earnings markets only for high-retail-
interest tickers; these are systematically more "beat-prone" than the
S&P average.
**Why it might be edge:** If true, the right baseline isn't 70% but ~78%,
which collapses the original thesis's edge.
**What data tests it:** I ran it. **Empirical beat rate across 856 markets
= 73.7%**. S&P historical baseline ≈ 70-75%. So this hypothesis is
**falsified at the aggregate level** — Polymarket-listed names beat only
~+1.7pp above baseline, not "systematically and meaningfully more."
**What's missing right now:** Nothing — already tested.
**Effort to test:** Done.
**Confidence:** 5 (in the negative result).
**Connection:** Sanity-check on the original thesis.

### Alternative 5: Volatility-crush hedge / IV-rank cross

**Hypothesis:** Polymarket "Miss" bets are functionally long-vol; the
highest-EV Miss bets should cluster in low-IV-rank tickers (cheap
short-vol complementary trade).
**Why it might be edge:** Two semi-independent signals (EPS edge + vol
edge) combine for higher Sharpe.
**What data tests it:** Daily IV-rank per ticker. Finnhub has options
chains but local `FINNHUB_API_KEY` is empty (STATE.md). Polygon/Tradier
alternatives.
**What's missing right now:** IV feed — blocked locally.
**Effort:** L (blocked on data).
**Confidence:** 2 — promising, can't test from here.
**Connection:** Dashboard's hedge tool already has option payoff math
(`lib/hedge/optionPayoff.ts`) but doesn't consume IV.

### Alternative 6: Cross-quarter momentum (THIS IS THE LIVE WIRE)

**Hypothesis:** A ticker that beat last quarter is more likely to beat this
quarter, AND markets systematically under-price that persistence.
**Why it might be edge:** Empirical: `P(beat|prior beat) = 0.788`,
`P(beat|prior miss) = 0.574` on N=326 / N=101 paired-quarter observations
in the dataset. That's a **~21pp split** — far larger than any other
feature I can compute from the raw data. If Polymarket prices treat each
quarter independently (anchored to ~70% baseline), buyers of "Yes" on
prior-beat tickers are under-priced; sellers of "Yes" on prior-miss tickers
are over-priced.
**What data tests it:** Already tested at the outcome level. Next step is to
join entry-price (from CLOB) at e.g. T-3d to confirm prices don't already
reflect the momentum signal — i.e. if YES is already priced at 0.85 on
prior-beat tickers, the edge is gone.
**What's missing right now:** The CLOB-price merge (same Alt-1 fetch).
**Effort to test:** M (requires CLOB fetch, then a one-screen analysis).
**Confidence:** 4 — empirical asymmetry is large; only blocker is whether
the market already prices it.
**Connection:** None pre-existing — new finding.

### Alternative 7: Question-phrasing alpha (LOW POWER)

**Hypothesis:** ≥3 question phrasings ("...beat its quarterly EPS
estimate?", "...beat quarterly earnings?", "...beat Q2 earnings forecast
($1.57 EPS)?"). Different phrasings attract different populations and so
different mispricing.
**Why it might be edge:** Explicit-EPS phrasings may anchor harder.
**What data tests it:** Tested. Distribution highly skewed: 838 markets
use "beat quarterly earnings" (74.1% beat), 12 use "quarterly EPS estimate"
(66.7%, N too small), 1 uses "($X EPS)".
**What's missing right now:** N fatally small in alt buckets.
**Effort:** Done; inconclusive.
**Confidence:** 1 — untestable on this dataset.
**Connection:** None.

### Alternative 8: Market-creation-time alpha

**Hypothesis:** Markets created 30d before earnings price differently than
markets created 1d before (longer windows attract informed flow; shorter
ones get retail hype).
**Why it might be edge:** Time-since-creation × information discovery.
Conceptually mirrors Fogglebet's stale-quote filter
([[multiplicative-devigging]]).
**What data tests it:** Add Gamma `createdTime` to scrape; bucket by
trading-window length (median 8.2d, range 3.5-40d); compare residual
`outcome - implied_prob` by bucket.
**What's missing right now:** `createdTime` not in `earnings_markets_raw.json`.
**Effort:** S — re-scrape with one extra field.
**Confidence:** 2 — speculative.
**Connection:** Loose link to Fogglebet's stale-quote filter.

---

## My recommendation

**Top candidate to investigate next:** **Cross-quarter momentum (Alt 6)**
combined with CLV measurement (Alt 1) as the diagnostic.

**Why:**
The momentum result fell out of a 30-second sanity check and is the only
hypothesis where the empirical asymmetry I can measure today (~21pp split)
is already larger than the entire baseline edge the project was originally
chasing (~5-10pp). Every other alternative requires data I don't yet have
(CLOB price history, IV feed, Kalshi catalogue) OR was falsified in
testing (selection bias was tiny, phrasing buckets are too small). Momentum
is the rare case where the data already on disk gave a strong answer; the
remaining work is to check whether Polymarket prices already discount it.

**Concrete first step:**
Fetch CLOB price history for the ~111 tickers with ≥3 historical markets
(=~330 markets, fits in a couple hours of polite API calls at
`fidelity=720`). For each market, take the median Yes-price in the T-7d to
T-3d window as "entry price." Bucket by `prior_quarter_outcome ∈ {beat, miss}`.
Compute the average residual `(actual_outcome - entry_price)` per bucket.
Decision criterion: if `prior-beat residual ≥ +0.05` AND `prior-miss residual
≤ -0.05` (i.e. market is leaving ≥5pp on the table on both sides), the
strategy is live. If the residuals are inside ±0.02, the market already
prices momentum and the edge is dead.

**Why I deprioritized the others:**
- **Alt 1 (CLV framework):** Useful infrastructure but not itself a
  hypothesis — supports Alt 6, doesn't replace it.
- **Alt 2 (Time-decay):** Plausible but no prior; speculative.
- **Alt 3 (Cross-venue arb):** Largest potential upside but L-effort and
  blocked on Kalshi catalogue work.
- **Alt 4 (Selection bias):** Already falsified.
- **Alt 5 (Vol-crush hedge):** Blocked on missing IV feed.
- **Alt 7 (Phrasing alpha):** Empirically untestable — alternative-phrasing
  buckets have N=12 and N=1.
- **Alt 8 (Creation-time alpha):** Speculative; cheap to test once
  `createdTime` is in the scrape, but no prior reason to believe it
  beats Alt 6.

---

## Side notes flagged for the user

- **Data hygiene bug:** 5 of the 856 "earnings" markets are MrBeast-Twitter-
  revenue questions. The `tag_slug=earnings` filter is leaky. Add a
  defensive regex on the question text (`/beat.*earnings/i` or
  `/EPS|quarterly/i`) before training.
- **Class-share tickers:** 4 markets use BRK.A / UHAL.B / MOG.A. The brief's
  ticker regex `\(([A-Z]{1,5})\)` misses them. Use `\(([A-Z.]{1,7})\)`.
- **CLOB history snapshots empty on disk** as of read time — Agents A and B
  will need to fetch ~856 series before any of this analysis (mine or
  theirs) runs end-to-end.
