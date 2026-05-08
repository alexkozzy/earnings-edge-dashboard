# v5 Deployment Record

**Deployed at:** 2026-05-08T04:55Z (approx; vercel cli timestamp)
**Verdict at deploy:** B (one mechanism-supported but underpowered signal)
**Build:** Next 16.2.4 + Turbopack, 18 routes, 0 errors, 0 warnings
**Commit:** `6f4c231` (`.vercelignore`) + `f3df260` (master verdict + UI)

## Production URL

https://earnings-edge-dashboard.vercel.app/

## Smoke test results

| Route | HTTP | Notes |
|---|---:|---|
| `/` | 200 | Earnings (default) |
| `/?category=econ` | 200 | Placeholder |
| `/?category=crypto` | 200 | Placeholder |
| `/?category=geopolitics` | 200 | NEW: v5 universe overview (2,911 markets) |
| `/stats` | 200 | Verdict banner: "VERDICT B (one mechanism-supported but underpowered signal)" |
| `/hedge` | 200 | Hedge tool unchanged |
| `/api/signals` | 200 | Earnings JSON |

## What's deployed (v5-specific changes)

1. **Geopolitics tab** (`/?category=geopolitics`): read-only universe stats sourced from `lib/geopolitics_stats.json` (snapshotted from `data/research/v5/markets/universe.parquet` at build time).
2. **Verdict banner** now reads the most-recent verdict via `lib/verdict.ts`. Lookup order: `v5/MASTER_VERDICT.md` → `v4/MASTER_VERDICT.md` → `v3/VERDICT_v3.md` → `VERDICT.md`. Currently displays the v5 result.
3. **`.vercelignore`** added to exclude `data/`, `scripts/`, `docs/screenshots/` from upload (~130MB → ~550KB).

## Honest framing check

Per locked SESSION_CONFIG: "**deploying_a_ui_that_overstates_verdict**" is forbidden.

- Banner says "VERDICT B" (the actual master verdict)
- Banner subtitle pulled from MASTER_VERDICT.md first paragraph: "one mechanism-supported but underpowered signal" — accurately describes the cycle 2 finding without overstating
- Geopolitics tab shows research-universe stats only; explicitly says "this tab does not display live signals — see /stats for the current verdict"
- Cycle 1/Cycle 2 status badges shown on geopolitics tab

No overstatement. Deploy is protocol-compliant.

## What's NOT deployed

- Live signal feeds for econ / crypto / geopolitics — would require scanner-side scrapers
- Live order-flow integration (the cycle 1 endpoint discovery — `data-api.polymarket.com/trades`)
- The cycle 2 ambiguity-grading model — it's a research artifact, not a production endpoint

## Rollback

If a regression is discovered post-deploy:
- The prior production deploy (`a3a101d`-era) is the v4 baseline
- `vercel rollback` would revert to a previous deployment ID (visible in Vercel dashboard)
- Or revert commits `6f4c231` and `f3df260` and re-deploy

## Resource usage during deploy

- Initial upload attempts (without .vercelignore): 2x failed with "Upload aborted" then rate-limited
- Successful deploy with `--archive=tgz`: 552 KB archive, deployed in <30 sec
- No production cron downtime; existing daily cron schedules unchanged
