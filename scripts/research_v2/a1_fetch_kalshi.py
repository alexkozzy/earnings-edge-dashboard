#!/usr/bin/env python3
"""
A1 — Inventory Kalshi public markets.

Strategy: query the public Kalshi API (no auth) for markets, paginating with cursor.
Filter to series likely to overlap Polymarket (Fed, CPI, BTC/ETH, politics, earnings).
Write JSONL with one market per line.

Pace at 0.5s between paginated calls to stay polite.
"""
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

BASE = "https://api.elections.kalshi.com/trade-api/v2"

# Series prefixes to prioritize (case-insensitive prefix match on series_ticker or ticker)
PRIORITY_SERIES_PREFIXES = (
    "KXFED",          # Fed decisions
    "KXFEDDECISION",  # Fed decision variants
    "FED",            # legacy
    "KXCPI",          # CPI
    "KXCPIYOY",       # CPI YoY
    "KXBTCD",         # BTC daily
    "KXETHD",         # ETH daily
    "KXBITCOIN",      # Bitcoin (price by month etc)
    "KXETHEREUM",
    "KXBTC",
    "KXETH",
    "BTCD",           # legacy
    "ETHD",
    "KXPRES",         # Pres election
    "PRES",           # legacy
    "KXSEN",          # Senate
    "KXHOUSE",
    "KXEARN",         # earnings
    "KXJOBS",         # jobs report
    "KXNFP",          # nonfarm
    "KXGDP",
    "KXUNRATE",
    "KXPPI",
    "KXPCE",
)

OUT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard/data/research/v2/kalshi_data/markets.jsonl")
OUT.parent.mkdir(parents=True, exist_ok=True)


def http_get(path, params=None, retries=3):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "earnings-edge-research/2.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                time.sleep(2 + attempt * 2)
                continue
            if e.code >= 500:
                time.sleep(1 + attempt)
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(1)
    raise last_err


def is_priority(market):
    s = (market.get("series_ticker") or "").upper()
    t = (market.get("ticker") or "").upper()
    et = (market.get("event_ticker") or "").upper()
    for p in PRIORITY_SERIES_PREFIXES:
        if s.startswith(p) or t.startswith(p) or et.startswith(p):
            return True
    return False


def in_date_window(market, start="2024-01-01"):
    ct = market.get("close_time") or market.get("expiration_time")
    if not ct:
        return False
    return ct >= start


def fetch_status(status, max_pages=200):
    cursor = None
    page = 0
    out = []
    while True:
        params = {"status": status, "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        try:
            data = http_get("/markets", params)
        except Exception as e:
            print(f"  ! page {page} ({status}) failed: {e}", flush=True)
            break
        markets = data.get("markets", []) or []
        out.extend(markets)
        cursor = data.get("cursor")
        page += 1
        if page % 5 == 0 or not cursor:
            print(f"  {status}: page {page}, cumulative {len(out)}", flush=True)
        if not cursor or page >= max_pages:
            break
        time.sleep(0.5)
    return out


def main():
    t0 = time.time()
    all_markets = []

    for status in ("settled", "active", "closed"):
        print(f"== Fetching {status} markets ==", flush=True)
        try:
            ms = fetch_status(status)
            print(f"  total {status}: {len(ms)}", flush=True)
            all_markets.extend(ms)
        except Exception as e:
            print(f"  failed for {status}: {e}", flush=True)

    # Dedupe by ticker
    seen = set()
    deduped = []
    for m in all_markets:
        tk = m.get("ticker")
        if not tk or tk in seen:
            continue
        seen.add(tk)
        deduped.append(m)
    print(f"== Deduped: {len(deduped)} unique tickers ==", flush=True)

    # Filter
    in_window = [m for m in deduped if in_date_window(m)]
    print(f"== In date window (>=2024-01-01): {len(in_window)} ==", flush=True)

    priority = [m for m in in_window if is_priority(m)]
    print(f"== Priority series subset: {len(priority)} ==", flush=True)

    # Save ALL in-window markets (not just priority) so we can match unanticipated topics too
    # but flag the priority ones
    with OUT.open("w") as f:
        for m in in_window:
            row = {
                "ticker": m.get("ticker"),
                "event_ticker": m.get("event_ticker"),
                "series_ticker": m.get("series_ticker") or (m.get("ticker") or "").split("-")[0],
                "title": m.get("title"),
                "subtitle": m.get("subtitle"),
                "yes_sub_title": m.get("yes_sub_title"),
                "no_sub_title": m.get("no_sub_title"),
                "category": m.get("category"),
                "open_time": m.get("open_time"),
                "close_time": m.get("close_time"),
                "expected_expiration_time": m.get("expected_expiration_time"),
                "expiration_time": m.get("expiration_time"),
                "result": m.get("result"),
                "status": m.get("status"),
                "yes_bid": m.get("yes_bid"),
                "yes_ask": m.get("yes_ask"),
                "no_bid": m.get("no_bid"),
                "no_ask": m.get("no_ask"),
                "volume": m.get("volume"),
                "volume_24h": m.get("volume_24h"),
                "liquidity": m.get("liquidity"),
                "open_interest": m.get("open_interest"),
                "is_priority": is_priority(m),
            }
            f.write(json.dumps(row) + "\n")

    elapsed = time.time() - t0
    print(f"== Wrote {len(in_window)} markets ({sum(1 for m in in_window if is_priority(m))} priority) to {OUT} in {elapsed:.1f}s ==", flush=True)


if __name__ == "__main__":
    main()
