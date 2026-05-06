#!/usr/bin/env python3
"""Build the training dataset and per-market entry annotations.

Reads:
  data/research/earnings_markets_raw.json
  data/research/clob_history/<condition_id>.json
  data/research/av_earnings/<TICKER>.json

Writes:
  data/research/training_data.parquet
  data/research/training_data.csv
  data/research/earnings_markets_with_entry.jsonl  (model_p_beat=null at this stage)
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean, stdev

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/research/earnings_markets_raw.json"
CLOB_DIR = ROOT / "data/research/clob_history"
AV_DIR = ROOT / "data/research/av_earnings"
OUT_PARQ = ROOT / "data/research/training_data.parquet"
OUT_CSV = ROOT / "data/research/training_data.csv"
OUT_JSONL = ROOT / "data/research/earnings_markets_with_entry.jsonl"

SECTOR_MAP = {
    "NVDA": "Semis", "AMD": "Semis", "AVGO": "Semis", "MU": "Semis", "TSM": "Semis",
    "INTC": "Semis", "QCOM": "Semis", "TXN": "Semis", "ARM": "Semis",
    "AAPL": "BigTech", "MSFT": "BigTech", "GOOGL": "BigTech", "GOOG": "BigTech",
    "META": "BigTech", "AMZN": "BigTech", "NFLX": "BigTech",
    "JPM": "Banks", "BAC": "Banks", "WFC": "Banks", "C": "Banks", "GS": "Banks",
    "MS": "Banks", "USB": "Banks", "PNC": "Banks", "RJF": "Banks",
    "TSLA": "AutoEV", "F": "AutoEV", "GM": "AutoEV", "RIVN": "AutoEV", "LCID": "AutoEV",
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy", "OXY": "Energy", "SLB": "Energy",
    "HAL": "Energy",
    "GIS": "Staples", "PEP": "Staples", "KO": "Staples", "PG": "Staples", "CL": "Staples",
    "WMT": "Staples", "COST": "Staples", "TGT": "Staples", "KMX": "Staples",
    "FDX": "Industrials", "UPS": "Industrials", "DAL": "Industrials", "UAL": "Industrials",
    "AAL": "Industrials", "LUV": "Industrials", "BA": "Industrials", "CAT": "Industrials",
    "DE": "Industrials", "GE": "Industrials",
    "NKE": "Consumer", "DPZ": "Consumer", "MCD": "Consumer", "SBUX": "Consumer",
    "CMG": "Consumer", "BKNG": "Consumer", "ABNB": "Consumer", "DIS": "Consumer",
    "ACN": "TechServices", "FDS": "TechServices", "ORCL": "TechServices",
    "IBM": "TechServices", "CRM": "TechServices", "NOW": "TechServices",
    "ADBE": "TechServices",
    "JNJ": "Pharma", "PFE": "Pharma", "MRK": "Pharma", "LLY": "Pharma",
    "ABBV": "Pharma", "BMY": "Pharma", "AMGN": "Pharma",
}


def parse_iso_z(s):
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def price_at_or_before(history, target_dt):
    """Return last point with t <= target_dt, else None."""
    target_ts = target_dt.timestamp()
    last_p = None
    for pt in history:
        t = pt.get("t")
        p = pt.get("p")
        if t is None or p is None:
            continue
        if t <= target_ts:
            last_p = p
        else:
            break
    return last_p


def load_av_quarters_lookup():
    """Returns {ticker: [(reportedDate, beat_flag, surprise_pct), ...]} sorted asc."""
    out = {}
    for fp in AV_DIR.glob("*.json"):
        tkr = fp.stem
        try:
            data = json.loads(fp.read_text())
        except Exception:
            continue
        if "quarterlyEarnings" not in data:
            continue  # likely a throttle envelope
        rows = []
        for q in data["quarterlyEarnings"]:
            try:
                rd = q.get("reportedDate")
                if not rd:
                    continue
                rd_dt = datetime.fromisoformat(rd).replace(tzinfo=timezone.utc)
                rep = q.get("reportedEPS")
                est = q.get("estimatedEPS")
                if rep in (None, "None", ""):
                    continue
                rep_f = float(rep)
                est_f = float(est) if est not in (None, "None", "") else None
                beat = (1 if (est_f is not None and rep_f > est_f) else 0
                        if est_f is not None else None)
                sp = q.get("surprisePercentage")
                sp_f = (float(sp) if sp not in (None, "None", "") else None)
                rows.append((rd_dt, beat, sp_f))
            except Exception:
                continue
        rows.sort(key=lambda r: r[0])
        out[tkr] = rows
    return out


def main():
    markets = json.loads(RAW.read_text())
    av_lookup = load_av_quarters_lookup()
    print(f"AV tickers loaded: {len(av_lookup)}", flush=True)

    # First pass: build per-market base records (entry prices + outcome + sector).
    rows = []
    drop_no_clob = 0
    drop_no_history = 0
    drop_no_t3d = 0
    drop_bad_window = 0

    for m in markets:
        tkr = m.get("ticker")
        if not tkr or not m.get("clob_token_ids_raw"):
            continue
        cid = m["condition_id"]
        clob_path = CLOB_DIR / f"{cid}.json"
        if not clob_path.exists():
            drop_no_clob += 1
            continue
        try:
            hist = json.loads(clob_path.read_text()).get("history", [])
        except Exception:
            drop_no_history += 1
            continue
        if not hist:
            drop_no_history += 1
            continue
        try:
            end_dt = parse_iso_z(m["end_date"])
        except Exception:
            drop_bad_window += 1
            continue

        # Entry prices
        p3 = price_at_or_before(hist, end_dt - timedelta(days=3))
        p7 = price_at_or_before(hist, end_dt - timedelta(days=7))
        p1 = price_at_or_before(hist, end_dt - timedelta(days=1))

        if p3 is None:
            # Fallback: if first history point is within 3-7d of end, use first point as
            # earliest available entry. But brief says skip if no T-3d entry — be strict.
            drop_no_t3d += 1
            continue

        # Outcome
        try:
            ops = json.loads(m["outcome_prices_raw"])
            outcome_beat = 1 if ops[0] == "1" else 0
        except Exception:
            continue

        # Diagnostics
        n_pts = len(hist)
        first_t = hist[0]["t"]
        last_t = hist[-1]["t"]
        trading_window_days = (last_t - first_t) / 86400.0

        sector = SECTOR_MAP.get(tkr, "Other")

        # AV-derived features (walk-forward: only quarters with reportedDate < end_dt)
        lagged_beat_rate_8q = None
        surprise_mean_8q = None
        surprise_stdev_8q = None
        quarters_since_last_miss = None
        if tkr in av_lookup:
            past = [q for q in av_lookup[tkr] if q[0] < end_dt]
            past = past[-8:]  # last 8 reported before end_dt
            if past:
                beats = [q[1] for q in past if q[1] is not None]
                surprises = [q[2] for q in past if q[2] is not None]
                if beats:
                    lagged_beat_rate_8q = sum(beats) / len(beats)
                if len(surprises) >= 1:
                    surprise_mean_8q = float(np.mean(surprises))
                if len(surprises) >= 2:
                    surprise_stdev_8q = float(np.std(surprises, ddof=1))
                # quarters_since_last_miss: count consecutive most-recent beats
                # before the first miss (None or 0). Walk past in reverse.
                consec = 0
                for q in reversed(past):
                    if q[1] == 1:
                        consec += 1
                    else:
                        break
                quarters_since_last_miss = consec

        rows.append({
            "condition_id": cid,
            "ticker": tkr,
            "end_date": end_dt.isoformat(),
            "end_date_dt": end_dt,
            "sector": sector,
            "outcome_beat": outcome_beat,
            "entry_yes_price_3d": p3,
            "entry_yes_price_7d": p7,
            "entry_yes_price_1d": p1,
            "polymarket_implied_p_beat": p3,  # entry at T-3d
            "lagged_beat_rate_8q": lagged_beat_rate_8q,
            "surprise_mean_8q": surprise_mean_8q,
            "surprise_stdev_8q": surprise_stdev_8q,
            "quarters_since_last_miss": quarters_since_last_miss,
            "n_history_points": n_pts,
            "trading_window_days": trading_window_days,
        })

    print(f"DROPS: no_clob={drop_no_clob} no_history={drop_no_history} "
          f"no_t3d={drop_no_t3d} bad_window={drop_bad_window}", flush=True)

    df = pd.DataFrame(rows)
    print(f"BASE rows: {len(df)}", flush=True)

    # Walk-forward sector_beat_rate_prior_8q.
    # For each market m, compute mean(outcome_beat) across markets in same sector
    # where end_date < m.end_date (using up to last 8 such markets).
    df = df.sort_values("end_date_dt").reset_index(drop=True)
    sector_history = {sec: [] for sec in df["sector"].unique()}
    sbr = []
    for _, r in df.iterrows():
        hist = sector_history[r["sector"]]
        last8 = hist[-8:]
        sbr.append(float(np.mean(last8)) if last8 else None)
        sector_history[r["sector"]].append(r["outcome_beat"])
    df["sector_beat_rate_prior_8q"] = sbr

    # Drop the helper col before saving (keep iso end_date)
    df_save = df.drop(columns=["end_date_dt"])

    df_save.to_parquet(OUT_PARQ, index=False)
    df_save.to_csv(OUT_CSV, index=False)
    print(f"wrote {OUT_PARQ.name} and {OUT_CSV.name}: shape={df_save.shape}",
          flush=True)
    print("outcome_beat distribution:")
    print(df_save["outcome_beat"].value_counts())

    # Write JSONL with one row per market (model_p_beat=null at this stage; filled by
    # the model script).
    with OUT_JSONL.open("w") as fh:
        for _, r in df_save.iterrows():
            fh.write(json.dumps({
                "condition_id": r["condition_id"],
                "ticker": r["ticker"],
                "end_date": r["end_date"],
                "sector": r["sector"],
                "entry_yes_price_3d": r["entry_yes_price_3d"],
                "entry_yes_price_7d": (None if pd.isna(r["entry_yes_price_7d"])
                                       else r["entry_yes_price_7d"]),
                "entry_yes_price_1d": (None if pd.isna(r["entry_yes_price_1d"])
                                       else r["entry_yes_price_1d"]),
                "outcome_beat": int(r["outcome_beat"]),
                "polymarket_implied_p_beat": r["polymarket_implied_p_beat"],
                "model_p_beat": None,
                "trading_window_days": r["trading_window_days"],
                "n_history_points": int(r["n_history_points"]),
            }) + "\n")
    print(f"wrote {OUT_JSONL.name}: {len(df_save)} rows", flush=True)


if __name__ == "__main__":
    main()
