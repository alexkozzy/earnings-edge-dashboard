# Earnings Edge Dashboard — Comprehensive v1.1 Build (verbatim user spec)

You are working on `~/Dropbox/claude shenanigans/earnings-edge-dashboard/`. Production is live at `https://earnings-edge-dashboard.vercel.app/`. Reference UI inspiration: `https://fogglebet.vercel.app` (FoggleBet) and the Polymarket earnings calendar screenshot in `~/Dropbox/claude shenanigans/earnings-edge-dashboard/docs/reference_polymarket_ui.png` (NOTE: this image is currently MISSING — work from the verbal description below).

You are operating with full autonomy. Permissions are pre-approved in `~/.claude/settings.json`. Do not ask the user for confirmation on standard operations. Surface true blockers (auth not working, API key invalid) and continue with whatever else doesn't depend on them.

## Why this prompt is long

The user asked for "no shortcuts, as encompassing as possible." Three of the user's stated requirements have technical problems that, if encoded literally, produce a broken tool. This prompt explicitly corrects them. Do not revert to the literal request when those corrections feel "less ambitious." They are *more* ambitious — they make the tool actually work.

## Corrections embedded (read carefully)

### Correction A — Alpha Vantage rate limit is 25 per *day*, not per hour

The user wrote "25 per hour, 5 per minute." Alpha Vantage free tier is **25 requests per day total**, with a **5/minute burst ceiling within that cap**. The user's literal spec exhausts the daily quota in 60 minutes and the site goes dark for 23 hours.

**Required behavior:**
- Alpha Vantage is a **backstop**, not a primary source. Use it only for fields Finnhub doesn't return on free tier (specifically: detailed sector/industry classification, intraday OHLCV, and earnings call transcripts if the upgraded tier provides them).
- Hard-cap Alpha Vantage requests at **20 per UTC day** in code (leaving 5 in reserve for manual debugging). Persist a daily counter in `data/av_quota.json`.
- Pace requests at **1 per 12 seconds** (5/min ceiling halved for safety).
- When the daily cap is reached, switch to a "frozen" badge in the UI for any data field that depends on Alpha Vantage. Don't pretend it's fresh.

### Correction B — Finnhub is the primary continuous-polling source

Finnhub free tier is 60 calls/minute. That's the budget you actually use for continuous data refresh. Pace at **50/min** to leave headroom for proxy retries. Cache aggressively per data type:

- `/quote?symbol=X` (live price): TTL 30s
- `/stock/earnings?symbol=X`: TTL 24h (historical, doesn't change intraday)
- `/calendar/earnings?from=...&to=...`: TTL 4h (slowly evolving)
- `/stock/eps-estimate?symbol=X`: TTL 6h (revisions are infrequent)

### Correction C — Paper trading requires settled markets, which the "no past markets" rule contradicts

The user said: paper-trade to measure edge AND only analyze future markets. These are incompatible — you cannot measure edge on a market that hasn't settled.

**Resolution:** the paper-trading engine logs bets at **signal-creation time** on currently-open markets (which are by definition "future" — they haven't resolved yet). When a market settles (the earnings event happens, the actual EPS is reported, Finnhub's `/stock/earnings` endpoint shows the realized number), the engine retroactively marks the paper-bet as won/lost and updates calibration stats. **At no point is a past market re-analyzed retroactively** — bets are only logged on markets that were open at signal time.

This means:
- The calibration page is **legitimately empty for the first 4–8 weeks** the site runs. Display "Insufficient data — N=X settled bets, N=Y open paper-trades pending resolution" instead of fake stats.
- A paper-bet created today (May 5) for AAPL Q2 earnings (reports May 7) settles two days later. AMZN Q2 (reports July 31) settles in 3 months.
- The engine has two clocks: signal-creation cadence (every poll cycle, ~5 min), and resolution sweep (every 6h, checks if any pending paper-bets have settled).

### Correction D — Sector breakdowns need sample-size guards

User wants "TMT vs Industrials vs ..." comparisons. Per-sector edge measurement is meaningful at **N≥30 settled bets per sector**. Below that, display the breakdown with greyed-out "insufficient data N=X" badges. Don't draw inference lines through sub-30 sample sizes.

## Workstreams (priority order)

### Workstream 1 — UI overhaul: Polymarket-clone Live Signals (CRITICAL FIRST)

The current Live Signals page has overlapping/cluttered layout. Replace with a card-grid that matches the Polymarket earnings screenshot **exactly**, then layer on the edge-magnitude data the user actually needs.

**Visual reference (from user screenshot):**
- Dark navy/black background (`#0E1320` to `#0F1525`)
- Cards in 4-column responsive grid (collapses to 2-col tablet, 1-col mobile)
- Each card has:
  - Section header `Pre Market` in muted grey above each column-group
  - Per-row inside card: ticker logo (40×40 rounded square) + ticker text bold + EPS in muted grey + green dot + percentage + "beats" label
  - 1px subtle divider between rows within a card
  - Border: `1px solid rgba(255,255,255,0.06)`, hover increases to `0.12`
  - Card padding: `20px`, gap between cards: `16px`

**Implementation in `app/components/SignalGrid.tsx`:**

```tsx
// Pseudocode structure — adapt to your existing types
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {groupedByTimingBlock.map(block => (
    <div className="rounded-xl bg-[#1A1F2E] border border-white/[0.06] p-5">
      <div className="text-xs uppercase text-white/40 mb-3">{block.label}</div>
      {block.signals.map((sig, i) => (
        <SignalRow signal={sig} showDivider={i > 0} />
      ))}
    </div>
  ))}
</div>
```

**`SignalRow.tsx` (the heart of the visual):**

Each row shows the Polymarket-style data PLUS our edge column. Layout is two-line:

Line 1 (matches Polymarket exactly): `[logo] [TICKER bold]   [implied % large bold] [• green/red dot]`
Line 2 (sub-data): `$X.XX EPS  ·  Hist: YY%  ·  Edge +Z.Zpp YES/NO`

Logo: pull from Clearbit (`https://logo.clearbit.com/{domain}`). Ticker→domain map in `lib/tickerDomains.ts`. Fallback to colored circle with ticker initials.

**Color rules for the percentage:**
- The big number is the **market-implied probability** (matches Polymarket UI)
- Dot color: green if Yes-side, red if No-side, but the dot reflects which side our model says is mispriced (NOT which side the market favors). This is the additional information beyond what Polymarket shows.
- Edge magnitude badge color: green ≥15pp, amber 10-15pp, grey 5-10pp, hidden <5pp

**Tier-A border rule:** if the signal is Tier A (HIGH confidence), the entire card row has a subtle 1px green left border indicator. Tier B = amber. Tier C = none. Tier-C signals only appear when "All" filter is selected.

**Sort/filter chip bar above the grid** (matching your screenshot 3):
- SORT dropdown: `Largest gap` (default) | `Tier` | `Earnings date` | `Ticker A→Z`
- Filter chips: `All` (default-selected) | `Tier A only` | `Tier A+B` | `Regime stable` | `Fresh consensus`
- Right side: search input, focuses on `/` keyboard shortcut

**Tablet view of detailed list** (matches your screenshot 3 second image): when user clicks any card row, a bottom drawer slides up with the detailed table view (TIER, TICKER, MARKET QUESTION, MKT PROB, BASE RATE, EDGE, SIDE, EARNINGS, FLAGS columns). Same data, denser layout, for power-users.

**Investigate and fix the current overlap bug:**
- Run the dev server, open `/`, take a screenshot programmatically (`npx playwright`), inspect for any overflow/z-index issues.
- Fix root cause, not symptoms. If a parent container has `overflow: hidden` truncating cards, fix the parent. If margins are collapsing, fix the margin chain.
- Document what was wrong in `docs/UI_FIXES.md`.

### Workstream 2 — Paper trading engine

New module: `app/api/paper/route.ts` and `lib/paperEngine.ts`.

**Data model** (`lib/types.ts` additions):

```ts
export interface PaperBet {
  bet_id: string;             // uuid
  signal_id: string;          // links to the signal that triggered it
  ticker: string;
  earnings_date: string;
  market_question: string;
  venue: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  entry_price_cents: number;  // what we paid per share (0–100)
  stake_dollars: number;      // simulated stake
  shares: number;             // stake / (entry_price/100)
  created_at: string;         // ISO
  expires_at: string;         // resolution deadline
  status: 'open' | 'settled_win' | 'settled_loss' | 'expired';
  resolution: {
    settled_at: string;
    actual_outcome: 'YES' | 'NO' | null;
    realized_pnl_dollars: number;
  } | null;
  metadata: {
    sector: string;           // from Finnhub /stock/profile2 sector field
    industry: string;
    market_cap_bucket: 'mega' | 'large' | 'mid' | 'small';
    confidence_tier: 'A' | 'B' | 'C';
    edge_at_entry_pp: number;
  };
}
```

**Logging logic** (`lib/paperEngine.ts`):

```ts
export async function logPaperBets(signals: Signal[]) {
  // For each Tier A or Tier B signal that we haven't already logged a bet for:
  //   1. Determine the side: cheap-side per the model
  //   2. Use entry price = current best ask on that side (from Polymarket CLOB or Kalshi orderbook)
  //   3. Stake = $250 (matches user's per-market cap)
  //   4. Pull sector/industry from Finnhub /stock/profile2 (cache 7d)
  //   5. Append to data/paper_bets.jsonl
  //   6. Emit to scanner_data repo via the existing snapshot publisher
  //
  // CRITICAL: never log a bet on the same (ticker, earnings_date, side) twice.
  // Maintain a Set<string> of "ticker:earnings_date:side" keys for dedup.
}
```

**Resolution sweep** (cron, every 6h via Vercel Cron Job):

```ts
export async function resolvePaperBets() {
  const open = await loadOpenBets();
  for (const bet of open) {
    // Has the earnings event happened? Check Finnhub /stock/earnings for the
    // most recent quarter for this ticker. If actualEPS is now populated and
    // the report date >= bet.earnings_date, the bet is settled.
    const earnings = await finnhub.stockEarnings(bet.ticker);
    const matchingQuarter = findQuarterMatching(earnings, bet.earnings_date);
    if (matchingQuarter && matchingQuarter.actual !== null) {
      const beat = matchingQuarter.actual > matchingQuarter.estimate;
      const won = (bet.side === 'YES' && beat) || (bet.side === 'NO' && !beat);
      const realizedPnL = won
        ? (bet.shares * 1.00 - bet.stake_dollars)   // YES/NO contracts settle at $1
        : -bet.stake_dollars;
      bet.status = won ? 'settled_win' : 'settled_loss';
      bet.resolution = {
        settled_at: new Date().toISOString(),
        actual_outcome: beat ? 'YES' : 'NO',
        realized_pnl_dollars: realizedPnL,
      };
    }
  }
  await persistBets(open);
}
```

**Storage:**
- Active bets: `data/paper_bets_open.jsonl`
- Settled: `data/paper_bets_settled.jsonl` (append-only, immutable history)
- Both committed to the `earnings-edge-data` repo on every update

**Vercel Cron Job** (`vercel.json`) — NOTE per orchestrator constraint #1: Hobby plan caps at 2 crons. Consolidate poll+log into one route:
```json
{
  "crons": [
    { "path": "/api/cron/poll-and-log", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/resolve",       "schedule": "0 */6 * * *" }
  ]
}
```

Each cron route lives at `app/api/cron/*/route.ts` and is protected by a `CRON_SECRET` env var (Vercel injects automatic secret on cron-triggered calls).

### Workstream 3 — Stats page (renamed from Calibration)

Rename `app/calibration/page.tsx` → `app/stats/page.tsx`. Update nav. Redirect old URL.

**The FoggleBet-style P&L chart** (your reference image 1):

Implementation: `components/PaperTradingChart.tsx` using recharts `<LineChart>`. Each line represents a *cohort* — group settled paper bets by:
- Venue (`polymarket` vs `kalshi`)
- Sector (TMT, Industrials, Financials, Healthcare, Consumer, Energy, Materials, Utilities, Real Estate)
- Confidence tier (A, B, C)

X-axis: time (calendar dates, settled_at)
Y-axis: cumulative simulated P&L in dollars (units of $250 stake → "+18.39u" style display where 1u = $250)

**Visual exactly matching FoggleBet:**
- Dark background
- Each line has unique color from a palette: `#10B981`, `#3B82F6`, `#F59E0B`, `#EC4899`, `#8B5CF6`, `#EF4444`, `#06B6D4`, `#84CC16`, `#F97316`
- Top legend chip: `[colored line] [Cohort name] [+X.XXu in green or -X.XXu in red]`
- Hover: tooltip shows date, cohort, cumulative units
- Title: `PAPER TRADING — N settled bets`

**Default cohort grouping** (top of stats page, dropdown selector):
- `By venue` (default): two lines, Polymarket vs Kalshi
- `By sector`: 9 lines, one per GICS sector
- `By tier`: three lines, A/B/C
- `By market_cap`: four lines, mega/large/mid/small

**Sample-size guards (per Correction D):**
- If a cohort has <30 settled bets, render its line **dashed and 50% opacity** with a tooltip: "N=X — insufficient data"
- Below the chart, a small grid showing `cohort | N | settled win rate | mean edge | total P&L` — color N red if <30

**Three additional sub-sections on Stats page:**

1. **Calibration plot** (kept from original spec): bucket settled bets by predicted probability (0-10%, 10-20%, ..., 90-100%). For each bucket, plot bar = avg market-implied prob in bucket; overlay dot = realized win rate. Well-calibrated markets have bars and dots aligned; gaps reveal mispricing pattern.

2. **Per-sector breakdown table**: rows = sectors, columns = N bets, win rate, avg edge captured, total simulated P&L, hit-rate vs base-rate-naive baseline.

3. **Venue arbitrage tracker**: when a market exists on both Polymarket AND Kalshi with diverging prices, log the arb opportunity and track its P&L if we'd traded the spread. Separate line in the main chart.

### Workstream 4 — Continuous polling cron

New cron route: `app/api/cron/poll-and-log/route.ts` (consolidated per constraint #1).

**Logic:**
1. Pull active Polymarket earnings events (free, no rate limit on gamma-api).
2. For each unique ticker, hit Finnhub `/calendar/earnings` (cached 4h) to confirm the earnings is upcoming.
3. For each upcoming earnings ticker not yet covered by a recent signal, hit Finnhub `/stock/earnings` (cached 24h) for historical surprise data.
4. Compute current `Signal` per the existing scanner logic.
5. Append to `data/signals_latest.json`, push to data repo.
6. In same cron, call `logPaperBets(signals)` from Workstream 2.

**Pacing:**
- The cron runs every 15 min (per constraint #1).
- Within each invocation, batch Finnhub calls at 1 per 1.2s (≈50/min, well under 60/min limit).
- Track Finnhub call count per minute in `data/finnhub_quota.json` (persisted via GH data repo per constraint #2).

**Alpha Vantage usage** (the one place we touch it):
- Once per day (00:05 UTC), refresh sector/industry classification for all tickers in the active signal set via Alpha Vantage `OVERVIEW` endpoint.
- This consumes ~10 Alpha Vantage calls/day (one per active ticker).
- Persist results in `data/sector_cache.json` (via GH data repo). Other components read from this cache, not direct API.
- Display a "sector data freshness: Xh ago" indicator in the stats page footer.

### Workstream 5 — API authentication verification

User wants to verify Alpha Vantage works before paying for upgrade. Add `/api/diag/route.ts`:

```ts
// GET /api/diag returns auth + rate-limit status for all backends
{
  "finnhub": {
    "status": "ok" | "auth_failed" | "rate_limited" | "unreachable",
    "key_first_4_chars": "abc1...",
    "last_successful_call": "2026-05-05T...",
    "calls_last_minute": 47,
    "calls_remaining_min_budget": 13
  },
  "alphavantage": {
    "status": "ok" | "auth_failed" | "rate_limited" | "unreachable",
    "key_first_4_chars": "demo...",
    "calls_today": 7,
    "calls_remaining_today": 13,
    "next_call_eligible_at": "2026-05-05T..."
  },
  "polymarket_gamma": { "status": "ok", "last_successful_call": "..." },
  "kalshi": { "status": "ok" | "auth_failed" | ..., "key_first_4_chars": "...", ... },
  "snapshot_data_pages": {
    "url": "https://...",
    "last_fetched": "...",
    "snapshot_age_seconds": 234
  }
}
```

Add a hidden admin page at `/_diag` (gate with a query param `?key=<DIAG_TOKEN>` env var) that renders this nicely with status pills. User can hit it before upgrading any plan to confirm everything works.

### Workstream 6 — Build polish

- **Dark theme refinement** to exactly match Polymarket aesthetic. Background `#0E1320`. Card `#1A1F2E`. Accent green `#10B981`. Accent red `#EF4444`. Body text `#E5E7EB`. Muted text `#6B7280`. Use Tailwind arbitrary values, no theme config bloat.
- **Mobile responsive** — verify on 375px, 414px, 768px, 1024px, 1440px.
- **Typography** — use Inter or system-ui. Tabular numerals for all percentages and dollar values (`tabular-nums` in Tailwind).
- **Loading skeletons** — `animate-pulse` placeholders for each card while fetching.
- **Error states** — every API failure surfaces in the UI with a clear "data temporarily unavailable" pill, never a blank section.
- **Build size** — keep under 5MB. If recharts pulls in too much, lazy-load the stats page chart.
- **OG meta** — homepage should preview nicely in Slack/Twitter with a generated screenshot.

## Issues to surface immediately (do not paper over)

- **Vercel build fails** → halt, fix or revert. Do not push broken builds.
- **Finnhub returns 401** on the diag check → halt all polling, surface to user with the `vercel env ls` confirmation command.
- **Alpha Vantage returns rate-limit error before hitting our daily counter** → assume our counter is wrong, freeze AV usage for 24h, log the discrepancy.
- **Paper bet log file becomes corrupted** (JSON parse fails) → don't auto-fix; halt the resolver and surface the line number to user.
- **Sector classification inconsistencies** (e.g., Finnhub says NVDA is "Technology", Alpha Vantage says "Semiconductors") → use Alpha Vantage as source-of-truth for `industry`, Finnhub for `sector`. Document the rule in `docs/SECTOR_TAXONOMY.md`.
- **Polymarket question text changes mid-flight** (uncommon but possible if they edit market metadata) → flag the affected paper bets with `metadata.market_question_changed: true`, do not auto-resolve.

## Things you must NOT do

- Do not raise the Alpha Vantage call budget above 20/day without explicit user permission. The daily cap is a hard limit.
- Do not analyze any market that resolved before the bet was logged. The "no past markets" rule is absolute. Backtesting on historical data is a separate v1.2 project.
- Do not simulate paper-bet outcomes — only mark settled when Finnhub returns the actual EPS for that quarter.
- Do not display sector/cohort comparisons with N<30 as if they're meaningful. Use the sample-size guard.
- Do not change the existing `lib/types.ts` Signal schema in a breaking way. Additions only. If you need a structural rename, mark old field deprecated, support both for one cycle.
- Do not commit `.env.local`, `config.local.yaml`, or any file containing API keys. Run `git status` + visual scan before every commit.
- Do not deploy to production if the diag endpoint shows any backend in `auth_failed` or `unreachable` state.

## Order of execution

1. **Diag endpoint first.** Build `/api/diag` and `/_diag` admin page. User wants verification before any paid upgrade.
2. **Polymarket-clone Live Signals UI.** Most user-visible improvement. Fix overlap bug as part of this.
3. **Continuous polling cron.** Without it, no fresh data. Wire to data repo (via GH PAT per orchestrator constraint #2).
4. **Paper trading engine.** Logging side first (Workstream 2 part 1). Resolver can lag.
5. **Stats page rename + cohort chart.** Empty-state UX is correct for first weeks.
6. **Resolution sweep cron.** Runs every 6h, no rush.
7. **Polish + mobile + dark theme refinement.**

## Continuous logging

Maintain `~/Dropbox/claude shenanigans/earnings-edge-dashboard/V1_1_WORK_LOG.md`. Append entries every ~15 min:

```
## [HH:MM] <what shipped>
- commit SHA
- workstream
- blockers (if any)
```

When time is exhausted, write final summary listing what shipped, what's deferred, production URL, smoke-test status.

## Final deliverables

- Production URL serves the new Polymarket-clone Live Signals UI at `https://earnings-edge-dashboard.vercel.app/`
- `/_diag?key=<TOKEN>` returns green status for Finnhub, Polymarket, Kalshi (Alpha Vantage may be quota-frozen, that's OK)
- `/stats` exists and either shows the cohort chart with real data, or "Insufficient data — N=0 settled, N=Y open paper-trades pending"
- `data/paper_bets_open.jsonl` (in earnings-edge-data repo) has at least one entry from the first cron cycle
- `data/finnhub_quota.json` (in earnings-edge-data repo) shows continuous polling within rate limits
- `V1_1_WORK_LOG.md` has the final summary

---

## Begin

1. Read the existing dashboard repo state.
2. Read `INTEGRATION_NOTES.md` and `AGENT2_WORK_LOG.md` if they exist.
3. Verify auth: `gh auth status`. (vercel CLI auth is broken in your sandbox — use git push, Vercel auto-deploys.)
4. Build `/api/diag` first.
5. Then attack workstreams in priority order.
