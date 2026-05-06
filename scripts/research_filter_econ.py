#!/usr/bin/env python3
"""Apply tighter econ filter to keep CLOB workload + signal-to-noise reasonable.

Rationale: gamma `tag_slug=economy` returned 4139 raw markets, most being
TSA-passenger-count trivia and "median home value" markets that are NOT
the macro releases the protocol's strategies (fade extremes around CPI/FOMC)
target. Pre-registered protocol expected "~700 unique" econ markets — current
4298 unfiltered count overshoots the intent.

Filter rule:
  KEEP if any of (fed, inflation, cpi, jobs, fomc, gdp, interest-rates) tag matches
  ELSE: keep only if volumeNum >= 1000 AND end_date >= 2024-01-01

Documented as a deliberate session deviation in availability.md.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DR = ROOT / "data" / "research"

SPECIFIC_TAGS = {"fed", "inflation", "cpi", "jobs", "fomc", "gdp", "interest-rates"}
MIN_VOL_BROAD = 1000.0
MIN_DATE = datetime.fromisoformat("2024-01-01T00:00:00+00:00")


def main():
    src = DR / "gamma_markets" / "econ.jsonl"
    dst = DR / "gamma_markets" / "econ_filtered.jsonl"
    kept_specific = 0
    kept_broad = 0
    dropped_low_vol = 0
    dropped_old = 0

    with open(src) as f, open(dst, "w") as out:
        for line in f:
            r = json.loads(line)
            tags = set(r.get("tags_matched") or [])
            end_iso = r.get("end_date_iso")
            try:
                end = datetime.fromisoformat(end_iso) if end_iso else None
            except Exception:
                end = None

            has_specific = bool(tags & SPECIFIC_TAGS)
            vol = r.get("volumeNum") or 0

            if has_specific:
                # Keep regardless (still skip pre-2024 if any sneak through)
                if end is None or end >= MIN_DATE:
                    out.write(json.dumps(r) + "\n")
                    kept_specific += 1
                else:
                    dropped_old += 1
            else:
                # economy-only: require min volume + post-2024
                if end is None or end < MIN_DATE:
                    dropped_old += 1
                    continue
                if vol < MIN_VOL_BROAD:
                    dropped_low_vol += 1
                    continue
                out.write(json.dumps(r) + "\n")
                kept_broad += 1

    summary = {
        "src": str(src),
        "dst": str(dst),
        "kept_specific_tag": kept_specific,
        "kept_broad_economy_filtered": kept_broad,
        "dropped_low_vol": dropped_low_vol,
        "dropped_old": dropped_old,
        "total_kept": kept_specific + kept_broad,
    }
    print(json.dumps(summary, indent=2))
    with open(DR / "diag" / "econ_filter_stats.json", "w") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()
