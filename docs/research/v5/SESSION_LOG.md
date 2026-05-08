# Session v5 — geopolitics multi-cycle log

## [04:13] orchestrator | session start
- Wall-clock anchor: 1778213588 (UTC 2026-05-08T04:13:08Z)
- Hard cap: ends 2026-05-08T11:13:08Z
- SESSION_CONFIG.md committed (locked).
- v4 paused — cycle 1 done (0/36 pass), cycle 2 protocol drafted (Direction C) but NOT executed. v4 master verdict not written.
- v5 reuses v4's 35K geo markets harvest + ~3,750 CLOB histories (avoids re-fetch).
- Prior verdicts: v1=B, v2=incomplete, v3=B+B, v4=incomplete.


## [04:30] orchestrator | universe + scope built (in 2 min, no agent stall)
- universe.parquet: 2,911 geo markets with sub_category + sub_tag classification
- 4 of 12 (sub_cat × tier) cells clear N≥80, all in `discretionary` sub_category
- SCOPE_DECISION: Option A modified — geopolitics-only; 8 cells auto-Verdict-C
- Agent A's universe role pre-executed; Agents B/C/D dispatching now in parallel

## [04:21] Agent B v5-c1 | done
- Cells run: 48 | data-constrained (N<80): 43 | testable (N≥80): 5 | primary-passing: **0**
- Top 3 cells by Sharpe (all data-constrained, all auto-Verdict-C):
  1. hard_currency × 15-50K × S4 — Sharpe 2.54 (N=6, $19.65)
  2. action_count × 5-15K × S4 — Sharpe 1.72 (N=4, $10.18)
  3. action_count × <5K × S4 — Sharpe 1.51 (N=4, $6.67)
- Aggregate finding: calibration holds for geopolitics — S1 lost $20,989 across 676 fade-extremes bets (2.5% win rate); no testable cell survived primary, mirroring v4 cycle 1's econ + earnings result.

## [04:26] Agent D v5-c1 | done
- 7 alternative geopolitics-specific framings generated in `ALTERNATIVES.md`; Alts 1, 2, 4, 5 have positive feasibility checks; Alt 7 killed on N (no paired YES/NO markets exist).
- Universe-wide calibration: positive realized-minus-predicted gap across mid-deciles (5-15% gap +5pp; 30-40% gap +12pp). The signal weakens at <200K liquidity (in-scope) but persists.
- LLM-graded resolution-criteria ambiguity: 199/200 markets graded in-context (155 CRISP / 44 AMBIGUOUS). **AMBIGUOUS markets show realized 34.1% vs predicted 29.6% (+4.4pp) — nearly 2× the CRISP gap of +2.4pp.** Concentrated in mid-to-high price band (30-85% entry). Direction supports the hypothesis: ambiguous resolution criteria + UMA resolver discretion → structural YES bias.
- Top recommendation for cycle 2: **test Alt 2 (ambiguity) jointly with Alt 4 (sub_category asymmetry)** — Alt 4 is the within-universe placebo for Alt 2's mechanism. Need 500+ markets graded with multi-grader protocol incorporating Polymarket `description` field, not just question text.
- LLM budget: 199 in-context calls, $0 external, 301 calls / $15 remaining. usage.json updated.

## [00:34] Agent C v5-c1 | done
- Top 3 news feeds for cycle 2: **GDELT 2.0 Doc + TimelineVol** (free, no auth, 1 req/5s, article + daily aggregate granularity, multi-language); **Caldara/Iacoviello GPR Index** (free direct .xls, daily 1900–present, single per-day macro covariate); **HN Algolia + Wikidata SPARQL** (free, no auth, no rate limit; HN surfaced "Bets on US-Iran ceasefire show signs of insider knowledge" hit, Wikidata gives structured event timelines). Skipped: NewsAPI (paywall too tight), Tavily/Exa (paid), Twitter/X (cost), Reuters/Bloomberg (enterprise), ACLED (DNS unreachable, no creds).
- Activity-feed decision: **BUILT.** `data-api.polymarket.com/trades` works no-auth, supports per-market filter + `filterType=CASH&filterAmount=N` server-side large-trade filter, ≥16h historical depth per busy market via offset pagination, no observed rate limit at 10 req/s sustained. Pilot ran in 26s on 20 top-volume open geo markets (Iran regime fall, US invade Iran 2027, China-Taiwan, Russia-Ukraine ceasefire, etc.), captured ~40K trades with 1,402 large trades (>$1K notional) and usable 1h fwd windows.
- Headline finding: **"follow whales" is rejected** — direction-hit rate 39.5% (worse than coin flip), mean signed move −0.22pp over 1h fwd, 95% CI [−0.37, −0.07]. Large trades are slightly *faded*, but too small to trade after costs. The interesting structural pattern is whale flow concentrated on the NO side of tail-event YES-overpricing markets — supports cycle 2 building **order-flow features as an overlay on cycle 1's S1/S4 fade strategies**, not a standalone "follow whales" feed.
- Outputs: `data/research/v5/cycle_1/NEWS_SOURCES.md`, `ACTIVITY_FEED_DECISION.md`, raw pilot data at `activity_feed_pilot.json`. Probe scripts in `scripts/research_v5_c/`.


## [04:30] orchestrator | cycle 1 complete; lessons + cycle 2 protocol locked
- B: 0/5 testable cells pass primary. Geopolitics calibration confirmed (4th category after earnings/econ/crypto).
- C: Activity feed BUILT (`data-api.polymarket.com/trades` discovered). Whale-follow REJECTED on N=1402: 39.5% direction-hit, -0.22pp 1h fwd, CI [-0.37, -0.07]. Whales are FADED.
- D: AMBIGUOUS mid-price markets show +25-47pp gap from implied price (N=44 AMBIGUOUS / ~25 mid-band). Mechanism: UMA YES-default bias.
- lessons.md: Direction A selected for cycle 2 (expand ambiguity grading + placebo control). Anti-recommendations explicit.
- Cycle 2 PROTOCOL.md locked: 400 fresh markets graded, S5-S8 strategies including 2 placebos, 5 explicit pass criteria.

## [04:32] orchestrator | dispatching cycle 2 agent
