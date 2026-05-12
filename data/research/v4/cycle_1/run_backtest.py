"""
v4 Cycle 1 — 36-cell backtest (Agent B)

3 cats (earnings, geopolitics, econ) × 3 tiers (<5K, 5-15K, 15-50K) × 4 strategies (S1-S4).
Walk-forward: rows sorted by end_date ascending; each bet uses only pre-resolution data.

Outputs:
  cells.parquet, per_bet_ledger.csv, RESULTS.md
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional, List, Tuple, Dict

import numpy as np
import pandas as pd

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
OUT = ROOT / "data/research/v4/cycle_1"
PARQUET = OUT / "all_markets_v4.parquet"

CLOB_DIRS = [
    ROOT / "data/research/clob_history",
    ROOT / "data/research/v4/cycle_1/geopolitics_clob",
    ROOT / "data/research/v4/cycle_1/geopolitics_lowvol_clob",
    ROOT / "data/research/v4/cycle_1/econ_full_clob",
]

STAKE = 50.0
FEE = 1.0  # 200 bps × 50

CATS = ["earnings", "geopolitics", "econ"]
TIERS = ["<5K", "5-15K", "15-50K"]
STRATS = ["S1", "S2", "S3", "S4"]

# Pass criteria from SESSION_CONFIG.md
PASS_SHARPE = 0.75
PASS_CI_LOW = 0.30
PASS_N = 80
PASS_MAXDD = 0.30  # 30% of starting capital

RNG = np.random.default_rng(20260506)


# ---------------- CLOB lookup ----------------
def build_clob_index() -> Dict[str, str]:
    idx: Dict[str, str] = {}
    for d in CLOB_DIRS:
        if not d.exists():
            continue
        for fn in os.listdir(d):
            if fn.endswith(".json"):
                cid = fn[:-5]
                if cid not in idx:
                    idx[cid] = str(d / fn)
    return idx


_clob_cache: Dict[str, List[Tuple[int, float]]] = {}


def load_history(path: str) -> List[Tuple[int, float]]:
    if path in _clob_cache:
        return _clob_cache[path]
    with open(path) as f:
        d = json.load(f)
    h = d.get("history", []) if isinstance(d, dict) else []
    out = [(int(p["t"]), float(p["p"])) for p in h if "t" in p and "p" in p]
    out.sort()
    _clob_cache[path] = out
    return out


def price_at_or_before(history: List[Tuple[int, float]], target_ts: int) -> Optional[float]:
    """Return last price at or before target_ts."""
    if not history:
        return None
    # binary search
    lo, hi = 0, len(history) - 1
    if history[0][0] > target_ts:
        return None
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if history[mid][0] <= target_ts:
            lo = mid
        else:
            hi = mid - 1
    return history[lo][1]


def history_window(
    history: List[Tuple[int, float]], start_ts: int, end_ts: int
) -> List[float]:
    return [p for (t, p) in history if start_ts <= t <= end_ts]


# ---------------- Bet calc ----------------
def compute_pnl(side: str, entry_price: float, outcome_yes_won: int) -> float:
    """Return P&L on a $50 stake net of $1 fee."""
    if side == "YES":
        if entry_price <= 0:
            return -STAKE - FEE  # impossible price, treat as loss
        shares = STAKE / entry_price
        payout = shares if outcome_yes_won == 1 else 0.0
    else:  # NO
        if entry_price >= 1:
            return -STAKE - FEE
        shares = STAKE / (1.0 - entry_price)
        payout = shares if outcome_yes_won == 0 else 0.0
    return payout - STAKE - FEE


# ---------------- Strategy filters ----------------
def strat_S1(row) -> Optional[str]:
    p = row["entry_yes_price_3d"]
    if pd.isna(p):
        return None
    if p > 0.85:
        return "NO"
    if p < 0.15:
        return "YES"
    return None


def strat_S2(row, clob_idx) -> Tuple[Optional[str], Optional[float]]:
    """Return (side, entry_price) — entry_price is yes_price_3d."""
    p3 = row["entry_yes_price_3d"]
    p7 = row["entry_yes_price_7d"]
    if pd.isna(p3):
        return None, None
    if pd.isna(p7):
        # Try CLOB lookup
        cid = row["condition_id"]
        path = clob_idx.get(cid)
        if path is None:
            return None, None
        hist = load_history(path)
        if not hist:
            return None, None
        end_ts = int(row["end_date"].timestamp())
        target = end_ts - 7 * 86400
        p7 = price_at_or_before(hist, target)
        if p7 is None:
            return None, None
    drift = p3 - p7
    if drift >= 0.10:
        return "NO", p3
    if drift <= -0.10:
        return "YES", p3
    return None, None


def strat_S3(row, clob_idx) -> Optional[str]:
    p3 = row["entry_yes_price_3d"]
    if pd.isna(p3) or p3 <= 0.05 or p3 >= 0.95:
        return None
    cid = row["condition_id"]
    path = clob_idx.get(cid)
    if path is None:
        return None
    hist = load_history(path)
    if not hist:
        return None
    end_ts = int(row["end_date"].timestamp())
    # Window: T-6d to T-3d (the prior 3 days before the entry snapshot at T-3d)
    win = history_window(hist, end_ts - 6 * 86400, end_ts - 3 * 86400)
    if len(win) < 2:
        return None
    if (max(win) - min(win)) > 0.03:
        return None
    return "NO" if p3 > 0.5 else "YES"


def strat_S4(row) -> Optional[str]:
    p = row["entry_yes_price_3d"]
    tw = row["trading_window_days"]
    if pd.isna(p) or pd.isna(tw):
        return None
    if p < 0.15 and tw <= 14:
        return "NO"
    return None


# ---------------- Bootstrap ----------------
def bootstrap_metrics(pnls: np.ndarray, wins: np.ndarray, n_resamp: int = 1000):
    """Return (winrate_ci, sharpe_ci, p_value_one_sided)."""
    n = len(pnls)
    if n < 2:
        return (np.nan, np.nan), (np.nan, np.nan), np.nan
    idx = RNG.integers(0, n, size=(n_resamp, n))
    sample_pnls = pnls[idx]  # shape (n_resamp, n)
    means = sample_pnls.mean(axis=1)
    stds = sample_pnls.std(axis=1, ddof=1)
    stds = np.where(stds == 0, 1e-12, stds)
    sharpes = means / stds * np.sqrt(n)
    sample_wins = wins[idx].mean(axis=1)
    win_lo, win_hi = np.percentile(sample_wins, [2.5, 97.5])
    sh_lo, sh_hi = np.percentile(sharpes, [2.5, 97.5])
    # one-sided p-value for H0: true Sharpe <= 0 → fraction of resamples with Sharpe <= 0
    p_value = float((sharpes <= 0).mean())
    return (float(win_lo), float(win_hi)), (float(sh_lo), float(sh_hi)), p_value


def max_drawdown_pct(pnls: np.ndarray) -> float:
    """Max drawdown as fraction of starting capital. Starting capital = N * STAKE."""
    if len(pnls) == 0:
        return 0.0
    starting_capital = len(pnls) * STAKE
    cum = np.cumsum(pnls)
    peak = np.maximum.accumulate(cum)
    dd = peak - cum  # dollar drawdown from peak
    max_dd_dollars = float(dd.max()) if len(dd) else 0.0
    return max_dd_dollars / starting_capital


# ---------------- Main backtest ----------------
def main():
    df = pd.read_parquet(PARQUET)
    df = df[df["category"].isin(CATS) & df["liquidity_tier"].isin(TIERS)].copy()
    df = df.sort_values("end_date").reset_index(drop=True)
    print(f"In-scope rows: {len(df)}")

    clob_idx = build_clob_index()
    print(f"CLOB files indexed: {len(clob_idx)}")

    ledger_rows: List[dict] = []
    cell_rows: List[dict] = []

    for cat in CATS:
        for tier in TIERS:
            cell_df = df[(df["category"] == cat) & (df["liquidity_tier"] == tier)].copy()
            cell_df = cell_df.sort_values("end_date").reset_index(drop=True)

            for strat in STRATS:
                bets = []  # (cid, side, entry_price, outcome, pnl, win)
                for _, row in cell_df.iterrows():
                    side = None
                    entry = None
                    if strat == "S1":
                        side = strat_S1(row)
                        entry = row["entry_yes_price_3d"]
                    elif strat == "S2":
                        side, entry = strat_S2(row, clob_idx)
                    elif strat == "S3":
                        side = strat_S3(row, clob_idx)
                        entry = row["entry_yes_price_3d"]
                    elif strat == "S4":
                        side = strat_S4(row)
                        entry = row["entry_yes_price_3d"]
                    if side is None or entry is None or pd.isna(entry):
                        continue
                    outcome = int(row["outcome_yes_won"])
                    pnl = compute_pnl(side, float(entry), outcome)
                    win = 1 if pnl > 0 else 0
                    bets.append(
                        {
                            "condition_id": row["condition_id"],
                            "category": cat,
                            "liquidity_tier": tier,
                            "strategy": strat,
                            "side": side,
                            "entry_price": float(entry),
                            "stake": STAKE,
                            "fee": FEE,
                            "outcome_yes_won": outcome,
                            "pnl": pnl,
                            "end_date": row["end_date"],
                        }
                    )

                ledger_rows.extend(bets)
                n = len(bets)
                if n == 0:
                    cell_rows.append(
                        {
                            "category": cat,
                            "liquidity_tier": tier,
                            "strategy": strat,
                            "n_bets": 0,
                            "win_rate": np.nan,
                            "win_rate_ci_low": np.nan,
                            "win_rate_ci_high": np.nan,
                            "mean_pnl": np.nan,
                            "stdev_pnl": np.nan,
                            "total_pnl": 0.0,
                            "sharpe": np.nan,
                            "sharpe_ci_low": np.nan,
                            "sharpe_ci_high": np.nan,
                            "max_drawdown": np.nan,
                            "p_value_one_sided": np.nan,
                            "primary_pass": False,
                            "data_constrained": True,
                        }
                    )
                    continue
                pnls = np.array([b["pnl"] for b in bets])
                wins = np.array([1.0 if b["pnl"] > 0 else 0.0 for b in bets])
                mean_pnl = float(pnls.mean())
                std_pnl = float(pnls.std(ddof=1)) if n > 1 else 0.0
                total_pnl = float(pnls.sum())
                if std_pnl > 0 and n > 1:
                    sharpe = mean_pnl / std_pnl * np.sqrt(n)
                else:
                    sharpe = np.nan
                win_ci, sh_ci, pval = bootstrap_metrics(pnls, wins, n_resamp=1000)
                mdd = max_drawdown_pct(pnls)
                data_constrained = n < PASS_N
                primary_pass = (
                    (not data_constrained)
                    and (not np.isnan(sharpe))
                    and (sharpe >= PASS_SHARPE)
                    and (sh_ci[0] >= PASS_CI_LOW)
                    and (mdd <= PASS_MAXDD)
                )
                cell_rows.append(
                    {
                        "category": cat,
                        "liquidity_tier": tier,
                        "strategy": strat,
                        "n_bets": n,
                        "win_rate": float(wins.mean()),
                        "win_rate_ci_low": win_ci[0],
                        "win_rate_ci_high": win_ci[1],
                        "mean_pnl": mean_pnl,
                        "stdev_pnl": std_pnl,
                        "total_pnl": total_pnl,
                        "sharpe": sharpe,
                        "sharpe_ci_low": sh_ci[0],
                        "sharpe_ci_high": sh_ci[1],
                        "max_drawdown": mdd,
                        "p_value_one_sided": pval,
                        "primary_pass": bool(primary_pass),
                        "data_constrained": bool(data_constrained),
                    }
                )

    cells = pd.DataFrame(cell_rows)
    cells.to_parquet(OUT / "cells.parquet", index=False)
    cells.to_csv(OUT / "cells.csv", index=False)

    ledger = pd.DataFrame(ledger_rows)
    # CSV write — drop end_date for compactness, keep rest
    ledger_csv = ledger.drop(columns=["end_date"], errors="ignore")
    ledger_csv.to_csv(OUT / "per_bet_ledger.csv", index=False)

    print("Cells written:", len(cells))
    print("Bets written:", len(ledger))
    return cells, ledger


if __name__ == "__main__":
    cells, ledger = main()
    print()
    print(cells.to_string(index=False))
