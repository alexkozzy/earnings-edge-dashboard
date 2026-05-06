#!/usr/bin/env python3
"""Step A4: build unified all_markets_resolved.parquet.

Combines:
  - Earnings (from prior session's earnings_markets_with_entry.jsonl + flat clob_history/)
  - Econ (from econ_filtered.jsonl + clob_history/econ/)
  - Crypto (from crypto.jsonl + clob_history/crypto/)

Computes entry prices at T-3d, T-1d, T-late (4h before resolution).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DR = ROOT / "data" / "research"


def load_history(cid: str, category: str) -> list[tuple[float, float]]:
    """Returns sorted list of (unix_seconds, price) tuples or []."""
    if category == "earnings":
        path = DR / "clob_history" / f"{cid}.json"
    else:
        path = DR / "clob_history" / category / f"{cid}.json"
    if not path.exists():
        return []
    try:
        data = json.load(open(path))
    except Exception:
        return []
    hist = data.get("history") or []
    pts = []
    for p in hist:
        t = p.get("t")
        v = p.get("p")
        if t is not None and v is not None:
            pts.append((float(t), float(v)))
    pts.sort()
    return pts


def price_at_or_before(pts, target_ts):
    last = None
    for t, p in pts:
        if t <= target_ts:
            last = p
        else:
            break
    return last


def price_window_late(pts, end_ts, hours_before=4):
    """Last price at >=hours_before before end."""
    cutoff = end_ts - hours_before * 3600
    return price_at_or_before(pts, cutoff)


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def volume_bucket(vol):
    if vol is None or pd.isna(vol):
        return "unknown"
    if vol < 50000:
        return "low"
    if vol < 200000:
        return "mid"
    return "high"


def build_earnings_rows():
    """Use prior session's earnings_markets_with_entry.jsonl + recompute entry_yes_price_late."""
    rows = []
    src = DR / "earnings_markets_with_entry.jsonl"
    if not src.exists():
        return rows
    for line in open(src):
        r = json.loads(line)
        cid = r["condition_id"]
        end = parse_iso(r["end_date"])
        if end is None:
            continue
        end_ts = end.timestamp()
        pts = load_history(cid, "earnings")
        late = price_window_late(pts, end_ts) if pts else None
        rows.append({
            "condition_id": cid,
            "category": "earnings",
            "question": None,  # not in prior session jsonl (we have ticker)
            "ticker_or_event": r.get("ticker"),
            "end_date": end,
            "outcome_yes_won": int(r.get("outcome_beat") or 0),
            "entry_yes_price_3d": r.get("entry_yes_price_3d"),
            "entry_yes_price_1d": r.get("entry_yes_price_1d"),
            "entry_yes_price_late": late,
            "volume_num": None,  # earnings rows don't have it; could re-add later
            "trading_window_days": r.get("trading_window_days"),
            "n_history_points": r.get("n_history_points") or len(pts),
            "volume_bucket": "unknown",
        })
    return rows


def build_category_rows(jsonl_path: Path, category: str):
    rows = []
    if not jsonl_path.exists():
        return rows
    for line in open(jsonl_path):
        r = json.loads(line)
        cid = r["condition_id"]
        end = parse_iso(r.get("end_date_iso") or r.get("end_date"))
        if end is None:
            continue
        end_ts = end.timestamp()
        try:
            prices = json.loads(r["_outcome_prices_raw"])
        except Exception:
            continue
        if not (isinstance(prices, list) and len(prices) == 2):
            continue
        outcome_yes_won = 1 if str(prices[0]).startswith("1") else 0
        pts = load_history(cid, category)
        if not pts:
            # Skip — no CLOB history
            continue
        # Determine trading window
        start_ts = pts[0][0]
        twd = (end_ts - start_ts) / 86400.0
        e3 = price_at_or_before(pts, end_ts - 3 * 86400)
        e1 = price_at_or_before(pts, end_ts - 1 * 86400)
        elate = price_window_late(pts, end_ts)
        vol = r.get("volumeNum")
        rows.append({
            "condition_id": cid,
            "category": category,
            "question": r.get("question"),
            "ticker_or_event": r.get("ticker_or_event") or r.get("slug"),
            "end_date": end,
            "outcome_yes_won": outcome_yes_won,
            "entry_yes_price_3d": e3,
            "entry_yes_price_1d": e1,
            "entry_yes_price_late": elate,
            "volume_num": vol,
            "trading_window_days": twd,
            "n_history_points": len(pts),
            "volume_bucket": volume_bucket(vol),
        })
    return rows


def main():
    print("=== Building unified parquet ===", file=sys.stderr)
    earnings = build_earnings_rows()
    print(f"earnings rows: {len(earnings)}", file=sys.stderr)
    econ = build_category_rows(DR / "gamma_markets" / "econ_filtered.jsonl", "econ")
    print(f"econ rows: {len(econ)}", file=sys.stderr)
    crypto = build_category_rows(DR / "gamma_markets" / "crypto.jsonl", "crypto")
    print(f"crypto rows: {len(crypto)}", file=sys.stderr)

    df = pd.DataFrame(earnings + econ + crypto)
    if df.empty:
        print("ERROR: no rows produced", file=sys.stderr)
        sys.exit(1)
    # Coerce dtypes
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True, errors="coerce")
    out_pq = DR / "all_markets_resolved.parquet"
    out_csv = DR / "all_markets_resolved.csv"
    df.to_parquet(out_pq, index=False)
    df.to_csv(out_csv, index=False)
    print(f"Wrote {out_pq} ({df.shape[0]} rows)", file=sys.stderr)
    print(df["category"].value_counts(), file=sys.stderr)
    print("outcome_yes_won counts:", df["outcome_yes_won"].value_counts().to_dict(), file=sys.stderr)


if __name__ == "__main__":
    main()
