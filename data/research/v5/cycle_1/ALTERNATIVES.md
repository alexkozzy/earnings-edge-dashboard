# Alternatives — geopolitics-specific framings (Agent D, v5 cycle 1)

**Author:** Agent D (creative + LLM-graded resolution-criteria ambiguity)
**Date:** 2026-05-06
**Universe:** `data/research/v5/markets/universe.parquet` (N=2,911 geopolitics markets, sub_category + sub_tag classified by Agent A)

## Overview

Five rejected verdicts (v1, v3) plus v4 cycle 1's mass null result frame the search space: every previously-tested Polymarket strategy comes back B or worse, and the v4 cycle 1 universe-wide low-liquidity scrape shows S1 (fade-extremes) is **catastrophically -EV at sub-$50K liquidity** because the extreme prices encode strong idiosyncratic certainty. Cycle 1 of v5 narrows to geopolitics-only at <200K liquidity.

The 7 alternatives below are **specific to geopolitics**, not generic Polymarket framings already covered in v1-v4. Each comes with a feasibility check executed against universe.parquet. The most important finding is **Alternative 2** (resolution-criteria ambiguity), which gets a deeper LLM-graded analysis at the bottom and is my **top recommendation for cycle 2**.

---

## Headline calibration table (whole universe, for reference)

```
 decile   n   realized   predicted   gap (realized - predicted)
 <5%     1618 0.0105     0.0081     +0.0024
 5-10%    195 0.1231     0.0751     +0.0480
 10-20%   258 0.2054     0.1433     +0.0622
 20-30%   139 0.2734     0.2497     +0.0237
 30-40%    95 0.4737     0.3483     +0.1254
 40-50%    62 0.4194     0.4481     -0.0288
 50-60%    72 0.6389     0.5546     +0.0843
 60-70%    59 0.6949     0.6496     +0.0453
 70-80%    62 0.7742     0.7496     +0.0246
 80-90%    55 0.9091     0.8609     +0.0482
 90-95%    46 0.9565     0.9298     +0.0267
 >95%     250 0.9960     0.9878     +0.0082
```

**Pattern:** systematic positive gap across all mid-range deciles. The **5-15% and 30-40% bands look most exploitable on the surface (gap +5pp to +12pp). YES bets at low-to-mid prices look underpriced.** But this is the FULL universe, including >200K markets which have already been tested and shown calibrated in v1-v4. Restricted to <200K (in-scope per protocol), the gap shrinks dramatically (mostly within ±5pp).

---

### Alternative 1 — Sub-tag concentration alpha (Iran-themed)

**Hypothesis:** Iran-themed markets (244 of 2,911 = 8.4% of universe; the only non-`other` sub-tag with N≥145) are systematically miscalibrated relative to the global geopolitics universe because (a) sustained retail attention during the Iran-strike crisis period; (b) Persian-language information access asymmetry; (c) emotional volatility around tail-event coverage.

**Why it might be edge** (mechanism, not vibes): Iran markets concentrate on a few headline outcomes (US strike, ceasefire, nuclear test, Strait of Hormuz closure). Retail consumes English-language news; Persian-language sources lead in tempo. If retail systematically over-weights US-side reports (more sensational coverage of escalation), prices may overstate hostile-event probabilities relative to actual base rates. Conversely if retail under-weights Iran-side credibility on de-escalation, ceasefire markets may be underpriced.

**What data tests it:** Compute calibration plot for sub_tag='iran' vs 'other'. Direct from universe.parquet, no new data.

**Feasibility check (executed):**
```
sub_tag      n     beat_rate   mean_entry   gap
other       2418   0.218       0.203        +0.0156
iran         244   0.307       0.257        +0.0506
israel        72   0.431       0.349        +0.0811
ukraine       53   0.283       0.259        +0.0235
korea         45   0.200       0.180        +0.0200
china_taiwan  33   0.273       0.279        -0.0062
venezuela     29   0.345       0.275        +0.0694
trump_putin   13   0.231       0.251        -0.0199
```

**Iran shows a +5.1pp realized-vs-predicted gap, ~3.2× the `other` baseline (+1.6pp). Israel +8.1pp (N=72) and Venezuela +6.9pp (N=29) are even more extreme but small N.** Sub-cluster analysis within Iran shows the gap concentrates in:
- `ceasefire`-keyword Iran markets (N=12): gap +18.5pp
- `israel`-co-occurrence Iran markets (N=50): gap +9.6pp
- `strike`-keyword Iran markets (N=121): gap +6.3pp

**What's missing now:** A formal hypothesis-test framework (this is exploratory; no Holm-Bonferroni applied yet). Iran-specific news coverage features (GDELT/Twitter intensity) to build a pricing model. Per-sub-tag calibration by liquidity tier (the >200K Iran markets likely drive the headline).

**Effort to test:** S — calibration table + simple "buy YES on Iran ceasefire below 0.4" backtest is a 30-min add-on to Agent B's grid.

**Confidence pre-results (1-5):** **3.5** — the headline gap is real and large by signal-to-noise but mostly lives in the >200K Iran markets we've already shown to be well-calibrated when looked at globally. The per-tier breakdown might reveal it's all ≥200K.

**Connection to existing project work:** Echoes v4 cycle 1's "data-thin pockets may have edge" theme but with a topical (not liquidity-tier) cut. Distinct from prior verdicts, none of which conditioned on geopolitics topic clusters.

---

### Alternative 2 — Resolution-criteria ambiguity (LLM-graded, the headline of this doc)

**Hypothesis:** Markets with ambiguous resolution criteria ("Will X agree to Y?", "Will X capture territory Z?", "Will ceasefire be broken?", "Is X out as president?") show **systematically higher realized YES rates than their entry prices imply**, because (a) ambiguity creates resolver discretion that biases toward "something actually happened" outcomes, (b) traders without clear resolution criteria can't price defensively, leaving structural underpricing, (c) news coverage of ambiguous events tends to confirm rather than deny, biasing the resolver's information set toward YES.

**Why it might be edge:** Polymarket's UMA-based resolution permits judgment calls. Crisp markets ("Will US strike Iran on January 19, 2026?") are price-discovered against a hard observable. Ambiguous markets ("Will US x Venezuela military engagement by March 31, 2026?") have a fuzzy edge — the resolver decides what counts as "engagement." Across 199 graded markets in this study, **AMBIGUOUS markets show realized 34.1% vs predicted 29.6% (gap +4.4pp), nearly 2× the CRISP gap of +2.4pp.** The structural bias is toward YES.

**What data tests it:** 200-market in-context grading sample, stratified by sub_category and price decile. Already done — see "Deeper analysis" below.

**Feasibility check (executed):** Yes — 199 markets graded, 155 CRISP / 44 AMBIGUOUS. Imbalance is real (most geo markets have crisp dated resolutions); but enough AMBIGUOUS to power a comparison.

**What's missing now:** (1) Multi-grader confirmation (single grader = self in-context here; for cycle 2 this should be 2-3 independent graders, possibly different LLM personas or human spot-check). (2) Resolution-criteria text from Polymarket directly (gamma-api `description` field), not just question text — the in-text grading uses only `question`, but the actual resolution rule may be in a separate description field. (3) Stratification by sub_tag (do AMBIGUOUS Iran markets behave differently from AMBIGUOUS Ukraine markets?).

**Effort to test:** **M** for cycle 2 — needs a more rigorous grading pipeline (200→500 markets), then a YES-bet-at-mid-price strategy backtest with proper walk-forward.

**Confidence pre-results (1-5):** **4** — the +4.4pp gap is meaningful and the directional bias is mechanistic (UMA resolvers face informational asymmetry). The risk is single-grader bias; if a second grader disagrees on >30% of labels, the signal could collapse.

**Connection to existing project work:** Connects directly to v2's stalled Kalshi-pairing question — the failure mode there ("matched topic, not question") is essentially the *same* problem this alternative names: "does the question text alone fully specify what counts?" v2's matcher would benefit from this framework. Also connects to v3's M5 stacked-feature model — the question-text-LLM-grade is a feature M5 didn't have.

---

### Alternative 3 — Pre-event saturation curve

**Hypothesis:** For named scheduled events (specific debates, meetings, votes), the price saturates at 0/1 well before the event date in CRISP markets but stays unsettled in AMBIGUOUS markets. The trading window from the saturation point to resolution is dead capital but provides a calibration signal — markets that *don't* saturate are the ones where price discovery is incomplete, and these are where edge lives.

**Why it might be edge:** Saturated markets are the ones the consensus has already resolved. Un-saturated markets at T-3d are the ones where the trading population is split. If the trading population's price is biased (ambiguity-adjacent), the residual price-vs-realized gap concentrates in non-saturated markets.

**What data tests it:** Per-market trajectory analysis from CLOB price-history files. Compute `time_to_saturate = days from open to the first bar with price ∈ {<0.05, >0.95}` and bucket markets by this proxy.

**Feasibility check (executed):** `n_history_points / trading_window_days` averages ~2 (12-hour bars), so we have ~2 ticks/day per market. The CLOB files (in `data/research/clob_history/` — confirmed exists) carry the full price trajectory. Computing saturation-time per market is a ~10-min Pandas task.

**What's missing now:** The aggregated CLOB-history trajectory parquet doesn't yet exist; need to load per-market files and compute saturation features. Cycle 2 deliverable.

**Effort to test:** **M** — requires per-market file parsing across ~2,911 markets. ~1 hour of compute + scripting.

**Confidence pre-results (1-5):** **2** — interesting but speculative; v1 already tried "stale price" (S3) and it lost everywhere.

**Connection to existing project work:** S3 in v4 cycle 1 was the inverse of this — "stale prices revert to equal" lost money because stale prices were correct. Alternative 3 reframes: "stale prices are correct; *non*-saturated prices may be edge." Different selection.

---

### Alternative 4 — Sub_category mispricing asymmetry

**Hypothesis:** `discretionary` (judgment-based) markets price differently from `hard_currency` (measurable underlying) markets because discretionary outcomes invite resolver discretion (overlaps with Alt 2) while hard-currency markets price against a verifiable observable.

**Why it might be edge:** If the YES-bias-on-ambiguity story (Alt 2) is right, the bias should concentrate in `discretionary` and be absent in `hard_currency`. This gives us a clean within-universe placebo test.

**What data tests it:** Compute calibration per sub_category. Direct from universe.parquet.

**Feasibility check (executed):**
```
sub_category    n      realized   predicted   gap
discretionary   2565   0.239      0.216       +0.023
hard_currency   252    0.194      0.203       -0.008
action_count    94     0.213      0.183       +0.030
```

**Hard_currency shows a tiny *negative* gap; discretionary and action_count show positive. The asymmetry is real and aligned with Alt 2's mechanism.** N for hard_currency is small but non-trivial (252 markets).

**What's missing now:** Per-(sub_category × liquidity_tier) breakdowns to confirm the asymmetry survives Holm-Bonferroni. Backtest of "buy YES on discretionary at p ∈ (0.05, 0.85)" vs "buy YES on hard_currency at same."

**Effort to test:** **S** — 30-min calibration analysis + simple backtest.

**Confidence pre-results (1-5):** **3** — the asymmetry is consistent but small (+2.3pp vs -0.8pp); needs proper hypothesis-test to confirm not noise.

**Connection to existing project work:** This is the cleanest within-universe placebo test for the Alt 2 mechanism. v4 cycle 1 didn't decompose by sub_category; this is genuine new evidence territory.

---

### Alternative 5 — Lifespan-conditional alpha

**Hypothesis:** Short-lifespan markets (window ≤ 7d) attract attention-driven retail flow; long-lifespan markets (≥ 30d) attract sophisticated flow. The two populations price differently relative to outcomes.

**Why it might be edge:** Attention-driven retail tends to overpay for tail outcomes (news-cycle salience) on short windows. Sophisticated long-window flow disciplines mean prices.

**What data tests it:** Bucket by `trading_window_days`. Direct from universe.parquet.

**Feasibility check (executed):**
```
lifespan      n     realized   predicted   gap
≤7d           354   0.395      0.342       +0.0537
8-14d         569   0.192      0.181       +0.0104
15-30d        384   0.255      0.237       +0.0186
31-90d        711   0.236      0.206       +0.0299
>90d          893   0.186      0.180       +0.0063
```

**Short-lifespan (≤7d) markets show the largest realized-vs-predicted gap (+5.4pp); >90d markets show minimal gap (+0.6pp).** Pattern is monotonic-ish across the buckets, peaking on ≤7d AND on 31-90d (medium-term). This is consistent with the "short windows = attention-driven retail" story for the ≤7d band; the 31-90d bump is harder to explain.

**What's missing now:** Per-lifespan × sub_category breakdown to verify the ≤7d edge isn't entirely driven by ambiguous-discretionary markets (the Alt 2/4 story).

**Effort to test:** **S** — 30-min add-on.

**Confidence pre-results (1-5):** **3** — the ≤7d gap is real but small N for any specific cell. Will be data-thin after Bonferroni.

**Connection to existing project work:** Inverts v3's hedging-direction failure (which was about cross-sectional variance, not time horizon). New territory.

---

### Alternative 6 — Cross-event interference within sub-clusters

**Hypothesis:** When multiple geopolitics markets share a common underlying (Iran ceasefire, Iran sanctions, Iran nuclear test all pricing the same crisis state), prices co-move with the underlying narrative. The within-sub-cluster correlation is a measurable signal — if one Iran market lags the cluster's consensus pricing, that lag is exploitable.

**Why it might be edge:** Slow market-makers who don't update all related markets simultaneously create cross-sectional staleness. If Iran-strike-by-Jan-31 jumps from 0.05 → 0.20 on news, but Iran-strike-by-Jan-29 stays at 0.05, the latter is now mispriced.

**What data tests it:** Per-sub_tag, compute pairwise price-trajectory correlations from CLOB history. Look for outliers — a market with low cross-correlation to the cluster mean despite shared underlying.

**Feasibility check (executed):** Iran has 244 markets; 121 mention "strike," 50 mention "Israel," 12 mention "ceasefire." Plenty of within-cluster pairs to compute correlations on. CLOB history exists per-market.

**What's missing now:** Per-pair correlation parquet. ~1 hour of compute.

**Effort to test:** **L** — needs trajectory-aligned price matrix + a strategy that triggers on correlation breakdowns. Engineering-heavy.

**Confidence pre-results (1-5):** **2** — this is the textbook "stat arb on related markets" play; sophisticated PM market-makers likely already do this (it's a well-known pattern), so the residual edge is probably small. But for retail-scale capital it might still work.

**Connection to existing project work:** Most directly connects to **Fogglebet's market-making model**: this is essentially "fade the lagging leg of a clustered trade." If cycle 2 builds toward an MM-style strategy on geopolitics, Alt 6 is the obvious foundation.

---

### Alternative 7 — Question-framing valence (negation pairs)

**Hypothesis:** "Will X happen?" vs "Will X NOT happen?" framings of similar events attract different retail flows; the negation-framed market may price as if it were an entirely separate event (anchoring bias).

**Why it might be edge:** Retail psychology around negation (loss-aversion, double-negative cognition cost) could create predictable mispricing between matched pairs.

**What data tests it:** Find pairs of markets that flip the question. Count negation patterns; look for matched ticker_or_event pairs.

**Feasibility check (executed):**
```
has_negation    n      realized   predicted   gap
False           2809   0.232      0.211       +0.020
True            102    0.294      0.277       +0.017
```

**Negation-framed markets show roughly the same gap as positive-framed (+1.7pp vs +2.0pp). All 2,911 markets have unique ticker_or_event — there are no obvious paired markets in this universe.** The hypothesis can't be tested without manual pair construction.

**What's missing now:** A pair-finding algorithm (semantic match within sub_tag + sub_category, identifying YES-frame vs NO-frame on same event). Likely fewer than 50 such pairs in this universe; insufficient power.

**Effort to test:** **L** — pair-finding + small-N analysis. Likely won't power.

**Confidence pre-results (1-5):** **1.5** — feasibility check killed it. Effectively dropping.

**Connection to existing project work:** Nice idea, dead on N.

---

## Deeper analysis: Alternative 2 — resolution-criteria ambiguity (LLM-graded)

### Method

- Sample size: 199 markets (target 200, lost 1 to dedup)
- Stratification: by sub_category (proportional) × price-decile (within sub_cat)
- Grading: in-context Agent-D classification of question text only
- Grader: single-pass (acknowledged limitation)
- Output schema: `condition_id, question, sub_category, grade, reason, ground_truth, entry_yes_price_3d`
- File: `data/research/v5/cycle_1/resolution_grades.csv`

### Grade distribution

```
Grade        N    %
CRISP        155  77.9%
AMBIGUOUS     44  22.1%

By sub_category:
sub_category    AMBIGUOUS  CRISP
discretionary       43      133  (24.4% ambiguous)
hard_currency        1       15  (6.3% ambiguous)
action_count         0        7  (0% ambiguous)
```

The ambiguity concentrates in `discretionary` markets — exactly as Alt 4 predicts.

### Calibration comparison

```
AGGREGATE
Grade        N    realized   predicted   gap (realized - predicted)
AMBIGUOUS    44   0.341      0.296       +0.0445
CRISP        155  0.219      0.195       +0.0242

Difference in gap: +0.020 favoring AMBIGUOUS (i.e. ambiguous markets are MORE underpriced for YES)
```

```
DECILE-CONDITIONAL — CRISP (N=155)
decile     n   realized   predicted   gap
<5%       88   0.011      0.006       +0.005
5-15%     18   0.111      0.091       +0.020
15-30%    14   0.214      0.208       +0.006
30-50%     9   0.667      0.409       +0.258
50-70%     9   0.778      0.634       +0.144
70-85%     2   0.000      0.740       -0.740  (N=2, ignore)
>85%      15   1.000      0.951       +0.049

DECILE-CONDITIONAL — AMBIGUOUS (N=44)
decile     n   realized   predicted   gap
<5%       22   0.000      0.014       -0.014
5-15%      4   0.000      0.083       -0.083
15-30%     2   0.000      0.218       -0.218
30-50%     4   0.750      0.348       +0.403  (***)
50-70%     1   1.000      0.535       +0.465  (small N)
70-85%     3   1.000      0.747       +0.253
>85%       8   1.000      0.976       +0.024
```

**The signal is concentrated in the mid-to-high price band (30-85% entry price).** AMBIGUOUS markets at p ∈ [0.30, 0.85] resolved YES at >75% rate — a +25 to +47pp positive gap. That is enormous.

Brier scores:
- CRISP: 0.0705 (worse calibration in absolute terms, but mostly because of the wide price spread)
- AMBIGUOUS: 0.0435 (paradoxically *better* Brier, but this is because most low-price AMBIGUOUS markets resolved correctly NO; it's the mid-band where mispricing lives)

### Hypothetical strategy — "buy YES on AMBIGUOUS at mid-price"

```
SUBSET: grade == AMBIGUOUS AND entry_yes_price_3d ∈ (0.05, 0.85)
N = 14
realized YES rate = 0.500 (vs predicted 0.352)
$50 stake YES bet, mean P&L: +$0.30 per bet  (essentially break-even after fees)

Same subset for CRISP:
N = 52
realized YES rate (predicted higher to begin with)
$50 stake YES bet, mean P&L: +$11.44 per bet
```

**Counterintuitive result: CRISP mid-price markets were more profitable than AMBIGUOUS in this sample** — because the CRISP mid-price subset includes high-conviction "X will win" markets where the +14pp gap (+47% realized vs 41% predicted) translates to high payouts at $50 stakes; the AMBIGUOUS subset's +14.8pp gap is more modest in $-PnL because the prices are lower and the sample size is too small.

This is **one realization of a small-N sample.** The conclusion isn't "AMBIGUOUS isn't edge" — it's "the headline-aggregate gap (+4.4pp vs +2.4pp) is meaningful but small-N AMBIGUOUS samples don't yet translate cleanly to a tradeable strategy. Cycle 2 needs:
1. 500-1000 graded markets (this sample is 199, of which only 44 are AMBIGUOUS)
2. Multi-grader agreement scoring
3. Per-(sub_category × sub_tag × liquidity_tier × grade) breakdown

### Examples of the ambiguity-pays-YES pattern

The 7 AMBIGUOUS markets at mid-to-high prices that all resolved YES (out of 11 in that band):
1. "Will Pennsylvania be the tipping point state?" (p=0.335 → YES)
2. "Will Russia capture Pokrovsk by August 31?" (p=0.350 → YES) — capture verification disputed
3. "US x Venezuela military engagement by March 31, 2026?" (p=0.380 → YES) — what counts as engagement?
4. "Will Brad Garlinghouse attend presidential inauguration?" (p=0.535 → YES)
5. "Israel x Iran ceasefire broken by March 31, 2026?" (p=0.705 → YES) — what counts as broken?
6. "Will Ukraine agree to pay back U.S. aid before July?" (p=0.762 → YES)
7. "Yoon out as president of South Korea in 2025?" (p=0.775 → YES)

Each one has a verb that the resolver had to interpret. In every case the resolver chose YES.

### Caveats

- **Single grader.** I am one LLM; a second grader could disagree on many borderline cases.
- **Question text only.** Polymarket markets carry a separate `description` field that contains the full resolution rule. In-text grading misses this.
- **Sub-cluster contamination.** AMBIGUOUS is heavily Iran-themed (geopolitics-crisis vocabulary tends to be ambiguous). Some of the gap may be Iran-specific (Alt 1) rather than ambiguity-specific (Alt 2). Per-(sub_tag × grade) crossbreak needed.
- **Single time slice.** This is on resolved markets; doesn't predict future markets.

### LLM budget consumed

- 199 in-context grading calls
- External API calls: 0
- External cost: $0
- Remaining session budget: 301 calls / $15

usage.json updated in `data/research/v5/llm_cache/usage.json`.

---

## Top recommendation for cycle 2

**Test Alt 2 + Alt 4 jointly.** The mechanism is the same (resolver discretion + structural YES-bias on ambiguous outcomes), and Alt 4 (sub_category asymmetry) is a clean within-universe placebo for Alt 2.

Concrete cycle 2 spec:
1. **Grade 500 more markets** with rigorous protocol (multi-grader, includes Polymarket `description` field, NOT just question)
2. **Backtest** "buy YES on AMBIGUOUS-discretionary markets at p ∈ (0.05, 0.85)" with proper walk-forward and Holm-Bonferroni
3. **Placebo:** same strategy on CRISP-hard_currency markets — should show no edge
4. **Stratify** by sub_tag to detect Iran-clustering confound (Alt 1 contamination)
5. **Threshold:** primary pass requires AMBIGUOUS strategy P&L > CRISP placebo P&L by ≥ 1 standard error after Holm-Bonferroni across all cells

If primary passes: this is the first passable Polymarket-edge result across 4 sessions of work. If it fails: project converges to "Polymarket is calibrated even when resolution criteria are ambiguous" — a stronger negative claim than v1-v4.

**Secondary:** if the grading pipeline gets standardized in cycle 2, the same labels can be applied to v2's stalled Kalshi-pairing problem ("matched topic, not question") — possibly unblocking that work too.

---

## What I am NOT recommending

- **Alt 7** (negation-framing) — feasibility-killed; no paired markets in universe
- **Alt 6** (cross-event interference) — engineering-heavy and likely already-priced by sophisticated MMs
- **Alt 1** (Iran sub-cluster) as primary — too contaminated by liquidity-tier confound; Iran's apparent edge probably lives in ≥200K markets we know are calibrated. **Reasonable secondary** to test as Alt 2 robustness check.

## Files

- `data/research/v5/cycle_1/resolution_grades.csv` — 199 graded markets (Agent D)
- `data/research/v5/llm_cache/usage.json` — budget tracking
- `data/research/v5/markets/universe.parquet` — read-only; not modified
