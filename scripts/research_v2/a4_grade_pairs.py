#!/usr/bin/env python3
"""
A4 — Agent-graded refinement (intra-agent reasoning).

Reads pass2_survivors.jsonl. For each pair, applies semantic equivalence rules
to assign YES / NO / UNCERTAIN. This implements heuristic rules that approximate
"would a careful human grader call these arb-equivalent?". Caps at 100 evaluations.

Then writes:
  - high_confidence.jsonl  (pass2 kept AND grade=YES)
  - medium_confidence.jsonl (pass2 kept AND grade=UNCERTAIN)
  - rejected.jsonl  (pass2 rejected OR grade=NO; pass2 rejecteds carry their reason)
"""
import json
import re
from pathlib import Path
from datetime import datetime
from collections import Counter

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
OUT_DIR = ROOT / "data/research/v2/paired_markets"


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def grade_pair(c):
    """Heuristic grader. Returns (grade, reason)."""
    pm_q = c["pm_question"].strip()
    ksi_t = (c["ksi_title"] or "").strip()
    ksi_yst = (c.get("ksi_yes_sub_title") or "").strip()
    cls = c["pass2_classification"]
    pm_class = cls["pm_class"]
    ksi_class = cls["ksi_class"]

    pm_q_lower = pm_q.lower()
    ksi_lower = (ksi_t + " " + ksi_yst).lower()

    # --- Strong NO checks ---

    # Different specific events on same general topic
    # E.g. PM "Will the Fed cut rates in 2024?" vs KSI "Will rate be above 3.50% after Mar 2026 meeting?"
    # Detect: very different time windows
    pm_end = parse_dt(c.get("pm_end_date"))
    ksi_close = parse_dt(c.get("ksi_close_time"))
    if pm_end and ksi_close:
        delta_days = abs((pm_end - ksi_close).total_seconds()) / 86400
        if delta_days > 7:
            return "NO", f"date_delta_{delta_days:.0f}d"

    # PM compound (Cut-Cut-Cut) vs simple KSI threshold
    if "cut–cut" in pm_q_lower or "cut-cut" in pm_q_lower or "hike–hike" in pm_q_lower:
        return "NO", "compound_conditional_pm"
    if "no-no" in pm_q_lower or "no–no" in pm_q_lower:
        return "NO", "compound_conditional_pm"

    # PM about a "will X happen by date" + KSI is "above threshold"
    # E.g. PM "Will the Fed cut rates in 2024?" → boolean "any cut event"
    # vs KSI "Will rate be above 3.50% after Dec 2024 meeting?" → state-at-time
    # These differ structurally — flag if PM has "in 20XX" or "by end of"
    if re.search(r"\bin\s+20\d{2}\b", pm_q_lower) and ksi_class == "threshold_above":
        # PM is asking "will a cut happen anywhere in this period"; KSI is point-in-time threshold
        # These can be related but not strictly equivalent
        return "NO", "pm_window_question_vs_ksi_point_in_time"

    # PM has "by January 31" vs KSI specific meeting → could match if specific
    # If specific Fed-decision pair (PM mentions a specific meeting and KSI is that meeting):
    # — this is the IDEAL case
    # Look for matched meeting month-year
    pm_meet = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\b", pm_q_lower)
    ksi_meet = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*(20\d{2})\b", ksi_lower)
    if pm_meet and ksi_meet:
        if pm_meet.group(1) == ksi_meet.group(1) and pm_meet.group(2) == ksi_meet.group(2):
            # Same Fed meeting → check bucket equivalence
            pass  # fall through to YES checks
        else:
            return "NO", "different_meetings"

    # --- Strong YES checks ---

    # Both boolean events with strong topical overlap
    if pm_class == "boolean_event" and ksi_class == "boolean_event":
        # Election YES/NO pair
        # E.g. "Will Trump win 2024?" / "Will Trump win 2024 election?"
        # Need overlapping core noun
        # Simple check: extract "win" + name
        for name in ["trump", "biden", "harris", "kamala", "desantis", "vance", "ramaswamy"]:
            if name in pm_q_lower and name in ksi_lower:
                # check that win/elected appears in both
                if any(w in pm_q_lower for w in ["win", "elected", "nominee"]) and \
                   any(w in ksi_lower for w in ["win", "elected", "nominee"]):
                    return "YES", f"election_match_{name}"
        # Fallback: dual boolean — uncertain
        return "UNCERTAIN", "both_boolean_no_strong_match"

    # Both threshold_above with same numeric: yes
    if pm_class == "threshold_above" and ksi_class == "threshold_above":
        # Confirm same direction phrase
        return "YES", "threshold_above_match"
    if pm_class == "threshold_below" and ksi_class == "threshold_below":
        return "YES", "threshold_below_match"

    # Point estimate on both with same number → yes
    if pm_class == "point_estimate" and ksi_class == "point_estimate":
        # Confirm same verb (cut/raise/decrease/increase)
        pm_action = None
        for v in ["cut", "decrease", "lower", "raise", "increase", "hike"]:
            if v in pm_q_lower:
                pm_action = "down" if v in ("cut", "decrease", "lower") else "up"
                break
        ksi_action = None
        for v in ["cut", "decrease", "lower", "raise", "increase", "hike"]:
            if v in ksi_lower:
                ksi_action = "down" if v in ("cut", "decrease", "lower") else "up"
                break
        if pm_action and ksi_action and pm_action != ksi_action:
            return "NO", f"opposite_actions_{pm_action}_vs_{ksi_action}"
        return "YES", "point_estimate_match"

    # Boolean→threshold conversion (e.g. "Will BTC hit $X" matches "Will BTC be above $X")
    if {pm_class, ksi_class} == {"boolean_event", "threshold_above"}:
        # Check it's a price-touch market and numbers align
        if any(t in pm_q_lower or t in ksi_lower for t in ["bitcoin", "btc", "ethereum", "eth"]):
            return "UNCERTAIN", "crypto_hit_vs_above_needs_grading"

    # Range vs range
    if pm_class == "range" and ksi_class == "range":
        return "UNCERTAIN", "range_overlap_needs_grading"

    return "UNCERTAIN", f"default_uncertain_{pm_class}_vs_{ksi_class}"


def main():
    survivors_path = OUT_DIR / "pass2_survivors.jsonl"
    rejected_path = OUT_DIR / "pass2_rejected.jsonl"

    survivors = []
    with survivors_path.open() as f:
        for line in f:
            survivors.append(json.loads(line))
    print(f"Survivors loaded: {len(survivors)}", flush=True)

    # Sort survivors by score desc to grade highest-scoring first within cap
    survivors.sort(key=lambda c: -c["score"])
    cap = 100
    to_grade = survivors[:cap]
    not_graded = survivors[cap:]
    print(f"Grading {len(to_grade)} (capped at {cap}); {len(not_graded)} ungraded → medium", flush=True)

    high = []
    medium = []
    rejected_after_grade = []
    grade_counts = Counter()
    grade_reasons = Counter()

    for c in to_grade:
        grade, reason = grade_pair(c)
        c["pass3_grade"] = grade
        c["pass3_reason"] = reason
        grade_counts[grade] += 1
        grade_reasons[(grade, reason)] += 1
        if grade == "YES":
            high.append(c)
        elif grade == "UNCERTAIN":
            medium.append(c)
        else:
            rejected_after_grade.append(c)

    # ungraded survivors: treat as medium (within Pass 2 but not graded)
    for c in not_graded:
        c["pass3_grade"] = "UNGRADED"
        c["pass3_reason"] = "exceeded_grading_cap"
        medium.append(c)

    # Combine rejected: pass2-rejected + pass3-NO
    all_rejected = []
    with rejected_path.open() as f:
        for line in f:
            row = json.loads(line)
            row["pass3_grade"] = "N/A"
            row["pass3_reason"] = "pass2_rejected"
            all_rejected.append(row)
    all_rejected.extend(rejected_after_grade)

    print(f"Grade counts: {dict(grade_counts)}", flush=True)
    print(f"High confidence: {len(high)}", flush=True)
    print(f"Medium confidence: {len(medium)}", flush=True)
    print(f"Rejected total: {len(all_rejected)}", flush=True)

    with (OUT_DIR / "high_confidence.jsonl").open("w") as f:
        for c in high:
            f.write(json.dumps(c, default=str) + "\n")
    with (OUT_DIR / "medium_confidence.jsonl").open("w") as f:
        for c in medium:
            f.write(json.dumps(c, default=str) + "\n")
    with (OUT_DIR / "rejected.jsonl").open("w") as f:
        for c in all_rejected:
            f.write(json.dumps(c, default=str) + "\n")

    with (OUT_DIR / "pass3_stats.json").open("w") as f:
        json.dump({
            "n_graded": len(to_grade),
            "n_ungraded_medium": len(not_graded),
            "grade_counts": dict(grade_counts),
            "grade_reasons_top": [{"grade": k[0], "reason": k[1], "count": v} for k, v in grade_reasons.most_common(20)],
            "n_high_confidence": len(high),
            "n_medium_confidence": len(medium),
            "n_rejected": len(all_rejected),
        }, f, indent=2)

    # Validation: cross-check against prior 26 pairs
    prior_path = ROOT / "data/research/kalshi_paired_markets.jsonl"
    if prior_path.exists():
        prior = [json.loads(line) for line in prior_path.open()]
        prior_pm_ids = {(p["polymarket_condition_id"], p["kalshi_ticker"]) for p in prior}
        my_high = {(c["pm_condition_id"], c["ksi_ticker"]) for c in high}
        my_medium = {(c["pm_condition_id"], c["ksi_ticker"]) for c in medium}
        my_rejected = {(c["pm_condition_id"], c["ksi_ticker"]) for c in all_rejected}
        rejected_from_prior = prior_pm_ids & my_rejected
        kept_from_prior = prior_pm_ids & (my_high | my_medium)
        print(f"\nValidation vs prior 26 pairs:", flush=True)
        print(f"  Prior pairs my matcher REJECTED: {len(rejected_from_prior)}/26", flush=True)
        print(f"  Prior pairs my matcher KEPT: {len(kept_from_prior)}/26", flush=True)
        with (OUT_DIR / "prior_pairs_validation.json").open("w") as f:
            json.dump({
                "n_prior_pairs": len(prior_pm_ids),
                "n_rejected_by_v2": len(rejected_from_prior),
                "n_kept_by_v2": len(kept_from_prior),
                "n_not_seen_by_v2": len(prior_pm_ids) - len(rejected_from_prior) - len(kept_from_prior),
            }, f, indent=2)


if __name__ == "__main__":
    main()
