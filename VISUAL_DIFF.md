# Visual diff log — v1.2 verification loop (Agent 4)

Reference images at `docs/reference_polymarket_ui.png` and
`docs/reference_foggle_bet_stats.png` are MISSING (orchestrator notice).
Phases 5 + 7 are blocked until those land. Phases 2 + 3 below are derived
from layout analysis + visual inspection only — no reference required.

## Phase 2 — Baseline observations (snapshot `2026-05-06T04-10-58-146Z`)

Production: https://earnings-edge-dashboard.vercel.app on commit `b62533d`.

### Home (`/`) at 1440×900

- Header: clean. Brand "Earnings Edge DASHBOARD" left, tabs right.
- Banner: 8 signals, snapshot freshness pill, sample badge.
- Chart "Edge map" renders. **Defect: x-axis label "Market-implied
  probability" overlaps the legend ("Tier A · Tier B · Tier C") at the
  bottom of the chart.** Both occupy the same horizontal band — text
  glyphs collide. Root cause: `EdgeChart.tsx` has the `XAxis` `label`
  using `position: insideBottom, offset: -16` and `Legend` is
  default-positioned at the bottom with `paddingTop: 8`. They share the
  bottom-margin band of 32px set in `ScatterChart.margin`.
- Sort/filter chip row + Cards/Table toggle: clean.
- Card grid: 2-column at 1440 (Today / Later buckets). No overlap.
- Footer: clean.

### Home (`/`) at 768×1024

- Same chart legend overlap as above.
- Filter chips wrap onto two rows — fine, expected.
- Card grid: 2-column. Clean.

### Home (`/`) at 375×812

- **Defect: header**. "Earnings Edge" wraps to two lines. The "Live
  Signals" tab pill ALSO wraps inside its own pill ("Live\nSignals"
  visible). Root cause: `app/layout.tsx` header is a single
  `flex justify-between` row with no responsive collapse, and at 375 px
  the tabs nav (`Live Signals` + `Stats` + `Hedge`) consumes more width
  than what's left after the brand block, forcing wraps.
- Chart legend overlap: even more pronounced (tight viewport).
- "Edge map" chart header: title "Edge map" sits next to the long
  description on the same row, which gets squeezed. The description
  starts on the same line as "Edge map" and clips/wraps awkwardly.
  Root cause: `EdgeChart.tsx` header uses `flex items-baseline
  justify-between` with no responsive stacking.
- Card grid: 1-column. Clean.

### Stats (`/`) at 1440 / 768 / 375

- Empty state — "Insufficient data — N=0 settled, N=0 open" — copy is
  fine. (Underlying cron / paper-trade data not yet populated; flagged
  separately for Phase 6 verification.)
- 1440 + 768: clean.
- 375: same header issue as the home page. "Earnings Edge" + tabs both
  wrap at this viewport.

### Confirmed root causes for Phase 3 fixes

1. `components/EdgeChart.tsx`: x-axis label collides with Legend.
   - Fix: increase chart bottom margin and/or move axis label above the
     legend (or remove the axis label since the units are already 0–100%
     ticks and the chart h2 communicates "Edge map"). Cleanest fix is
     drop the x-axis label, keep the y-axis label, and let the legend
     own the bottom band.
   - Also stack the chart header (title above description) on narrow
     viewports.
2. `app/layout.tsx`: header overflows on small viewports.
   - Fix: reduce nav `gap`, shrink tab padding at small sizes, and
     ensure the brand block doesn't shrink past content size. Could
     also hide the wordmark "Earnings Edge" → just keep an "EE" mark
     under sm, but that's a bigger redesign decision. The lighter fix
     is `whitespace-nowrap` on each tab + `shrink-0` on the brand and
     tighter padding at xs.

## Phase 3 — Fixes applied + verified (snapshot `2026-05-06T06-55-24-526Z`)

Production deploy: commit `a9e4887` (3 file changes: EdgeChart, layout, NavTabs).

### Verified fixes (compared baseline → new screenshots)

| Bug | Baseline | After fix | Verified at viewport |
|---|---|---|---|
| EdgeChart x-axis label collides with Legend | "Market-implied probability" text overlapped colored Tier A/B/C dots at chart bottom | Legend has its own band below x-axis ticks; redundant axis label dropped (0–100% ticks + chart title `Edge map` already communicate the dimension); chart bottom margin increased 32→64px | desktop 1440, tablet 768, mobile 375 |
| Header wraps "Earnings Edge" + tab pills at narrow viewports | At 375px: brand wrapped to 2 lines, "Live Signals" tab pill wrapped INSIDE itself | Brand stays single-line via `whitespace-nowrap` + `shrink-0`; tabs use `whitespace-nowrap` + smaller padding/text below sm:; layout collapses gracefully | mobile 375, also clean at desktop |
| EdgeChart header (title + description) collide at narrow viewports | At 375px: "Edge map" title and long description sat in same flex-row, squeezing each other | Header now `flex-col gap-1 sm:flex-row` — stacks vertically below sm:, side-by-side at sm: and up | mobile 375 |

### Phase 3 status: ✅ COMPLETE

All three baseline-identified bugs visually verified fixed via Playwright
screenshot comparison at three viewports. No new bugs introduced (`/stats`
empty state still clean, `/hedge` placeholder still clean).

### What still needs reference images (HALTED)

- **Phase 5 (Priority 2)**: Polymarket visual match for Live Signals card grid
  — needs `docs/reference_polymarket_ui.png`
- **Phase 7 (Priority 4)**: FoggleBet visual match for Stats cohort chart
  — needs `docs/reference_foggle_bet_stats.png`
