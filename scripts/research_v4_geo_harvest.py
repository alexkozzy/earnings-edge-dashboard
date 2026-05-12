#!/usr/bin/env python3
"""
v4 Cycle 1 — orchestrator pre-fetch of geopolitics markets + CLOB price-history.
Watchdog-resistant. Combines with existing earnings + econ unified parquet.

Outputs:
- data/research/v4/cycle_1/geopolitics_markets.jsonl
- data/research/v4/cycle_1/clob_history/<condition_id>.json
- data/research/v4/cycle_1/all_markets_v4.parquet (earnings + econ + geopolitics
  with liquidity_tier column added)
"""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "research"
V4 = DATA / "v4" / "cycle_1"
GEO_DIR = V4 / "geopolitics_clob"
V4.mkdir(parents=True, exist_ok=True)
GEO_DIR.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "earnings-edge-research/1.0"}
GEO_TAGS = [
    "politics", "elections", "world", "russia-ukraine", "china",
    "israel", "iran", "geopolitics", "war", "ukraine",
    "us-elections", "international-affairs", "north-korea", "trump",
    "biden", "putin",
]

THREADS = 6
SLEEP_PER_THREAD = 0.5


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def harvest_geo_markets():
    """Page through gamma-api per geo tag; dedup by condition_id."""
    seen = {}
    for tag in GEO_TAGS:
        print(f"[geo] tag={tag} fetching …", flush=True)
        for offset in range(0, 5000, 200):
            try:
                events = get(f"https://gamma-api.polymarket.com/events?tag_slug={tag}&closed=true&limit=200&offset={offset}")
            except Exception as e:
                print(f"[geo]  err tag={tag} offset={offset}: {e}", flush=True)
                break
            if not events:
                break
            for ev in events:
                for m in ev.get("markets", []):
                    cid = m.get("conditionId")
                    if not cid: continue
                    if cid in seen:
                        seen[cid]["tags_matched"].append(tag)
                        continue
                    # Filter binary, has clob token ids, has resolution
                    outcomes = m.get("outcomes")
                    if not outcomes: continue
                    try:
                        if len(json.loads(outcomes)) != 2: continue
                    except Exception:
                        continue
                    if not m.get("clobTokenIds"): continue
                    op = m.get("outcomePrices")
                    if not op: continue
                    try:
                        opl = json.loads(op)
                        if str(opl[0]) not in ("0", "1"): continue
                    except Exception:
                        continue
                    seen[cid] = {
                        "condition_id": cid,
                        "tags_matched": [tag],
                        "question": m.get("question"),
                        "end_date": m.get("endDate") or ev.get("endDate"),
                        "ticker_or_event": m.get("slug") or ev.get("slug"),
                        "clob_token_ids_raw": m.get("clobTokenIds"),
                        "outcomes_raw": outcomes,
                        "outcome_prices_raw": op,
                        "volumeNum": m.get("volumeNum"),
                        "liquidityNum": m.get("liquidityNum"),
                        "slug": m.get("slug"),
                        "start_date_iso": m.get("startDate"),
                        "end_date_iso": m.get("endDate") or ev.get("endDate"),
                    }
            if len(events) < 200:
                break
        time.sleep(0.4)
    print(f"[geo] unique markets after dedup: {len(seen)}", flush=True)
    out = V4 / "geopolitics_markets.jsonl"
    with open(out, "w") as f:
        for r in seen.values():
            f.write(json.dumps(r) + "\n")
    print(f"[geo] wrote {out}", flush=True)
    return list(seen.values())


def fetch_clob_one(yes_token, condition_id):
    out = GEO_DIR / f"{condition_id}.json"
    if out.exists():
        return ("skipped", condition_id)
    url = f"https://clob.polymarket.com/prices-history?market={yes_token}&interval=max&fidelity=720"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        with open(out, "w") as f:
            json.dump(data, f)
        time.sleep(SLEEP_PER_THREAD)
        return ("ok", condition_id)
    except Exception as e:
        time.sleep(SLEEP_PER_THREAD)
        return ("err", f"{condition_id} :: {str(e)[:80]}")


def fetch_all_clob(markets, max_n=2000):
    """Sample top markets by volume; cap to avoid runaway."""
    valid = [m for m in markets if m.get("clob_token_ids_raw")]
    valid.sort(key=lambda m: float(m.get("volumeNum") or 0), reverse=True)
    sampled = valid[:max_n]
    print(f"[geo-clob] fetching {len(sampled)} CLOB histories with {THREADS} threads …", flush=True)
    t0 = time.time()
    ok = err = skipped = 0
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futures = {
            ex.submit(fetch_clob_one, json.loads(m["clob_token_ids_raw"])[0], m["condition_id"]): m["condition_id"]
            for m in sampled
        }
        for i, fut in enumerate(as_completed(futures), 1):
            status, _ = fut.result()
            if status == "ok": ok += 1
            elif status == "skipped": skipped += 1
            else: err += 1
            if i % 100 == 0:
                print(f"[geo-clob] progress {i}/{len(futures)} ok={ok} skip={skipped} err={err} ({time.time()-t0:.0f}s)", flush=True)
    print(f"[geo-clob] DONE ok={ok} skipped={skipped} err={err} in {time.time()-t0:.0f}s", flush=True)
    return sampled


def parse_history_to_entry(condition_id, end_date_iso):
    path = GEO_DIR / f"{condition_id}.json"
    if not path.exists():
        return None
    try:
        h = json.load(open(path))
        pts = h.get("history", []) if isinstance(h, dict) else h
    except Exception:
        return None
    if not pts:
        return None
    end_ts = datetime.fromisoformat(end_date_iso.replace("Z", "+00:00")).timestamp()

    def last_at_or_before(target_ts):
        cands = [p for p in pts if p["t"] <= target_ts]
        if not cands: return None
        return max(cands, key=lambda p: p["t"])["p"]

    return {
        "entry_yes_price_3d": last_at_or_before(end_ts - 3 * 86400),
        "entry_yes_price_7d": last_at_or_before(end_ts - 7 * 86400),
        "entry_yes_price_1d": last_at_or_before(end_ts - 86400),
        "entry_yes_price_late": last_at_or_before(end_ts - 4 * 3600),
        "n_history_points": len(pts),
        "trading_window_days": (pts[-1]["t"] - pts[0]["t"]) / 86400 if len(pts) >= 2 else 0,
    }


def build_unified():
    """Combine prior all_markets_resolved.parquet + new geopolitics rows.
    Add liquidity_tier column."""
    base = pd.read_parquet(DATA / "all_markets_resolved.parquet")
    base["entry_yes_price_7d"] = None  # not present in prior parquet; set null
    base["liquidity_tier"] = pd.cut(
        base["volume_num"].astype(float).fillna(0),
        bins=[-1, 5000, 15000, 50000, float("inf")],
        labels=["<5K", "5-15K", "15-50K", ">50K"],
    ).astype(str)

    geo_rows = []
    geo_path = V4 / "geopolitics_markets.jsonl"
    for line in open(geo_path):
        m = json.loads(line)
        if not m.get("end_date_iso"):
            continue  # skip markets with missing resolution date
        entry = parse_history_to_entry(m["condition_id"], m["end_date_iso"])
        if entry is None or entry["entry_yes_price_3d"] is None:
            continue
        op = json.loads(m["outcome_prices_raw"])
        outcome_yes = 1 if str(op[0]) == "1" else 0
        v = float(m.get("volumeNum") or 0)
        geo_rows.append({
            "condition_id": m["condition_id"],
            "category": "geopolitics",
            "question": m["question"],
            "ticker_or_event": m.get("ticker_or_event"),
            "end_date": m["end_date_iso"],
            "outcome_yes_won": outcome_yes,
            "entry_yes_price_3d": float(entry["entry_yes_price_3d"]),
            "entry_yes_price_7d": float(entry["entry_yes_price_7d"]) if entry["entry_yes_price_7d"] is not None else None,
            "entry_yes_price_1d": float(entry["entry_yes_price_1d"]) if entry["entry_yes_price_1d"] is not None else None,
            "entry_yes_price_late": float(entry["entry_yes_price_late"]) if entry["entry_yes_price_late"] is not None else None,
            "volume_num": v,
            "trading_window_days": entry["trading_window_days"],
            "n_history_points": entry["n_history_points"],
            "volume_bucket": "low" if v < 50000 else "mid" if v < 200000 else "high",
            "liquidity_tier": "<5K" if v < 5000 else "5-15K" if v < 15000 else "15-50K" if v < 50000 else ">50K",
        })

    geo_df = pd.DataFrame(geo_rows)
    if len(geo_df) > 0:
        geo_df["end_date"] = pd.to_datetime(geo_df["end_date"], utc=True)
    base["end_date"] = pd.to_datetime(base["end_date"], utc=True)

    df = pd.concat([base, geo_df], ignore_index=True)
    df = df.sort_values("end_date").reset_index(drop=True)
    out = V4 / "all_markets_v4.parquet"
    df.to_parquet(out, index=False)
    df.to_csv(V4 / "all_markets_v4.csv", index=False)
    print(f"[unified] wrote {out} with {len(df)} rows", flush=True)
    print(df[["category", "liquidity_tier"]].value_counts().sort_index().to_string(), flush=True)


def main():
    markets = harvest_geo_markets()
    fetch_all_clob(markets)
    build_unified()


if __name__ == "__main__":
    main()
