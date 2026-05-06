# Earnings Edge — Current State

**Last updated:** 2026-05-06T16:55Z
**Last session commit:** `a7911be` (v1.3 W3 verified: hedge page + API screenshots + visual diff log)
**Production URL:** https://earnings-edge-dashboard.vercel.app/
**Data feed URL:** https://alexkozzy.github.io/earnings-edge-data/data/signals_latest.json
**GitHub:** https://github.com/alexkozzy/earnings-edge-dashboard (PUBLIC) + https://github.com/alexkozzy/earnings-edge-data (PUBLIC)

## What this project is (in 3 sentences)

A scraper-trader for prediction markets on equity earnings outcomes. Polls Polymarket and Kalshi for earnings markets, devigs prices, compares to historical empirical beat rates from Finnhub/Alpha Vantage, and surfaces mispricing signals — the thesis is that markets systematically overprice "beat" outcomes. Paper trades against open markets to retrospectively measure if the edge is real.

Three-repo split. **Dashboard** (Next.js on Vercel) is the public read-only UI. **Scanner** (Python in `~/Dropbox/claude shenanigans/earnings-edge/`) generates signals + paper-bets. **Data** (GitHub Pages) holds the published JSON snapshots.

## Status snapshot

| Area | Status | Notes |
|---|---|---|
| Dashboard production | ✅ | All 18 routes 200/expected; build green |
| Scanner crons | ⚠️ | 14:00 UTC poll-and-log fired today (commit `4d08de2` in data repo, 6 bets logged); 20:00 UTC resolve hasn't created `paper_bets_settled.jsonl` yet (no settlements due) |
| Future-only filter | ✅ | Live in `lib/paperEngine.isFutureEarnings` + `app/api/signals/route.ts`; verified `dropped_past_or_stale: 4` of 8 |
| Paper bet logging | ⚠️ | 6 open bets, 0 settled. **3 of the 6 are on past-earnings (AMD/GOOGL/AMZN)** from before the future-only filter shipped. Resolver will settle them naturally as Finnhub returns actuals. |
| Polymarket card UI | ⚠️ | Card grid shipped (TODAY/LATER buckets, ticker logos, edge badges, tier-colored borders); visual match to Polymarket reference NOT verified — reference image `docs/reference_polymarket_ui.png` is missing |
| Stats page | ✅ | Empty-state copy correct ("Insufficient data — N=0 settled, N=Y open paper-trades pending"); will populate as resolver runs |
| Hedge tool | ✅ | Form + output panel + `/api/hedge` POST live. Verified end-to-end: NVDA test returns 5-scenario grid, edge-wins-on-conflict resolution, pure-hedge alternative for transparency. |
| Diag endpoint | ✅ | `/api/diag` and `/diag` page both gated by `DIAG_TOKEN` query param |
| Snapshot freshness | ❌ | `data/signals_latest.json` last `generated_at: 2026-05-05T14:30:00Z` — over 24h stale. Scanner-side snapshot writer not yet wired to scheduled run. **THIS IS THE P0 BLOCKER.** |

## What's working RIGHT NOW

Verification commands paste-ready:

```bash
# Production homepage renders
curl -s -o /dev/null -w "%{http_code}\n" https://earnings-edge-dashboard.vercel.app/
# Expected: 200

# Signals API filtered to future-earnings only
curl -s https://earnings-edge-dashboard.vercel.app/api/signals | jq '.filter_meta'
# Expected: future_only_returned > 0, dropped_past_or_stale > 0

# Hedge tool API
curl -s -X POST https://earnings-edge-dashboard.vercel.app/api/hedge \
  -H "content-type: application/json" \
  -d '{"ticker":"NVDA","position":"long","instrument":"call","strike":220,"expiry":"2026-05-30","contracts":1,"cost_basis":5.50}' | jq '.recommendation'
# Expected: { side, source, venue, stake_dollars, ... }

# Cron route gated correctly
curl -s -o /dev/null -w "%{http_code}\n" https://earnings-edge-dashboard.vercel.app/api/cron/poll-and-log
# Expected: 401 (or 405)

# Data repo growing
cd ~/Dropbox/claude\ shenanigans/earnings-edge-data && git pull -q && wc -l data/paper_bets_open.jsonl
# Currently: 6 bets

# Stats page renders empty-state correctly
curl -s -o /dev/null -w "%{http_code}\n" https://earnings-edge-dashboard.vercel.app/stats
# Expected: 200; HTML contains "Insufficient data"
```

## What's broken or partial

### ❌ Snapshot file is stale (P0 — blocks signal refresh)

`data/signals_latest.json` `generated_at: 2026-05-05T14:30:00Z` — over 24h old. Contains 8 signals; 4 of them are now past-earnings (AMD/META/GOOGL/AMZN). The dashboard's `/api/signals` route filters past-earnings at read time so the live UI never shows them, but the SOURCE file isn't being refreshed.

**Root cause:** the scanner repo at `~/Dropbox/claude shenanigans/earnings-edge/` has `src/snapshot_writer.py` but it's not on a scheduled run. Plus the writer maps to the OLD kickoff-prompt schema (Tier `HIGH/MEDIUM/LOW`, direction `YES_CHEAP/NO_CHEAP`) instead of the dashboard's canonical `lib/types.ts` (Tier `A/B/C`, direction `YES/NO`). See `INTEGRATION_NOTES.md` for the field-by-field rewrite map.

**Until this is fixed, new signals never appear** — only the 4 future-earnings entries from yesterday's snapshot are live.

### ⚠️ No sub-daily polling cadence

Vercel Hobby plan caps cron jobs at 1/day per route. Currently scheduled: `poll-and-log` at 14:00 UTC, `resolve` at 20:00 UTC. With one poll per day, paper-bet calibration takes months not weeks.

**Workaround documented but not implemented:** GitHub Actions on a public repo gives unlimited free minutes; could call `/api/cron/poll-and-log` at any cadence (e.g. `*/15 * * * *`) with `Authorization: Bearer $CRON_SECRET`. Workflow file would live at `.github/workflows/poll-15min.yml`. User declined Vercel Pro upgrade.

### ⚠️ 3 stale paper bets

6 bets in `data/paper_bets_open.jsonl`. AMD (2026-05-06), GOOGL (2026-04-29), AMZN (2026-05-01) are on past earnings — logged before the future-only filter shipped. **Will resolve naturally** as Finnhub returns actuals over the next several days. No manual action needed.

## What's deferred (intentionally)

- **Real Polymarket CLOB orderbook entry pricing.** v1.3 estimates entry price as `market_implied_prob + 1ct` slip. v1.x replacement: hit the Polymarket CLOB book endpoint per signal.
- **Daily Alpha Vantage sector classification.** PaperBet metadata fields `sector`, `industry`, `market_cap_bucket` are optional in the schema; populated by a separate daily AV refresh job that doesn't exist yet.
- **Venue arbitrage tracker.** Stats page would show a Polymarket-vs-Kalshi spread cohort; not built — needs cross-venue signal data we don't yet collect.
- **Bottom-drawer card detail view.** Per the v1.1 spec; using `/signal/[id]` permalinks instead.
- **Hedge tool: real historical 1-day post-earnings move distribution from Finnhub.** Currently uses static {-15%, -7.5%, 0%, +7.5%, +15%} scenarios.
- **Black-Scholes option pricing.** v1 uses intrinsic value at scenario spot only.

## Critical configuration

### Env vars on Vercel (production) — verified 2026-05-06

- `FINNHUB_API_KEY` — set; used by `/api/finnhub/[...path]` proxy
- `ALPHA_VANTAGE_API_KEY` — set; daily cap **20 req** (hard limit; do not raise)
- `SNAPSHOT_BASE_URL` — `https://alexkozzy.github.io/earnings-edge-data/data`
- `CRON_SECRET` — set; `Authorization: Bearer $CRON_SECRET` required on `/api/cron/*` routes
- `DIAG_TOKEN` — set; required as `?key=` on `/api/diag` and `/diag` admin page
- `GH_DATA_PAT` — set; `contents:write` on `alexkozzy/earnings-edge-data` only; used by paperEngine to commit bets

⚠️ `vercel env pull --environment=production` returns these as EMPTY strings even when set. That's a CLI quirk for "Sensitive" classification, not a real bug. Verify with `vercel env ls production` (lists names only).

### Vercel plan limits in effect

- **Hobby plan** — cron jobs capped at **once per day per route**.
- Currently scheduled in `vercel.json`:
  - `poll-and-log` at `0 14 * * *` (14:00 UTC daily)
  - `resolve` at `0 20 * * *` (20:00 UTC daily)
- User declined Pro upgrade ($20/mo). Sub-daily would unlock `*/15 * * * *` etc.

### Persistence model

Vercel serverless functions have ephemeral filesystem; `/tmp` only is writable but wiped between invocations. **All paper-trade persistence flows through the GitHub data repo via `lib/dataRepo.ts`** which uses GitHub Contents API + `GH_DATA_PAT`. Reads via the public Pages URL (`SNAPSHOT_BASE_URL` env), writes via the API.

## How to resume work

1. **Read this file (you're doing it).**
2. Read `wiki/projects/Earnings Edge.md` in the iCloud Obsidian vault (`/Users/alexkozlov/Library/Mobile Documents/iCloud~md~obsidian/Documents/alexs project/wiki/projects/Earnings Edge.md`) for architecture + file tree.
3. Run the diagnostic in `## Verification commands` below.
4. Pick from `## Open issues` in priority order. **Do not start new features until P0 is closed or explicitly cut.**

## Open issues (priority order)

### P0 — blocks the project's value

**1. Snapshot file is stale; new signals don't appear.**
- File: `data/signals_latest.json` in `alexkozzy/earnings-edge-data` repo
- Last refreshed: `2026-05-05T14:30:00Z`
- Symptom: `/api/signals` returns 4 future-earnings tickers, but they're all from yesterday's snapshot. New earnings markets aren't being scraped.
- Root cause: scanner repo's `src/snapshot_writer.py` exists but isn't on a scheduled run. Also schema-mismatched.
- Fix: either (a) wire `snapshot_writer.py` to a Mac launchd / cron / GitHub Actions schedule, or (b) port the snapshot-writing logic into the dashboard's `/api/cron/poll-and-log` so Vercel handles it.
- **Recommended:** path (b) is cleaner — keep all production-relevant code in one deploy target. Means writing a Polymarket gamma API scraper inside the dashboard cron, then publishing the snapshot back to the GitHub data repo via `dataRepo.ts`. ~3-4 hours of work.

### P1 — important but not blocking

**2. Sub-daily polling cadence.**
- Currently 1/day per Vercel Hobby tier
- Workaround: GitHub Actions on the dashboard repo (public, unlimited free min) → `*/15 * * * *` curls `/api/cron/poll-and-log`
- Implementation effort: ~30 min (one workflow file + GH Actions secret for `CRON_SECRET`)
- Without this, paper-bet calibration takes months

**3. Polymarket UI visual match.**
- Card grid is built and functional but never compared to user's reference screenshot
- Reference image at `docs/reference_polymarket_ui.png` still missing on disk
- User has surfaced "now available" twice but file never landed
- Iterative loop ready (`tools/visual/screenshot.ts` + Playwright)

**4. FoggleBet-style cohort chart match.**
- Stats page chart is built; visual fidelity to FoggleBet reference unverified
- Reference image at `docs/reference_foggle_bet_stats.png` missing
- Same iteration loop as P1 #3

### P2 — nice to have

**5. 3 stale paper bets.** Resolver settles them as Finnhub returns actuals; no manual cleanup needed.

**6. Hedge tool edge-case validation.** Form + API verified for NVDA call. Untested: stock positions, short puts, tickers absent from /api/signals (should 404), tickers with zero edge.

**7. Scanner repo has zero commits.** `~/Dropbox/claude shenanigans/earnings-edge/` has the full src/ tree but `git main` has no commits. Files are durable on disk but not version-controlled.

## Files to inspect when debugging

### Dashboard (`~/Dropbox/claude shenanigans/earnings-edge-dashboard/`)
- `app/api/signals/route.ts` — applies the future-only filter; reads from `lib/snapshots.ts`
- `app/api/cron/poll-and-log/route.ts` — daily 14:00 UTC cron; loads snapshot, calls `paperEngine.logPaperBets`
- `app/api/cron/resolve/route.ts` — daily 20:00 UTC cron; calls `paperEngine.resolvePaperBets`
- `app/api/hedge/route.ts` — POST endpoint for hedge tool
- `app/api/diag/route.ts` — health check JSON; gated by `DIAG_TOKEN`
- `lib/paperEngine.ts` — bet logging + resolution + `isFutureEarnings`
- `lib/dataRepo.ts` — GitHub Contents API helper for read/write
- `lib/snapshots.ts` — snapshot loader (reads `SNAPSHOT_BASE_URL` or falls back to `tools/sample_snapshot.json`)
- `lib/types.ts` — canonical schema; **additive only**, see "Conventions"
- `lib/hedge/{optionPayoff,sizer,conflict}.ts` — hedge math
- `vercel.json` — cron schedules (Hobby-tier compatible)
- `tools/visual/screenshot.ts` — Playwright screenshot loop
- `tools/validate_snapshot.ts` — Zod validator for any snapshot JSON
- `INTEGRATION_NOTES.md` — schema-divergence catalog + scanner→dashboard field map
- `VISUAL_DIFF.md` — running visual-bug log + fix verifications

### Data repo (`~/Dropbox/claude shenanigans/earnings-edge-data/`)
- `data/signals_latest.json` — current signal snapshot (1 day stale)
- `data/paper_bets_open.jsonl` — 6 open bets
- `data/paper_bets_settled.jsonl` — doesn't exist yet (no settlements)
- `data/calibration_summary.json` — placeholder

### Scanner (`~/Dropbox/claude shenanigans/earnings-edge/`) — read-only from this side
- `src/scanner.py` — main signal-generation loop
- `src/snapshot_writer.py` — exists but unscheduled and schema-mismatched
- `INTEGRATION_NOTES.md` (in dashboard repo) explains the schema gap

## Reference images on disk

- `docs/reference_polymarket_ui.png` — 🚫 **missing** (target visual for /)
- `docs/reference_foggle_bet_stats.png` — 🚫 **missing** (target visual for /stats)

User has stated these are "available" but they haven't reached the docs/ directory. Recursive search of `~/Downloads`, `~/Desktop`, `~/Library/Mobile Documents`, `~/Pictures` returns nothing matching `*polymarket*.png` or `*foggle*.png`. **Surface to user at session start if visual-match work is on the agenda.**

## Verification commands (paste before declaring any change "done")

```bash
# Live site renders
curl -s -o /dev/null -w "homepage: %{http_code}\n" https://earnings-edge-dashboard.vercel.app/

# Signals API has future-only data
curl -s https://earnings-edge-dashboard.vercel.app/api/signals | jq '.filter_meta'

# Strict zero past-earnings
curl -s https://earnings-edge-dashboard.vercel.app/api/signals | \
  jq '[.snapshot.signals[] | select(.earnings_date < (now | todate))] | length'
# Must equal 0

# Diag green (need DIAG_TOKEN env var)
curl -s "https://earnings-edge-dashboard.vercel.app/api/diag?key=$DIAG_TOKEN" | \
  jq '.probes[] | {name, ok, status}'
# All probes should have ok: true

# Paper bets accumulating
cd ~/Dropbox/claude\ shenanigans/earnings-edge-data && git pull -q
wc -l data/paper_bets_open.jsonl
ls -la data/paper_bets_settled.jsonl 2>/dev/null

# Build still green locally
cd ~/Dropbox/claude\ shenanigans/earnings-edge-dashboard && npm run build 2>&1 | tail -5

# Run validation harness
npx tsx tools/validate_snapshot.ts ~/Dropbox/claude\ shenanigans/earnings-edge-data/data/signals_latest.json
```

## Conventions inherited from earlier sessions

- **Screenshot verification loop is mandatory.** Any UI change must include before/after Playwright screenshots committed to `docs/screenshots/<timestamp>/`. HTTP 200 is necessary but not sufficient. The v1.1 build agent skipped this and shipped broken UI; v1.2 corrected it.
- **Future-only filter is non-negotiable.** Every signal must satisfy `earnings_date >= now + 12h` AND `<= now + 90d`. Both `lib/paperEngine.isFutureEarnings` and `app/api/signals/route.ts` enforce. Defense-in-depth.
- **Alpha Vantage hard cap: 20 req/day.** Code persists counter; do NOT raise without explicit user approval.
- **Finnhub primary at 50 req/min** of the 60-cap budget (10 req/min reserved for retries/proxy).
- **Paper bets log on Tier A and B signals only.** Tier C is informational; never logged. (`paperEngine.logPaperBets` skips Tier C with a counter.)
- **Empty calibration page is correct for 4–8 weeks.** Do not fabricate data. Insufficient-data fallback is the right UX until N≥30 settled bets per cohort.
- **Edge direction overrides hedge direction** — when they conflict, default cursor highlights +EV side. The `Signal.default_action` getter and `lib/hedge/conflict.resolveSide` both enforce. Pure-hedge alternative shown for transparency, not as default.
- **`lib/types.ts` is additive only.** Adding new fields → must be optional. Renaming = breaking. If you need a structural rename, mark old field deprecated and support both for one cycle.
- **No HTTP-200-as-success** for cron flows. Verify the data repo got a fresh commit + the file content actually changed.
- **All persistence through the GitHub data repo.** Vercel filesystem is ephemeral. Reads via Pages URL, writes via Contents API + `GH_DATA_PAT`.
- **Vercel `env pull` lies.** Returns "Sensitive" values as empty strings even when set. Use `vercel env ls` for verification.
- **Vercel cron is once-daily on Hobby.** Multi-cron `vercel.json` deploys fail schema-validation if frequency exceeds 1/day per route.
- **Public repo only.** No private values committed. `.env.local`, `config.local.yaml`, `.env*` all in `.gitignore`. Verify before every push: `git status --porcelain | grep -E '\.env'`.

## Tag for this handoff

`handoff-2026-05-06` (created at end of this session)
