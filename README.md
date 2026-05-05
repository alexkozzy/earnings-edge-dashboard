# Earnings Edge Dashboard

Public read-only Next.js site that visualizes mispricing signals from the
earnings-edge scanner and tracks whether past predictions were calibrated.

Two tabs:

- **Live Signals** (`/`) — current signals with edge magnitude, tier, market vs base-rate scatter.
- **Calibration** (`/calibration`) — reliability diagram + per-tier Brier scores. Shows an "insufficient data" fallback below `n=20` resolved signals.

## Local development

```bash
cp .env.local.example .env.local
# (optional) fill in FINNHUB_API_KEY / ALPHA_VANTAGE_API_KEY for proxy testing
npm install
npm run dev
```

Open http://localhost:3000.

With no `SNAPSHOT_BASE_URL` set the dashboard reads `tools/sample_snapshot.json`
so the UI renders something useful out of the box.

## Architecture (one-liner per layer)

- `app/` — App Router pages + Route Handlers.
- `app/api/finnhub|alphavantage|polymarket/[...path]/route.ts` — server-side proxies. **All upstream API calls go through these**; React components never `fetch()` external APIs directly.
- `app/api/signals/route.ts`, `app/api/calibration/route.ts` — read snapshot files via `lib/snapshots.ts`, validate with Zod, return JSON.
- `lib/types.ts` — canonical `Signal`, `SignalsSnapshot`, `CalibrationSummary` Zod schemas. Source of truth for what the UI expects.
- `lib/cache.ts` — tiny in-memory TTL cache shared by all proxies.
- `lib/proxy.ts` — fetch + cache + normalize-error helper for the proxy routes.
- `lib/snapshots.ts` — loads `signals_latest.json` / `calibration_summary.json` from `SNAPSHOT_BASE_URL` or local sample.
- `components/` — React UI. Server components by default; chart + view wrappers are `"use client"` for SWR + Recharts.
- `tools/sample_snapshot.json` — hand-crafted sample for dev. Real data is published by the scanner repo.

## Snapshot contract (scanner -> dashboard)

The scanner is responsible for writing two files to a public location:

```
<SNAPSHOT_BASE_URL>/signals_latest.json
<SNAPSHOT_BASE_URL>/calibration_summary.json
```

Both must conform to the Zod schemas in `lib/types.ts`. The dashboard validates on every load and returns 500 on schema mismatch — this is intentional, we don't render garbage.

The schema-translation script (scanner `Signal` → dashboard `Signal`) lives in the **scanner repo**, not here. Don't add it here.

## Security model (read this before changing proxy code)

1. **No API keys in the browser.** Anything secret lives in env vars on Vercel and is read only inside `app/api/*` route handlers (server-side). Never use a `NEXT_PUBLIC_*` prefix for these.
2. **No direct external `fetch` from React components.** Always go through `/api/finnhub/*`, `/api/alphavantage/*`, `/api/polymarket/*`.
3. The proxy routes strip any client-supplied `token` / `apikey` query param and inject the real one server-side, so a stray attempt to pass a key from the UI won't leak it.
4. The in-memory cache stores responses but never writes the API key into the cache key.

## Deploying to Vercel

The Vercel CLI is **not** installed automatically. When you're ready:

```bash
npm install -g vercel        # one-time
vercel login                 # one-time
vercel link                  # link the local dir to a Vercel project
vercel env add FINNHUB_API_KEY        # paste value when prompted, pick "Production"
vercel env add ALPHA_VANTAGE_API_KEY
vercel env add SNAPSHOT_BASE_URL
vercel --prod                # deploy
```

You can also set env vars from the Vercel dashboard (Project → Settings → Environment Variables). They are read server-side only — no rebuild needed for runtime values to take effect on the next deploy.

### What to verify after first deploy

- `https://<your-deploy>/` renders the SignalGrid (sample data if `SNAPSHOT_BASE_URL` is unset).
- `https://<your-deploy>/calibration` renders the n<20 fallback or the reliability diagram.
- `https://<your-deploy>/api/finnhub/quote?symbol=NVDA` returns JSON when the env var is set; returns 500 with a clear error message when it isn't.
- View source on the home page and confirm `FINNHUB_API_KEY` does not appear anywhere in the HTML or JS bundle.

## Scripts

- `npm run dev` — Next dev server on :3000.
- `npm run build` — production build (Turbopack).
- `npm run lint` — ESLint.
