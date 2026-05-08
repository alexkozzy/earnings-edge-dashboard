# Scope Decision — Cycle 1

**Decision:** Option A modified — geopolitics-only, with explicit acknowledgment of data-constrained cells.

## Universe summary

- **Total geopolitics markets** with full T-3d entry data: **2,911** (out of 35,067 raw harvested in v4; the difference is markets where v4 didn't fetch CLOB price-history)
- **In <200K tiers** (in scope for primary): **955**

## Cell density (3 sub_categories × 4 tiers = 12 cells max)

```
liquidity_tier  15-50K  5-15K  50-200K  <5K
sub_category
action_count        13     21        1   15
discretionary      313    236      105  150
hard_currency       43     51        1    6
```

**Cells with N ≥ 80:** **4 of 12** (all in `discretionary` sub_category × 4 tiers)

## Sub_tag distribution

```
other           2418
iran             244
israel            72
ukraine           53
korea             45
china_taiwan      33
venezuela         29
trump_putin       13
syria              2
yemen              1
cuba               1
```

**Significant sub_tags** (N ≥ max(30, 5% of universe = 145)): only `other` qualifies. **Iran (244) is the dominant non-other sub_tag.** sub_tag_diversification robustness check will be tight: any cell that's heavily Iran-themed will need to remain valid after dropping Iran.

## Decision rationale

**Option A geopolitics-only is chosen even though only 4 of 12 cells clear N ≥ 80**, because:

1. **The 4 discretionary cells are well-powered** (105 to 313 markets each). With Holm-Bonferroni across 4 cells × 4 strategies = 16 cells max, per-cell α ≈ 0.003 — strict but achievable for a real signal.

2. **Adding Kalshi (Option B) is not viable in cycle 1.** v2 spent a full session attempting Kalshi pairing and produced spurious topic-matched pairs. A fresh attempt would consume ~2 hours of session budget — better deferred to cycle 2 if cycle 1 surfaces a need.

3. **Adding econ-adjacent (Option C) dilutes the geopolitics-specific test.** v4 cycle 1 already tested econ at low liquidity and showed Polymarket prices are well-calibrated there too. Mixing categories now would obscure whether a geopolitics-specific edge exists.

4. **Backfilling unfetched markets to fill action_count + hard_currency cells** would take ~30 min (~5,000 additional CLOB calls); the marginal value is uncertain because both sub_categories are inherently lower-N (action_count = countable events, hard_currency = monetary thresholds — naturally rarer in Polymarket geopolitics listings).

5. **The locked Holm-Bonferroni protocol punishes data acquisition** that doesn't address the binding question. The binding question is whether geopolitics markets are calibrated. The 4 discretionary cells are sufficient power to answer it.

## Cells flagged auto-Verdict-C (data-constrained)

8 cells with N < 80:
- action_count × {<5K, 5-15K, 15-50K, 50-200K}
- hard_currency × {<5K, 50-200K} (15-50K and 5-15K are also <80 but closer to threshold)

These cells appear in cells.parquet for transparency but do NOT count toward Holm-Bonferroni denominator.

## What this scope test answers

**Primary question:** at low-to-moderate Polymarket liquidity (<200K), does the price for `discretionary` geopolitics markets (judgment-based outcomes: meet, sign, win, lose, declare, etc.) systematically deviate from the realized resolution rate enough that simple price-threshold strategies are profitable after fees?

If NO (likely, given v1 + v3 + v4 priors): geopolitics markets are well-calibrated even on judgment-based outcomes at low liquidity. Project verdict converges to "Polymarket is well-calibrated across all categories tested."

If YES: the calibration story has a category-specific exception worth deeper testing in cycle 2.
