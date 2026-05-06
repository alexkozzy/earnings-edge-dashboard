#!/usr/bin/env python3
"""Fetch CLOB price history for every Polymarket earnings market.

Resume-on-restart: skips markets whose JSON file already exists.
Pace: ~0.4s between requests.
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/research/earnings_markets_raw.json"
OUT_DIR = ROOT / "data/research/clob_history"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ENDPOINT = "https://clob.polymarket.com/prices-history"
SLEEP_SEC = 0.4

def main():
    markets = json.loads(RAW.read_text())
    valid = [m for m in markets if m.get("ticker") and m.get("clob_token_ids_raw")]
    print(f"loaded {len(markets)} markets, {len(valid)} valid", flush=True)

    sess = requests.Session()
    n_done = 0
    n_skip = 0
    n_fail = 0
    n_empty = 0
    t0 = time.time()
    for i, m in enumerate(valid):
        cid = m["condition_id"]
        out_path = OUT_DIR / f"{cid}.json"
        if out_path.exists():
            n_skip += 1
            continue
        try:
            tokens = json.loads(m["clob_token_ids_raw"])
            yes_token = tokens[0]
        except Exception as exc:
            print(f"[{i}] {cid}: bad clob_token_ids_raw ({exc})", flush=True)
            n_fail += 1
            continue
        try:
            r = sess.get(
                ENDPOINT,
                params={"market": yes_token, "interval": "max", "fidelity": 720},
                timeout=20,
            )
            if r.status_code != 200:
                print(f"[{i}] {cid}: HTTP {r.status_code}", flush=True)
                n_fail += 1
                time.sleep(SLEEP_SEC)
                continue
            data = r.json()
            history = data.get("history", [])
            if not history:
                n_empty += 1
            out_path.write_text(json.dumps(data))
            n_done += 1
        except Exception as exc:
            print(f"[{i}] {cid}: exception {exc}", flush=True)
            n_fail += 1
        time.sleep(SLEEP_SEC)
        if (i + 1) % 50 == 0:
            elapsed = time.time() - t0
            print(
                f"progress {i+1}/{len(valid)} done={n_done} skip={n_skip} "
                f"fail={n_fail} empty={n_empty} elapsed={elapsed:.0f}s",
                flush=True,
            )

    print(f"FINAL done={n_done} skip={n_skip} fail={n_fail} empty={n_empty} "
          f"total_files={len(list(OUT_DIR.glob('*.json')))}", flush=True)


if __name__ == "__main__":
    main()
