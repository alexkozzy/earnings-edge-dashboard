#!/usr/bin/env python3
"""Fetch Alpha Vantage EARNINGS for a curated list of 20 tickers.

Hard cap: 20 calls total. Reads/writes data/research/av_quota.json before each call.
Skips tickers whose JSON file already exists (resume-friendly).
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
ENV = ROOT / ".env.research"
OUT_DIR = ROOT / "data/research/av_earnings"
OUT_DIR.mkdir(parents=True, exist_ok=True)
QUOTA = ROOT / "data/research/av_quota.json"
HARD_CAP = 20

# 2 representative tickers per sector × 10 sectors = 20.
# Picked from the high-frequency tickers in the dataset that map to SECTOR_MAP.
TICKERS = [
    # Semis
    "MU", "AMD",
    # BigTech
    "AAPL", "GOOGL",
    # Banks
    "JPM", "GS",
    # AutoEV
    "TSLA", "F",
    # Energy
    "XOM", "HAL",
    # Staples
    "GIS", "KMX",
    # Industrials
    "FDX", "DAL",
    # Consumer
    "NKE", "DPZ",
    # TechServices
    "ACN", "FDS",
    # Pharma
    "JNJ", "LLY",
]


def load_env():
    for line in ENV.read_text().splitlines():
        if "=" not in line or line.startswith("#"):
            continue
        k, v = line.split("=", 1)
        os.environ[k] = v.strip().strip('"')


def load_quota():
    if QUOTA.exists():
        return json.loads(QUOTA.read_text())
    return {"total_calls": 0, "calls_by_endpoint": {}, "tickers_called": []}


def save_quota(q):
    QUOTA.write_text(json.dumps(q, indent=2))


def main():
    load_env()
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY", "").strip()
    if not api_key:
        print("FATAL: no ALPHA_VANTAGE_API_KEY", flush=True)
        sys.exit(1)
    quota = load_quota()
    print(f"starting quota: total_calls={quota['total_calls']}", flush=True)

    for tkr in TICKERS:
        out = OUT_DIR / f"{tkr}.json"
        if out.exists():
            print(f"  skip {tkr} (file exists)", flush=True)
            continue
        if tkr in quota["tickers_called"]:
            # We already burned a call on this ticker (likely throttled, no data).
            # Don't re-bill the quota.
            print(f"  skip {tkr} (already counted in quota; throttled?)", flush=True)
            continue
        if quota["total_calls"] >= HARD_CAP:
            print(f"HARD CAP reached at {quota['total_calls']} calls. Stopping.",
                  flush=True)
            break
        # Increment BEFORE the call to be safe
        quota["total_calls"] += 1
        quota["calls_by_endpoint"]["EARNINGS"] = quota["calls_by_endpoint"].get(
            "EARNINGS", 0
        ) + 1
        if tkr not in quota["tickers_called"]:
            quota["tickers_called"].append(tkr)
        save_quota(quota)
        try:
            r = requests.get(
                "https://www.alphavantage.co/query",
                params={"function": "EARNINGS", "symbol": tkr, "apikey": api_key},
                timeout=20,
            )
            data = r.json()
        except Exception as exc:
            print(f"  {tkr}: error {exc}", flush=True)
            continue
        # Detect AV rate-limit / error envelopes
        if "Note" in data or "Information" in data or "Error Message" in data:
            msg = data.get("Note") or data.get("Information") or data.get("Error Message")
            print(f"  {tkr}: AV envelope: {msg}", flush=True)
            # If rate-limited, save the envelope but stop
            out.write_text(json.dumps(data))
            print("STOP: AV rate-limit/error", flush=True)
            break
        out.write_text(json.dumps(data))
        nq = len(data.get("quarterlyEarnings") or [])
        print(f"  {tkr}: ok, {nq} quarters", flush=True)
        # AV free tier is moody about pace; sleep 15s between calls.
        time.sleep(15)
    print(f"DONE total_calls={quota['total_calls']}", flush=True)


if __name__ == "__main__":
    main()
