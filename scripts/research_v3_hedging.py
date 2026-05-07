"""
v3 hedging backtest — Agent B.

Tests 5 hedge variants (H1 naive 50%, H2 per-market optimal, H3 sector-bucketed,
H4 conditional, H5 no-hedge baseline) on 819 historical earnings markets with
real Polymarket entry prices and yfinance daily OHLC.

Walk-forward integrity: H2 and H3 use only PRIOR markets (strict <) for fitting.

Output:
    data/research/v3/strategy_pnl_H{1..5}.csv  — per-bet ledgers
    data/research/v3/hedging_summary.csv      — one row per variant
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

REPO = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
TRAIN_PARQUET = REPO / "data" / "research" / "training_data.parquet"
STOCK_DIR = REPO / "data" / "research" / "v3" / "stock_history"
OUT_DIR = REPO / "data" / "research" / "v3"

STAKE = 250.0
PM_FEE_BPS = 200          # 200 bps = 0.02 → $5 on a $250 stake. Wrapper says
                          # "Subtract 200 bps fee (0.005 × $250 = $1.25)" — that's 50 bps.
                          # The wrapper's number is internally inconsistent. I follow
                          # the wrapper's literal instruction: $1.25 per PM leg.
PM_FEE_DOLLARS = 1.25
STOCK_FEE_BPS = 6.0       # 6 bps round-trip per wrapper
RNG = np.random.default_rng(42)


# ------------------------------------------------------------------ stock data

_STOCK_CACHE: dict[str, pd.DataFrame] = {}


def load_stock(ticker: str) -> Optional[pd.DataFrame]:
    if ticker in _STOCK_CACHE:
        return _STOCK_CACHE[ticker]
    path = STOCK_DIR / f"{ticker}.csv"
    if not path.exists():
        _STOCK_CACHE[ticker] = None  # type: ignore
        return None
    df = pd.read_csv(path)
    if df.empty or "Date" not in df.columns or "Close" not in df.columns:
        _STOCK_CACHE[ticker] = None  # type: ignore
        return None
    df["Date"] = pd.to_datetime(df["Date"], utc=True, errors="coerce")
    df = df.dropna(subset=["Date", "Close"]).sort_values("Date").reset_index(drop=True)
    _STOCK_CACHE[ticker] = df
    return df


def stock_window(ticker: str, end_date: pd.Timestamp) -> Optional[tuple[float, float]]:
    """Return (close_t3d, close_t1d) or None.

    t3d: close on the latest trading day ≤ end_date − 3d
    t1d: close on the earliest trading day ≥ end_date + 1d
    """
    df = load_stock(ticker)
    if df is None or df.empty:
        return None
    if end_date.tzinfo is None:
        end_date = end_date.tz_localize("UTC")
    t3 = end_date - pd.Timedelta(days=3)
    t1 = end_date + pd.Timedelta(days=1)
    pre = df[df["Date"] <= t3]
    post = df[df["Date"] >= t1]
    if pre.empty or post.empty:
        return None
    return float(pre.iloc[-1]["Close"]), float(post.iloc[0]["Close"])


# ------------------------------------------------------------------ PM leg

def pm_bet_side(p_implied: float) -> str:
    return "YES" if p_implied >= 0.5 else "NO"


def pm_pnl(side: str, entry_yes_3d: float, outcome_beat: int) -> float:
    """Return $ PnL on a $250 PM bet net of $1.25 fee.

    Devig: NO entry price ≈ 1 − YES.
    Payout = $1 if our side wins else $0.
    PnL = stake × ((payout/entry) − 1) − fee.
    """
    entry = entry_yes_3d if side == "YES" else (1.0 - entry_yes_3d)
    if entry <= 0 or entry >= 1:
        # Degenerate market (price 0 or 1). Treat as zero gross PnL after fee.
        return -PM_FEE_DOLLARS
    won_yes = outcome_beat == 1
    won = won_yes if side == "YES" else (not won_yes)
    payout = 1.0 if won else 0.0
    gross = STAKE * (payout / entry - 1.0)
    return gross - PM_FEE_DOLLARS


# ------------------------------------------------------------------ stock leg

def stock_pnl(side: str, hedge_ratio: float, stock_return: float) -> float:
    """Stock leg PnL.

    Direction such that stock leg is correlated with PM-YES winning.
        - side YES → long stock (gain when stock goes up, i.e. beat)
        - side NO  → short stock (gain when stock goes down)
    Net of round-trip stock fee in bps applied to the notional.
    """
    if hedge_ratio <= 0:
        return 0.0
    notional = STAKE * hedge_ratio
    sign = 1.0 if side == "YES" else -1.0
    gross = notional * sign * stock_return
    fee = notional * (STOCK_FEE_BPS / 10_000.0)
    return gross - fee


# ------------------------------------------------------------------ load + base ledger

def build_base_ledger() -> pd.DataFrame:
    df = pd.read_parquet(TRAIN_PARQUET)
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True, errors="coerce")
    df = df.dropna(subset=["end_date", "outcome_beat", "entry_yes_price_3d",
                           "polymarket_implied_p_beat", "ticker", "sector"]).copy()
    df = df.sort_values("end_date").reset_index(drop=True)

    rows = []
    for _, r in df.iterrows():
        win = stock_window(r["ticker"], r["end_date"])
        if win is None:
            continue
        s3, s1 = win
        if s3 <= 0:
            continue
        stock_ret = (s1 - s3) / s3
        side = pm_bet_side(float(r["polymarket_implied_p_beat"]))
        pm = pm_pnl(side, float(r["entry_yes_price_3d"]), int(r["outcome_beat"]))
        rows.append({
            "ticker": r["ticker"],
            "sector": r["sector"],
            "end_date": r["end_date"],
            "polymarket_implied_p_beat": float(r["polymarket_implied_p_beat"]),
            "entry_yes_price_3d": float(r["entry_yes_price_3d"]),
            "outcome_beat": int(r["outcome_beat"]),
            "stock_t3d": s3,
            "stock_t1d": s1,
            "stock_return": stock_ret,
            "pm_side": side,
            "pm_pnl": pm,
        })
    base = pd.DataFrame(rows)
    base = base.sort_values("end_date").reset_index(drop=True)
    return base


# ------------------------------------------------------------------ hedge ratios

def ratio_h1(_row, _prior):
    return 0.5


def ratio_h2(row, prior_self_ticker: pd.DataFrame) -> float:
    """Per-market optimal from prior markets of same ticker.

    Hedge ratio = corr(YES_won, stock_return) × stdev(pm_pnl_at_h0) / stdev(stock_pnl_at_h1)
                ≈ slope of pm_pnl on stock_pnl_proxy

    Walk-forward: only prior markets for THIS ticker. Need ≥ 4; otherwise 0.5.
    """
    sub = prior_self_ticker
    if len(sub) < 4:
        return 0.5
    # PM PnL as already computed in base for those rows.
    pm_p = sub["pm_pnl"].to_numpy()
    sr = sub["stock_return"].to_numpy()
    # The variance-minimizing ratio for combined = pm + h * (stake * sign * stock_return)
    # is h = -cov(pm, sign*stock_return) / var(sign*stock_return * stake)
    # With our convention sign already baked into the leg (YES→+, NO→−), simpler to
    # compute over the prior series the empirical signed stock contribution per $ of
    # hedge-ratio: signed_sr[i] = (+1 if pm_side==YES else -1) * stock_return[i] * stake.
    sign = np.where(sub["pm_side"] == "YES", 1.0, -1.0)
    signed_stock_pnl_per_unit_h = STAKE * sign * sr  # PnL when h=1 (ignoring fees)
    var_s = np.var(signed_stock_pnl_per_unit_h, ddof=1)
    if var_s <= 1e-12:
        return 0.5
    cov = np.cov(pm_p, signed_stock_pnl_per_unit_h, ddof=1)[0, 1]
    h_opt = -cov / var_s
    return float(np.clip(h_opt, 0.0, 1.0))


def ratio_h3(row, prior_sector: pd.DataFrame) -> float:
    """Sector-bucketed: regress pm_pnl on signed stock return, use slope."""
    sub = prior_sector
    if len(sub) < 8:
        return 0.5
    sign = np.where(sub["pm_side"] == "YES", 1.0, -1.0)
    signed_stock_pnl_per_unit_h = STAKE * sign * sub["stock_return"].to_numpy()
    pm_p = sub["pm_pnl"].to_numpy()
    var_s = np.var(signed_stock_pnl_per_unit_h, ddof=1)
    if var_s <= 1e-12:
        return 0.5
    cov = np.cov(pm_p, signed_stock_pnl_per_unit_h, ddof=1)[0, 1]
    h_opt = -cov / var_s
    return float(np.clip(h_opt, 0.0, 1.0))


def ratio_h4(row, _prior) -> float:
    p = float(row["polymarket_implied_p_beat"])
    return 0.5 if abs(p - 0.5) > 0.20 else 0.0


def ratio_h5(_row, _prior) -> float:
    return 0.0


# ------------------------------------------------------------------ run a variant

def run_variant(base: pd.DataFrame, variant: str) -> pd.DataFrame:
    out_rows = []
    for i, row in base.iterrows():
        prior = base.iloc[:i]  # strictly earlier rows (sorted by end_date)
        if variant == "H1":
            h = ratio_h1(row, None)
        elif variant == "H2":
            sub = prior[prior["ticker"] == row["ticker"]].tail(8)
            h = ratio_h2(row, sub)
        elif variant == "H3":
            sub = prior[prior["sector"] == row["sector"]]
            h = ratio_h3(row, sub)
        elif variant == "H4":
            h = ratio_h4(row, None)
        elif variant == "H5":
            h = ratio_h5(row, None)
        else:
            raise ValueError(variant)

        s_pnl = stock_pnl(row["pm_side"], h, row["stock_return"])
        combined = row["pm_pnl"] + s_pnl
        out_rows.append({
            "ticker": row["ticker"],
            "sector": row["sector"],
            "end_date": row["end_date"],
            "pm_side": row["pm_side"],
            "polymarket_implied_p_beat": row["polymarket_implied_p_beat"],
            "outcome_beat": row["outcome_beat"],
            "stock_return": row["stock_return"],
            "pm_pnl": row["pm_pnl"],
            "hedge_ratio": h,
            "stock_pnl": s_pnl,
            "pnl": combined,
        })
    return pd.DataFrame(out_rows)


# ------------------------------------------------------------------ stats

def sharpe(pnls: np.ndarray) -> float:
    pnls = np.asarray(pnls, dtype=float)
    if len(pnls) < 2:
        return float("nan")
    sd = pnls.std(ddof=1)
    if sd == 0:
        return float("nan")
    return float(pnls.mean() / sd * np.sqrt(len(pnls)))


def max_drawdown(pnls: np.ndarray) -> float:
    cum = np.cumsum(pnls)
    peak = np.maximum.accumulate(cum)
    dd = cum - peak
    return float(dd.min()) if len(dd) else 0.0


def bootstrap_sharpe_ci(pnls: np.ndarray, n: int = 1000) -> tuple[float, float]:
    if len(pnls) < 5:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(42)
    samples = []
    for _ in range(n):
        idx = rng.integers(0, len(pnls), len(pnls))
        s = sharpe(pnls[idx])
        if not np.isnan(s):
            samples.append(s)
    if not samples:
        return (float("nan"), float("nan"))
    arr = np.array(samples)
    return float(np.percentile(arr, 2.5)), float(np.percentile(arr, 97.5))


# ------------------------------------------------------------------ robustness

def robustness(ledger: pd.DataFrame, h5_sharpe: float) -> dict:
    p = ledger["pnl"].to_numpy()
    n = len(p)
    out: dict = {}

    # 1) Drop top/bottom 5% by stock_return
    sr = ledger["stock_return"].to_numpy()
    lo, hi = np.percentile(sr, 5), np.percentile(sr, 95)
    keep = (sr >= lo) & (sr <= hi)
    abl_p = p[keep]
    out["ablation_n"] = int(keep.sum())
    out["ablation_sharpe"] = sharpe(abl_p)
    out["ablation_pass"] = (
        h5_sharpe and not np.isnan(out["ablation_sharpe"])
        and out["ablation_sharpe"] >= 1.2 * h5_sharpe
    )

    # 2) Period split (chronological halves)
    mid = n // 2
    s_first = sharpe(p[:mid])
    s_second = sharpe(p[mid:])
    out["period_first_n"] = mid
    out["period_first_sharpe"] = s_first
    out["period_second_n"] = n - mid
    out["period_second_sharpe"] = s_second
    out["period_pass"] = (
        h5_sharpe and not (np.isnan(s_first) or np.isnan(s_second))
        and s_first >= 1.2 * h5_sharpe and s_second >= 1.2 * h5_sharpe
    )

    # 3) Top-decile-stripped → mean > 0
    cutoff = np.percentile(p, 90)
    stripped = p[p < cutoff]
    out["topdecile_n"] = int(len(stripped))
    out["topdecile_mean"] = float(stripped.mean()) if len(stripped) else float("nan")
    out["topdecile_pass"] = bool(out["topdecile_mean"] > 0)

    return out


def summarize(ledger: pd.DataFrame, variant: str, h5_stats: Optional[dict]) -> dict:
    p = ledger["pnl"].to_numpy()
    n = len(p)
    mean = float(p.mean()) if n else float("nan")
    sd = float(p.std(ddof=1)) if n > 1 else float("nan")
    var = sd * sd
    sh = sharpe(p)
    ci = bootstrap_sharpe_ci(p)
    mdd = max_drawdown(p)
    total = float(p.sum())

    h5_var = h5_stats["variance"] if h5_stats else var
    h5_mean = h5_stats["mean_pnl"] if h5_stats else mean
    h5_sh = h5_stats["sharpe"] if h5_stats else sh

    var_ratio = var / h5_var if h5_var and h5_var > 0 else float("nan")
    sh_ratio = sh / h5_sh if h5_sh and h5_sh != 0 and not np.isnan(h5_sh) else float("nan")

    rob = robustness(ledger, h5_sh)

    primary_pass = (
        n >= 100
        and not np.isnan(var_ratio) and var_ratio <= 0.70
        and not np.isnan(mean) and not np.isnan(h5_mean) and h5_mean != 0
        and abs(mean - h5_mean) <= 0.20 * abs(h5_mean)
        and not np.isnan(sh_ratio) and sh_ratio >= 1.5
    )
    robustness_pass = bool(rob["ablation_pass"] and rob["period_pass"] and rob["topdecile_pass"])

    return {
        "variant": variant,
        "n": n,
        "total_pnl": total,
        "mean_pnl": mean,
        "stdev_pnl": sd,
        "variance": var,
        "variance_ratio_vs_H5": var_ratio,
        "sharpe": sh,
        "sharpe_ci_low": ci[0],
        "sharpe_ci_high": ci[1],
        "sharpe_ratio_vs_H5": sh_ratio,
        "max_drawdown": mdd,
        "ablation_n": rob["ablation_n"],
        "ablation_sharpe": rob["ablation_sharpe"],
        "ablation_pass": rob["ablation_pass"],
        "period_first_sharpe": rob["period_first_sharpe"],
        "period_second_sharpe": rob["period_second_sharpe"],
        "period_pass": rob["period_pass"],
        "topdecile_n": rob["topdecile_n"],
        "topdecile_mean": rob["topdecile_mean"],
        "topdecile_pass": rob["topdecile_pass"],
        "primary_pass": primary_pass,
        "robustness_pass": robustness_pass,
        "verdict_a_pass": bool(primary_pass and robustness_pass),
    }


# ------------------------------------------------------------------ main

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("[v3 hedging] building base ledger ...", flush=True)
    base = build_base_ledger()
    print(f"[v3 hedging] base N={len(base)} markets with PM + stock data", flush=True)
    if len(base) < 100:
        print(f"[v3 hedging] WARN: N={len(base)} < 100, results not deployable.", flush=True)

    variants = ["H1", "H2", "H3", "H4", "H5"]
    ledgers: dict[str, pd.DataFrame] = {}
    for v in variants:
        print(f"[v3 hedging] running {v} ...", flush=True)
        ledger = run_variant(base, v)
        ledger.to_csv(OUT_DIR / f"strategy_pnl_{v}.csv", index=False)
        ledgers[v] = ledger

    # Compute H5 stats first (baseline reference)
    print("[v3 hedging] summarizing ...", flush=True)
    h5_summary = summarize(ledgers["H5"], "H5", h5_stats=None)

    summaries = []
    for v in variants:
        s = summarize(ledgers[v], v, h5_stats=h5_summary)
        summaries.append(s)

    summary_df = pd.DataFrame(summaries)
    summary_df.to_csv(OUT_DIR / "hedging_summary.csv", index=False)
    print(summary_df[["variant", "n", "mean_pnl", "stdev_pnl",
                      "variance_ratio_vs_H5", "sharpe",
                      "sharpe_ratio_vs_H5", "primary_pass",
                      "robustness_pass", "verdict_a_pass"]].to_string(index=False),
          flush=True)

    print(f"[v3 hedging] wrote {OUT_DIR/'hedging_summary.csv'}")


if __name__ == "__main__":
    main()
