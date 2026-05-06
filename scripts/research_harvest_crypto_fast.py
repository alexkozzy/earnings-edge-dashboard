#!/usr/bin/env python3
"""Faster crypto harvest using parallel pagination."""
from __future__ import annotations

import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlencode
import urllib.request

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DR = ROOT / "data" / "research"
GAMMA = "https://gamma-api.polymarket.com/events"

TAGS = ["crypto", "bitcoin", "ethereum"]
LIMIT = 200
CONCURRENCY = 6


def http_get_json(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers={"User-Agent": "research/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_page(tag: str, offset: int):
    params = urlencode({"tag_slug": tag, "closed": "true", "limit": LIMIT, "offset": offset})
    url = f"{GAMMA}?{params}"
    try:
        return tag, offset, http_get_json(url)
    except Exception as e:
        print(f"[err] {tag} offset={offset}: {e}", file=sys.stderr)
        return tag, offset, []


CRYPTO_RE = re.compile(
    r"\b(crypto|bitcoin|btc|ethereum|eth|coin|blockchain|sol(ana)?|doge|xrp|"
    r"ada|cardano|polkadot|dot|avax|matic|polygon|chainlink|link|binance|bnb|"
    r"shiba|shib|pepe|memecoin|defi|nft|stablecoin|usdt|usdc|altcoin|"
    r"trezor|wallet|hodl|halving|hash\s*rate|merge|miner|mining|stable\s*coin)\b",
    re.IGNORECASE,
)


def safe_float(x, default=None):
    try:
        return float(x) if x is not None else default
    except Exception:
        return default


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def main():
    # Phase 1: probe each tag for total page count
    print("[phase1] discovering tag sizes", file=sys.stderr)
    tag_pages: dict[str, int] = {}
    for tag in TAGS:
        # First check offsets 0, 200, ... binary-search style up to a max
        # Simpler: just paginate sequentially until short page; should be quick if we blast
        offset = 0
        while True:
            _, off, data = fetch_page(tag, offset)
            if not data:
                break
            offset += LIMIT
            if len(data) < LIMIT:
                break
            if offset > 10000:  # safety
                break
        tag_pages[tag] = offset
        print(f"  {tag}: ~{offset} events scanned in probe", file=sys.stderr)

    # Phase 2: parallel fetch all pages
    print("[phase2] parallel fetching all pages", file=sys.stderr)
    page_jobs = []
    for tag, max_offset in tag_pages.items():
        for off in range(0, max_offset + LIMIT, LIMIT):
            page_jobs.append((tag, off))
    print(f"  total page jobs: {len(page_jobs)}", file=sys.stderr)

    all_events = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futs = [ex.submit(fetch_page, t, o) for t, o in page_jobs]
        for fut in as_completed(futs):
            tag, offset, data = fut.result()
            for ev in (data or []):
                ev["_query_tag"] = tag
            all_events.extend(data or [])

    print(f"[phase2] fetched {len(all_events)} event objects (with dups across tags)", file=sys.stderr)

    # Phase 3: dedup by event id, then process markets
    seen_events: dict[str, dict] = {}
    event_tags: dict[str, set[str]] = defaultdict(set)
    for ev in all_events:
        evid = ev.get("id")
        if not evid:
            continue
        seen_events[evid] = ev
        event_tags[evid].add(ev.get("_query_tag"))

    print(f"[phase3] unique events: {len(seen_events)}", file=sys.stderr)

    # Phase 4: process markets
    market_seen: dict[str, dict] = {}
    market_tags: dict[str, set[str]] = defaultdict(set)
    drop_counts: dict[str, int] = defaultdict(int)

    for evid, ev in seen_events.items():
        ev_tag_set = event_tags[evid]
        for m in ev.get("markets") or []:
            cid = m.get("conditionId")
            if not cid:
                drop_counts["no_condition_id"] += 1
                continue
            for t in ev_tag_set:
                if t:
                    market_tags[cid].add(t)

            # Filters: binary, tokens, prices, end_date, vol<50k, mentions crypto
            outs_raw = m.get("outcomes")
            try:
                outs = json.loads(outs_raw) if isinstance(outs_raw, str) else outs_raw
            except Exception:
                drop_counts["outcomes_unparseable"] += 1
                continue
            if not (isinstance(outs, list) and len(outs) == 2):
                drop_counts["not_binary"] += 1
                continue

            tokens_raw = m.get("clobTokenIds")
            try:
                tokens = json.loads(tokens_raw) if isinstance(tokens_raw, str) else tokens_raw
            except Exception:
                drop_counts["tokens_unparseable"] += 1
                continue
            if not (isinstance(tokens, list) and len(tokens) == 2 and all(tokens)):
                drop_counts["tokens_bad"] += 1
                continue

            prices_raw = m.get("outcomePrices")
            try:
                prices = json.loads(prices_raw) if isinstance(prices_raw, str) else prices_raw
            except Exception:
                drop_counts["prices_unparseable"] += 1
                continue
            if not (isinstance(prices, list) and len(prices) == 2):
                drop_counts["prices_bad"] += 1
                continue
            if prices == ["0.5", "0.5"]:
                drop_counts["unresolved_5050"] += 1
                continue

            end = parse_iso(m.get("endDate") or ev.get("endDate"))
            if end is None:
                drop_counts["no_end_date"] += 1
                continue

            vol = safe_float(m.get("volumeNum"))
            if vol is None:
                drop_counts["no_volume"] += 1
                continue
            if vol >= 50000:
                drop_counts["volume_too_high"] += 1
                continue

            q = (m.get("question") or "")
            if not CRYPTO_RE.search(q):
                drop_counts["not_crypto_topic"] += 1
                continue

            if cid in market_seen:
                continue

            start = parse_iso(m.get("startDate") or ev.get("startDate"))
            market_seen[cid] = {
                "condition_id": cid,
                "tags_matched": sorted(market_tags[cid]),
                "question": m.get("question"),
                "end_date": m.get("endDate") or ev.get("endDate"),
                "ticker_or_event": m.get("groupItemTitle") or ev.get("slug"),
                "_outcomes_raw": outs_raw if isinstance(outs_raw, str) else json.dumps(outs_raw),
                "_clob_token_ids_raw": tokens_raw if isinstance(tokens_raw, str) else json.dumps(tokens_raw),
                "_outcome_prices_raw": prices_raw if isinstance(prices_raw, str) else json.dumps(prices_raw),
                "volumeNum": vol,
                "liquidityNum": safe_float(m.get("liquidityNum")),
                "slug": m.get("slug") or ev.get("slug"),
                "start_date_iso": start.isoformat() if start else None,
                "end_date_iso": end.isoformat() if end else None,
            }

    out = DR / "gamma_markets" / "crypto.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        for r in market_seen.values():
            # Re-sync tags_matched
            r["tags_matched"] = sorted(market_tags[r["condition_id"]])
            f.write(json.dumps(r, default=str) + "\n")

    print(f"[done] kept={len(market_seen)}", file=sys.stderr)
    print(f"[drops] {dict(drop_counts)}", file=sys.stderr)

    with open(DR / "diag" / "crypto_harvest_stats.json", "w") as f:
        json.dump({"kept": len(market_seen), "drop_counts": dict(drop_counts), "tag_pages": tag_pages}, f, indent=2)


if __name__ == "__main__":
    main()
