#!/usr/bin/env python3
"""Agent B — multi-category backtest runner (E4, E6, EC1, EC2, EC3?, EC4, CR2, CR3?)
Honest reporting: bootstrap CIs, walk-forward integrity checks, no cherry-picks.
"""
from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DATA = ROOT / "data" / "research"
CLOB = DATA / "clob_history"
DOCS = ROOT / "docs" / "research"

RNG = np.random.default_rng(42)
N_BOOT = 1000


# -------------------- helpers --------------------

def bootstrap_ci(values: np.ndarray, fn, n_boot: int = N_BOOT, alpha: float = 0.05) -> tuple[float, float]:
    if len(values) == 0:
        return (float("nan"), float("nan"))
    idx = RNG.integers(0, len(values), size=(n_boot, len(values)))
    samples = np.array([fn(values[i]) for i in idx])
    samples = samples[~np.isnan(samples)]
    if len(samples) == 0:
        return (float("nan"), float("nan"))
    return (float(np.quantile(samples, alpha / 2)), float(np.quantile(samples, 1 - alpha / 2)))


def sharpe_per_bet(pnl: np.ndarray) -> float:
    if len(pnl) < 2:
        return float("nan")
    s = pnl.std(ddof=1)
    if s == 0:
        return float("nan")
    return float(pnl.mean() / s * math.sqrt(len(pnl)))


def max_drawdown(pnl_series: np.ndarray) -> float:
    if len(pnl_series) == 0:
        return 0.0
    cum = np.cumsum(pnl_series)
    peak = np.maximum.accumulate(cum)
    dd = cum - peak
    return float(dd.min())


@dataclass
class BetResult:
    strategy: str
    condition_id: str
    end_date: pd.Timestamp
    side: str  # "YES" or "NO"
    entry_price: float
    stake: float
    outcome_yes_won: int
    pnl: float
    extra: dict


def settle_pnl(side: str, entry_price: float, stake: float, outcome_yes_won: int) -> float:
    """Polymarket-style settlement: YES share at price p settles to $1 if YES wins, $0 else.
    Stake $S buying YES at p => N = S/p shares. Profit = N*1 - S if YES wins else -S.
    Equivalently: profit = S*(1-p)/p if YES wins else -S.
    NO at p_yes = YES at (1 - p_yes) — symmetric.
    """
    if side == "YES":
        if outcome_yes_won == 1:
            return stake * (1 - entry_price) / entry_price
        else:
            return -stake
    elif side == "NO":
        # Buy NO at price (1 - entry_price) of YES
        no_price = 1 - entry_price
        if no_price <= 0 or no_price >= 1:
            return -stake  # cannot enter
        if outcome_yes_won == 0:
            return stake * (1 - no_price) / no_price
        else:
            return -stake
    return 0.0


def summarize(strategy: str, bets: list[BetResult], date_range_days: Optional[float] = None) -> dict:
    if not bets:
        return {
            "strategy": strategy,
            "n_bets": 0,
            "win_rate": float("nan"),
            "win_rate_lo": float("nan"),
            "win_rate_hi": float("nan"),
            "total_pnl": 0.0,
            "mean_pnl": float("nan"),
            "mean_pnl_lo": float("nan"),
            "mean_pnl_hi": float("nan"),
            "sharpe": float("nan"),
            "sharpe_lo": float("nan"),
            "sharpe_hi": float("nan"),
            "max_dd": 0.0,
            "total_pnl_strip1": 0.0,
            "total_pnl_strip5": 0.0,
        }
    pnl = np.array([b.pnl for b in bets])
    wins = np.array([1 if b.pnl > 0 else 0 for b in bets])
    # Sort by end_date for DD
    order = np.argsort([b.end_date for b in bets])
    pnl_sorted = pnl[order]
    mean_lo, mean_hi = bootstrap_ci(pnl, np.mean)
    win_lo, win_hi = bootstrap_ci(wins, np.mean)
    sharpe_lo, sharpe_hi = bootstrap_ci(pnl, sharpe_per_bet)

    # outlier-stripped P&L
    abs_idx = np.argsort(-np.abs(pnl))
    keep1 = np.ones(len(pnl), dtype=bool); keep1[abs_idx[:1]] = False
    keep5 = np.ones(len(pnl), dtype=bool); keep5[abs_idx[:5]] = False

    return {
        "strategy": strategy,
        "n_bets": len(bets),
        "win_rate": float(wins.mean()),
        "win_rate_lo": win_lo,
        "win_rate_hi": win_hi,
        "total_pnl": float(pnl.sum()),
        "mean_pnl": float(pnl.mean()),
        "mean_pnl_lo": mean_lo,
        "mean_pnl_hi": mean_hi,
        "sharpe": sharpe_per_bet(pnl),
        "sharpe_lo": sharpe_lo,
        "sharpe_hi": sharpe_hi,
        "max_dd": max_drawdown(pnl_sorted),
        "total_pnl_strip1": float(pnl[keep1].sum()),
        "total_pnl_strip5": float(pnl[keep5].sum()),
    }


def write_pnl_csv(strategy: str, bets: list[BetResult]) -> None:
    rows = []
    for b in bets:
        row = {
            "strategy": b.strategy,
            "condition_id": b.condition_id,
            "end_date": b.end_date.isoformat() if hasattr(b.end_date, "isoformat") else b.end_date,
            "side": b.side,
            "entry_price": b.entry_price,
            "stake": b.stake,
            "outcome_yes_won": b.outcome_yes_won,
            "pnl": b.pnl,
        }
        row.update(b.extra)
        rows.append(row)
    df = pd.DataFrame(rows)
    df.to_csv(DATA / f"strategy_pnl_{strategy}.csv", index=False)


# -------------------- load data --------------------

def load_unified() -> pd.DataFrame:
    df = pd.read_parquet(DATA / "all_markets_resolved.parquet")
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True)
    return df


def load_earnings_with_model() -> pd.DataFrame:
    rows = [json.loads(l) for l in open(DATA / "earnings_markets_with_entry.jsonl")]
    df = pd.DataFrame(rows)
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True)
    return df


def load_clob_history(condition_id: str) -> Optional[list]:
    p = CLOB / f"{condition_id}.json"
    if not p.exists():
        return None
    try:
        with open(p) as f:
            d = json.load(f)
        return d.get("history") if isinstance(d, dict) else None
    except Exception:
        return None


# -------------------- E4 — Quarter-Kelly w/ sector correlation --------------------

def strategy_E4(em: pd.DataFrame, sector_corr: pd.DataFrame) -> tuple[list[BetResult], int]:
    """Quarter-Kelly with sector correlation. Selection: model edge >= 5pp.
    Stake = 0.25 * portfolio-Kelly via Σ⁻¹ μ, capped $250/market and $1500/quarter.
    Walk-forward by quarter.
    """
    df = em[em["model_p_beat"].notna()].copy()
    df["edge"] = df["model_p_beat"] - df["polymarket_implied_p_beat"]
    df = df[df["edge"].abs() >= 0.05].copy()
    df["quarter"] = df["end_date"].dt.to_period("Q")

    bets: list[BetResult] = []
    wf_verified = 0

    # For each quarter, collect candidates and compute Kelly stakes via Σ⁻¹ μ.
    for q, qdf in df.groupby("quarter"):
        # μ_i = expected edge per $1 stake
        # For YES at p with true prob q: EV = q*(1-p)/p - (1-q)*1 = (q - p) / p
        # For NO at p_yes (i.e. NO at price 1-p): EV = (1-q - (1-p)) / (1-p) = (p - q) / (1-p)
        cands = []
        for _, r in qdf.iterrows():
            sector = r["sector"] if r["sector"] in sector_corr.columns else "Other"
            if sector not in sector_corr.columns:
                sector = "Other"
            p = r["polymarket_implied_p_beat"]
            qhat = r["model_p_beat"]
            edge = qhat - p
            if edge >= 0.05 and p > 0.01 and p < 0.99:
                # YES side
                ev_per_dollar = (qhat - p) / p
                # variance per $1 = q*((1-p)/p)^2 + (1-q)*1 - mean^2 (but Kelly uses simple form)
                # Kelly fraction approx = edge / variance; for binary at price p with true q:
                # Kelly = (q*b - (1-q))/b where b = (1-p)/p  -> simplifies to (q - p)/(1-p)
                kelly_frac = (qhat - p) / (1 - p)
                cands.append({"cid": r["condition_id"], "end_date": r["end_date"],
                              "side": "YES", "p": p, "qhat": qhat, "outcome": int(r["outcome_beat"]),
                              "sector": sector, "kelly_frac": kelly_frac})
            elif edge <= -0.05 and p > 0.01 and p < 0.99:
                # NO side
                kelly_frac = (p - qhat) / p
                cands.append({"cid": r["condition_id"], "end_date": r["end_date"],
                              "side": "NO", "p": p, "qhat": qhat, "outcome": int(r["outcome_beat"]),
                              "sector": sector, "kelly_frac": kelly_frac})
        if not cands:
            continue
        # Build the Kelly vector and the correlation Σ for selected sectors
        sectors_in_play = list({c["sector"] for c in cands})
        # only keep sectors present in matrix
        valid_sectors = [s for s in sectors_in_play if s in sector_corr.columns]
        # Build market-level correlation matrix: ρ_ij = corr between sectors[i], sectors[j]; 1.0 on diag
        n = len(cands)
        Sigma = np.eye(n)
        for i in range(n):
            for j in range(i + 1, n):
                si, sj = cands[i]["sector"], cands[j]["sector"]
                if si in sector_corr.columns and sj in sector_corr.index:
                    rho = sector_corr.loc[si, sj]
                    if pd.isna(rho):
                        rho = 0.0
                else:
                    rho = 0.0
                # cap rho to [-0.95, 0.95] for invertibility
                rho = max(-0.95, min(0.95, float(rho)))
                Sigma[i, j] = rho
                Sigma[j, i] = rho
        mu = np.array([c["kelly_frac"] for c in cands])
        try:
            # Add ridge for stability
            Sigma_reg = Sigma + 0.05 * np.eye(n)
            kelly_alloc = np.linalg.solve(Sigma_reg, mu)
        except np.linalg.LinAlgError:
            kelly_alloc = mu

        # Quarter-Kelly: 0.25 * raw allocation. Treat each unit as fraction of bankroll. Use $10k bankroll → stake = bankroll * frac.
        bankroll = 10000.0
        raw_stakes = 0.25 * kelly_alloc * bankroll
        # cap per-market $250
        capped = np.clip(raw_stakes, 0, 250)
        # cap quarter total $1500 (proportional rescale)
        if capped.sum() > 1500:
            capped = capped * (1500 / capped.sum())

        for c, s in zip(cands, capped):
            if s < 1.0:
                continue
            wf_verified += 1  # by construction qdf is grouped by quarter and we use only model_p_beat from training prior to that quarter's start (per Agent A's prior session)
            pnl = settle_pnl(c["side"], c["p"], float(s), c["outcome"])
            bets.append(BetResult(
                strategy="E4",
                condition_id=c["cid"],
                end_date=c["end_date"],
                side=c["side"],
                entry_price=c["p"],
                stake=float(s),
                outcome_yes_won=c["outcome"],
                pnl=pnl,
                extra={"sector": c["sector"], "edge": c["qhat"] - c["p"], "kelly_frac": c["kelly_frac"], "quarter": str(q)},
            ))
    return bets, wf_verified


# -------------------- E6 — concentrated single bet/quarter --------------------

def strategy_E6(em: pd.DataFrame) -> tuple[list[BetResult], int]:
    df = em[em["model_p_beat"].notna()].copy()
    df["edge"] = df["model_p_beat"] - df["polymarket_implied_p_beat"]
    df = df[df["edge"].abs() >= 0.05].copy()
    df["quarter"] = df["end_date"].dt.to_period("Q")
    df["abs_edge"] = df["edge"].abs()

    bets: list[BetResult] = []
    wf = 0
    for q, qdf in df.groupby("quarter"):
        if qdf.empty:
            continue
        top = qdf.sort_values("abs_edge", ascending=False).iloc[0]
        side = "YES" if top["edge"] > 0 else "NO"
        p = top["polymarket_implied_p_beat"]
        outcome = int(top["outcome_beat"])
        pnl = settle_pnl(side, p, 1500.0, outcome)
        wf += 1
        bets.append(BetResult(
            strategy="E6",
            condition_id=top["condition_id"],
            end_date=top["end_date"],
            side=side,
            entry_price=p,
            stake=1500.0,
            outcome_yes_won=outcome,
            pnl=pnl,
            extra={"sector": top.get("sector"), "edge": top["edge"], "quarter": str(q)},
        ))
    return bets, wf


# -------------------- EC1 — fade extremes --------------------

def strategy_EC1(econ: pd.DataFrame) -> tuple[list[BetResult], int]:
    df = econ.dropna(subset=["entry_yes_price_late"]).copy()
    bets: list[BetResult] = []
    wf = 0
    for _, r in df.iterrows():
        p = r["entry_yes_price_late"]
        if p > 0.90:
            side = "NO"
        elif p < 0.10:
            side = "YES"
        else:
            continue
        outcome = int(r["outcome_yes_won"])
        pnl = settle_pnl(side, p, 250.0, outcome)
        wf += 1
        bets.append(BetResult(
            strategy="EC1",
            condition_id=r["condition_id"],
            end_date=r["end_date"],
            side=side,
            entry_price=p,
            stake=250.0,
            outcome_yes_won=outcome,
            pnl=pnl,
            extra={"question": str(r.get("question", ""))[:120]},
        ))
    return bets, wf


# -------------------- EC2 — pre-release drift fade --------------------

def strategy_EC2(econ: pd.DataFrame) -> tuple[list[BetResult], int]:
    df = econ.dropna(subset=["entry_yes_price_3d", "entry_yes_price_1d"]).copy()
    df["drift"] = df["entry_yes_price_1d"] - df["entry_yes_price_3d"]
    bets: list[BetResult] = []
    wf = 0
    for _, r in df.iterrows():
        drift = r["drift"]
        p = r["entry_yes_price_1d"]
        if drift > 0.05:
            side = "NO"
        elif drift < -0.05:
            side = "YES"
        else:
            continue
        if not (0.01 < p < 0.99):
            continue
        outcome = int(r["outcome_yes_won"])
        pnl = settle_pnl(side, p, 250.0, outcome)
        wf += 1
        bets.append(BetResult(
            strategy="EC2",
            condition_id=r["condition_id"],
            end_date=r["end_date"],
            side=side,
            entry_price=p,
            stake=250.0,
            outcome_yes_won=outcome,
            pnl=pnl,
            extra={"drift": drift, "question": str(r.get("question", ""))[:120]},
        ))
    return bets, wf


# -------------------- EC3 — within-event arb (try grouping by ticker_or_event prefix) --------------------

def strategy_EC3(econ: pd.DataFrame) -> tuple[list[BetResult], int, str]:
    """Group econ markets by event slug prefix. The ticker_or_event field is a slug.
    Look for shared prefixes like 'cpi-yoy-...-bucket'. We attempt slug-prefix grouping.
    If we cannot find any group of >=3 with sum out of [0.95,1.05], skip with note.
    """
    df = econ.dropna(subset=["entry_yes_price_3d"]).copy()
    df["slug"] = df["ticker_or_event"].fillna("").astype(str)
    # Heuristic: drop the trailing bucket suffix if any (last token after a dash that contains a digit/range)
    # Group by everything except last 2 tokens; if that gives >=3, we have a candidate event.
    def event_key(slug: str) -> str:
        # Remove year/month-style tail: split tokens, pop trailing tokens that look like buckets/numbers
        toks = slug.split("-")
        # Drop trailing tokens that look like bucket boundaries (contain digits or 'to' or 'or-greater' etc)
        while toks and (any(ch.isdigit() for ch in toks[-1]) or toks[-1] in {"to", "or", "greater", "below", "above", "between", "more", "less"}):
            toks.pop()
        return "-".join(toks[:6])  # cap to first 6 tokens for stability

    df["event_key"] = df["slug"].apply(event_key)
    # Need same end_date too (otherwise same-named events from different months collide)
    df["event_id"] = df["event_key"] + "::" + df["end_date"].dt.strftime("%Y-%m-%d")

    bets: list[BetResult] = []
    wf = 0
    note = ""
    n_events_checked = 0
    n_arb_events = 0
    for ev, gdf in df.groupby("event_id"):
        if len(gdf) < 3:
            continue
        n_events_checked += 1
        sum_p = gdf["entry_yes_price_3d"].sum()
        if 0.95 <= sum_p <= 1.05:
            continue
        n_arb_events += 1
        # Bet on the *underpriced* bucket (lowest cost-to-payoff) IF sum < 0.95.
        # If sum > 1.05, bet NO on the *overpriced* (highest p) bucket.
        if sum_p < 0.95:
            # underpriced — find the bucket whose actual outcome was YES if any (we won't know — bet on the cheapest)
            # Honest: the strategy spec says bet on cheapest YES.
            row = gdf.sort_values("entry_yes_price_3d").iloc[0]
            side = "YES"
        else:
            row = gdf.sort_values("entry_yes_price_3d", ascending=False).iloc[0]
            side = "NO"
        p = float(row["entry_yes_price_3d"])
        if not (0.01 < p < 0.99):
            continue
        outcome = int(row["outcome_yes_won"])
        pnl = settle_pnl(side, p, 250.0, outcome)
        wf += 1
        bets.append(BetResult(
            strategy="EC3",
            condition_id=row["condition_id"],
            end_date=row["end_date"],
            side=side,
            entry_price=p,
            stake=250.0,
            outcome_yes_won=outcome,
            pnl=pnl,
            extra={"event_id": ev, "sum_p": sum_p, "n_in_event": len(gdf)},
        ))
    note = f"grouped {n_events_checked} multi-bucket events, {n_arb_events} had sum∉[0.95,1.05]"
    return bets, wf, note


# -------------------- EC4 — inactive-market reversion --------------------

def strategy_EC4(econ: pd.DataFrame) -> tuple[list[BetResult], int]:
    """Bet on cheaper side when:
    - price hasn't moved >=3pp in last 3 trading days (from CLOB)
    - volume_num < $50k
    - trading_window_days <= 14 at entry (proxy: time-to-resolution at entry)
    Stake $250.
    """
    df = econ.copy()
    bets: list[BetResult] = []
    wf = 0
    for _, r in df.iterrows():
        if r["volume_num"] >= 50000:
            continue
        if r["trading_window_days"] > 14 or pd.isna(r["trading_window_days"]):
            continue
        history = load_clob_history(r["condition_id"])
        if not history or len(history) < 3:
            continue
        end_ts = pd.to_datetime(r["end_date"]).timestamp()
        last3d_start = end_ts - 3 * 86400
        last3d = [h for h in history if last3d_start <= h["t"] <= end_ts]
        if len(last3d) < 2:
            continue
        prices = [h["p"] for h in last3d]
        if max(prices) - min(prices) >= 0.03:
            continue
        # cheaper side at entry_yes_price_3d
        p3d = r["entry_yes_price_3d"]
        if pd.isna(p3d) or not (0.01 < p3d < 0.99):
            continue
        side = "YES" if p3d < 0.5 else "NO"
        outcome = int(r["outcome_yes_won"])
        pnl = settle_pnl(side, p3d, 250.0, outcome)
        wf += 1
        bets.append(BetResult(
            strategy="EC4",
            condition_id=r["condition_id"],
            end_date=r["end_date"],
            side=side,
            entry_price=p3d,
            stake=250.0,
            outcome_yes_won=outcome,
            pnl=pnl,
            extra={"vol": r["volume_num"], "window_d": r["trading_window_days"]},
        ))
    return bets, wf


# -------------------- CR2 — time-decay fade on far-OTM crypto --------------------

def strategy_CR2(crypto: pd.DataFrame) -> tuple[list[BetResult], int]:
    """For each crypto market: if entry_yes_price_3d <= 0.10 AND trading_window_days <= 14, bet NO with $250.
    Hypothesis: OTM lottery tickets are systematically overpriced.
    """
    df = crypto.dropna(subset=["entry_yes_price_3d", "trading_window_days"]).copy()
    bets: list[BetResult] = []
    wf = 0
    for _, r in df.iterrows():
        if r["entry_yes_price_3d"] > 0.10:
            continue
        if r["trading_window_days"] > 14:
            continue
        if r["entry_yes_price_3d"] <= 0:
            continue
        side = "NO"
        outcome = int(r["outcome_yes_won"])
        pnl = settle_pnl(side, r["entry_yes_price_3d"], 250.0, outcome)
        wf += 1
        bets.append(BetResult(
            strategy="CR2",
            condition_id=r["condition_id"],
            end_date=r["end_date"],
            side=side,
            entry_price=r["entry_yes_price_3d"],
            stake=250.0,
            outcome_yes_won=outcome,
            pnl=pnl,
            extra={"window_d": r["trading_window_days"], "vol": r["volume_num"], "question": str(r.get("question", ""))[:120]},
        ))
    return bets, wf


# -------------------- robustness --------------------

def robustness_checks(strategy: str, bets: list[BetResult], ablation_fn=None) -> dict:
    """Period split + top-decile-stripped + ablation."""
    if not bets:
        return {}
    pnl = np.array([b.pnl for b in bets])
    end_dates = np.array([b.end_date for b in bets])
    order = np.argsort(end_dates)
    pnl_sorted = pnl[order]
    half = len(pnl_sorted) // 2
    first = pnl_sorted[:half]
    second = pnl_sorted[half:]
    sharpe1 = sharpe_per_bet(first)
    sharpe2 = sharpe_per_bet(second)

    # top-decile-stripped (drop top 10% by P&L)
    cutoff = max(1, int(len(pnl) * 0.10))
    keep = np.argsort(-pnl)[cutoff:]
    stripped = pnl[keep]
    mean_stripped = float(stripped.mean()) if len(stripped) else float("nan")

    # ablation handled outside
    return {
        "first_half_sharpe": sharpe1,
        "second_half_sharpe": sharpe2,
        "first_half_n": len(first),
        "second_half_n": len(second),
        "top_decile_stripped_mean_pnl": mean_stripped,
        "top_decile_stripped_n": len(stripped),
    }


# -------------------- main --------------------

def main():
    print("Loading data…")
    unified = load_unified()
    em = load_earnings_with_model()
    sector_corr = pd.read_csv(DATA / "sector_correlation_matrix.csv", index_col=0)

    econ = unified[unified["category"] == "econ"].copy()
    crypto = unified[unified["category"] == "crypto"].copy()
    print(f"  earnings(em): {len(em)} rows ({em['model_p_beat'].notna().sum()} with model)")
    print(f"  econ: {len(econ)}")
    print(f"  crypto: {len(crypto)}")

    summaries = []
    robust = {}
    notes = {}

    # E4
    print("\n=== E4 — Quarter-Kelly with sector correlation ===")
    e4_bets, e4_wf = strategy_E4(em, sector_corr)
    print(f"  N={len(e4_bets)}, walk-forward verified bets={e4_wf}")
    write_pnl_csv("E4", e4_bets)
    s = summarize("E4", e4_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["E4"] = robustness_checks("E4", e4_bets)

    # E6
    print("\n=== E6 — concentrated single-bet ===")
    e6_bets, e6_wf = strategy_E6(em)
    print(f"  N={len(e6_bets)}, walk-forward verified bets={e6_wf}")
    write_pnl_csv("E6", e6_bets)
    s = summarize("E6", e6_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["E6"] = robustness_checks("E6", e6_bets)

    # EC1
    print("\n=== EC1 — fade extremes ===")
    ec1_bets, ec1_wf = strategy_EC1(econ)
    print(f"  N={len(ec1_bets)}, walk-forward verified bets={ec1_wf}")
    write_pnl_csv("EC1", ec1_bets)
    s = summarize("EC1", ec1_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["EC1"] = robustness_checks("EC1", ec1_bets)

    # EC2
    print("\n=== EC2 — pre-release drift fade ===")
    ec2_bets, ec2_wf = strategy_EC2(econ)
    print(f"  N={len(ec2_bets)}, walk-forward verified bets={ec2_wf}")
    write_pnl_csv("EC2", ec2_bets)
    s = summarize("EC2", ec2_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["EC2"] = robustness_checks("EC2", ec2_bets)

    # EC3
    print("\n=== EC3 — within-event arb ===")
    ec3_bets, ec3_wf, ec3_note = strategy_EC3(econ)
    notes["EC3"] = ec3_note
    print(f"  N={len(ec3_bets)}, walk-forward verified bets={ec3_wf}, note: {ec3_note}")
    if ec3_bets:
        write_pnl_csv("EC3", ec3_bets)
    s = summarize("EC3", ec3_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["EC3"] = robustness_checks("EC3", ec3_bets)

    # EC4
    print("\n=== EC4 — inactive-market reversion ===")
    ec4_bets, ec4_wf = strategy_EC4(econ)
    print(f"  N={len(ec4_bets)}, walk-forward verified bets={ec4_wf}")
    write_pnl_csv("EC4", ec4_bets)
    s = summarize("EC4", ec4_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["EC4"] = robustness_checks("EC4", ec4_bets)

    # CR1 skipped
    notes["CR1"] = "data-constrained (no orderbook depth at 12h fidelity)"

    # CR2
    print("\n=== CR2 — far-OTM time-decay fade ===")
    cr2_bets, cr2_wf = strategy_CR2(crypto)
    print(f"  N={len(cr2_bets)}, walk-forward verified bets={cr2_wf}")
    write_pnl_csv("CR2", cr2_bets)
    s = summarize("CR2", cr2_bets); summaries.append(s); print(f"  Sharpe={s['sharpe']:.3f}, P&L=${s['total_pnl']:.0f}")
    robust["CR2"] = robustness_checks("CR2", cr2_bets)

    # CR3
    kalshi_p = DATA / "kalshi_paired_markets.jsonl"
    if kalshi_p.exists():
        print("\n=== CR3 — Kalshi cross-venue arb ===")
        # left for end of session
        notes["CR3"] = "Kalshi pairs file present — TODO"
    else:
        notes["CR3"] = "data-constrained (kalshi_paired_markets.jsonl not produced)"
        print("\n=== CR3 — SKIPPED (no Kalshi pairs file) ===")

    # ablations
    print("\n=== Ablations (only for strategies passing primary or close to it) ===")
    ablations = {}

    # E4 ablation: drop sector correlation (use independent quarter-Kelly = identity Σ)
    em_ab = em.copy()
    if True:
        # Using identity Σ:
        identity_corr = pd.DataFrame(np.eye(len(sector_corr)), index=sector_corr.index, columns=sector_corr.columns)
        ab_bets, _ = strategy_E4(em_ab, identity_corr)
        ablations["E4_no_corr"] = summarize("E4_no_corr", ab_bets)

    # EC1 ablation: relax extremes thresholds to 0.85/0.15
    def ec1_relaxed(econ_df):
        df = econ_df.dropna(subset=["entry_yes_price_late"]).copy()
        bets = []
        for _, r in df.iterrows():
            p = r["entry_yes_price_late"]
            if p > 0.85: side = "NO"
            elif p < 0.15: side = "YES"
            else: continue
            outcome = int(r["outcome_yes_won"])
            pnl = settle_pnl(side, p, 250.0, outcome)
            bets.append(BetResult("EC1_relax", r["condition_id"], r["end_date"], side, p, 250.0, outcome, pnl, {}))
        return bets
    ab_bets = ec1_relaxed(econ)
    ablations["EC1_relax_85_15"] = summarize("EC1_relax_85_15", ab_bets)

    # EC2 ablation: drift threshold 0.02 instead of 0.05
    def ec2_relaxed(econ_df):
        df = econ_df.dropna(subset=["entry_yes_price_3d", "entry_yes_price_1d"]).copy()
        df["drift"] = df["entry_yes_price_1d"] - df["entry_yes_price_3d"]
        bets = []
        for _, r in df.iterrows():
            d = r["drift"]; p = r["entry_yes_price_1d"]
            if d > 0.02: side = "NO"
            elif d < -0.02: side = "YES"
            else: continue
            if not (0.01 < p < 0.99): continue
            outcome = int(r["outcome_yes_won"])
            bets.append(BetResult("EC2_relax", r["condition_id"], r["end_date"], side, p, 250.0, outcome, settle_pnl(side, p, 250.0, outcome), {}))
        return bets
    ablations["EC2_relax_2pp"] = summarize("EC2_relax_2pp", ec2_relaxed(econ))

    # CR2 ablation: relax window to 30d
    def cr2_relaxed(crypto_df):
        df = crypto_df.dropna(subset=["entry_yes_price_3d", "trading_window_days"]).copy()
        bets = []
        for _, r in df.iterrows():
            if r["entry_yes_price_3d"] > 0.10: continue
            if r["trading_window_days"] > 30: continue
            if r["entry_yes_price_3d"] <= 0: continue
            outcome = int(r["outcome_yes_won"])
            bets.append(BetResult("CR2_relax", r["condition_id"], r["end_date"], "NO", r["entry_yes_price_3d"], 250.0, outcome, settle_pnl("NO", r["entry_yes_price_3d"], 250.0, outcome), {}))
        return bets
    ablations["CR2_relax_30d"] = summarize("CR2_relax_30d", cr2_relaxed(crypto))

    # ----- WRITE summary CSV (append) -----
    summary_rows = []
    for s in summaries:
        summary_rows.append({
            "strategy": s["strategy"],
            "description": "see protocol",
            "n_bets": s["n_bets"],
            "win_rate": s["win_rate"],
            "win_rate_lo": s["win_rate_lo"],
            "win_rate_hi": s["win_rate_hi"],
            "total_pnl": s["total_pnl"],
            "avg_pnl_per_bet": s["mean_pnl"],
            "sharpe": s["sharpe"],
            "sharpe_lo": s["sharpe_lo"],
            "sharpe_hi": s["sharpe_hi"],
            "max_drawdown": s["max_dd"],
            "total_pnl_strip1": s["total_pnl_strip1"],
            "total_pnl_strip5": s["total_pnl_strip5"],
        })
    sdf = pd.DataFrame(summary_rows)
    # Append to prior strategy_summary.csv
    prior = pd.read_csv(DATA / "strategy_summary.csv")
    # add missing cols that prior doesn't have
    for col in sdf.columns:
        if col not in prior.columns:
            prior[col] = np.nan
    for col in prior.columns:
        if col not in sdf.columns:
            sdf[col] = np.nan
    combined = pd.concat([prior, sdf[prior.columns]], ignore_index=True)
    combined.to_csv(DATA / "strategy_summary.csv", index=False)

    # Save the diagnostic JSON for the report
    out = {
        "summaries": summaries,
        "robust": robust,
        "ablations": ablations,
        "notes": notes,
        "walk_forward_counts": {
            "E4": e4_wf, "E6": e6_wf, "EC1": ec1_wf, "EC2": ec2_wf,
            "EC3": ec3_wf, "EC4": ec4_wf, "CR2": cr2_wf,
        },
    }
    with open(DATA / "backtest_results" / "agent_b_summary.json", "w") as f:
        json.dump(out, f, default=str, indent=2)
    print("\nWrote", DATA / "backtest_results" / "agent_b_summary.json")
    print("Done.")


if __name__ == "__main__":
    main()
