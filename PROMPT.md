# Earnings Edge Dashboard — full spec

This is the canonical spec for the dashboard agent. Read end-to-end before
writing code.

---

## Locked decisions

- **Public read-only.** No auth wall.
- **Secrets NEVER in the browser.** All API calls (Finnhub, Alpha Vantage, Polymarket) go through Vercel serverless functions in `app/api/`. Keys live in Vercel environment variables, accessed server-side only. If you find yourself putting a key in a `NEXT_PUBLIC_*` var or a client component, stop — you're about to leak it.
- **Two data sources behind the proxy:**
  - Finnhub: `/stock/earnings` (historical surprise), `/stock/eps-estimate` (consensus, if tier allows), `/quote` (live underlying).
  - Alpha Vantage: secondary backstop for price data when Finnhub rate-limits or returns gaps. Free tier is 25 req/day — aggressive cache.
- **Live + calibration scope.** Two tabs: "Live Signals" and "Calibration."
- **Scanner integration via snapshot files.** The scanner repo writes `signals_latest.json`, `signals_history.jsonl`, and `calibration_summary.json` to a published location (GitHub Pages on the scanner repo, or commit to dashboard repo on a CI cadence). Dashboard reads these — no live cross-process IPC.

## Repo structure

```
earnings-edge-dashboard/
├── package.json                 # next ^15, react ^19, tailwind, recharts, swr
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── README.md                    # written last
├── .env.local.example           # template only — actual .env.local gitignored
├── .gitignore
├── app/
│   ├── layout.tsx               # global shell, dark theme matching screenshot
│   ├── page.tsx                 # default route → Live Signals tab
│   ├── calibration/page.tsx     # Calibration tab
│   ├── api/
│   │   ├── signals/route.ts     # GET → current live signals from snapshot
│   │   ├── calibration/route.ts # GET → settled-signal calibration summary
│   │   ├── finnhub/[...path]/route.ts   # PROXY (server-side only, key in env)
│   │   ├── alphavantage/[...path]/route.ts  # PROXY with cache
│   │   └── polymarket/[...path]/route.ts    # PROXY (Polymarket gamma is public, but keep proxy for caching + uniform interface)
│   └── components/
│       ├── SignalGrid.tsx       # the JPM/BAC/TSM-style card grid (see screenshot reference)
│       ├── SignalRow.tsx        # one card: ticker + EPS threshold + market-implied % + gap badge
│       ├── EdgeChart.tsx        # recharts: x = market-implied prob, y = historical base rate, diagonal = fair line
│       ├── CalibrationChart.tsx # recharts: predicted prob bucket vs. realized outcome rate
│       ├── ThesisBanner.tsx     # top-line stat: "Markets overpriced beats by Xpp on average across N settled events"
│       └── DataFreshness.tsx    # last-updated timestamp + manual refresh button
├── lib/
│   ├── types.ts                 # Signal, CalibrationPoint, BeatPrior types — match scanner's signal_bus.py shape
│   ├── snapshotLoader.ts        # fetches signals JSONs (cached 5min)
│   ├── proxyCache.ts            # in-memory + Vercel KV (if available) cache for proxy responses
│   └── format.ts                # ticker formatting, color coding by tier
└── public/
    └── icons/                   # ticker logos (or use a CDN — see "Logos" section below)
```

## API design — serverless functions

Each proxy route does three things: (1) read key from `process.env`, (2) hit the upstream API, (3) cache the response. Pattern:

```ts
// app/api/finnhub/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const CACHE: Map<string, { data: any; expires: number }> = new Map();
const TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return NextResponse.json({ error: 'unconfigured' }, { status: 503 });

  const upstreamPath = params.path.join('/');
  const search = req.nextUrl.searchParams.toString();
  const cacheKey = `${upstreamPath}?${search}`;

  const cached = CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.data);

  const url = `https://finnhub.io/api/v1/${upstreamPath}?${search}&token=${key}`;
  const r = await fetch(url);
  if (!r.ok) return NextResponse.json({ error: 'upstream', status: r.status }, { status: r.status });
  const data = await r.json();
  CACHE.set(cacheKey, { data, expires: Date.now() + TTL_MS });
  return NextResponse.json(data);
}
```

Apply same pattern for Alpha Vantage (cache 60min — its tier is tighter) and Polymarket (cache 30s — prices move).

**Hard rule:** the client never sees `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY`, or any other secret. Only the proxy URLs.

## Live Signals tab — the main view

Visual reference: the user shared a screenshot of Polymarket's earnings calendar showing cards like:
- `JPM | $4.94 EPS | 95% beats`
- `BLK | $12.64 EPS | 87% beats`
- `MTB | $4.50 EPS | 77% beats`

Replicate that grid pattern but **add the edge column**, since that's the actual point of this tool. Each card shows:

```
┌──────────────────────────────────┐
│ [logo] JPM           Pre Market  │
│        $4.94 EPS                 │
│                                  │
│ Market: 95%  Hist: 78%  Δ +17pp  │
│ ─────────                        │
│ Edge: HIGH | No is cheap         │
│ Slip-adj: +14pp                  │
└──────────────────────────────────┘
```

Sort options: `largest gap` (default), `tier`, `earnings date`, `ticker A→Z`.

Filter chips: `HIGH only`, `MEDIUM+`, `regime stable`, `consensus not recently revised`.

**Tier color coding:**
- HIGH → green border
- MEDIUM → amber
- LOW → gray
- INELIGIBLE (data quality issues) → faded with tooltip explaining why

## EdgeChart component

Scatter plot. X-axis: market-implied probability of beat (0–100%). Y-axis: historical empirical beat rate (0–100%). Diagonal line is the "fair pricing" reference. Points above the line = market underpricing beats (Yes is cheap); points below = market overpricing beats (No is cheap). Each point is a ticker, sized by orderbook depth, colored by tier.

This visualization is the dashboard's signature image. Get it right.

## Calibration tab

For settled signals (where the earnings event has passed and outcome is known):

1. **Top banner:** "Across N settled signals, markets overpriced beats by an average of Xpp. Thesis [confirmed/refuted/insufficient data]."

2. **Calibration chart:** bucket signals by predicted probability (0–10%, 10–20%, ..., 90–100%). For each bucket, plot bar = average market-implied prob in bucket; overlay dot = realized beat rate. A well-calibrated market has bars and dots aligned; gaps = mispricing pattern.

3. **Per-tier breakdown table:** rows = HIGH/MEDIUM/LOW, columns = N signals, mean gap, realized win rate (if signals had been traded as recommended), simulated P&L per $250 stake.

4. **Disclaimer footer:** "Hypothetical results based on signal history. Not trading advice. Slippage and fees may differ in execution."

## Data flow — snapshot files (the scanner integration)

The scanner needs to publish three files for the dashboard to consume. Either:

**Option A (simpler):** Scanner runs locally, commits JSON to a public GitHub Pages branch on a cron. Dashboard fetches `https://<user>.github.io/earnings-edge-data/signals_latest.json`.

**Option B (cleaner):** Use Vercel KV or a tiny Supabase project. Scanner writes via a webhook endpoint `app/api/ingest/route.ts` protected by a shared secret. Dashboard reads from KV.

Default to Option A for v1 — zero infrastructure, free, public-by-design fits the public-dashboard goal. Document Option B as v1.1 in README.

**Schema** (`lib/types.ts`, must match scanner's `Signal` dataclass):

```ts
export interface Signal {
  ticker: string;
  company_name: string;
  market_question: string;
  condition_id: string;
  earnings_date: string;        // ISO
  consensus_threshold: number;  // EPS in dollars
  market_implied_prob_yes: number;     // 0–1, devigged
  historical_base_rate_beat: number;   // 0–1, empirical N-quarter
  consensus_tightness_adjusted?: number; // null if Finnhub paywalled
  edge_magnitude_pp: number;    // percentage points
  slippage_adjusted_gap_pp: number;
  direction: 'YES_CHEAP' | 'NO_CHEAP';
  tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'INELIGIBLE';
  ineligible_reason?: string;
  regime_stable: boolean;
  n_quarters: number;
  consensus_recently_revised: boolean;
  book_depth_at_target_cents: number;
  current_spot_estimate: number;
  recorded_at: string;          // ISO
  resolved?: { actual_eps: number; outcome: 'BEAT' | 'MISS'; resolved_at: string };
}
```

## Logos

Use [Clearbit Logo API](https://logo.clearbit.com/{domain}) — free, public, no auth. Map ticker → domain with a static lookup file `lib/tickerDomains.ts` (JPM → jpmorganchase.com, BAC → bankofamerica.com, etc). Fallback to ticker initials in a colored circle if Clearbit returns 404.

## Deployment

1. `vercel link` against the user's Vercel account.
2. Set env vars via dashboard or `vercel env add`:
   - `FINNHUB_API_KEY`
   - `ALPHAVANTAGE_API_KEY`
   - `SCANNER_DATA_URL` (the GitHub Pages URL or KV endpoint)
3. `vercel --prod` deploys.
4. Custom domain optional — `*.vercel.app` is fine for v1.

**Print the deployment URL to the user when complete.**

## Issues to flag prominently (do NOT silently work around)

- **Missing env vars** at build time → halt build with clear error, list which vars are missing.
- **Snapshot file unreachable** at runtime → render a "Scanner data unavailable, last successful fetch: <timestamp>" banner instead of empty cards. Don't show stale data without warning.
- **Alpha Vantage rate-limited** → log clearly, fall back to Finnhub-only, show banner: "Price data: Finnhub primary, Alpha Vantage backup currently rate-limited."
- **Finnhub returns paywalled error on `/stock/eps-estimate`** → drop the consensus-tightness column from UI, show tooltip explaining why the column is empty. Do not pretend the data exists.
- **Calibration data has fewer than 20 settled signals** → show "Insufficient data — N=<count>, need 20+ for meaningful calibration" instead of a noisy chart.
- **Type mismatch between scanner's Signal and dashboard's Signal** → fail the build in TypeScript, not at runtime. Generate `lib/types.ts` from the scanner's dataclass; if scanner adds fields, build breaks until dashboard syncs.

## What NOT to do

- Do NOT put any API key in client-side code. Ever.
- Do NOT call Polymarket / Finnhub / Alpha Vantage directly from a React component — always go through `app/api/*` proxies.
- Do NOT cache signals beyond 5 minutes — the user expects fresh.
- Do NOT cache fundamentals/historical for less than 24 hours — they don't change.
- Do NOT add fake/mock signals as a "demo mode." If scanner data is missing, show the empty state.
- Do NOT add charting libraries beyond recharts. Tailwind + recharts is the whole stack.
- Do NOT write the README first. Last.

## Order of build

1. Scaffold Next.js app, Tailwind, dark theme matching screenshot aesthetic.
2. Build proxy routes with cache. **Test each with curl using a real key before building UI.**
3. Build snapshot loader. Test against a hand-written sample JSON before scanner integration.
4. Build SignalGrid + SignalRow with mocked Signal data first, then wire to live snapshot.
5. Build EdgeChart.
6. Build Calibration tab.
7. Wire deployment.
8. README.
