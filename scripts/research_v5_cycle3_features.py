#!/usr/bin/env python3
"""
v5 cycle 3 — pull FRED GPR daily file + join to geopolitics universe.

GPR Index source: https://www2.bc.edu/matteo-iacoviello/gpr_files/
- data_gpr_daily_recent.xls (recent decades, daily)
- alternative: gpr.csv if .xls fails

Output: data/research/v5/cycle_3/feature_data.parquet with columns:
  ...universe columns... + gpr_at_t-3d + gpr_at_t-7d + gpr_change_4d
"""
import urllib.request
import urllib.error
from datetime import timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
V5 = ROOT / "data" / "research" / "v5"
OUT = V5 / "cycle_3"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "earnings-edge-research/1.0"}


def fetch_gpr():
    """Fetch GPR daily series. Try multiple URLs."""
    urls = [
        ("xls", "https://matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls"),
        ("xls", "https://matteoiacoviello.com/gpr_files/data_gpr_export.xls"),
    ]
    for kind, url in urls:
        cache = OUT / f"gpr_daily.{kind}"
        if cache.exists() and cache.stat().st_size > 1000:
            print(f"[gpr] using cached {cache}", flush=True)
            return cache, kind
        try:
            print(f"[gpr] fetching {url} …", flush=True)
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            cache.write_bytes(data)
            print(f"[gpr] saved {len(data)} bytes to {cache}", flush=True)
            return cache, kind
        except urllib.error.HTTPError as e:
            print(f"[gpr] {url} → HTTP {e.code}", flush=True)
        except Exception as e:
            print(f"[gpr] {url} → {e}", flush=True)
    raise RuntimeError("All GPR URLs failed")


def load_gpr_series(path, kind):
    """Parse GPR file into a Series indexed by date."""
    if kind in ("xls", "xlsx"):
        # Try multiple sheet/column conventions
        try:
            df = pd.read_excel(path, sheet_name=0)
        except Exception as e:
            print(f"[gpr] excel load err: {e}", flush=True)
            raise
    else:
        df = pd.read_csv(path)
    print(f"[gpr] columns: {list(df.columns)[:10]}", flush=True)
    print(f"[gpr] shape: {df.shape}", flush=True)
    print(f"[gpr] head:\n{df.head().to_string()}", flush=True)

    # Find the date column — prefer ISO 'date' over integer 'DAY'
    date_col = None
    for c in df.columns:
        cl = str(c).lower()
        if cl == "date":
            date_col = c
            break
    if date_col is None:
        for c in df.columns:
            cl = str(c).lower()
            if "date" in cl or cl == "day" or cl == "month":
                date_col = c
                break
    if date_col is None:
        date_col = df.columns[0]

    gpr_col = None
    for c in df.columns:
        cl = str(c).lower()
        if cl in ("gpr", "gpr_d", "gprd", "gpr daily") or "gpr" == cl:
            gpr_col = c
            break
    if gpr_col is None:
        # Try second column or any numeric column
        for c in df.columns:
            if c == date_col: continue
            if pd.api.types.is_numeric_dtype(df[c]):
                gpr_col = c
                break

    print(f"[gpr] using date_col={date_col!r}, gpr_col={gpr_col!r}", flush=True)
    df = df[[date_col, gpr_col]].dropna()
    df.columns = ["date", "gpr"]
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)
    print(f"[gpr] series: {len(df)} obs from {df.date.min().date()} to {df.date.max().date()}", flush=True)
    return df


def main():
    path, kind = fetch_gpr()
    gpr_df = load_gpr_series(path, kind)

    # Build a daily-frequency lookup table; forward-fill to handle weekends/holidays
    full_idx = pd.date_range(gpr_df.date.min(), gpr_df.date.max(), freq="D", tz="UTC")
    gpr_series = gpr_df.set_index("date").gpr
    if gpr_series.index.tz is None:
        gpr_series.index = gpr_series.index.tz_localize("UTC")
    gpr_daily = gpr_series.reindex(full_idx).ffill()

    # Load universe
    uni = pd.read_parquet(V5 / "markets" / "universe.parquet")
    uni["end_date"] = pd.to_datetime(uni["end_date"], utc=True)

    print(f"[join] universe: {len(uni)} rows; gpr coverage: {gpr_daily.index.min().date()} → {gpr_daily.index.max().date()}", flush=True)

    # Compute features
    def lookup(d):
        d = d.normalize()  # midnight UTC
        if d in gpr_daily.index:
            return gpr_daily.loc[d]
        # If outside, ffill from nearest prior
        prior = gpr_daily.index[gpr_daily.index <= d]
        if len(prior) == 0:
            return None
        return gpr_daily.loc[prior[-1]]

    gpr_t3 = []
    gpr_t7 = []
    for end in uni.end_date:
        gpr_t3.append(lookup(end - timedelta(days=3)))
        gpr_t7.append(lookup(end - timedelta(days=7)))

    uni["gpr_t3"] = gpr_t3
    uni["gpr_t7"] = gpr_t7
    uni["gpr_change_4d"] = uni["gpr_t3"] - uni["gpr_t7"]

    coverage = uni["gpr_t3"].notna().sum()
    print(f"[join] gpr_t3 coverage: {coverage} / {len(uni)} = {coverage/len(uni)*100:.1f}%", flush=True)
    print(f"[join] gpr_t3 distribution: min={uni.gpr_t3.min():.1f} med={uni.gpr_t3.median():.1f} max={uni.gpr_t3.max():.1f}", flush=True)

    out = OUT / "feature_data.parquet"
    uni.to_parquet(out, index=False)
    uni.to_csv(OUT / "feature_data.csv", index=False)
    print(f"[join] wrote {out}", flush=True)


if __name__ == "__main__":
    main()
