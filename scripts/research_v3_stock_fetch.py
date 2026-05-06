#!/usr/bin/env python3
"""
Pre-fetch historical stock prices for the 411 unique earnings tickers in
data/research/all_markets_resolved.parquet. Saves per-ticker CSVs to
data/research/v3/stock_history/<TICKER>.csv covering T-60d to T+10d around
each market's end_date.

Watchdog-resistant: prints progress every 25 tickers.
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "research"
OUT = DATA / "v3" / "stock_history"
OUT.mkdir(parents=True, exist_ok=True)

THREADS = 4  # yfinance is sensitive to too much parallelism

def main():
    df = pd.read_parquet(DATA / "all_markets_resolved.parquet")
    earnings = df[df.category == "earnings"].copy()
    earnings["end_date"] = pd.to_datetime(earnings["end_date"], utc=True)
    print(f"earnings markets: {len(earnings)}", flush=True)

    # Per-ticker date range
    ticker_ranges = {}
    for _, row in earnings.iterrows():
        t = str(row["ticker_or_event"]).strip().upper()
        if not t or t in {"NAN", "NONE", ""}: continue
        start = (row["end_date"] - timedelta(days=60)).date()
        end = (row["end_date"] + timedelta(days=10)).date()
        if t in ticker_ranges:
            old_start, old_end = ticker_ranges[t]
            ticker_ranges[t] = (min(old_start, start), max(old_end, end))
        else:
            ticker_ranges[t] = (start, end)

    # Filter to non-class-share tickers (yfinance handles class shares as TICKER-A but our data has TICKER without)
    print(f"unique tickers to fetch: {len(ticker_ranges)}", flush=True)

    def fetch_one(ticker, dr):
        out = OUT / f"{ticker}.csv"
        if out.exists() and out.stat().st_size > 200:
            return ("skipped", ticker, 0)
        try:
            tk = yf.Ticker(ticker)
            h = tk.history(start=dr[0].isoformat(), end=dr[1].isoformat(), auto_adjust=True)
            if h.empty:
                return ("empty", ticker, 0)
            h = h[["Open", "High", "Low", "Close", "Volume"]]
            h.to_csv(out)
            return ("ok", ticker, len(h))
        except Exception as e:
            return ("err", ticker, str(e)[:80])

    t0 = time.time()
    ok = err = empty = skipped = 0
    err_log = []
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futures = {ex.submit(fetch_one, t, dr): t for t, dr in ticker_ranges.items()}
        for i, fut in enumerate(as_completed(futures), 1):
            status, ticker, info = fut.result()
            if status == "ok":
                ok += 1
            elif status == "skipped":
                skipped += 1
            elif status == "empty":
                empty += 1
                err_log.append((ticker, "empty history"))
            else:
                err += 1
                err_log.append((ticker, info))
            if i % 25 == 0:
                elapsed = time.time() - t0
                print(f"progress {i}/{len(futures)} ok={ok} skip={skipped} empty={empty} err={err} ({elapsed:.0f}s)", flush=True)
    elapsed = time.time() - t0
    print(f"DONE ok={ok} skipped={skipped} empty={empty} err={err} in {elapsed:.0f}s", flush=True)

    # Diagnostic
    diag = {
        "total_tickers": len(ticker_ranges),
        "ok": ok,
        "skipped": skipped,
        "empty": empty,
        "err": err,
        "elapsed_sec": int(elapsed),
        "first_10_errors": err_log[:10],
    }
    (DATA / "v3" / "stock_fetch_diag.json").write_text(json.dumps(diag, indent=2))
    print(f"diag saved", flush=True)

if __name__ == "__main__":
    main()
