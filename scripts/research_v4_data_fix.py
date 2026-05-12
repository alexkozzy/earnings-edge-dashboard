#!/usr/bin/env python3
"""
v4 cycle 1 — data gap fix.

Three issues from initial harvest:
1. Earnings markets all show volume_num=0 (v1 raw scrape didn't preserve gamma volumeNum)
2. Econ markets all >50K (v1 econ harvest sampled top-by-volume; need low-vol too)
3. Geo CLOB only top-2000-by-volume; need low-volume sample for <5K/5-15K tiers

Fix:
- Re-scrape earnings via gamma-api with volumeNum
- Stratified-sample 1500 econ markets across volume tiers; fetch CLOB
- Stratified-sample 1500 additional geo markets across <50K tiers; fetch CLOB
- Rebuild unified parquet with correct liquidity_tier
- Also dedup econ <-> geopolitics overlapping markets

Watchdog-resistant. Prints progress every 50 fetches.
"""
import json, time, urllib.request, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "research"
V4 = DATA / "v4" / "cycle_1"
V4.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "earnings-edge-research/1.0"}
THREADS = 6
SLEEP = 0.5


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


# ----- 1. Re-scrape earnings with volumeNum -----
def re_scrape_earnings():
    """Get earnings tag markets WITH volumeNum, dedup against existing condition_ids."""
    print("[fix-earnings] re-scraping earnings tag with volumeNum …", flush=True)
    seen = {}
    for offset in range(0, 5000, 200):
        try:
            events = get(f"https://gamma-api.polymarket.com/events?tag_slug=earnings&closed=true&limit=200&offset={offset}")
        except Exception as e:
            print(f"[fix-earnings] err offset={offset}: {e}", flush=True)
            break
        if not events: break
        for ev in events:
            for m in ev.get("markets", []):
                cid = m.get("conditionId")
                if not cid or cid in seen: continue
                seen[cid] = {
                    "condition_id": cid,
                    "volumeNum": m.get("volumeNum"),
                    "liquidityNum": m.get("liquidityNum"),
                }
        if len(events) < 200: break
    print(f"[fix-earnings] re-scraped {len(seen)} earnings with volume", flush=True)
    out = V4 / "earnings_volume_fix.json"
    out.write_text(json.dumps(seen, indent=2))
    return seen


# ----- 2. Stratified sample econ/geo for low-volume tiers -----
ECON_TAGS = ["fed", "inflation", "cpi", "jobs", "fomc", "economy", "gdp", "interest-rates"]


def get_low_vol_econ():
    """Fetch econ markets, keep ALL not just top-by-volume."""
    print("[fix-econ] re-scraping econ tags (no top-N filter) …", flush=True)
    seen = {}
    for tag in ECON_TAGS:
        for offset in range(0, 5000, 200):
            try:
                events = get(f"https://gamma-api.polymarket.com/events?tag_slug={tag}&closed=true&limit=200&offset={offset}")
            except Exception as e:
                break
            if not events: break
            for ev in events:
                for m in ev.get("markets", []):
                    cid = m.get("conditionId")
                    if not cid or cid in seen: continue
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
                    end = m.get("endDate") or ev.get("endDate")
                    if not end: continue
                    seen[cid] = {
                        "condition_id": cid,
                        "tags_matched": [tag],
                        "question": m.get("question"),
                        "end_date_iso": end,
                        "ticker_or_event": m.get("slug"),
                        "clob_token_ids_raw": m.get("clobTokenIds"),
                        "outcomes_raw": outcomes,
                        "outcome_prices_raw": op,
                        "volumeNum": m.get("volumeNum"),
                        "liquidityNum": m.get("liquidityNum"),
                    }
            if len(events) < 200: break
        time.sleep(0.3)
    print(f"[fix-econ] full econ universe: {len(seen)}", flush=True)
    out_path = V4 / "econ_full.jsonl"
    with open(out_path, "w") as f:
        for r in seen.values():
            f.write(json.dumps(r) + "\n")
    return list(seen.values())


def stratified_sample(rows, per_tier=600):
    """Sample per_tier markets per liquidity tier."""
    by_tier = {"<5K": [], "5-15K": [], "15-50K": [], ">50K": []}
    for r in rows:
        v = float(r.get("volumeNum") or 0)
        if v < 5000: by_tier["<5K"].append(r)
        elif v < 15000: by_tier["5-15K"].append(r)
        elif v < 50000: by_tier["15-50K"].append(r)
        else: by_tier[">50K"].append(r)
    print(f"  tier counts: " + ", ".join(f"{k}={len(v)}" for k, v in by_tier.items()), flush=True)
    sample = []
    import random
    random.seed(42)
    for tier, lst in by_tier.items():
        if tier == ">50K":
            sample.extend(lst[:per_tier // 2])  # half budget for >50K
        else:
            random.shuffle(lst)
            sample.extend(lst[:per_tier])
    return sample


# ----- 3. CLOB fetcher (shared) -----
def fetch_clob(yes_token, condition_id, out_dir):
    out = out_dir / f"{condition_id}.json"
    if out.exists() and out.stat().st_size > 50:
        return ("skipped", condition_id)
    url = f"https://clob.polymarket.com/prices-history?market={yes_token}&interval=max&fidelity=720"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        with open(out, "w") as f:
            json.dump(data, f)
        time.sleep(SLEEP)
        return ("ok", condition_id)
    except Exception as e:
        time.sleep(SLEEP)
        return ("err", f"{condition_id} :: {str(e)[:60]}")


def fetch_all(rows, out_dir, label):
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[{label}] fetching {len(rows)} CLOB histories …", flush=True)
    t0 = time.time()
    ok = err = skip = 0
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futures = {
            ex.submit(fetch_clob, json.loads(m["clob_token_ids_raw"])[0], m["condition_id"], out_dir): m["condition_id"]
            for m in rows
        }
        for i, fut in enumerate(as_completed(futures), 1):
            status, _ = fut.result()
            if status == "ok": ok += 1
            elif status == "skipped": skip += 1
            else: err += 1
            if i % 50 == 0:
                print(f"[{label}] {i}/{len(futures)} ok={ok} skip={skip} err={err} ({time.time()-t0:.0f}s)", flush=True)
    print(f"[{label}] DONE ok={ok} skip={skip} err={err} in {time.time()-t0:.0f}s", flush=True)


# ----- 4. Get low-vol geo (rest of the 35K) -----
def get_low_vol_geo_sample():
    """Read existing geopolitics_markets.jsonl, stratified sample low-vol tiers."""
    print("[fix-geo] reading existing 35K geo markets, stratified-sampling low-vol …", flush=True)
    rows = []
    with open(V4 / "geopolitics_markets.jsonl") as f:
        for line in f:
            r = json.loads(line)
            if not r.get("end_date_iso"): continue
            if not r.get("clob_token_ids_raw"): continue
            if not r.get("outcome_prices_raw"): continue
            try:
                op = json.loads(r["outcome_prices_raw"])
                if str(op[0]) not in ("0", "1"): continue
            except Exception:
                continue
            rows.append(r)
    print(f"[fix-geo] valid geo: {len(rows)}", flush=True)
    return stratified_sample(rows, per_tier=500)


# ----- 5. Rebuild unified parquet -----
def parse_history_to_entry(condition_id, end_date_iso, sub_dir):
    p = sub_dir / f"{condition_id}.json"
    if not p.exists(): return None
    try:
        h = json.load(open(p))
        pts = h.get("history", []) if isinstance(h, dict) else h
    except Exception:
        return None
    if not pts: return None
    end_ts = datetime.fromisoformat(end_date_iso.replace("Z", "+00:00")).timestamp()

    def lab(target):
        cands = [p for p in pts if p["t"] <= target]
        if not cands: return None
        return max(cands, key=lambda p: p["t"])["p"]

    return {
        "entry_yes_price_3d": lab(end_ts - 3*86400),
        "entry_yes_price_7d": lab(end_ts - 7*86400),
        "entry_yes_price_1d": lab(end_ts - 86400),
        "entry_yes_price_late": lab(end_ts - 4*3600),
        "n_history_points": len(pts),
        "trading_window_days": (pts[-1]["t"] - pts[0]["t"]) / 86400 if len(pts) >= 2 else 0,
    }


def rebuild_unified(earnings_vol_fix):
    """Build the final unified parquet from corrected sources, dedupe across categories."""
    base = pd.read_parquet(DATA / "all_markets_resolved.parquet")
    # Apply earnings volume fix
    fix_map = {cid: float(d.get("volumeNum") or 0) for cid, d in earnings_vol_fix.items()}
    mask = base.category == "earnings"
    base.loc[mask, "volume_num"] = base.loc[mask, "condition_id"].map(fix_map).fillna(base.loc[mask, "volume_num"])

    rows = []
    # Earnings + crypto from base (use existing)
    for _, r in base.iterrows():
        v = float(r["volume_num"] or 0)
        rows.append({
            "condition_id": r["condition_id"],
            "category": r["category"],
            "question": r["question"],
            "ticker_or_event": r["ticker_or_event"],
            "end_date": r["end_date"],
            "outcome_yes_won": int(r["outcome_yes_won"]),
            "entry_yes_price_3d": r["entry_yes_price_3d"],
            "entry_yes_price_7d": None,
            "entry_yes_price_1d": r["entry_yes_price_1d"],
            "entry_yes_price_late": r["entry_yes_price_late"],
            "volume_num": v,
            "trading_window_days": r["trading_window_days"],
            "n_history_points": r["n_history_points"],
            "liquidity_tier": "<5K" if v < 5000 else "5-15K" if v < 15000 else "15-50K" if v < 50000 else ">50K",
        })

    # Add econ rebuild from new fetch
    econ_dir = V4 / "econ_full_clob"
    econ_full = list((open(V4 / "econ_full.jsonl") if (V4 / "econ_full.jsonl").exists() else []))
    econ_rows = [json.loads(l) for l in econ_full if l.strip()]
    print(f"[unified] econ_full rows available: {len(econ_rows)}", flush=True)
    seen_cids = set(r["condition_id"] for r in rows)
    for m in econ_rows:
        if m["condition_id"] in seen_cids: continue
        e = parse_history_to_entry(m["condition_id"], m["end_date_iso"], econ_dir)
        if not e or e["entry_yes_price_3d"] is None: continue
        op = json.loads(m["outcome_prices_raw"])
        v = float(m.get("volumeNum") or 0)
        rows.append({
            "condition_id": m["condition_id"],
            "category": "econ",
            "question": m["question"],
            "ticker_or_event": m.get("ticker_or_event"),
            "end_date": pd.to_datetime(m["end_date_iso"], utc=True),
            "outcome_yes_won": 1 if str(op[0]) == "1" else 0,
            "entry_yes_price_3d": float(e["entry_yes_price_3d"]),
            "entry_yes_price_7d": float(e["entry_yes_price_7d"]) if e["entry_yes_price_7d"] is not None else None,
            "entry_yes_price_1d": float(e["entry_yes_price_1d"]) if e["entry_yes_price_1d"] is not None else None,
            "entry_yes_price_late": float(e["entry_yes_price_late"]) if e["entry_yes_price_late"] is not None else None,
            "volume_num": v,
            "trading_window_days": e["trading_window_days"],
            "n_history_points": e["n_history_points"],
            "liquidity_tier": "<5K" if v < 5000 else "5-15K" if v < 15000 else "15-50K" if v < 50000 else ">50K",
        })
        seen_cids.add(m["condition_id"])

    # Add geopolitics (low-vol stratified + existing top-2000)
    geo_dirs = [V4 / "geopolitics_clob", V4 / "geopolitics_lowvol_clob"]
    geo_rows_raw = []
    with open(V4 / "geopolitics_markets.jsonl") as f:
        for line in f:
            r = json.loads(line)
            if not r.get("end_date_iso"): continue
            geo_rows_raw.append(r)
    for m in geo_rows_raw:
        if m["condition_id"] in seen_cids: continue
        e = None
        for d in geo_dirs:
            e = parse_history_to_entry(m["condition_id"], m["end_date_iso"], d)
            if e: break
        if not e or e["entry_yes_price_3d"] is None: continue
        op = json.loads(m["outcome_prices_raw"])
        v = float(m.get("volumeNum") or 0)
        rows.append({
            "condition_id": m["condition_id"],
            "category": "geopolitics",
            "question": m["question"],
            "ticker_or_event": m.get("ticker_or_event"),
            "end_date": pd.to_datetime(m["end_date_iso"], utc=True),
            "outcome_yes_won": 1 if str(op[0]) == "1" else 0,
            "entry_yes_price_3d": float(e["entry_yes_price_3d"]),
            "entry_yes_price_7d": float(e["entry_yes_price_7d"]) if e["entry_yes_price_7d"] is not None else None,
            "entry_yes_price_1d": float(e["entry_yes_price_1d"]) if e["entry_yes_price_1d"] is not None else None,
            "entry_yes_price_late": float(e["entry_yes_price_late"]) if e["entry_yes_price_late"] is not None else None,
            "volume_num": v,
            "trading_window_days": e["trading_window_days"],
            "n_history_points": e["n_history_points"],
            "liquidity_tier": "<5K" if v < 5000 else "5-15K" if v < 15000 else "15-50K" if v < 50000 else ">50K",
        })
        seen_cids.add(m["condition_id"])

    df = pd.DataFrame(rows)
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True)
    df = df.sort_values("end_date").reset_index(drop=True)
    df.to_parquet(V4 / "all_markets_v4.parquet", index=False)
    df.to_csv(V4 / "all_markets_v4.csv", index=False)
    print(f"[unified] FINAL: {len(df)} rows", flush=True)
    print(pd.crosstab(df.category, df.liquidity_tier).to_string(), flush=True)
    return df


def main():
    # Step 1: re-scrape earnings volume
    earn_vol = re_scrape_earnings()
    # Step 2: full econ scrape + stratified sample
    if not (V4 / "econ_full.jsonl").exists():
        econ_all = get_low_vol_econ()
    else:
        econ_all = []
        with open(V4 / "econ_full.jsonl") as f:
            for l in f:
                if l.strip(): econ_all.append(json.loads(l))
        print(f"[fix-econ] using cached econ_full: {len(econ_all)}", flush=True)
    econ_sample = stratified_sample(econ_all, per_tier=500)
    print(f"[fix-econ] sampled {len(econ_sample)} for CLOB fetch", flush=True)
    fetch_all(econ_sample, V4 / "econ_full_clob", "econ-clob")
    # Step 3: stratified geo low-vol sample
    geo_sample = get_low_vol_geo_sample()
    print(f"[fix-geo] sampled {len(geo_sample)} for CLOB fetch", flush=True)
    fetch_all(geo_sample, V4 / "geopolitics_lowvol_clob", "geo-lowvol-clob")
    # Step 4: rebuild unified
    rebuild_unified(earn_vol)


if __name__ == "__main__":
    main()
