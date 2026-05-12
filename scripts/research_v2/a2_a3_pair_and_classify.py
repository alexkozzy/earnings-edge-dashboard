#!/usr/bin/env python3
"""
A2 + A3 — Heuristic scoring (Pass 1) and bucket-equivalence check (Pass 2).

Inputs:
  - data/research/all_markets_resolved.parquet  (Polymarket, 1823 rows)
  - data/research/v2/kalshi_data/markets.jsonl  (Kalshi inventory)

Output:
  - data/research/v2/paired_markets/pass1_candidates.jsonl
  - data/research/v2/paired_markets/pass2_survivors.jsonl
  - data/research/v2/paired_markets/pass2_rejected.jsonl
  - data/research/v2/paired_markets/pass1_stats.json

Pass 1 score (per protocol):
  +3 same ticker / same named event
  +3 same numeric threshold within 5% tolerance
  +2 resolution dates within 2 days
  +2 topic keyword class matches
  +1 phrase substring overlap > 20 chars
  candidate threshold: score >= 5

Pass 2 — classify each side as point_estimate / threshold_above / threshold_below
/ range / boolean_event, then apply equivalence rules.
"""
import json
import re
from pathlib import Path
from datetime import datetime, timedelta, timezone
import pandas as pd
from collections import Counter, defaultdict

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
PM_PARQUET = ROOT / "data/research/all_markets_resolved.parquet"
KSI_JSONL = ROOT / "data/research/v2/kalshi_data/markets.jsonl"
OUT_DIR = ROOT / "data/research/v2/paired_markets"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# -----------------------------------------------------------------------------
# Topic classification
# -----------------------------------------------------------------------------
TOPIC_KEYWORDS = {
    "fed": ["fed", "federal reserve", "fomc", "interest rate", "rate cut", "rate hike", "fed funds", "federal funds"],
    "cpi": ["cpi", "consumer price", "inflation"],
    "ppi": ["ppi", "producer price"],
    "pce": ["pce", "personal consumption"],
    "jobs": ["jobs report", "nonfarm", "non-farm", "payrolls", "nfp", "unemployment", "unrate", "unemployment rate"],
    "gdp": ["gdp", "gross domestic"],
    "btc": ["bitcoin", "btc"],
    "eth": ["ethereum", "eth"],
    "sol": ["solana"],
    "election_pres": ["president", "presidential", "trump", "biden", "harris", "kamala", "desantis", "ramaswamy", "vance"],
    "election_sen": ["senate", "senator"],
    "election_house": ["house seat", "speaker", "house of representatives", "congress"],
    "earnings": ["eps", "earnings", "revenue", "beats estimates", "miss"],
}

TICKERS = set([
    "AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "TSLA", "NVDA", "NFLX",
    "AMD", "INTC", "CRM", "ORCL", "ADBE", "CSCO", "AVGO", "QCOM", "TXN",
    "JPM", "BAC", "C", "GS", "MS", "WFC", "BLK",
    "WMT", "TGT", "COST", "HD", "LOW", "DIS", "MCD",
    "XOM", "CVX", "COP",
    "PFE", "JNJ", "MRK", "LLY", "UNH",
    "DELL", "HPQ", "IBM", "PYPL", "SQ", "SHOP", "UBER", "LYFT", "ABNB",
    "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "BNB",
])


def classify_topic(text):
    t = text.lower()
    matches = []
    for topic, kws in TOPIC_KEYWORDS.items():
        for kw in kws:
            if kw in t:
                matches.append(topic)
                break
    return set(matches)


def extract_tickers(text):
    # Tickers: uppercase 2-5 letters surrounded by non-alpha or as words
    found = set()
    for tok in re.findall(r"\b[A-Z]{2,5}\b", text):
        if tok in TICKERS:
            found.add(tok)
    return found


# -----------------------------------------------------------------------------
# Numeric extraction
# -----------------------------------------------------------------------------
NUM_PATTERNS = [
    # percentages / bps
    (re.compile(r"(\d+(?:\.\d+)?)\s*bps", re.I), "bps"),
    (re.compile(r"(\d+(?:\.\d+)?)\s*%"), "pct"),
    # dollar amounts with K/M/B/T suffix
    (re.compile(r"\$\s*(\d+(?:\.\d+)?)\s*([KkMmBbTt])"), "dollar_suf"),
    # plain dollar amounts
    (re.compile(r"\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"), "dollar"),
    # bare K/M (e.g. "100K")
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*([KkMmBbTt])\b"), "num_suf"),
    # bare floats with at least one digit after dot (e.g. CPI 0.3)
    (re.compile(r"\b(\d+\.\d+)\b"), "float"),
]


def extract_numbers(text):
    """Return list of normalized numeric values + raw."""
    nums = []
    for pat, kind in NUM_PATTERNS:
        for m in pat.finditer(text):
            raw = m.group(0)
            val_str = m.group(1).replace(",", "")
            try:
                val = float(val_str)
            except ValueError:
                continue
            mult = 1.0
            unit = ""
            if kind == "bps":
                unit = "bps"
            elif kind == "pct":
                unit = "pct"
            elif kind in ("dollar_suf", "num_suf"):
                suf = m.group(2).lower()
                mult = {"k": 1e3, "m": 1e6, "b": 1e9, "t": 1e12}.get(suf, 1.0)
                unit = "dollar" if kind == "dollar_suf" else "num"
            elif kind == "dollar":
                unit = "dollar"
            elif kind == "float":
                unit = "float"
            nums.append({"raw": raw, "value": val * mult, "unit": unit})
    return nums


def numbers_compatible(a, b, tol=0.05):
    """Check if any number in `a` matches any in `b` within tolerance."""
    for x in a:
        for y in b:
            # Normalize bps vs pct: 25bps == 0.25 pct
            xv = x["value"]
            yv = y["value"]
            if x["unit"] == "bps" and y["unit"] == "pct":
                xv = xv / 100.0
            elif x["unit"] == "pct" and y["unit"] == "bps":
                yv = yv / 100.0
            # Skip if mixing dollars and percentages — incompatible types
            xtype = "dollar" if x["unit"] == "dollar" else ("pct" if x["unit"] in ("bps", "pct") else "other")
            ytype = "dollar" if y["unit"] == "dollar" else ("pct" if y["unit"] in ("bps", "pct") else "other")
            if xtype != ytype and "other" not in (xtype, ytype):
                continue
            if xv == 0 and yv == 0:
                return True
            denom = max(abs(xv), abs(yv))
            if denom == 0:
                continue
            if abs(xv - yv) / denom <= tol:
                return True
    return False


# -----------------------------------------------------------------------------
# Bucket classification
# -----------------------------------------------------------------------------
THRESHOLD_ABOVE = re.compile(r"\b(above|over|greater than|higher than|exceed|at least|>=?|\bor more\b|or higher|or greater)\b", re.I)
THRESHOLD_BELOW = re.compile(r"\b(below|under|less than|lower than|<=?|\bor less\b|or lower|or fewer)\b", re.I)
RANGE_PATTERN = re.compile(r"\bbetween\b|\bto\b.*%|\b\d+\.\d+\s*-\s*\d+\.\d+\b|\bin the range\b", re.I)
POINT_BPS = re.compile(r"(by|of|exactly)\s+\d+\s*bps", re.I)
POINT_BY = re.compile(r"\b(cut|raise|decrease|increase)\s+(?:rates?\s+)?by\s+\d+", re.I)
HIT_PATTERN = re.compile(r"\b(reach|hit|touch|cross|breach)\b", re.I)
WIN_PATTERN = re.compile(r"\b(win|won|elected|re-elected|reelected|nominee|nominated)\b", re.I)
BEAT_PATTERN = re.compile(r"\b(beat|exceed|miss)\s+.*\b(estimat|expectations|forecast)", re.I)


def classify_bucket(text, subtitle=""):
    """Classify question into one of: point_estimate, threshold_above, threshold_below,
    range, boolean_event, unknown."""
    full = (text or "") + " " + (subtitle or "")
    t = full.strip()
    nums = extract_numbers(t)

    # Range first (more specific)
    if RANGE_PATTERN.search(t) and len(nums) >= 2:
        return "range"

    # Threshold detection
    has_above = bool(THRESHOLD_ABOVE.search(t))
    has_below = bool(THRESHOLD_BELOW.search(t))
    if has_above and not has_below and nums:
        return "threshold_above"
    if has_below and not has_above and nums:
        return "threshold_below"

    # Point estimate (specific delta)
    if POINT_BPS.search(t) or POINT_BY.search(t):
        return "point_estimate"

    # Hit pattern (e.g. "reach $100K") with number
    if HIT_PATTERN.search(t) and nums:
        # "reach above X" => threshold_above
        return "threshold_above"

    # Election / boolean
    if WIN_PATTERN.search(t):
        return "boolean_event"

    # Earnings beat
    if BEAT_PATTERN.search(t):
        return "boolean_event"

    # If has a number with no comparator, treat as point_estimate (often "Will rate be X%?")
    if nums:
        return "point_estimate"

    return "boolean_event"


# -----------------------------------------------------------------------------
# Pass 1 scoring
# -----------------------------------------------------------------------------
def parse_dt(s):
    if not s:
        return None
    if isinstance(s, pd.Timestamp):
        return s.to_pydatetime()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def score_pair(pm, ksi):
    """Pass 1 scoring per PROTOCOL_v2.md."""
    score = 0
    rationale = []

    pm_q = (pm["question"] or "").lower()
    ksi_q = ((ksi.get("title") or "") + " " + (ksi.get("subtitle") or "") + " " + (ksi.get("yes_sub_title") or "")).lower()
    pm_te = (pm.get("ticker_or_event") or "").lower()

    # +3 same ticker or same named event
    pm_tickers = extract_tickers(pm["question"])
    ksi_tickers = extract_tickers((ksi.get("title") or "") + " " + (ksi.get("subtitle") or ""))
    if pm_tickers & ksi_tickers:
        score += 3
        rationale.append(f"ticker_match:{','.join(pm_tickers & ksi_tickers)}")
    elif pm_te:
        # named-event match: look for distinctive event phrases (multi-word)
        for phrase in [pm_te]:
            if len(phrase) >= 8 and phrase in ksi_q:
                score += 3
                rationale.append(f"named_event:{phrase}")
                break

    # +3 same numeric threshold within 5%
    pm_nums = extract_numbers(pm["question"])
    ksi_nums = extract_numbers((ksi.get("title") or "") + " " + (ksi.get("subtitle") or "") + " " + (ksi.get("yes_sub_title") or ""))
    if pm_nums and ksi_nums and numbers_compatible(pm_nums, ksi_nums, tol=0.05):
        score += 3
        rationale.append("num_match")

    # +2 resolution dates within 2 days
    pm_end = pm["end_date"]
    if isinstance(pm_end, pd.Timestamp):
        pm_end = pm_end.to_pydatetime()
    ksi_close = parse_dt(ksi.get("close_time") or ksi.get("expiration_time"))
    if pm_end and ksi_close:
        delta = abs((pm_end - ksi_close).total_seconds())
        if delta <= 2 * 86400:
            score += 2
            rationale.append(f"date_match:{delta/86400:.1f}d")

    # +2 topic keyword class matches
    pm_topics = classify_topic(pm["question"])
    ksi_topics = classify_topic((ksi.get("title") or "") + " " + (ksi.get("subtitle") or ""))
    common = pm_topics & ksi_topics
    if common:
        score += 2
        rationale.append(f"topic:{','.join(common)}")

    # +1 phrase substring overlap > 20 chars
    pm_words = pm_q.split()
    for n in (4, 3):
        for i in range(len(pm_words) - n + 1):
            phrase = " ".join(pm_words[i:i+n])
            if len(phrase) > 20 and phrase in ksi_q:
                score += 1
                rationale.append(f"phrase_overlap:'{phrase[:30]}...'")
                break
        else:
            continue
        break

    return score, rationale


# -----------------------------------------------------------------------------
# Pass 2: bucket-equivalence
# -----------------------------------------------------------------------------
def pass2_check(pm, ksi):
    """Returns (status, classification_dict, reason)."""
    pm_full = pm["question"]
    ksi_full = (ksi.get("title") or "") + " " + (ksi.get("subtitle") or "") + " " + (ksi.get("yes_sub_title") or "")

    pm_class = classify_bucket(pm_full)
    ksi_class = classify_bucket(ksi.get("title") or "", ksi.get("yes_sub_title") or "")

    classification = {"pm_class": pm_class, "ksi_class": ksi_class}

    pm_nums = extract_numbers(pm_full)
    ksi_nums = extract_numbers(ksi_full)
    classification["pm_nums"] = [{"raw": n["raw"], "value": n["value"], "unit": n["unit"]} for n in pm_nums]
    classification["ksi_nums"] = [{"raw": n["raw"], "value": n["value"], "unit": n["unit"]} for n in ksi_nums]

    # Rule: types must match
    if pm_class != ksi_class:
        # Allow: range vs range; threshold_above vs threshold_above; etc.
        # Special: boolean_event vs boolean_event always OK
        if {pm_class, ksi_class} == {"point_estimate", "threshold_above"}:
            return "rejected", classification, f"mismatch_class:{pm_class}_vs_{ksi_class}"
        if {pm_class, ksi_class} == {"point_estimate", "threshold_below"}:
            return "rejected", classification, f"mismatch_class:{pm_class}_vs_{ksi_class}"
        if {pm_class, ksi_class} == {"threshold_above", "threshold_below"}:
            return "rejected", classification, "opposite_thresholds"
        if {pm_class, ksi_class} == {"boolean_event", "threshold_above"}:
            # Could be e.g. "Will BTC hit $100k" vs "Will BTC be above $100k" → keep if numeric matches
            if pm_nums and ksi_nums and numbers_compatible(pm_nums, ksi_nums, tol=0.05):
                return "kept", classification, "boolean_to_threshold_with_num_match"
            return "rejected", classification, f"mismatch_class:{pm_class}_vs_{ksi_class}"
        if {pm_class, ksi_class} == {"boolean_event", "threshold_below"}:
            if pm_nums and ksi_nums and numbers_compatible(pm_nums, ksi_nums, tol=0.05):
                return "kept", classification, "boolean_to_threshold_with_num_match"
            return "rejected", classification, f"mismatch_class:{pm_class}_vs_{ksi_class}"
        return "rejected", classification, f"mismatch_class:{pm_class}_vs_{ksi_class}"

    # Same class:
    if pm_class == "boolean_event":
        # Both boolean — accept; agent grading will refine
        return "kept", classification, "both_boolean"

    if pm_class == "point_estimate":
        # Both point estimates — require numeric match
        if not pm_nums or not ksi_nums:
            return "rejected", classification, "point_estimate_missing_nums"
        if not numbers_compatible(pm_nums, ksi_nums, tol=0.05):
            return "rejected", classification, "point_estimate_nums_differ_>5pct"
        return "kept", classification, "point_estimate_num_match"

    if pm_class in ("threshold_above", "threshold_below"):
        if not pm_nums or not ksi_nums:
            return "rejected", classification, f"{pm_class}_missing_nums"
        if not numbers_compatible(pm_nums, ksi_nums, tol=0.05):
            return "rejected", classification, f"{pm_class}_thresholds_differ_>5pct"
        return "kept", classification, f"{pm_class}_num_match"

    if pm_class == "range":
        # Both ranges — require >=2 numbers each and overlap
        if len(pm_nums) < 2 or len(ksi_nums) < 2:
            return "rejected", classification, "range_missing_bounds"
        return "kept", classification, "range_overlap_needs_grading"

    return "rejected", classification, "unknown_class"


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def enrich_pm_questions(pm_df):
    """Earnings markets in the parquet have empty 'question' fields; join from raw."""
    raw_path = ROOT / "data/research/earnings_markets_raw.json"
    if not raw_path.exists():
        return pm_df
    with raw_path.open() as f:
        raw = json.load(f)
    by_id = {r["condition_id"]: r.get("question", "") for r in raw if r.get("question")}
    by_ticker = {}  # not always reliable but fallback
    enriched = 0
    out_df = pm_df.copy()
    for idx in out_df.index:
        if not (out_df.at[idx, "question"] or "").strip():
            cid = out_df.at[idx, "condition_id"]
            if cid in by_id:
                out_df.at[idx, "question"] = by_id[cid]
                enriched += 1
            else:
                # Fallback: synthesize from ticker_or_event for earnings
                te = out_df.at[idx, "ticker_or_event"]
                cat = out_df.at[idx, "category"]
                if cat == "earnings" and te:
                    out_df.at[idx, "question"] = f"Will {te} beat earnings estimates?"
                    enriched += 1
    print(f"Enriched {enriched} PM questions", flush=True)
    return out_df


def main():
    import time
    t0 = time.time()
    pm_df = pd.read_parquet(PM_PARQUET)
    pm_df = enrich_pm_questions(pm_df)
    print(f"PM: {len(pm_df)} markets", flush=True)

    ksi = []
    with KSI_JSONL.open() as f:
        for line in f:
            ksi.append(json.loads(line))
    print(f"KSI: {len(ksi)} markets", flush=True)

    # Pre-compute date for each KSI
    for k in ksi:
        k["_close_dt"] = parse_dt(k.get("close_time") or k.get("expiration_time"))

    # Bucket KSI by close_date (year-month) for narrowing
    ksi_by_ym = defaultdict(list)
    for k in ksi:
        if k["_close_dt"]:
            ym = k["_close_dt"].strftime("%Y-%m")
            ksi_by_ym[ym].append(k)
            # also adjacent months for date tolerance
    print(f"KSI months: {sorted(ksi_by_ym.keys())[:5]} ... {sorted(ksi_by_ym.keys())[-5:]}", flush=True)

    candidates = []
    score_hist = Counter()
    eval_count = 0

    for _, pm in pm_df.iterrows():
        pm_dt = pm["end_date"]
        if isinstance(pm_dt, pd.Timestamp):
            pm_dt = pm_dt.to_pydatetime()
        if not pm_dt:
            continue

        # Look at this month + adjacent months for date overlap
        ym = pm_dt.strftime("%Y-%m")
        prev_ym = (pm_dt.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        next_ym = (pm_dt.replace(day=28) + timedelta(days=5)).strftime("%Y-%m")
        ksi_subset = ksi_by_ym.get(ym, []) + ksi_by_ym.get(prev_ym, []) + ksi_by_ym.get(next_ym, [])

        for k in ksi_subset:
            eval_count += 1
            score, rationale = score_pair(pm, k)
            score_hist[score] += 1
            if score >= 5:
                candidates.append({
                    "pm_condition_id": pm["condition_id"],
                    "pm_question": pm["question"],
                    "pm_category": pm["category"],
                    "pm_end_date": str(pm["end_date"]),
                    "pm_entry_yes_price_3d": pm.get("entry_yes_price_3d"),
                    "pm_volume_num": pm.get("volume_num"),
                    "pm_outcome_yes_won": int(pm["outcome_yes_won"]) if pd.notna(pm.get("outcome_yes_won")) else None,
                    "ksi_ticker": k.get("ticker"),
                    "ksi_event_ticker": k.get("event_ticker"),
                    "ksi_series_ticker": k.get("series_ticker"),
                    "ksi_title": k.get("title"),
                    "ksi_yes_sub_title": k.get("yes_sub_title"),
                    "ksi_close_time": k.get("close_time"),
                    "ksi_status": k.get("status"),
                    "ksi_result": k.get("result"),
                    "ksi_yes_bid": k.get("yes_bid"),
                    "ksi_yes_ask": k.get("yes_ask"),
                    "ksi_volume": k.get("volume"),
                    "ksi_volume_24h": k.get("volume_24h"),
                    "ksi_liquidity": k.get("liquidity"),
                    "score": score,
                    "score_rationale": rationale,
                })

    print(f"Pass 1: evaluated {eval_count} pairs in {time.time()-t0:.1f}s", flush=True)
    print(f"Pass 1: {len(candidates)} candidates with score>=5", flush=True)
    print(f"Score histogram: {dict(sorted(score_hist.items()))}", flush=True)

    with (OUT_DIR / "pass1_candidates.jsonl").open("w") as f:
        for c in candidates:
            f.write(json.dumps(c, default=str) + "\n")

    with (OUT_DIR / "pass1_stats.json").open("w") as f:
        json.dump({
            "n_pm_markets": len(pm_df),
            "n_ksi_markets": len(ksi),
            "n_pair_evaluations": eval_count,
            "n_candidates_score_ge_5": len(candidates),
            "score_histogram": dict(sorted(score_hist.items())),
        }, f, indent=2)

    # Pass 2
    survivors = []
    rejected = []
    rejection_reasons = Counter()

    for c in candidates:
        # rebuild objects
        pm_obj = {"question": c["pm_question"], "end_date": c["pm_end_date"], "ticker_or_event": ""}
        ksi_obj = {"title": c["ksi_title"], "subtitle": "", "yes_sub_title": c["ksi_yes_sub_title"], "close_time": c["ksi_close_time"]}
        status, classification, reason = pass2_check(pm_obj, ksi_obj)
        c["pass2_classification"] = classification
        c["pass2_reason"] = reason
        c["pass2_status"] = status
        if status == "kept":
            survivors.append(c)
        else:
            rejected.append(c)
            rejection_reasons[reason] += 1

    print(f"Pass 2: {len(survivors)} survivors / {len(rejected)} rejected", flush=True)
    print(f"Rejection reasons: {dict(rejection_reasons.most_common())}", flush=True)

    with (OUT_DIR / "pass2_survivors.jsonl").open("w") as f:
        for s in survivors:
            f.write(json.dumps(s, default=str) + "\n")
    with (OUT_DIR / "pass2_rejected.jsonl").open("w") as f:
        for r in rejected:
            f.write(json.dumps(r, default=str) + "\n")

    with (OUT_DIR / "pass2_stats.json").open("w") as f:
        json.dump({
            "n_pass1_candidates": len(candidates),
            "n_pass2_survivors": len(survivors),
            "n_pass2_rejected": len(rejected),
            "rejection_reasons": dict(rejection_reasons.most_common()),
        }, f, indent=2)

    print(f"Done in {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
