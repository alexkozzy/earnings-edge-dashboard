# Cycle 1 → Cycle 2 lessons (pre-results)

Written before Agent B's cycle-1 backtest results land. Pre-registers candidate cycle-2 directions based on dataset structure alone. Author: Agent D, v4 cycle 1.

I have NOT read Agent B's outputs (they had not landed at the time of this writing — by design, to keep this an honest pre-registration).

## Dataset summary

`data/research/v4/cycle_1/all_markets_v4.parquet` — 5,745 rows, 14 columns. End-date range 2023-05-31 → 2026-12-31.

In-scope per SESSION_CONFIG (3 cats × 3 sub-$50K tiers): **2,678 markets**.

| category    | <5K | 5-15K | 15-50K | >50K (out of scope) |
|-------------|----:|------:|-------:|--------------------:|
| earnings    | 191 |   321 |    249 |                  58 |
| econ        | 289 |   397 |    425 |                 844 |
| geopolitics | 167 |   282 |    357 |                1946 |
| crypto*     |   0 |     0 |    219 |                   0 |

\* Crypto is out of v4 scope per SESSION_CONFIG (saturated in v1). The 219 rows in 15-50K still appear in the parquet.

**No data-constrained cells in the 3×3 in-scope grid** — all nine have N ≥ 80 (min: geopolitics-<5K at 167). The smallest in-scope cell is well above the threshold. That means cycle-1 `RESULTS.md` will be statistically powered to deliver a clean pass/fail per cell; the post-Holm-Bonferroni question is whether any of the 36 cells survives correction at α=0.05 / 36 ≈ 0.0014.

## Information density gaps

For each in-scope cell, qualitative read:

### Trading-window distributions

| cell                  | N   | median window | p10 | p90 | shape note |
|-----------------------|----:|--------------:|----:|----:|------------|
| earnings   <5K        | 191 | 11d           |  6d | 15d | tight; pre/post-earnings dynamics |
| earnings   5-15K      | 321 | 11d           |  5d | 14d | tight |
| earnings   15-50K     | 249 | 10d           |  5d | 16d | tight |
| geopolitics <5K       | 167 | 10d           |  2d | 72d | bimodal (event vs long-horizon) |
| geopolitics 5-15K     | 282 | 12d           |  3d | 49d | bimodal |
| geopolitics 15-50K    | 357 | 14d           |  4d | 86d | bimodal |
| econ       <5K        | 289 | 11d           |  5d | 48d | bimodal |
| econ       5-15K      | 397 | 24d           |  7d | 47d | wider |
| econ       15-50K     | 425 | 29d           |  9d | 70d | widest, often pre-release window |

### Entry-price distributions (entry_yes_price_3d)

Geopolitics and econ are **strongly NO-skewed** — median entry_yes_3d is 0.03–0.13. "Will X happen?" with X being an unlikely outcome dominates. Earnings is **YES-skewed** (median 0.77–0.83) — earnings markets are typically framed "Will EPS exceed X?" where X is set near consensus, biasing the YES side.

Concentration near 0/1 vs spread: in geopolitics 15-50K, **238 of 357 markets (67%)** have entry_yes_3d < 0.15 — highly concentrated near zero. In earnings 15-50K, **102 of 249 (41%)** have entry_yes_3d > 0.85 — concentrated near one. The mid-bucket [0.40, 0.60] is sparsely populated everywhere (24–39 markets per cell).

**Calibration in extremes is already very good** (computed from the parquet directly):

| cell                | hi(>0.85) yes-rate | lo(<0.15) yes-rate | mid([.40,.60]) yes-rate |
|---------------------|-------------------:|-------------------:|------------------------:|
| earnings <5K        | 92.9% (N=56)       | 0.0% (N=1)         | 61.3% (N=31)            |
| earnings 5-15K      | 92.9% (N=85)       | 0.0% (N=2)         | 56.2% (N=32)            |
| earnings 15-50K     | 94.1% (N=102)      | 0.0% (N=3)         | 55.2% (N=29)            |
| geopolitics <5K     | 100% (N=12)        | 1.1% (N=93)        | 50.0% (N=20)            |
| geopolitics 5-15K   | 96.2% (N=26)       | 2.5% (N=161)       | 37.0% (N=27)            |
| geopolitics 15-50K  | 96.3% (N=27)       | 3.8% (N=238)       | 50.0% (N=24)            |
| econ <5K            | 100% (N=17)        | 0.6% (N=161)       | 50.0% (N=36)            |
| econ 5-15K          | 95.7% (N=23)       | 6.2% (N=209)       | 46.2% (N=39)            |
| econ 15-50K         | 97.3% (N=37)       | 4.0% (N=224)       | 46.9% (N=32)            |

This **strongly suggests that S1 ("fade extremes") and S4 ("fade extreme + short window") will lose money in every cell** before the backtest runs. Polymarket's late-stage extreme prices are mechanically as well-calibrated at sub-$5K liquidity as they were at $50K+ in v1's EC1 (which lost $105k on N=664). I expect cycle-1's verdict to recapitulate this finding across categories and tiers.

### Structural distinguishers worth flagging

1. **Earnings has NO `entry_yes_price_7d` and NO `entry_yes_price_late`** (191/321/249 missing on each). Strategy S2 (drift fade T-7→T-3) is **mechanically inapplicable to earnings cells** — the cycle-1 backtest will produce N=0 for all three earnings × S2 cells. This is a data gap, not a strategy result.

2. **Strategy S2's universe is small**: only 20–57 markets per non-earnings cell have a ≥10pp drift between T-7d and T-3d. Sub-N=80 in most cells before any other filter applies — S2 will be power-limited everywhere.

3. **Outcome-conditional trajectory shows the market discriminates by T-7d already**: in geopolitics 15-50K, YES-resolved markets average 0.704 at T-7d; NO-resolved markets average 0.078. The gap is roughly stable from T-7d to T-1d. That's price discovery being basically complete by a week out.

4. **`n_history_points` is large** (e.g. 234, 167, 390 for the first three rows) — there's room to upgrade to richer time-series features in later cycles if cycle-1 leaves any cell standing.

## Five candidate cycle-2 directions

The wrapper specifically said "informative gap not promising-looking." All five below answer questions whose answer changes the project-level verdict regardless of cycle 1's specific cells.

### Direction A — Outcome-conditional information content of T-7d → T-1d trajectory by category

**Question it answers:** Does Polymarket do *any* incremental price discovery in the final week, or is the market already done by T-7d? If the answer is "already done," then **all late-stage strategies are dead by definition** in this project — not just S1/S4 — and the queue should pivot to T-30d or earlier entries (or to a different category). If the answer is "still discovering," then there's a temporal-alpha opening that cycle-1's static-entry strategies can't see.

**What it would test:** For each (category, tier) cell, fit a logit of `outcome_yes_won` on `entry_yes_price_3d` alone, then on `entry_yes_price_3d + entry_yes_price_1d` (or `_late` where available). Compare AUC and log-loss. Bootstrap CI on AUC delta. A delta of <0.005 in AUC means T-1d adds nothing; ≥0.02 means there's incremental signal worth a strategy. Also: residual analysis — when the price *does* move T-3d → T-1d, does it move toward the eventual outcome (real info) or away (overshoot/noise)?

**Why this is informative not promising-looking:** This is a structural property of the market microstructure, not a strategy variant. The answer reframes the entire project: if late-stage markets aren't doing price discovery, the v1+v3 "Polymarket prices encode all info" picture is even stronger and the project should pivot venues or move to liquidity-provision. If they *are* doing discovery, cycle-3 has a clean direction.

**Effort estimate:** S (1-2 hours; pure pandas + sklearn, no new IO).

**Data already on disk:** Yes (`all_markets_v4.parquet` has all four price columns). Earnings will only have 3d and 1d, but that's enough for a 3d→1d trajectory test in earnings.

**External API needed:** None.

### Direction B — Selection-bias quantification: what fraction of "in scope" events get a Polymarket market?

**Question it answers:** When Polymarket creates a market for a geopolitical or economic event, is that listing decision itself informative? If only the high-attention events get listed, the universe in `all_markets_v4.parquet` is non-random and the calibration story may be conditional on selection. Concretely: across e.g. all "election" or "ceasefire" or "rate cut" events catalogued by GDELT in 2024-2025, what fraction received a Polymarket binary market within 60 days of occurrence? If 5%, listing is a strong signal; if 80%, it's not.

**What it would test:** Pull GDELT GKG event lists for 2024-2025 in a few canonical buckets (election, ceasefire, central-bank-decision). Match against `ticker_or_event` slugs. Compute coverage rate. Then compare market calibration on the matched-universe slice vs the unmatched slice (where applicable in cycle-1 results — but only as sensitivity, not main result).

**Why this is informative not promising-looking:** Project-level question. If selection bias is strong, every prior verdict (B across v1, v3) needs an asterisk: "calibrated *on the listing-selected universe*." That doesn't flip B → A, but it does change what we tell users about /stats.

**Effort estimate:** M (2-4 hours: GDELT pull is free, no key needed; matching is fuzzy and labor-intensive).

**Data already on disk:** No (GDELT pull required).

**External API needed:** GDELT 2.0 GKG (free, no key).

### Direction C — External-context feature value: GDELT news-tone + FRED Geopolitical Risk Index as predictors over and above the implied price

**Question it answers:** Does adding **off-Polymarket information** (GDELT news tone for the event topic; FRED GPR index value at T-3d) beat the implied-price-only baseline on log loss / AUC? This is the v1+v3 "Polymarket prices encode all info" finding under a stronger test: instead of richer model classes (v3 M1-M5 all failed), use *strictly external features* the market itself can't fully see in real time.

**What it would test:** For each geopolitics + econ cell with N ≥ 200 (so 6 of 6 in-scope non-earnings cells qualify), fit two logistic models:
- Baseline: `outcome ~ entry_yes_price_3d`
- Extended: `outcome ~ entry_yes_price_3d + gdelt_tone_event_topic_T-3d + gpr_index_T-3d`

Walk-forward by quarter. Bootstrap CI on log-loss delta. If extended doesn't beat baseline by ≥0.01 log loss with CI excluding zero on any cell, the v1+v3 picture is even more conclusive: even fresh external signals don't improve on the price. If it does beat, cycle-3 has a clean strategy direction (bet when external features predict outcome opposite to what implied price says).

**Why this is informative not promising-looking:** This is a stronger version of the core question of the entire project. v1 tried internal feature engineering (failed). v3 tried richer model classes (failed). External signals are the next axis. If they also fail, the project-level verdict graduates from "no edge in this model class" to "no edge from any incremental information beyond implied price across three categories" — which is a much stronger claim and arguably the right note to wind down on.

**Effort estimate:** M (3-5 hours: GDELT tone time-series pull is the biggest chunk; FRED GPR is a single CSV).

**Data already on disk:** No.

**External API needed:** GDELT (free), FRED (free, key trivially obtained).

### Direction D — Information-speed audit: how fast does the price snap at the econ-data release timestamp?

**Question it answers:** For econ markets, the price discontinuously revalues at the BLS / BEA / Fed release timestamp. *How fast?* If the bid-side bounce takes ≥30 minutes after release, slow retail flow is paying stale prices to fast adapters during the window. If it's <60 seconds, there's no window. This is a microstructure question that cycle-1's daily-snapshot data literally cannot answer — it requires sub-minute fidelity around the release minute.

**What it would test:** Pick the 30 highest-volume econ markets (CPI, PCE, NFP, FOMC) with end_date in the last 12 months and a known wire-release timestamp. Fetch CLOB at fidelity=15 (15-minute) or 60 (1-hour) for the ±2-hour window around release. For each market, measure (a) time from release to first tick that crosses 0.50, (b) total absolute price travel in the next hour, (c) whether the post-release equilibrium matches the pre-release implied probability adjusted for the surprise direction.

**Why this is informative not promising-looking:** This is a *new evidence axis* (microstructure timing) that no v1/v2/v3/v4-cycle-1 protocol has touched. If snap is <60s, then the whole project's microstructure assumption ("12h fidelity is enough") is right and the locally-stored data is fit-for-purpose for all subsequent work. If snap is >30min, cycle-1's findings are conditional on snapshot timing relative to release windows and we have a real microstructure story to tell.

**Effort estimate:** M (2-3 hours: orchestrator pre-fetches the 30-market intraday CLOB to avoid the silent-IO trap; agent does the analysis).

**Data already on disk:** No (intraday CLOB needs to be pulled).

**External API needed:** Polymarket CLOB `/prices-history?fidelity=60` (free, public).

### Direction E — Orderbook depth audit (the v1 CR1 unblock)

**Question it answers:** What does the live bid-ask spread distribution look like across the in-scope sub-$50K cells? v1's CR1 was specifically blocked on this; v1's verdict noted real CLOB ask-side prices are "2-5% worse" than the snapshot mid (an estimate, not a measurement). If the median spread on currently-open low-liquidity markets is, say, 6%, then **every cycle-1 strategy result is overstated by ~3pp on entry alone**, which would push borderline cells from "near miss" to "deeply negative" after spread is properly modeled.

**What it would test:** For ~100 currently-open low-liquidity Polymarket markets across the 3 in-scope categories, pull `/book?token_id=X` (untested locally; likely free). Record best bid, best ask, depth at $50, $250, $1000 fill sizes. Histogram. Quantify the "real cost of entry" distribution per cell. Use it to rerun cycle-1 cells with realistic execution cost as a sensitivity check.

**Why this is informative not promising-looking:** This is the same "unblock" v1 explicitly listed in `docs/research/VERDICT.md` under "What would change the answer." If spreads are wide enough, cycle-1's verdict is fragile against execution cost; if they're tight, cycle-1's results stand. Either way, the answer is project-level and it's the cleanest unblock from the v1 verdict's recommendations table.

**Effort estimate:** S (1-2 hours: orchestrator pre-fetches; agent histograms).

**Data already on disk:** No (live orderbook snapshot required).

**External API needed:** Polymarket CLOB `/book` (likely free, untested).

## Anti-recommendations (cycle 2 should NOT do this)

These would be tempting after cycle-1 results land but are the cherry-picking trap. Pre-registering them as forbidden so the orchestrator doesn't drift:

1. **"Test cycle-1's near-passing cell at higher N."** Promising-looking, not informative. If cell X passes by chance and Holm-Bonferroni rejects it, getting more N on cell X without changing the question is just chasing the same noise. Equivalent to v1's S6-outlier trap.

2. **"Add strategy variants S5–S10 for cycle-1's best cell."** Variant proliferation produces fake edge by random sampling — exactly the failure mode `WHY_NOT_INFINITE.md` warns about. 1000× variants → ~50 false positives at p<0.05.

3. **"Relax the 3-day entry to T-1d / T-12h to see if a tighter window passes."** This is a threshold relaxation in disguise. If T-3d entries don't pass, T-1d entries facing even better-calibrated prices won't either; we'd be hunting the noise level.

4. **"Pivot to >$50K markets."** The whole v4 scope rationale is sub-$50K. Pivoting mid-session is `inventing_new_categories_mid_session` adjacent and breaks the SESSION_CONFIG contract.

5. **"Add 5 more strategies for the cells where the protocol gave N=0 due to data missingness (earnings × S2)."** That's data-fixing, which belongs in orchestrator IO, not in a cycle-2 strategy proliferation. If we want T-7d earnings prices, fetch them; don't paper over the gap with new strategies.

6. **"Add cell-specific feature engineering after seeing which cells almost passed."** Forking strategies on cell-result-conditioned features is leakage by construction.

## Top recommendation

**Best cycle-2 direction: Direction C (external-context features)** — provided the wall clock allows ~3-5 hours of agent runtime in cycle 2.

**Why:** It's the strongest version of the central project-level question. v1's negative was "internal model features don't beat the price." v3's negative was "richer model classes don't beat the price." Direction C asks "do *external, non-Polymarket-derived* features beat the price?" — which is the last axis on which the "Polymarket prices encode all info" hypothesis can fail or be confirmed. A null result here is the most decisive null result the project could deliver: it would let us write a final-form verdict that doesn't have an open question hanging on "but what if you used different features?" A non-null result would *also* be decisive — it would unblock a real cycle-3 strategy direction with pre-registered structure.

**Fallback if the orchestrator wants something cheaper:** Direction A (outcome-conditional T-7d → T-1d information content). Pure pandas/sklearn on data already on disk, S effort, and answers a structural question that informs every later decision (does Polymarket do late-stage price discovery in any of these categories? Affects how we frame the dashboard and whether late-stage strategies are theoretically possible in this universe at all).

**Best for cycle 2 specifically vs cycle 3+:** Direction A and Direction E are best for cycle 2 (low-effort, on-or-near disk data). Direction B and Direction C are higher-impact but need GDELT/FRED ingestion that fits within cycle 2 only if the orchestrator pre-fetches in parallel. Direction D is best deferred to cycle 3 because (a) intraday CLOB is a known IO-stall risk that needs careful pre-execution, and (b) it answers a microstructure question that's important but not load-bearing on the project-level verdict.

If the wall clock at cycle-2 dispatch is < 4 hours remaining, I'd actually pick **Direction A** over C — it's the one with the highest information-per-hour ratio and uses only data already on disk.
