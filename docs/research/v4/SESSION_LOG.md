# Session v4 — multi-cycle log

## [03:52] orchestrator | session start
- Wall-clock anchor: 1778125963 (UTC 2026-05-07T03:52:43Z)
- Hard cap: 7 hours → ends 2026-05-07T10:52:43Z
- SESSION_CONFIG.md committed (locked).
- Prior verdicts: v1 B, v2 incomplete, v3 B+B.
- v4 hypothesis class: low-liquidity scraper edge across 3 categories × 3 tiers × 4+ strategies.
- Methodology vs prior: + Holm-Bonferroni correction + 4 robustness checks (was 3) + Monte Carlo confirmation for any passing cell.
- Cycle 1 protocol writing next.


## [00:00] orchestrator | data fix complete
- Re-scraped earnings tag with volumeNum (recovered for 819 markets)
- Stratified-sampled 2000 econ + 2000 geo low-vol markets; CLOB fetched in 242s
- Unified parquet: 5,745 rows. All 9 (category × <50K tier) cells clear N≥80.
- Cell coverage:
    earnings:    <5K=191  5-15K=321  15-50K=249
    econ:        <5K=289  5-15K=397  15-50K=425
    geopolitics: <5K=167  5-15K=282  15-50K=357
    crypto:      15-50K=219 (other tiers empty by construction)

## [00:02] orchestrator | dispatching B + C + D for cycle 1

## [04:05] Agent D v4-c1 | done
- 5 directions generated: A (T-7d→T-1d outcome-conditional info content), B (selection-bias quantification via GDELT coverage), C (external-context features GDELT+FRED), D (info-speed audit on econ release timestamps), E (orderbook depth audit / v1 CR1 unblock).
- Top recommendation: **C** if cycle-2 has ≥4 hours wall-clock remaining; **A** as fallback (uses only on-disk data, S-effort, highest info-per-hour).
- Read Agent B's outputs? **NO** — pre-registration kept honest. Agent B's results had not landed at the time of writing. Authored from the parquet structure alone.
- Key structural finding flagged in lessons.md: earnings has NO `entry_yes_price_7d` and NO `entry_yes_price_late` (all 761 in-scope earnings rows missing both) — so cycle-1's S2 "drift fade" cells for earnings will mechanically return N=0; that's a data gap, not a strategy result.
- Calibration in extreme buckets is already excellent across all 9 in-scope cells (>0.85 yes-rate 92.9–100%; <0.15 yes-rate 0.0–6.2%) — strongly predicts S1 and S4 will lose money in every cell, recapitulating v1 EC1.

## [00:08] Agent B v4-c1 | done
- 36 cells run; **0 cells pass primary** (Sharpe ≥ 0.75, CI lower ≥ 0.30, N ≥ 80, max DD ≤ 30%).
- 26/36 cells data-constrained (N < 80). Remaining 10 cells (with N ≥ 80): 9 of them are S1 cells (mostly catastrophic Sharpes -1 to -9), plus `geopolitics 15-50K S4` (Sharpe -2.29) and `earnings 5-15K S3` (Sharpe -1.08). The only N≥80 cell with positive Sharpe is `econ 5-15K S1` (Sharpe 1.45) — but its CI lower is -0.34, fails CI gate.
- Top 3 cells by Sharpe: (1) **econ × <5K × S4** Sharpe 7.36 / CI lower 5.90 / N=76 (FAILS N gate by 4 bets — primary blocker; win rate 72.4%, mean P&L +$2.08, maxDD 0.05%). (2) econ × 5-15K × S1 Sharpe 1.45, N=232 (FAILS CI gate). (3) earnings × 5-15K × S2 Sharpe 0.92, N=46 (FAILS N gate).
- Per-strategy aggregate: S1 -$17,303 over 1,477 bets; S2 +$2,842 over 347 bets; S3 -$2,987 over 381 bets; S4 -$459 over 388 bets. S2 is the only strategy with positive aggregate P&L but every individual S2 cell is N<80.
- **Robustness-check candidates for Agent C: NONE pass primary.** The closest near-miss is `econ <5K S4` (would pass everything except N=76). Agent C may want to investigate it as a near-miss case study, but it does not meet the locked primary gate.
- Outputs: data/research/v4/cycle_1/cells.parquet, cells.csv, per_bet_ledger.csv (2,593 bets), RESULTS.md.
- v1 EC1 prediction (Agent D) confirmed: S1 fading-extremes is unprofitable across all 9 (cat × tier) S1 cells with N ≥ 80. The cycle hypothesis "low liquidity degrades calibration" is REJECTED for S1, S3, S4 in current form. S2 ambiguous (positive aggregate but every cell underpowered).

## [00:14] orchestrator | cycle 1 complete; synthesizing
- B: 0/36 cells pass primary. 26 data-constrained (N<80). Top near-miss: econ × <5K × S4 with Sharpe 7.36 / N=76 / total +$158 — fails N≥80 by 4 bets, max DD 0.05% (very low variance, NOT cherry-pickable).
- Aggregate finding: S1 fade-extremes lost $17,303 over 1,477 bets across all (cat × tier) cells — REFUTES cycle 1's "low-liquidity degrades calibration" hypothesis. Polymarket is well-calibrated even at sub-$5K liquidity.
- D: lessons.md pre-registered before B's results landed. Top recommendation: Direction C (external features via GDELT + FRED GPR). Anti-recommended: extending S4 cell.
- Cycle 2 direction confirmed: Direction C. Tests "do external signals add information beyond Polymarket-implied price?" — orthogonal to cycle 1's threshold strategies.


## [00:18] orchestrator | v4 paused — user pivoted to v5
- v4 cycle 1 RESULTS shipped: 0/36 cells pass primary; econ × <5K × S4 near-miss documented (N=76 of 80 needed; per protocol does not qualify).
- v4 cycle 2 PROTOCOL.md was drafted (Direction C: external context features) but NOT executed.
- User dispatched v5 (geopolitics-focused, 7h cap, deploy at end). v5 SESSION_CONFIG to be written immediately.
- v4 master verdict NOT written — left as incomplete. v4 data is reused as input to v5 (35K geo markets already harvested + 5,745 unified parquet).
