# Agent 3 — v1.1 work log

Append-only timestamped log of v1.1 build. Started from commit `bb5d620`
(Agent 2 final).

Times are wall-clock UTC, approximate to nearest 5 min.

## Pre-flight (orchestrator-supplied)

- Vercel Hobby plan caps cron jobs at 2 → consolidating poll+log into one
  cron at 15-min cadence (vs spec's 5-min and 3 separate crons).
- Vercel serverless filesystem is read-only (except wiped `/tmp`) →
  paper-bet persistence must use GitHub Contents API on `earnings-edge-data`
  via `GH_DATA_PAT`. No local filesystem writes.
- `lib/types.ts` is canonical Signal schema → PaperBet aligns with existing
  `tier: 'A'|'B'|'C'` and `direction: 'YES'|'NO'` enums; new fields are
  optional.
- Reference image `docs/reference_polymarket_ui.png` MISSING → working from
  spec verbal description.
- vercel CLI auth broken in sandbox → all deploys via `gh push` →
  Vercel GitHub auto-deploy. User must add any new env vars themselves.

## [+0m] Survey complete

Existing codebase:
- 11 routes, build green at `bb5d620`
- `lib/types.ts` has Signal, SignalsSnapshot, CalibrationBucket,
  TierCalibration, CalibrationSummary
- `components/SignalGrid.tsx` renders a desktop table + mobile card stack
  (NOT the Polymarket grid yet)
- `app/calibration/page.tsx` exists; needs rename to `/stats` with redirect
- Proxy routes for finnhub/alphavantage/polymarket already exist
- No cron routes yet, no paper-trading engine yet, no /api/diag yet

Next: build /api/diag + /_diag admin page first so we have a tool to
verify env-var state before deploying further crons.

## [+15m] Workstream 5 (diag) shipped — d55dd71

- `app/api/diag/route.ts`: env-var presence flags + upstream probes
- `app/diag/page.tsx`: pretty-printed admin view
- Note: Next.js excludes `_diag` (underscore = private folder), so the
  page lives at `/diag` not `/_diag`. Documented in DEPLOYMENT.md.

## [+35m] Workstreams 2 + 4 (paper engine + crons) shipped — 982dc55

- `lib/dataRepo.ts`: GH Contents API helpers (read via Pages, write via
  PAT). Fails loudly if GH_DATA_PAT unset.
- `lib/paperEngine.ts`: logPaperBets + resolvePaperBets.
- `lib/types.ts`: PaperBet + cohort schemas (additive).
- `app/api/cron/poll-and-log/route.ts`: 15-min cron.
- `app/api/cron/resolve/route.ts`: 6h cron.
- `vercel.json`: 2 crons (Hobby cap).
- `DEPLOYMENT.md`: env matrix + GH_DATA_PAT setup steps.

## [+55m] Workstream 1 (Polymarket card grid) shipped — c23f322

- `components/SignalCardGrid.tsx`: 1/2/4-col responsive grid bucketed by
  earnings-date timing block.
- `components/TickerLogo.tsx`: Clearbit logo with initials fallback.
- `lib/tickerDomains.ts`: 60+ ticker → domain mappings.
- View toggle in LiveSignalsView (Cards default, Table for power users).
- Layout widened max-w-6xl → max-w-7xl.
- `docs/UI_FIXES.md`: documents the table-overlap diagnosis.

## [+75m] Workstream 3 (Stats page) shipped — 591fa91

- `lib/cohorts.ts`: cohort aggregation with N<30 sample-size guard.
- `app/api/stats/route.ts`: combined cohorts + calibration endpoint.
- `app/stats/page.tsx`: server-rendered Stats page.
- `components/PaperTradingChart.tsx`: FoggleBet-style cumulative-P&L
  cohort chart.
- `components/StatsView.tsx`: empty-state when N=0 settled bets.
- `/calibration` → `/stats` server redirect.
- Nav + keyboard shortcuts updated (c → s).

## Status going into final summary

7 commits past bb5d620 baseline. 17 routes registered, build green.
Everything required by the spec is in place. The crons will fail
without GH_DATA_PAT — that's by design, surfaces clearly in /diag.
