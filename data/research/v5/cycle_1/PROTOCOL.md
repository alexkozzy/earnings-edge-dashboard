# Cycle 1 Protocol — geopolitics universe + scope decision + baseline backtest

**Pre-registered.** Locked. Direction is fixed by SESSION_CONFIG (geopolitics primary). Sub-category × tier × strategy grid spec below.

## Why geopolitics specifically (rationale, locked into config not chosen here)

Per SESSION_CONFIG.md, geopolitics is the locked primary. Justification carries forward from prior sessions:
- Earnings: dead (v1 + v3 both B)
- Econ data (cycle 1 of v4 + v1 EC1): well-calibrated; price encodes signal
- Crypto: covered in v1
- Geopolitics: 35K resolved markets in v4 harvest, never tested as a category cluster — fresh evidence territory
- The v4 dataset showed Trump 2024 / Iran ceasefire / Fed-rate markets are the high-volume tickets. The low-liquidity geopolitics segment is the most genuinely under-studied corner.

## Scope-decision delegation

Agent A (cycle 1) writes `data/research/v5/cycle_1/SCOPE_DECISION.md` choosing one of:

- **Option A — geopolitics-only** (sufficient cell density)
- **Option B — geopolitics + Kalshi cross-venue pairs** (only if v2-style pairing yields ≥ 30 high-confidence pairs after semantic filtering)
- **Option C — geopolitics + Polymarket "economy" tag adjacent** (if cell density of geopolitics alone is below the threshold)

Threshold for Option A sufficient: ≥ 6 cells with N ≥ 80 across the 3 sub_categories × 4 tiers grid (12 max), preserving sub_tag_diversification.

If Option A fails the density test, Agent A picks Option B or C with explicit reasoning. Document.

## Sub-category classification rules (locked)

For each market, classify by question text:

- **hard_currency** if regex matches monetary, count, or measurable underlying:
  `\$|\bUSD\b|\bdollar|\bbarrel|\b(M|B)\b|\d+%|export|sanction.*lift|tariff|reserve|GDP|treasury|missile.*launched|nuclear.*test|drone.*strike\b`
- **action_count** if regex matches countable events not handled above:
  `\bhow many\b|\bnumber of\b|\bcount of\b|\bat least\b\s\d|\bmore than\b\s\d|\bfewer than\b\s\d`
- **discretionary** otherwise (judgment-based: meet, agree, sign, declare, win, lose, etc.)

Rules applied in order; first match wins. Document distribution counts in SCOPE_DECISION.md.

## Sub-tag classification (locked)

Substring match on question text (case-insensitive), first match wins:

- `iran` ← /iran|tehran/
- `ukraine` ← /ukraine|kyiv|zelensky/
- `china_taiwan` ← /china|taiwan|xi jinping|beijing/
- `israel` ← /israel|gaza|hamas|netanyahu/
- `venezuela` ← /venezuela|maduro/
- `cuba` ← /cuba|havana/
- `yemen` ← /yemen|houthi/
- `syria` ← /syria/
- `korea` ← /\bkorea\b|kim jong/
- `trump_putin` ← /trump.*putin|putin.*trump|trump.*russia|kremlin.*trump/
- `other` ← fallback

Sub-tag minimum: include sub-tags where N ≥ max(30, 0.05 × universe_size). Sub_tag_diversification robustness check requires every passing cell to remain valid after dropping the most-represented sub_tag.

## Strategies (max 4 — locked)

Same shape as v4 cycle 1 (price-threshold + drift) since this is the **baseline** test for geopolitics:

**S1 — Fade extremes.** NO if `entry_yes_3d > 0.85`; YES if `entry_yes_3d < 0.15`. Stake $50.

**S2 — Mean-reversion drift.** Drift = `entry_yes_3d - entry_yes_7d`. NO if drift > 0.10; YES if drift < -0.10. Skip rows missing T-7d entry. Stake $50.

**S3 — Stale-price reversion.** From CLOB history: max price-change in past 3 days ≤ 3pp AND `entry_yes_3d ∈ (0.05, 0.95)` → bet cheaper side. Stake $50.

**S4 — Time-decay long-tail.** NO if `entry_yes_3d < 0.15` AND `trading_window_days ≤ 14`. Stake $50.

## Subagent dispatch — 4 agents

**Agent A — universe construction + SCOPE_DECISION.** Reads existing v4 geo data, applies sub_category + sub_tag classification, writes `data/research/v5/markets/universe.parquet` and `cycle_1/SCOPE_DECISION.md`.

**Agent B — baseline backtest.** Waits for A. Runs the (3 sub_cat × 4 tier × 4 strategy = 48 cells) grid with bootstrap CIs. NB: B must verify walk-forward integrity per bet.

**Agent C — news-feed availability matrix + activity-feed scraper decision.** Two-part:
- Part 1: GDELT, FRED, Twitter/X, RSS, paid feeds — capability matrix.
- Part 2: Polymarket public activity-feed feasibility. Investigate gamma-api, CLOB API, websocket. If feasible, build a 1-hour pilot, capture trades on top-volume open geo markets, check if large trades correlate with subsequent moves. **Decision must be data-driven.**

**Agent D — creative + LLM-graded resolution-criteria ambiguity.** Reads prior verdicts + bounded vault list. Generates 5-7 alternative geopolitics-specific framings. Allocates ≤ 200 LLM grading calls (40% of session budget) for the resolution-criteria ambiguity hypothesis: do markets with ambiguous resolution criteria mispriceably differ from markets with crisp criteria?

## Walk-forward integrity

Same as prior sessions. For each cell in B's backtest, sort rows by `end_date` ascending, ensure features computed for a bet at row i use only data from rows with `end_date < end_date[i]`. Verify per bet count.

## Halt conditions

- If Agent A's scope decision is C (insufficient geopolitics-only density), B's backtest grid expands to include the secondary category (econ-adjacent).
- If GDELT returns < 50% market coverage, document and continue with what's available.
- If activity-feed scraper is build-feasible: cycle 2 likely follows it. If not: cycle 2 picks an orthogonal direction.

## Outputs

- `data/research/v5/markets/universe.parquet` — full classified universe
- `data/research/v5/cycle_1/SCOPE_DECISION.md` — A's scope choice + justification
- `data/research/v5/cycle_1/cells.parquet` — 48-cell results
- `data/research/v5/cycle_1/per_bet_ledger.csv`
- `data/research/v5/cycle_1/RESULTS.md`
- `data/research/v5/cycle_1/NEWS_SOURCES.md`
- `data/research/v5/cycle_1/ACTIVITY_FEED_DECISION.md`
- `data/research/v5/cycle_1/ALTERNATIVES.md` (D's creative output)
- `data/research/v5/cycle_1/lessons.md` (orchestrator-written between cycles, not by an agent — keeps cycle 2 direction honest)
