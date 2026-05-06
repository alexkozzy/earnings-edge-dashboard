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
