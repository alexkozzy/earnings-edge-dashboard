# Deployment notes — Earnings Edge Dashboard v1.1

Production: <https://earnings-edge-dashboard.vercel.app/>

## Required env vars (Vercel project settings)

Set on the Vercel dashboard or via `vercel env add <NAME> production`.
Restart the deployment after adding new vars (Vercel reads them at build time).

| Var | Required | Purpose |
|---|---|---|
| `FINNHUB_API_KEY` | yes | Free tier 60/min. Used by /api/finnhub/* proxy and resolver. |
| `GH_DATA_PAT` | yes (for crons) | Fine-grained GitHub PAT, scoped to `contents:write` on `alexkozzy/earnings-edge-data` only. Without it, paper-bet persistence fails loudly. |
| `SNAPSHOT_BASE_URL` | recommended | e.g. `https://alexkozzy.github.io/earnings-edge-data/data`. Falls back to bundled sample if unset. |
| `ALPHA_VANTAGE_API_KEY` | optional | 25 req/day backstop for sector classification (not used in v1.1 cron yet). |
| `GH_DATA_REPO` | optional | Defaults to `alexkozzy/earnings-edge-data`. |
| `GH_DATA_BRANCH` | optional | Defaults to `main`. |
| `CRON_SECRET` | recommended | If set, cron routes require `?secret=...` or `Authorization: Bearer <secret>`. Vercel auto-injects on cron-triggered calls when configured in project. |
| `DIAG_TOKEN` | optional | If set, /api/diag and /diag require `?key=<token>`. |

## Creating GH_DATA_PAT

1. <https://github.com/settings/personal-access-tokens/new>
2. Resource owner: `alexkozzy`
3. Repository access: **Only select repositories** → `earnings-edge-data`
4. Permissions: **Repository → Contents → Read and write**
5. Expiration: 90d (set a calendar reminder to rotate)
6. Copy the token (starts with `github_pat_…`)
7. `vercel env add GH_DATA_PAT production` and paste

Verify after deploy by hitting `/diag` — the `GH_DATA_PAT` row should
show `YES (<length>)` and the `github.contents` probe should be `ok=yes`.

## Cron schedule (Vercel Hobby plan)

Vercel Hobby caps cron jobs at **2**. Spec called for 3; we consolidated:

- `/api/cron/poll-and-log` runs every 15 minutes — loads the latest
  signals snapshot and appends Tier A/B paper bets to
  `data/paper_bets_open.jsonl` in the data repo.
- `/api/cron/resolve` runs every 6 hours — checks Finnhub for actual
  EPS on each open bet's ticker, settles winners/losers.

If you upgrade to Pro and want a separate poll cron, split
`poll-and-log` into `/poll-signals` (5min) + `/log-paper-bets` (15min)
and update `vercel.json`.

## Data repo

`alexkozzy/earnings-edge-data` is a separate public repo that stores
operational data:

- `data/signals_latest.json` — current signals snapshot (written by scanner)
- `data/paper_bets_open.jsonl` — active paper bets
- `data/paper_bets_settled.jsonl` — historical settled bets

GitHub Pages serves these read-only at
`https://alexkozzy.github.io/earnings-edge-data/data/...`.

The dashboard reads via Pages (fast, cached) and writes via the GitHub
Contents API (authenticated with `GH_DATA_PAT`).

## Diagnostic page

`/diag` (also `/api/diag` for JSON) — shows env-var presence (NOT values)
and upstream reachability. Run this BEFORE upgrading any plan or paying
for an API tier upgrade. It's also safe to share with support — no
secret values are printed.

If `DIAG_TOKEN` is set, append `?key=<token>` to the URL.

NOTE: Spec called for `/_diag` but Next.js App Router excludes
underscore-prefixed directories from routing, so the page lives at
`/diag` instead.

## Smoke tests after deploy

```bash
# Homepage (should return 200, render Live Signals)
curl -sI https://earnings-edge-dashboard.vercel.app/ | head -1

# Diag JSON (should return status: OK if all required vars set)
curl -s https://earnings-edge-dashboard.vercel.app/api/diag | jq .status

# Signals API (should return source: remote or local-sample)
curl -s https://earnings-edge-dashboard.vercel.app/api/signals | jq '.source, .snapshot.signals | length'

# Stats page
curl -sI https://earnings-edge-dashboard.vercel.app/stats | head -1

# Manual cron trigger (only if CRON_SECRET set; replace TOKEN)
curl -s "https://earnings-edge-dashboard.vercel.app/api/cron/poll-and-log?secret=TOKEN" | jq .
```

## Deploy flow

`vercel --prod` from sandbox is blocked by sandbox auth (broken
`auth.json`). Deploy by pushing to `main` — Vercel's GitHub integration
auto-deploys.

```bash
git push origin main
# Watch deploy:
gh run list --repo alexkozzy/earnings-edge-dashboard --limit 3
```
