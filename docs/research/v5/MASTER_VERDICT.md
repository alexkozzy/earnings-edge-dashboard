# Master Verdict v5 — Geopolitics multi-cycle

**Cycles run:** 3
**Total cells tested:** ~16 across all cycles (5 testable backtest cells in cycle 1 + 4 in cycle 2 + 3 model variants in cycle 3 + activity-feed pilot)
**Hard cap reached:** No (early stop after cycle 3)
**Total runtime:** ~1h 30min of 7h cap (cycles efficient; no agent stalls thanks to orchestrator pre-execution of bulky IO)
**Scope chosen:** geopolitics-only (Option A from cycle 1 SCOPE_DECISION)
**Activity feed scraper status:** built + tested (whale-follow REJECTED on N=1402)

## Result: B (one mechanism-supported but underpowered signal)

The verdict is B at the protocol level — no cell or model variant survives all four locked thresholds (Sharpe ≥ 0.75, CI lower ≥ 0.30, N ≥ 80, max DD ≤ 30%) plus Holm-Bonferroni correction plus all four robustness checks. But this is a qualitatively different B than v1/v3/v4: cycle 2 surfaced **the only mechanism-supported, placebo-discriminated signal across 5 sessions of evidence**. It fails primary by N=40 (vs the locked N=80) and Sharpe 0.631 vs 0.75 — but the placebo controls passed at 3+ SE. The honest reading is "there is plausibly a real bias here; we cannot reach Verdict A on this dataset alone."

## Cells tested (multiple-comparisons-corrected)

| Cycle | Cell description | N | Sharpe | CI lower | Max DD | Robustness | Verdict |
|---|---|---:|---:|---:|---:|---|---|
| 1 | discretionary × <5K × S1 | 122 | -2.57 | -3.40 | -84% | not run (failed primary) | B |
| 1 | discretionary × <5K × S4 | 91 | +0.05 | -0.61 | -47% | not run | B |
| 1 | discretionary × 5-15K × S1 | 156 | -3.74 | -4.42 | -91% | not run | B |
| 1 | discretionary × 15-50K × S1 | 239 | -2.36 | -2.94 | -85% | not run | B |
| 1 | discretionary × 15-50K × S4 | 92 | -2.19 | -2.67 | -57% | not run | B |
| 2 | AMBIG-mid YES (S5) | 40 | **+0.631** | **+0.297** | -8% | not run (N gate failed) | **B (near-miss)** |
| 2 | AMBIG-mid NO (S6, mirror) | 40 | -0.713 | -1.71 | -1218 | n/a (loss expected) | sanity-pass |
| 2 | CRISP-mid YES (S7, placebo) | 200 | +0.067 | -0.081 | -660 | n/a | placebo neutral as expected |
| 2 | CRISP-hard_currency (S8, placebo) | 25 | -0.233 | -0.821 | -344 | n/a | placebo neutral as expected |
| 3 | V1 implied baseline | 2836 | (LL=0.2403) | — | — | — | reference |
| 3 | V2 implied + GPR | 2836 | LL=0.2423 (+0.002) | — | — | — | B (neutral) |
| 3 | V3 implied + GPR + sub_cat | 2836 | LL=0.2459 (+0.006) | CI [+0.002, +0.010] | — | — | B (significantly worse) |
| C | Whale-follow on >$1K trades | 1402 | direction-hit 0.395 | — | — | — | B (rejected) |

**Holm-Bonferroni denominator:** 16 cells. Family-wise α = 0.05 → per-cell α ≈ 0.003. The cycle 2 S5 cell's bootstrap one-sided p-value for "Sharpe > 0" is roughly 0.011 (CI lower 0.297 close to but above zero). After Bonferroni correction, **does not pass** (0.011 > 0.003 / cells_tested per Holm-Bonferroni).

## Cells passing primary threshold

**Zero.** S5 (cycle 2) is the closest to passing — fails N gate by 40 markets and Sharpe gate by 0.119 (Sharpe 0.631 vs 0.75 threshold).

## Cells passing all four robustness checks

**Zero** (no cell qualifies — all failed primary).

## Key cross-cycle finding

**The AMBIGUOUS-resolution-criteria YES bias is the only positive signal across 5 sessions of evidence**, and it survives placebo controls at 3+ SE. This suggests UMA-resolver dispute behavior (defaulting to YES on subjective questions) creates a structural pricing inefficiency on a specific market subset. The constraint is statistical power: AMBIGUOUS-mid markets are ~17% of the geopolitics mid-band universe. Reaching N(S5) ≥ 80 requires grading ~2,400 markets — exceeds the v5 LLM-call budget.

## What we now know about the project (v1 → v5)

| Session | Hypothesis class | Verdict |
|---|---|---|
| v1 | EPS-modeling + 13 strategies × earnings/econ/crypto | B (decisive) |
| v2 | Cross-venue Polymarket↔Kalshi arb | incomplete (Kalshi pairing structurally hard; bucket mismatch) |
| v3 H1 | Hedging variance reduction | B (protocol bug found: spec'd direction was inverted) |
| v3 H2 | 5 alternative model classes (no-price, RF, HGBC, k-NN, simple stack) | B |
| v4 cycle 1 | Low-liquidity scraper × 3 categories × 3 tiers | B (calibration holds at low liq) |
| v5 cycle 1 | Geopolitics low-liq baseline | B (calibration holds at 4th category) |
| v5 cycle 2 | LLM-graded ambiguity + placebo | B (near-miss; placebos pass at 3+ SE) |
| v5 cycle 3 | External GPR feature test | B (V3 significantly worse than implied baseline) |

**Synthesis:** Polymarket implied prices on resolved markets in earnings, econ, crypto, and geopolitics categories are extremely well-calibrated. AUC for the implied baseline on geopolitics = 0.949. No price-derivable model class, no internal accounting features, no external macro context, no whale-flow signal beats the price. The single mechanism-supported exception is **resolution-criteria ambiguity**, which surfaced in cycle 2 as a placebo-controlled but underpowered finding.

## Project-level recommendation

The honest call: **wind down active strategy research; fork the dashboard as a verdict-presentation tool.**

Reasoning:
1. **Five sessions of evidence converge on Polymarket prices being well-calibrated.** The base rate of false-positive findings in research projects this size is high; that we found ZERO Verdict A across 5 distinct hypothesis classes is decisive evidence of no easy edge.
2. **The cycle 2 ambiguity finding is a real candidate for follow-up** — but reaching Verdict A requires a much larger LLM grading budget (~$15-30 paid grading) AND a fresh sample design that avoids any data overlap. This is a 4-8 hour future session, not a continuation.
3. **The dashboard is more valuable as a benchmark/monitoring tool** than as a strategy advertisement. The current geopolitics tab + verdict banner already supports that framing.
4. **The activity-feed endpoint discovery (data-api.polymarket.com/trades)** is independently useful — it could power a public "Polymarket whale tracker" that's interesting research/journalism even without a tradeable strategy.

## Three options ranked by EV

**Option 1 — recommended: ship the dashboard as a public benchmark + close active research.**
The dashboard already shows honest verdicts. Update homepage copy to remove any "we have edge" framing. Add a short "Research Findings" section linking to docs/research/v5/MASTER_VERDICT.md. Keep paper-bet logger running for future re-eval (free; data accumulates). Re-evaluate at Q1 2027 if N for the AMBIGUOUS-mid cell crosses 80 organically.

**Option 2 — pursue the cycle 2 follow-up: grade 2,400 markets.**
4-8 hour future session, $15-30 in LLM grading costs (or in-context if budget allows). High variance on outcome — could flip to Verdict A or close out as B. Only worth it if Option 1 (close out) feels like premature surrender.

**Option 3 — pivot entirely: build a public Polymarket whale tracker using the cycle 1 endpoint discovery.**
Different project shape (data journalism / public-benefit), reuses dashboard infrastructure. Doesn't claim trading edge — claims transparency value. Could ship in 1-2 sessions.

## API recommendations (for future research)

Ranked by EV/cost:

1. **Polymarket `data-api.polymarket.com/trades`** — newly discovered in cycle 1, no auth, ≥16h history per market. Free. Useful for any future flow-following or whale-tracking work.
2. **Polymarket CLOB `prices-history`** — used in all 5 sessions, 12h fidelity, no auth. Mature toolchain.
3. **Caldara-Iacoviello GPR Index** — free, daily back to 1985, accessible at `https://matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls` (the cycle-1-published `www2.bc.edu` URL is dead-letter; the GitHub Pages mirror works). Coverage is one number per day; not granular enough for ticker-specific work.
4. **GDELT 2.0 Doc + TimelineVol** — verified working in cycle 1, free, no auth. Rate-limited (1 req/5s for Doc); usable for sample-based backtests, not full-universe.
5. **HN Algolia + Wikidata SPARQL** — free, no rate limit. Niche use cases but worth knowing.

Skipped: NewsAPI / Tavily / Exa / Twitter (all paid or auth-blocked locally).

## Open questions for the user (priority order)

1. **Recommend Option 1 (close out).** Do you concur, or want to pursue Option 2's cycle-2 follow-up?
2. **Update home page copy** to remove any framing claiming edge. Current verdict banner displays B; the prose elsewhere may still claim the original thesis. Should I do a copy-pass?
3. **The AMBIGUOUS-mid finding is genuinely interesting** even at N=40 — would you want this written up as a short research artifact (suitable for a finance application portfolio piece)?
4. **The activity-feed endpoint discovery is independently shippable** as a "Polymarket whale tracker" public tool. Worth scoping?
5. **Five sessions of compute is a lot of subscription time.** With remaining time, is it best to ship/deploy/wind-down, or push on Option 2/3?

## Stop reason

Cycle 3 produced the third orthogonal Verdict B in this session. Continuing with cycles 4-6 would test directions whose priors are now even weaker — the marginal information value drops sharply. Per WHY_NOT_INFINITE.md's "no more useful tests" stopping condition, I'm electing to stop here and write this verdict. ~5h of session budget remains for deploy, copy-pass, and any user-directed follow-up.
