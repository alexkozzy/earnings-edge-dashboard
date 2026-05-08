#!/usr/bin/env python3
"""
v5 cycle 1 — universe construction + sub_category + sub_tag classification.

Reads:
- data/research/v4/cycle_1/geopolitics_markets.jsonl (35K raw harvested in v4)
- data/research/v4/cycle_1/geopolitics_clob/ + geopolitics_lowvol_clob/
- data/research/v4/cycle_1/all_markets_v4.parquet (geopolitics rows only)

Writes:
- data/research/v5/markets/universe.parquet
- data/research/v5/cycle_1/SCOPE_DECISION.md (orchestrator pre-decision; agent A may revise)
"""
import json, re
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
V4C1 = ROOT / "data" / "research" / "v4" / "cycle_1"
V5 = ROOT / "data" / "research" / "v5"
V5_M = V5 / "markets"
V5_C1 = V5 / "cycle_1"
V5_M.mkdir(parents=True, exist_ok=True)
V5_C1.mkdir(parents=True, exist_ok=True)

# Sub-tag rules (substring/regex, first match wins)
SUB_TAGS = [
    ("iran", re.compile(r"\b(iran|tehran)\b", re.I)),
    ("ukraine", re.compile(r"\b(ukraine|kyiv|zelensky)\b", re.I)),
    ("china_taiwan", re.compile(r"\b(china|taiwan|xi\s+jinping|beijing)\b", re.I)),
    ("israel", re.compile(r"\b(israel|gaza|hamas|netanyahu)\b", re.I)),
    ("venezuela", re.compile(r"\b(venezuela|maduro)\b", re.I)),
    ("cuba", re.compile(r"\b(cuba|havana)\b", re.I)),
    ("yemen", re.compile(r"\b(yemen|houthi)\b", re.I)),
    ("syria", re.compile(r"\bsyria\b", re.I)),
    ("korea", re.compile(r"\b(korea|kim\s+jong)\b", re.I)),
    ("trump_putin", re.compile(r"\b(trump.*putin|putin.*trump|trump.*russia|kremlin.*trump)\b", re.I)),
]
# Sub-category rules
HARD_CURRENCY_RE = re.compile(
    r"\$|\bUSD\b|\bdollar|\bbarrel|\b\d+(\s*)(M|B)\b|\d+%|\bexport(s|ed)?|\bsanction|\btariff|\breserve|\bGDP|\btreasury|\bmissile|\bnuclear|\bdrone|\bairstrike",
    re.I,
)
ACTION_COUNT_RE = re.compile(
    r"\b(how many|number of|count of|at least \d|more than \d|fewer than \d|over \d|under \d|\d+\+ )\b",
    re.I,
)


def classify_sub_tag(question):
    if not question: return "other"
    for tag, pattern in SUB_TAGS:
        if pattern.search(question):
            return tag
    return "other"


def classify_sub_category(question):
    if not question: return "discretionary"
    if HARD_CURRENCY_RE.search(question): return "hard_currency"
    if ACTION_COUNT_RE.search(question): return "action_count"
    return "discretionary"


def liquidity_tier(v):
    if v < 5000: return "<5K"
    if v < 15000: return "5-15K"
    if v < 50000: return "15-50K"
    if v < 200000: return "50-200K"
    return ">200K"


def parse_history_to_entry(condition_id, end_date_iso, candidate_dirs):
    for d in candidate_dirs:
        p = d / f"{condition_id}.json"
        if not p.exists(): continue
        try:
            h = json.load(open(p))
            pts = h.get("history", []) if isinstance(h, dict) else h
        except Exception:
            continue
        if not pts: continue
        end_ts = datetime.fromisoformat(end_date_iso.replace("Z", "+00:00")).timestamp()

        def lab(target):
            cands = [pp for pp in pts if pp["t"] <= target]
            if not cands: return None
            return max(cands, key=lambda pp: pp["t"])["p"]

        return {
            "entry_yes_price_3d": lab(end_ts - 3 * 86400),
            "entry_yes_price_7d": lab(end_ts - 7 * 86400),
            "entry_yes_price_1d": lab(end_ts - 86400),
            "entry_yes_price_late": lab(end_ts - 4 * 3600),
            "n_history_points": len(pts),
            "trading_window_days": (pts[-1]["t"] - pts[0]["t"]) / 86400 if len(pts) >= 2 else 0,
        }
    return None


def main():
    print("[v5-uni] reading v4 geo harvest …", flush=True)
    raw_path = V4C1 / "geopolitics_markets.jsonl"
    rows = []
    skipped_no_end = skipped_no_clob = skipped_no_outcome = skipped_no_entry = 0
    candidate_dirs = [V4C1 / "geopolitics_clob", V4C1 / "geopolitics_lowvol_clob"]

    for line in open(raw_path):
        m = json.loads(line)
        if not m.get("end_date_iso"):
            skipped_no_end += 1; continue
        if not m.get("clob_token_ids_raw"):
            skipped_no_clob += 1; continue
        if not m.get("outcome_prices_raw"):
            skipped_no_outcome += 1; continue
        try:
            op = json.loads(m["outcome_prices_raw"])
            if str(op[0]) not in ("0", "1"):
                skipped_no_outcome += 1; continue
        except Exception:
            skipped_no_outcome += 1; continue
        entry = parse_history_to_entry(m["condition_id"], m["end_date_iso"], candidate_dirs)
        if not entry or entry["entry_yes_price_3d"] is None:
            skipped_no_entry += 1; continue

        v = float(m.get("volumeNum") or 0)
        question = m.get("question") or ""
        rows.append({
            "condition_id": m["condition_id"],
            "category": "geopolitics",
            "question": question,
            "sub_category": classify_sub_category(question),
            "sub_tag": classify_sub_tag(question),
            "ticker_or_event": m.get("ticker_or_event") or m.get("slug"),
            "end_date": pd.to_datetime(m["end_date_iso"], utc=True),
            "outcome_yes_won": 1 if str(op[0]) == "1" else 0,
            "entry_yes_price_3d": float(entry["entry_yes_price_3d"]),
            "entry_yes_price_7d": float(entry["entry_yes_price_7d"]) if entry["entry_yes_price_7d"] is not None else None,
            "entry_yes_price_1d": float(entry["entry_yes_price_1d"]) if entry["entry_yes_price_1d"] is not None else None,
            "entry_yes_price_late": float(entry["entry_yes_price_late"]) if entry["entry_yes_price_late"] is not None else None,
            "volume_num": v,
            "trading_window_days": entry["trading_window_days"],
            "n_history_points": entry["n_history_points"],
            "liquidity_tier": liquidity_tier(v),
            "tags_matched_raw": json.dumps(m.get("tags_matched") or []),
        })

    df = pd.DataFrame(rows)
    df = df.sort_values("end_date").reset_index(drop=True)
    print(f"[v5-uni] kept {len(df)} markets (skipped: no_end={skipped_no_end} no_clob={skipped_no_clob} no_outcome={skipped_no_outcome} no_entry={skipped_no_entry})", flush=True)
    print(f"[v5-uni] sub_category counts:")
    print(df.sub_category.value_counts().to_string())
    print(f"\n[v5-uni] sub_tag counts:")
    print(df.sub_tag.value_counts().to_string())
    print(f"\n[v5-uni] liquidity tier counts:")
    print(df.liquidity_tier.value_counts().sort_index().to_string())
    print(f"\n[v5-uni] sub_cat × tier (in <50K tiers):")
    sub = df[df.liquidity_tier.isin(["<5K","5-15K","15-50K","50-200K"])]
    print(pd.crosstab(sub.sub_category, sub.liquidity_tier).to_string())

    out_pq = V5_M / "universe.parquet"
    out_csv = V5_M / "universe.csv"
    df.to_parquet(out_pq, index=False)
    df.to_csv(out_csv, index=False)
    print(f"\n[v5-uni] wrote {out_pq}")

    # Compute cell density check (12 cells = 3 sub_cat × 4 tiers)
    cells = sub.groupby(["sub_category", "liquidity_tier"]).size().reset_index(name="n")
    cells_pass = (cells.n >= 80).sum()
    print(f"\n[v5-uni] cells with N≥80 (in 4 tiers): {cells_pass} / 12 max")

    # Pre-write SCOPE_DECISION.md (orchestrator's first-pass; agent A may revise)
    scope_path = V5_C1 / "SCOPE_DECISION.md"
    with open(scope_path, "w") as f:
        f.write("# Scope Decision (orchestrator pre-decision)\n\n")
        f.write(f"**Universe size:** {len(df)} resolved geopolitics markets with full T-3d entry data\n\n")
        f.write(f"**Markets in <200K tiers (in scope):** {len(sub)}\n\n")
        f.write(f"## Cell density (3 sub_categories × 4 liquidity tiers = 12 cells max)\n\n")
        f.write("```\n")
        f.write(pd.crosstab(sub.sub_category, sub.liquidity_tier).to_string())
        f.write(f"\n```\n\n")
        f.write(f"**Cells with N ≥ 80:** {cells_pass} of 12\n\n")
        f.write(f"## Sub_tag distribution\n\n")
        f.write("```\n")
        f.write(df.sub_tag.value_counts().to_string())
        f.write(f"\n```\n\n")
        f.write(f"**Sub_tags meeting min threshold (max(30, 0.05 × {len(df)} = {max(30, int(0.05*len(df)))})):**\n")
        thr = max(30, int(0.05 * len(df)))
        sig_tags = df.sub_tag.value_counts()
        sig_tags = sig_tags[sig_tags >= thr]
        f.write("```\n")
        f.write(sig_tags.to_string())
        f.write("\n```\n\n")
        f.write("## Decision\n\n")
        if cells_pass >= 6:
            f.write("**Option A — geopolitics-only.** Cell density is sufficient (≥6 cells with N≥80) for the locked grid. ")
            f.write("Cycle 1 baseline backtest runs against this universe alone. ")
            f.write("If cycle 2's `most informative gap` analysis surfaces cross-venue or news-feed strategies, those agents may pull additional data.\n")
        else:
            f.write(f"**Cell density insufficient ({cells_pass} cells with N≥80, need ≥6).** ")
            f.write("Defer to Agent A in cycle 1 to choose Option B (Kalshi pairs) or Option C (econ-adjacent).\n")
        f.write("\n*This is the orchestrator's pre-decision based on data alone. Agent A may revise after deeper analysis.*\n")
    print(f"[v5-uni] wrote {scope_path}")


if __name__ == "__main__":
    main()
