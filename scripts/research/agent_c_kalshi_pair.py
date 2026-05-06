#!/usr/bin/env python3
"""
agent_c_kalshi_pair.py — Agent C, Part 2 (fast, capped).

Pair Polymarket econ + crypto markets to Kalshi via the public
api.elections.kalshi.com endpoint (no auth). Probes a small set of known
econ + crypto series tickers, caps events per series, and matches Polymarket
rows by topic + close-date proximity.

Output: data/research/kalshi_paired_markets.jsonl
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
import urllib.request

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PARQUET = ROOT / "data/research/all_markets_resolved.parquet"
OUT = ROOT / "data/research/kalshi_paired_markets.jsonl"

KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"
USER_AGENT = "earnings-edge-dashboard-research/1.0"

# Series confirmed to host real econ+crypto markets via probe.
# Cap to a few high-yield ones so the run finishes in <2 min.
ECON_SERIES = ["KXFED", "KXFEDDECISION", "KXCPI"]
CRYPTO_SERIES = ["KXBTCD", "KXETHD"]

SERIES_TO_TOPIC = {
    "KXFED": "fed", "KXFEDDECISION": "fed", "KXCPI": "cpi",
    "KXBTCD": "btc", "KXETHD": "eth",
}

MAX_EVENTS_PER_SERIES = 60
MAX_MARKETS_PER_EVENT = 50


def http_get(url: str, timeout: int = 12, retries: int = 2) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt == retries - 1:
                print(f"[c] HTTP err {url[:120]}: {e}", file=sys.stderr, flush=True)
                return None
            time.sleep(1.5)
    return None


def fetch_events_capped(series_ticker: str, status: str | None = None,
                        max_events: int = MAX_EVENTS_PER_SERIES) -> list[dict]:
    out: list[dict] = []
    cursor = ""
    while len(out) < max_events:
        qs = {"limit": 200, "series_ticker": series_ticker}
        if status:
            qs["status"] = status
        if cursor:
            qs["cursor"] = cursor
        url = f"{KALSHI_BASE}/events?{urlencode(qs)}"
        data = http_get(url)
        if not data:
            break
        events = data.get("events", [])
        out.extend(events)
        cursor = data.get("cursor", "") or ""
        if not cursor or not events:
            break
        time.sleep(0.3)
    return out[:max_events]


def fetch_markets_for_event(event_ticker: str) -> list[dict]:
    qs = {"limit": MAX_MARKETS_PER_EVENT, "event_ticker": event_ticker}
    url = f"{KALSHI_BASE}/markets?{urlencode(qs)}"
    data = http_get(url)
    if not data:
        return []
    return data.get("markets", []) or []


def parse_date(s) -> datetime | None:
    if s is None:
        return None
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def topic_for_question(q: str) -> str | None:
    t = (q or "").lower()
    if "fed" in t and ("rate" in t or "cut" in t or "hike" in t or "raise" in t
                        or "decrease" in t or "increase" in t or "meeting" in t
                        or "fomc" in t):
        return "fed"
    if "cpi" in t or "inflation" in t:
        return "cpi"
    if "bitcoin" in t or " btc " in f" {t} ":
        return "btc"
    if "ethereum" in t or " eth " in f" {t} ":
        return "eth"
    return None


def write_status(status: str, reason: str, extra: dict | None = None):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"status": status, "reason": reason}
    if extra:
        payload.update(extra)
    with OUT.open("w") as f:
        f.write(json.dumps(payload) + "\n")
    print(f"[c] {status}: {reason}", file=sys.stderr, flush=True)


def main():
    if not PARQUET.exists():
        write_status("BLOCKED", f"Polymarket parquet not found: {PARQUET}")
        return

    df = pd.read_parquet(PARQUET)
    df_econ = df[df["category"] == "econ"].copy()
    df_crypto = df[df["category"] == "crypto"].copy()

    market_index: list[dict] = []
    series_log: dict[str, dict] = {}

    for series in ECON_SERIES + CRYPTO_SERIES:
        print(f"[c] series {series}...", file=sys.stderr, flush=True)
        events = fetch_events_capped(series, status=None)
        series_log[series] = {"events": len(events), "markets": 0}
        if not events:
            continue
        topic = SERIES_TO_TOPIC[series]
        for ev in events:
            event_ticker = ev.get("event_ticker") or ev.get("ticker")
            if not event_ticker:
                continue
            markets = fetch_markets_for_event(event_ticker)
            time.sleep(0.2)
            for m in markets:
                close_time = parse_date(m.get("close_time")) or parse_date(ev.get("strike_date"))
                if (m.get("status") or "").lower() not in {"settled", "finalized", "closed"}:
                    continue
                market_index.append({
                    "topic": topic,
                    "series_ticker": series,
                    "event_ticker": event_ticker,
                    "ticker": m.get("ticker"),
                    "title": m.get("title") or ev.get("title"),
                    "subtitle": m.get("subtitle"),
                    "yes_sub_title": m.get("yes_sub_title"),
                    "close_time": close_time,
                    "status": m.get("status"),
                    "yes_bid_dollars": m.get("yes_bid_dollars"),
                    "yes_ask_dollars": m.get("yes_ask_dollars"),
                    "volume_fp": m.get("volume_fp"),
                })
                series_log[series]["markets"] += 1
        print(f"[c]   {series}: {len(events)} events, {series_log[series]['markets']} markets indexed",
              file=sys.stderr, flush=True)

    print(f"[c] total kalshi market index: {len(market_index)}", file=sys.stderr, flush=True)

    if not market_index:
        write_status("BLOCKED",
                     "Kalshi public endpoint reachable but probed series tickers returned no settled markets",
                     extra={"series_log": series_log})
        return

    # Pair each Polymarket row to closest-by-date Kalshi market in the same topic.
    pairs = []
    for _, row in pd.concat([df_econ, df_crypto]).iterrows():
        p_topic = topic_for_question(row["question"])
        if p_topic is None:
            continue
        p_end = parse_date(row["end_date"])
        if p_end is None:
            continue
        max_offset = 14 if row["category"] == "econ" else 3
        candidates = []
        for k in market_index:
            if k["topic"] != p_topic:
                continue
            if k["close_time"] is None:
                continue
            delta = abs((k["close_time"] - p_end).days)
            if delta > max_offset:
                continue
            candidates.append((delta, k))
        if not candidates:
            continue
        candidates.sort(key=lambda x: x[0])
        best = candidates[0][1]
        pairs.append({
            "polymarket_condition_id": row["condition_id"],
            "polymarket_question": row["question"],
            "polymarket_end_date": str(row["end_date"]),
            "polymarket_entry_yes_price_3d": float(row.get("entry_yes_price_3d", float("nan"))),
            "polymarket_volume_num": float(row.get("volume_num", 0.0)),
            "kalshi_ticker": best["ticker"],
            "kalshi_event_ticker": best["event_ticker"],
            "kalshi_series_ticker": best["series_ticker"],
            "kalshi_title": best["title"],
            "kalshi_yes_sub_title": best.get("yes_sub_title"),
            "kalshi_close_time": best["close_time"].isoformat() if best["close_time"] else None,
            "kalshi_status": best.get("status"),
            "kalshi_yes_bid_dollars": best.get("yes_bid_dollars"),
            "kalshi_yes_ask_dollars": best.get("yes_ask_dollars"),
            "kalshi_volume_fp": best.get("volume_fp"),
            "match_topic": p_topic,
            "match_day_offset": candidates[0][0],
            "category": str(row["category"]),
        })

    print(f"[c] paired count: {len(pairs)}", file=sys.stderr, flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as f:
        if pairs:
            for p in pairs:
                f.write(json.dumps(p, default=str) + "\n")
        else:
            f.write(json.dumps({
                "status": "PARTIAL",
                "reason": "Kalshi index built but no Polymarket→Kalshi matches within day-offset tolerance",
                "kalshi_market_index": len(market_index),
                "polymarket_econ_n": int(len(df_econ)),
                "polymarket_crypto_n": int(len(df_crypto)),
                "series_log": series_log,
            }) + "\n")
    print(f"[c] wrote {OUT}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
