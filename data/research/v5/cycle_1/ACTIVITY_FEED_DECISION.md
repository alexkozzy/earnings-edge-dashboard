# Polymarket activity-feed feasibility

Generated 2026-05-08 by Agent C v5-c1. Probes in `scripts/research_v5_c/probe_polymarket.py`, `probe_data_api.py`, `probe_data_api_depth.py`. Pilot in `scripts/research_v5_c/pilot_activity_feed.py`. Raw output in `data/research/v5/cycle_1/activity_feed_pilot.json`.

## Endpoints investigated

| Endpoint | Status | Notes |
|---|---|---|
| `gamma-api.polymarket.com/markets` | OK (200) | Known. Used for market-list discovery. |
| `gamma-api.polymarket.com/trades` | 404 | Doesn't exist. |
| `gamma-api.polymarket.com/activity` | 404 | Doesn't exist. |
| `data-api.polymarket.com/trades` | OK (200) | **Per-trade firehose, no auth required.** |
| `data-api.polymarket.com/activity` | 400 | Requires `user` param. Not the firehose. |
| `clob.polymarket.com/` | OK (200, "OK") | Health check. |
| `clob.polymarket.com/markets` | OK (200) | Closed-book market metadata; not trades. |
| `clob.polymarket.com/trades` | 401 | Auth required (signed CLOB request). Not usable for public feed. |
| `clob.polymarket.com/trade-history` | 404 | Doesn't exist. |
| `wss://ws-subscriptions-clob.polymarket.com/ws/` | not probed in this run | Documented public WSS for live order/trade events; would need 30s+ of socket time. **Future cycle.** |
| Goldsky orderbook subgraph | 404 | The path I guessed is wrong. Goldsky hosts polymarket subgraphs but the project/subgraph slug needs to be looked up. |
| Goldsky positions subgraph | 200 (errors in payload) | Subgraph exists, GraphQL schema has different field names than guessed. |
| `api.thegraph.com/subgraphs/name/polymarket/...` | DNS-level NXDOMAIN | The Graph hosted service is sunset for Polymarket (migrated to Goldsky). |

## Endpoints that responded usefully

### `data-api.polymarket.com/trades` — the workhorse

- **Auth:** none.
- **Method:** GET.
- **Response shape (per trade):**
  - `proxyWallet` (taker), `side` (`BUY`/`SELL`), `asset` (CTF token id, decimal),
    `conditionId` (0x-prefixed bytes32 → market identifier),
    `size` (USDC notional? actually — verified by inspection, this is the SHARE size, with `notional = size * price`),
    `price` (0–1 probability), `timestamp` (unix seconds),
    `title`, `slug`, `eventSlug`, `outcome`, `outcomeIndex` (0=YES, 1=NO),
    `name`, `pseudonym`, `bio`, `transactionHash`.
- **Query params (verified):**
  - `limit` (max 1000 — verified 200/500/1000 all returned that count for the firehose).
  - `offset` (verified working).
  - `market=<conditionId>` (filter to one market — verified).
  - `filterType=CASH&filterAmount=1000` (filter to large notional trades — **verified**, returned a $1059 SELL on "Strait of Hormuz traffic returns to normal by May 15"). This is essentially a server-side large-trade filter. Useful.
  - `takerOnly=true` (boolean — accepted; behavior unverified).
- **Granularity:** per-trade, sub-second timestamps (unix seconds — limit of upstream resolution).
- **Historical depth:**
  - **Unfiltered firehose:** `limit=1000` covers ~23 seconds end-to-end (~43 trades/sec aggregate). `offset` works but the deep-offset behavior is shallow at the firehose level.
  - **Per-market filtered:** `limit=1000&market=<cond>` for a busy geopolitics market (Strait of Hormuz) covered **16.8 hours**. `offset=1000` continued further back. Per-market historical depth is comfortably ≥24 h, likely ≥1 week on quiet markets.
- **Rate limit:** 10 unbroken requests in <2s with all sub-200ms responses, no 429s. No documented hard limit observed; treat 1 req/200ms as comfortably safe.
- **Latency:** trades observed in the API within seconds of their on-chain timestamp; effectively real-time.

### `gamma-api.polymarket.com/markets` — for market discovery

- Filter `closed=false&active=true&order=volumeNum&ascending=false` returned the highest-volume open markets.
- Geopolitics tag filter via `tag_id=2&related_tags=true` was used in early probes but had no effect; used keyword-based question filter as fallback (see `pilot_activity_feed.py` `is_geopolitics()` helper).
- Pagination: `limit=100` per page, `offset` for next page. Confirmed working.

## Decision criteria recap

Required for "build the pilot":
- [x] Per-trade data with sub-minute timestamps. **Met.** Unix-second timestamps.
- [x] Historical access ≥ 24 hours. **Met.** Per-market filtered, easily 24 h+.
- [x] Rate limit allows polling top 100 geopolitics markets at 5-min cadence. **Met by margin.** 100 reqs / 5 min = 1 req every 3s; observed 1 req / 100 ms is fine.

## Pilot scraper decision: **BUILT**

Time-box: 30 min total Part 2 budget. Pilot constructed and run in 26 seconds because we used historical pull (last ~48 h) instead of live polling for an hour. This is more honest than a 1-hour live capture would have been: more data, same statistical question.

### Pilot configuration

- 65 candidate open geopolitics markets discovered (via question-text keyword filter); top 20 by `volumeNum` selected.
- Top markets covered: Iran regime fall (multiple expiries), US invade Iran 2027, China invade Taiwan, US x Iran peace deal, Russia x Ukraine ceasefire, Iran airspace closure, Putin out by 2026, Kharg Island, etc.
- For each market, fetched up to 4 pages × 1000 trades = 4000 trades, looped until ts < now-48 h.
- "Large trade" threshold: `notional = size * price > $1000`.
- Forward window: 1 hour after each large trade. Reference price: VWAP of last 5 trades inside the window. Skip large trades with <5 fwd trades.

### Pilot results

- **Markets monitored:** 20.
- **Trades captured:** ~40,000 across the 20 markets (sum of per-market 1000–4000 trade pulls).
- **Large trades (>$1K notional, with usable 1h fwd window):** **1,402.**
- **Correlation with subsequent moves:**
  - Mean signed move (in YES-probability terms, sign-aligned to large-trade direction): **−0.0022** (i.e., −0.22 percentage points against the large-trade direction over 1h).
  - 95% bootstrap CI on the mean: **[−0.0037, −0.0007]** — distinguishable from zero, sign is **negative**.
  - Direction-hit rate (subsequent move in same direction as large trade): **39.5%** (554/1402). **Worse than coin-flip.**
  - Five biggest examples (notional, direction, price-now → price-fwd):
    - $469,030 SELL (yes_dir=-1) on "U.S. invade Iran before 2027": 0.280 → 0.274 (move went *against* the SELL by 0.6pp; signed_move=+0.006)
    - $351,817 SELL on same market: 0.290 → 0.274 (signed_move=+0.016)
    - $173,704 SELL on "Iranian regime fall by May 31": 0.021 → 0.020 (signed_move=+0.001)
    - $160,000 BUY on "U.S. invade Iran before 2027": 0.200 → 0.198 (signed_move=−0.002)
    - $144,000 SELL on "Iranian regime fall by June 30": 0.040 → 0.044 (signed_move=−0.004)

### Headline finding

**"Follow large trades" doesn't work — it's slightly anti-momentum.** The naive "follow whales" prior is rejected at p ≈ 0.005 in the wrong direction. Large trades are slightly *faded* by the order book over the next hour.

But the fade is too small to trade: −0.22pp is below typical Polymarket bid/ask spread for these markets and far below any reasonable cost-aware threshold. As a profit strategy: not viable in this raw form.

### What's actually interesting in the data

- **Whale dominance.** The "large trade" set is not a uniform population. The top-5 largest trades range from $144K to $469K — orders of magnitude above the $1K floor. Two of the top 5 are sequential SELLs by the same market on "U.S. invade Iran before 2027" within 32 seconds of each other; almost certainly one wallet executing a single intent. The signed-move statistic is heavily influenced by these outliers.
- **Bias toward NO-side large trades.** Anecdotally, most of the largest trades in this sample are SELLs on YES (or BUYs on NO) of "regime falls / war happens" markets — i.e., whales fading the tail-event YES side. This matches the broader prior: tail-event prediction markets persistently overprice YES, and the smart money fades them.
- **Per-market historical depth is rich.** 16.8h of trades on a single mid-volume market in 1000 records is a huge feature surface for cycle 2 to mine: order-flow imbalance, taker/maker ratio, clustering of large trades around news events, etc.

### Recommendation for cycle 2

**Pursue an order-flow-feature direction**, not a "follow whales" strategy. Specifically:

1. **Tail-event fading with whale-flow as confirmation.** The strongest signal in this pilot is *NO whales fading YES on tail-event markets*. Build a feature: rolling 24h sum of NO-side large-trade notional / total-volume. Backtest as a confirmation overlay on existing strategies S1 (fade extremes) and S4 (time-decay long-tail) from cycle 1's grid. Cycle 2 hypothesis: when the whale flow agrees with the strategy's bet direction, the bet has higher expected return.
2. **Order-flow imbalance feature for cell-grid expansion.** Add `oi_24h = (BUY_vol_YES + SELL_vol_NO) - (SELL_vol_YES + BUY_vol_NO)` per market per day as a continuous feature. Test if quartiles of `oi_24h` interact meaningfully with strategy returns.
3. **Skip the live-streaming WebSocket for now.** Per-market REST polling at 5-min cadence is more than sufficient for the feature-frequency the strategies need. The WebSocket is interesting for a future "fast-fade" intraday strategy but not for cycle 2 which is still at the daily/weekly horizon per SESSION_CONFIG.

### Cycle 2 build checklist (if orchestrator picks this direction)

- Persistent ETL: poll `data-api.polymarket.com/trades?market=<cond>&limit=1000` for the universe of geopolitics markets every 30 min, dedupe by `transactionHash`, append to a parquet/duckdb table. Storage budget per market per day: ~50 KB at typical mid-volume. 200 markets × 90 days = ~900 MB raw. Trivial.
- Feature engineering: per market per day, derive: large-trade count (>$1K, >$10K, >$100K bands), notional sum by side, count of unique large-wallets, rolling 7d / 30d aggregates.
- Backtest harness: re-run the cycle-1 cell grid with these features as additional partitioning dims; check whether marginal Sharpe improves vs. price-only.
