#!/usr/bin/env python3
"""
Finish Agent A's harvest: normalize schemas, sample markets, fetch CLOB history,
build unified parquet. Watchdog-resistant (prints progress every 50 markets).

Run from repo root.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "research"
GAMMA = DATA / "gamma_markets"
HIST = DATA / "clob_history"

ECON_SAMPLE_N = 800
CRYPTO_SAMPLE_N = 800
THREADS = 6
SLEEP_PER_THREAD = 0.6  # → effective rate ~10 calls/sec across 6 threads

UA = {"User-Agent": "earnings-edge-research/1.0"}


def load_jsonl(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def normalize(row):
    """Fix the underscore-prefix inconsistency and clob_token_ids dual-storage."""
    # Resolve outcome prices
    op_raw = row.get("_outcome_prices_raw") or row.get("outcome_prices_raw")
    # Resolve clob token ids
    ct_raw = row.get("_clob_token_ids_raw") or row.get("clob_token_ids_raw")
    # Resolve outcomes
    o_raw = row.get("_outcomes_raw") or row.get("outcomes_raw")
    return {
        "condition_id": row.get("condition_id"),
        "tags_matched": row.get("tags_matched", []),
        "question": row.get("question"),
        "end_date": row.get("end_date"),
        "ticker_or_event": row.get("ticker_or_event"),
        "clob_token_ids_raw": ct_raw,
        "outcomes_raw": o_raw,
        "outcome_prices_raw": op_raw,
        "volumeNum": row.get("volumeNum"),
        "liquidityNum": row.get("liquidityNum"),
        "slug": row.get("slug"),
        "start_date_iso": row.get("start_date_iso"),
        "end_date_iso": row.get("end_date_iso"),
    }


def is_valid_resolved(row):
    """Has clob token ids, has resolution outcome (not 0.5/0.5)."""
    if not row["clob_token_ids_raw"]:
        return False
    if not row["outcome_prices_raw"]:
        return False
    try:
        op = json.loads(row["outcome_prices_raw"])
        if len(op) != 2:
            return False
        # Drop unresolved (still trading at non-binary final price)
        if op[0] not in ("0", "1") and op[0] not in (0, 1):
            return False
    except Exception:
        return False
    return True


def parse_yes_token(row):
    return json.loads(row["clob_token_ids_raw"])[0]


def fetch_clob(yes_token, condition_id, category):
    out_path = HIST / category / f"{condition_id}.json"
    if out_path.exists():
        return ("skipped", condition_id)
    url = f"https://clob.polymarket.com/prices-history?market={yes_token}&interval=max&fidelity=720"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        with open(out_path, "w") as f:
            json.dump(data, f)
        time.sleep(SLEEP_PER_THREAD)
        return ("ok", condition_id)
    except Exception as e:
        time.sleep(SLEEP_PER_THREAD)
        return ("err", f"{condition_id} :: {e}")


def harvest_category(category):
    src = GAMMA / f"{category}.jsonl"
    print(f"[{category}] loading {src} …", flush=True)
    rows = [normalize(r) for r in load_jsonl(src)]
    print(f"[{category}] loaded {len(rows)} raw rows", flush=True)

    # Dedup by condition_id (some markets in econ are tagged twice)
    seen = {}
    for r in rows:
        cid = r["condition_id"]
        if cid and cid not in seen:
            seen[cid] = r
    rows = list(seen.values())
    print(f"[{category}] after dedup: {len(rows)}", flush=True)

    # Filter to fully-resolved + valid
    valid = [r for r in rows if is_valid_resolved(r)]
    print(f"[{category}] valid resolved: {len(valid)}", flush=True)

    # Sample
    if category == "econ":
        target_n = ECON_SAMPLE_N
    elif category == "crypto":
        target_n = CRYPTO_SAMPLE_N
    else:
        target_n = len(valid)

    valid.sort(key=lambda r: float(r.get("volumeNum") or 0), reverse=True)
    sampled = valid[:target_n]
    print(f"[{category}] sampled top {len(sampled)} by volume", flush=True)

    # Save normalized + sampled
    sampled_path = GAMMA / f"{category}_sampled.jsonl"
    with open(sampled_path, "w") as f:
        for r in sampled:
            f.write(json.dumps(r) + "\n")
    print(f"[{category}] wrote {sampled_path}", flush=True)

    # Fetch CLOB history (parallel)
    (HIST / category).mkdir(parents=True, exist_ok=True)
    print(f"[{category}] fetching CLOB history with {THREADS} threads …", flush=True)
    t0 = time.time()
    ok = err = skipped = 0
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futures = {
            ex.submit(fetch_clob, parse_yes_token(r), r["condition_id"], category): r["condition_id"]
            for r in sampled
        }
        for i, fut in enumerate(as_completed(futures), 1):
            status, _ = fut.result()
            if status == "ok":
                ok += 1
            elif status == "skipped":
                skipped += 1
            else:
                err += 1
            if i % 50 == 0:
                elapsed = time.time() - t0
                print(f"[{category}] progress {i}/{len(futures)} ok={ok} skip={skipped} err={err} ({elapsed:.0f}s)", flush=True)
    print(f"[{category}] CLOB done: ok={ok} skipped={skipped} err={err} in {time.time()-t0:.0f}s", flush=True)
    return sampled, {"ok": ok, "skipped": skipped, "err": err}


def parse_history_to_entry(condition_id, category, end_date_iso):
    """For a given market, find Yes-prices at T-3d, T-1d, T-late."""
    path = HIST / category / f"{condition_id}.json"
    if not path.exists():
        return None
    try:
        h = json.load(open(path))
        pts = h.get("history", []) if isinstance(h, dict) else h
    except Exception:
        return None
    if not pts:
        return None

    # end_date_iso → unix
    end_dt = datetime.fromisoformat(end_date_iso.replace("Z", "+00:00"))
    end_ts = end_dt.timestamp()

    def last_at_or_before(target_ts):
        candidates = [p for p in pts if p["t"] <= target_ts]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p["t"])["p"]

    e3d = last_at_or_before(end_ts - 3 * 86400)
    e1d = last_at_or_before(end_ts - 86400)
    elate = last_at_or_before(end_ts - 4 * 3600)

    return {
        "entry_yes_price_3d": e3d,
        "entry_yes_price_1d": e1d,
        "entry_yes_price_late": elate,
        "n_history_points": len(pts),
        "trading_window_days": (pts[-1]["t"] - pts[0]["t"]) / 86400 if len(pts) >= 2 else 0,
    }


def build_unified():
    """Combine earnings (prior session) + econ + crypto into all_markets_resolved.parquet."""
    import pandas as pd

    rows = []

    # ---------- Earnings (carry forward) ----------
    earnings_path = DATA / "earnings_markets_with_entry.jsonl"
    if earnings_path.exists():
        print(f"[unified] loading earnings carry-forward …", flush=True)
        for line in open(earnings_path):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            v = float(r.get("volume_num") or 0)
            rows.append({
                "condition_id": r["condition_id"],
                "category": "earnings",
                "question": r.get("question", ""),
                "ticker_or_event": r.get("ticker"),
                "end_date": r.get("end_date"),
                "outcome_yes_won": int(r.get("outcome_beat", 0)),
                "entry_yes_price_3d": r.get("entry_yes_price_3d"),
                "entry_yes_price_1d": r.get("entry_yes_price_1d"),
                "entry_yes_price_late": None,
                "volume_num": v,
                "trading_window_days": r.get("trading_window_days"),
                "n_history_points": r.get("n_history_points"),
                "volume_bucket": "low" if v < 50000 else "mid" if v < 200000 else "high",
            })
        print(f"[unified] earnings: {sum(1 for x in rows if x['category']=='earnings')}", flush=True)

    # ---------- Econ + Crypto ----------
    for category in ["econ", "crypto"]:
        sampled_path = GAMMA / f"{category}_sampled.jsonl"
        if not sampled_path.exists():
            print(f"[unified] {category} sampled file missing, skipping", flush=True)
            continue
        cat_rows = load_jsonl(sampled_path)
        kept = 0
        for r in cat_rows:
            entry = parse_history_to_entry(r["condition_id"], category, r["end_date_iso"])
            if entry is None or entry["entry_yes_price_3d"] is None:
                continue
            op = json.loads(r["outcome_prices_raw"])
            outcome_yes = 1 if str(op[0]) == "1" else 0
            v = float(r.get("volumeNum") or 0)
            rows.append({
                "condition_id": r["condition_id"],
                "category": category,
                "question": r["question"],
                "ticker_or_event": r.get("ticker_or_event"),
                "end_date": r["end_date"],
                "outcome_yes_won": outcome_yes,
                "entry_yes_price_3d": float(entry["entry_yes_price_3d"]),
                "entry_yes_price_1d": float(entry["entry_yes_price_1d"]) if entry["entry_yes_price_1d"] is not None else None,
                "entry_yes_price_late": float(entry["entry_yes_price_late"]) if entry["entry_yes_price_late"] is not None else None,
                "volume_num": v,
                "trading_window_days": entry["trading_window_days"],
                "n_history_points": entry["n_history_points"],
                "volume_bucket": "low" if v < 50000 else "mid" if v < 200000 else "high",
            })
            kept += 1
        print(f"[unified] {category}: kept {kept}", flush=True)

    df = pd.DataFrame(rows)
    df["end_date"] = pd.to_datetime(df["end_date"])
    df = df.sort_values("end_date").reset_index(drop=True)

    out_pq = DATA / "all_markets_resolved.parquet"
    out_csv = DATA / "all_markets_resolved.csv"
    df.to_parquet(out_pq, index=False)
    df.to_csv(out_csv, index=False)
    print(f"[unified] wrote {out_pq} ({len(df)} rows)", flush=True)
    print(df.category.value_counts().to_string(), flush=True)
    print(df.outcome_yes_won.value_counts().to_string(), flush=True)
    return df


def main():
    HIST.mkdir(parents=True, exist_ok=True)
    (HIST / "econ").mkdir(exist_ok=True)
    (HIST / "crypto").mkdir(exist_ok=True)

    summary = {}
    for cat in ["econ", "crypto"]:
        _, stats = harvest_category(cat)
        summary[cat] = stats

    df = build_unified()

    # Diag report
    diag_path = DATA / "diag" / "availability.md"
    diag_path.parent.mkdir(exist_ok=True)
    with open(diag_path, "w") as f:
        f.write("# Data availability — multi-category harvest\n\n")
        f.write("Generated by `scripts/research_harvest_finish.py` after Agent A's gamma-API scrape.\n\n")
        f.write("## Counts per category (in unified parquet)\n\n")
        f.write("| Category | N markets | With T-3d entry | With T-1d entry |\n|---|---:|---:|---:|\n")
        for c in ["earnings", "econ", "crypto"]:
            sub = df[df.category == c]
            t3 = sub.entry_yes_price_3d.notna().sum()
            t1 = sub.entry_yes_price_1d.notna().sum()
            f.write(f"| {c} | {len(sub)} | {t3} | {t1} |\n")
        f.write("\n## Date ranges\n\n")
        for c in ["earnings", "econ", "crypto"]:
            sub = df[df.category == c]
            if len(sub) > 0:
                f.write(f"- **{c}:** {sub.end_date.min().date()} → {sub.end_date.max().date()}\n")
        f.write("\n## CLOB fetch summary\n\n")
        for c, s in summary.items():
            f.write(f"- **{c}:** ok={s['ok']}, skipped={s['skipped']}, err={s['err']}\n")
        f.write("\n## Halt-condition status (per protocol)\n\n")
        for c in ["earnings", "econ", "crypto"]:
            sub = df[df.category == c]
            t3 = sub.entry_yes_price_3d.notna().sum()
            verdict = "✅ ample" if t3 >= 80 else ("⚠️ marginal" if t3 >= 30 else "❌ auto-Verdict-C")
            f.write(f"- **{c}:** {t3} with T-3d entry — {verdict}\n")
    print(f"[diag] wrote {diag_path}", flush=True)


if __name__ == "__main__":
    main()
