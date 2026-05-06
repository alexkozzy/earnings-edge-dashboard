#!/usr/bin/env python3
"""Parallel CLOB price-history fetcher.

Reads econ.jsonl and crypto.jsonl, fetches yes-token history into clob_history/{econ,crypto}/.
Skips files that already exist.
Uses ThreadPoolExecutor with bounded concurrency for speed while respecting CLOB.
"""
from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode
import urllib.request

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DR = ROOT / "data" / "research"
CLOB = "https://clob.polymarket.com/prices-history"

# Concurrency: 4 workers + each pacing 0.4s/req self-imposed, gives ~10 req/s effective
CONCURRENCY = 8
PER_WORKER_PACE = 0.05  # tiny inter-call sleep per worker


def fetch_one(token_id: str, dest: Path) -> tuple[str, str]:
    if dest.exists():
        return ("skip", str(dest))
    params = urlencode({"market": token_id, "interval": "max", "fidelity": "720"})
    url = f"{CLOB}?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "research/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return ("err", f"{token_id[:14]}: {e}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w") as f:
        json.dump(data, f)
    time.sleep(PER_WORKER_PACE)
    return ("ok", str(dest))


def collect_targets(jsonl_path: Path, hist_dir: Path):
    targets = []
    with open(jsonl_path) as f:
        for line in f:
            r = json.loads(line)
            try:
                tokens = json.loads(r["_clob_token_ids_raw"])
            except Exception:
                continue
            if not tokens or not tokens[0]:
                continue
            cid = r["condition_id"]
            dest = hist_dir / f"{cid}.json"
            targets.append((tokens[0], dest))
    return targets


def run(category: str, jsonl: Path, hist_dir: Path, max_n: int | None = None):
    targets = collect_targets(jsonl, hist_dir)
    if max_n:
        targets = targets[:max_n]
    print(f"[clob:{category}] {len(targets)} targets", file=sys.stderr)

    n_ok = n_skip = n_err = 0
    t0 = time.time()
    errs = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futs = [ex.submit(fetch_one, tid, dest) for tid, dest in targets]
        for i, fut in enumerate(as_completed(futs)):
            status, info = fut.result()
            if status == "ok":
                n_ok += 1
            elif status == "skip":
                n_skip += 1
            else:
                n_err += 1
                if len(errs) < 5:
                    errs.append(info)
            if (i + 1) % 100 == 0:
                rate = (i + 1) / max(time.time() - t0, 0.01)
                print(f"[clob:{category}] {i+1}/{len(targets)} ok={n_ok} skip={n_skip} err={n_err} rate={rate:.1f}/s", file=sys.stderr)
    print(f"[clob:{category}] DONE ok={n_ok} skip={n_skip} err={n_err} in {time.time()-t0:.1f}s", file=sys.stderr)
    if errs:
        print(f"[clob:{category}] sample errors: {errs}", file=sys.stderr)
    return {"ok": n_ok, "skip": n_skip, "err": n_err}


if __name__ == "__main__":
    category = sys.argv[1] if len(sys.argv) > 1 else "both"
    max_n = int(sys.argv[2]) if len(sys.argv) > 2 else None
    summary = {}
    if category in ("econ", "both"):
        summary["econ"] = run("econ", DR / "gamma_markets" / "econ_filtered.jsonl",
                              DR / "clob_history" / "econ", max_n=max_n)
    if category in ("crypto", "both"):
        summary["crypto"] = run("crypto", DR / "gamma_markets" / "crypto.jsonl",
                                DR / "clob_history" / "crypto", max_n=max_n)
    print("=== CLOB FETCH SUMMARY ===", file=sys.stderr)
    print(json.dumps(summary, indent=2), file=sys.stderr)
