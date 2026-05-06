#!/usr/bin/env python3
"""Agent A: Harvest Polymarket econ + low-cap crypto markets and CLOB histories.

Steps:
A1 - Enumerate econ tags, paginate, dedup, filter
A2 - Enumerate crypto tags, paginate, dedup, filter (volumeNum<50k, must mention crypto)
A3 - Fetch CLOB price history for each market into clob_history/{econ,crypto}/
A4 - Build unified parquet (earnings + econ + crypto)
A5 - Write availability.md diagnostic
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
import urllib.request
import urllib.error

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DR = ROOT / "data" / "research"
GAMMA = "https://gamma-api.polymarket.com/events"
CLOB = "https://clob.polymarket.com/prices-history"

ECON_TAGS = ["fed", "inflation", "cpi", "jobs", "fomc", "economy", "gdp", "interest-rates"]
CRYPTO_TAGS = ["crypto", "bitcoin", "ethereum"]

GAMMA_PACE = 0.4   # seconds between gamma calls
CLOB_PACE = 0.4    # seconds between clob calls

# Counters tracked across the run
_calls = {"gamma": 0, "clob": 0, "clob_skip": 0, "clob_err": 0}


def http_get_json(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers={"User-Agent": "research-harvest/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def paginate_tag(tag: str, kind: str = "events"):
    """Yield raw event objects for one tag until a partial page comes back."""
    offset = 0
    LIMIT = 200
    while True:
        params = urlencode({
            "tag_slug": tag,
            "closed": "true",
            "limit": LIMIT,
            "offset": offset,
        })
        url = f"{GAMMA}?{params}"
        try:
            data = http_get_json(url)
        except Exception as e:
            print(f"[gamma] {tag} offset={offset} ERROR: {e}", file=sys.stderr)
            break
        _calls["gamma"] += 1
        if not isinstance(data, list) or not data:
            break
        for ev in data:
            yield ev
        if len(data) < LIMIT:
            break
        offset += LIMIT
        time.sleep(GAMMA_PACE)


def event_markets(ev: dict):
    """Yield each market dict inside an event, attaching the event's slug/dates."""
    mkts = ev.get("markets") or []
    for m in mkts:
        m = dict(m)  # shallow copy
        m["_event_slug"] = ev.get("slug")
        m["_event_title"] = ev.get("title")
        # Dates: prefer market end_date, fall back to event endDate
        m["_event_endDate"] = ev.get("endDate")
        m["_event_startDate"] = ev.get("startDate")
        yield m


CRYPTO_RE = re.compile(
    r"\b(crypto|bitcoin|btc|ethereum|eth|coin|blockchain|sol(ana)?|doge|xrp|"
    r"ada|cardano|polkadot|dot|avax|matic|polygon|chainlink|link|binance|bnb|"
    r"shiba|shib|pepe|memecoin|defi|nft|stablecoin|usdt|usdc|altcoin|"
    r"trezor|wallet|hodl|halving|hash\s*rate|merge|pos\b|pow\b|miner|mining)\b",
    re.IGNORECASE,
)


def safe_float(x, default=None):
    if x is None:
        return default
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def parse_iso(s):
    if not s:
        return None
    try:
        # Polymarket uses ISO with Z
        s2 = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s2)
    except Exception:
        return None


def market_passes_filters(m: dict, category: str) -> tuple[bool, str | None]:
    # Outcomes parseable + binary
    outs_raw = m.get("outcomes") or m.get("outcomesRaw") or m.get("outcomes_raw")
    if not outs_raw:
        return False, "no_outcomes"
    try:
        outs = json.loads(outs_raw) if isinstance(outs_raw, str) else outs_raw
    except Exception:
        return False, "outcomes_unparseable"
    if not (isinstance(outs, list) and len(outs) == 2):
        return False, "not_binary"

    # Token IDs
    tokens_raw = m.get("clobTokenIds") or m.get("clob_token_ids_raw")
    if not tokens_raw:
        return False, "no_tokens"
    try:
        tokens = json.loads(tokens_raw) if isinstance(tokens_raw, str) else tokens_raw
    except Exception:
        return False, "tokens_unparseable"
    if not (isinstance(tokens, list) and len(tokens) == 2 and all(tokens)):
        return False, "tokens_bad"

    # Outcome prices indicating real resolution
    prices_raw = m.get("outcomePrices") or m.get("outcome_prices_raw")
    if not prices_raw:
        return False, "no_prices"
    try:
        prices = json.loads(prices_raw) if isinstance(prices_raw, str) else prices_raw
    except Exception:
        return False, "prices_unparseable"
    if not (isinstance(prices, list) and len(prices) == 2):
        return False, "prices_bad"
    if prices == ["0.5", "0.5"]:
        return False, "unresolved_5050"

    # endDate
    end = parse_iso(m.get("endDate") or m.get("_event_endDate"))
    if end is None:
        return False, "no_end_date"

    # condition_id
    if not m.get("conditionId"):
        return False, "no_condition_id"

    # Category-specific
    if category == "crypto":
        vol = safe_float(m.get("volumeNum"))
        if vol is None:
            return False, "no_volume"
        if vol >= 50000:
            return False, "volume_too_high"
        q = (m.get("question") or "")
        if not CRYPTO_RE.search(q):
            return False, "not_crypto_topic"
    return True, None


def normalize_market(m: dict, tags_matched: list[str]) -> dict:
    outs_raw = m.get("outcomes") or m.get("outcomesRaw") or m.get("outcomes_raw")
    tokens_raw = m.get("clobTokenIds") or m.get("clob_token_ids_raw")
    prices_raw = m.get("outcomePrices") or m.get("outcome_prices_raw")
    end = parse_iso(m.get("endDate") or m.get("_event_endDate"))
    start = parse_iso(m.get("startDate") or m.get("_event_startDate"))
    return {
        "condition_id": m["conditionId"],
        "tags_matched": sorted(set(tags_matched)),
        "question": m.get("question"),
        "end_date": m.get("endDate") or m.get("_event_endDate"),
        "ticker_or_event": m.get("groupItemTitle") or m.get("_event_slug"),
        "clob_token_ids_raw": outs_raw and tokens_raw,  # keep raw form below
        # explicit raw fields
        "_outcomes_raw": outs_raw if isinstance(outs_raw, str) else json.dumps(outs_raw),
        "_clob_token_ids_raw": tokens_raw if isinstance(tokens_raw, str) else json.dumps(tokens_raw),
        "_outcome_prices_raw": prices_raw if isinstance(prices_raw, str) else json.dumps(prices_raw),
        "volumeNum": safe_float(m.get("volumeNum")),
        "liquidityNum": safe_float(m.get("liquidityNum")),
        "slug": m.get("slug") or m.get("_event_slug"),
        "start_date_iso": start.isoformat() if start else None,
        "end_date_iso": end.isoformat() if end else None,
    }


def harvest_category(tags: list[str], category: str, out_path: Path) -> dict:
    """Returns drop-reason counts and writes JSONL."""
    seen: dict[str, dict] = {}
    tag_match: dict[str, set[str]] = defaultdict(set)
    drop_counts: dict[str, int] = defaultdict(int)
    raw_market_count = 0
    raw_event_count = 0

    for tag in tags:
        ev_count_for_tag = 0
        mkt_count_for_tag = 0
        for ev in paginate_tag(tag):
            ev_count_for_tag += 1
            for m in event_markets(ev):
                mkt_count_for_tag += 1
                cid = m.get("conditionId")
                if cid:
                    tag_match[cid].add(tag)
                ok, why = market_passes_filters(m, category)
                if not ok:
                    if cid not in seen:  # only count drop reason if not already kept
                        drop_counts[why or "unknown"] += 1
                    continue
                if cid in seen:
                    continue
                seen[cid] = m
        raw_event_count += ev_count_for_tag
        raw_market_count += mkt_count_for_tag
        print(f"[harvest:{category}] tag={tag} events={ev_count_for_tag} mkts={mkt_count_for_tag} kept_so_far={len(seen)}", file=sys.stderr)
        time.sleep(GAMMA_PACE)

    # Write JSONL
    rows = []
    for cid, m in seen.items():
        row = normalize_market(m, list(tag_match[cid]))
        # Final sanity recheck
        ok, why = market_passes_filters(m, category)
        if not ok:
            drop_counts[why or "unknown_final"] += 1
            continue
        rows.append(row)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        for r in rows:
            f.write(json.dumps(r, default=str) + "\n")

    print(f"[harvest:{category}] wrote {len(rows)} rows to {out_path}", file=sys.stderr)
    return {
        "kept": len(rows),
        "raw_events": raw_event_count,
        "raw_markets_seen": raw_market_count,
        "drop_counts": dict(drop_counts),
    }


def fetch_clob_history(token_id: str, dest: Path) -> bool:
    if dest.exists():
        _calls["clob_skip"] += 1
        return True
    params = urlencode({"market": token_id, "interval": "max", "fidelity": "720"})
    url = f"{CLOB}?{params}"
    try:
        data = http_get_json(url, timeout=30)
        _calls["clob"] += 1
    except Exception as e:
        _calls["clob_err"] += 1
        print(f"[clob] {token_id[:12]}.. ERROR: {e}", file=sys.stderr)
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w") as f:
        json.dump(data, f)
    time.sleep(CLOB_PACE)
    return True


def step_a3_fetch_history(jsonl_path: Path, hist_dir: Path, label: str):
    n_total = 0
    n_done = 0
    with open(jsonl_path) as f:
        rows = [json.loads(l) for l in f if l.strip()]
    print(f"[A3:{label}] {len(rows)} markets to potentially fetch", file=sys.stderr)
    for i, r in enumerate(rows):
        cid = r["condition_id"]
        try:
            tokens = json.loads(r["_clob_token_ids_raw"])
        except Exception:
            continue
        if not tokens or not tokens[0]:
            continue
        yes_token = tokens[0]
        dest = hist_dir / f"{cid}.json"
        n_total += 1
        if fetch_clob_history(yes_token, dest):
            n_done += 1
        if i % 50 == 0 and i > 0:
            print(f"[A3:{label}] progress {i}/{len(rows)} clob_calls={_calls['clob']} skip={_calls['clob_skip']} err={_calls['clob_err']}", file=sys.stderr)
    print(f"[A3:{label}] done total={n_total} success={n_done}", file=sys.stderr)


def main():
    print("=== A1: ECON harvest ===", file=sys.stderr)
    econ_path = DR / "gamma_markets" / "econ.jsonl"
    econ_stats = harvest_category(ECON_TAGS, "econ", econ_path)
    print(json.dumps(econ_stats, indent=2), file=sys.stderr)

    print("=== A2: CRYPTO harvest ===", file=sys.stderr)
    crypto_path = DR / "gamma_markets" / "crypto.jsonl"
    crypto_stats = harvest_category(CRYPTO_TAGS, "crypto", crypto_path)
    print(json.dumps(crypto_stats, indent=2), file=sys.stderr)

    # Persist drop stats for diagnostic
    with open(DR / "diag" / "harvest_stats.json", "w") as f:
        json.dump({"econ": econ_stats, "crypto": crypto_stats}, f, indent=2)

    print("=== A3a: ECON CLOB history ===", file=sys.stderr)
    step_a3_fetch_history(econ_path, DR / "clob_history" / "econ", "econ")
    print("=== A3b: CRYPTO CLOB history ===", file=sys.stderr)
    step_a3_fetch_history(crypto_path, DR / "clob_history" / "crypto", "crypto")

    # Summary
    summary = {
        "calls": dict(_calls),
        "econ_n": econ_stats["kept"],
        "crypto_n": crypto_stats["kept"],
    }
    print("=== HARVEST DONE ===", file=sys.stderr)
    print(json.dumps(summary, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
