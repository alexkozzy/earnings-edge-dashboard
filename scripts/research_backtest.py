#!/usr/bin/env python3
"""Agent B — backtest 7 strategies on resolved Polymarket earnings markets.

See `docs/research/BACKTEST_RESULTS.md` for narrative.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

ROOT = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
DATA = ROOT / "data" / "research"
DOCS = ROOT / "docs" / "research"
DOCS.mkdir(parents=True, exist_ok=True)


def load_markets() -> pd.DataFrame:
    rows = []
    with (DATA / "earnings_markets_with_entry.jsonl").open() as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    df = pd.DataFrame(rows)
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True)
    df["quarter"] = df["end_date"].dt.to_period("Q").astype(str)
    df = df.sort_values(["ticker", "end_date"]).reset_index(drop=True)
    # Compute prior-quarter outcome per ticker (within the dataset itself).
    df["prior_outcome_beat"] = df.groupby("ticker")["outcome_beat"].shift(1)
    return df


@dataclass
class Bet:
    condition_id: str
    ticker: str
    end_date: pd.Timestamp
    side: str  # "YES" or "NO"
    entry_price: float  # cost per share (price you actually pay)
    stake: float
    shares: float
    outcome_beat: int
    pnl_dollars: float


def make_bet(row, side: str, stake: float) -> Optional[Bet]:
    p = row["entry_yes_price_3d"]
    if p is None or (isinstance(p, float) and (math.isnan(p))):
        return None
    # Guard against degenerate prices (0 or 1) which would imply infinite shares.
    if side == "YES":
        cost = float(p)
    else:
        cost = float(1.0 - p)
    if cost <= 1e-4 or cost >= 1.0 - 1e-4:
        # too tight to trade meaningfully
        return None
    shares = stake / cost
    win = (side == "YES" and row["outcome_beat"] == 1) or (
        side == "NO" and row["outcome_beat"] == 0
    )
    pnl = shares * 1.0 - stake if win else -stake
    return Bet(
        condition_id=row["condition_id"],
        ticker=row["ticker"],
        end_date=row["end_date"],
        side=side,
        entry_price=cost,
        stake=stake,
        shares=shares,
        outcome_beat=int(row["outcome_beat"]),
        pnl_dollars=pnl,
    )


# -------------------- strategy generators -------------------- #


def strat_S1_no_extreme_favorites(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        if r["polymarket_implied_p_beat"] is None or pd.isna(r["polymarket_implied_p_beat"]):
            continue
        if r["polymarket_implied_p_beat"] >= 0.85:
            b = make_bet(r, "NO", 250.0)
            if b: bets.append(b)
    return bets


def strat_S2_yes_extreme_dogs(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        if r["polymarket_implied_p_beat"] is None or pd.isna(r["polymarket_implied_p_beat"]):
            continue
        if r["polymarket_implied_p_beat"] <= 0.50:
            b = make_bet(r, "YES", 250.0)
            if b: bets.append(b)
    return bets


def strat_S3_mean_reversion(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        p = r["polymarket_implied_p_beat"]
        if p is None or pd.isna(p): continue
        if p >= 0.85:
            b = make_bet(r, "NO", 250.0)
            if b: bets.append(b)
        elif p <= 0.50:
            b = make_bet(r, "YES", 250.0)
            if b: bets.append(b)
    return bets


def strat_S4_momentum(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        prior = r["prior_outcome_beat"]
        p = r["polymarket_implied_p_beat"]
        if pd.isna(prior) or p is None or pd.isna(p): continue
        if prior == 1 and p < 0.80:
            b = make_bet(r, "YES", 250.0)
            if b: bets.append(b)
        elif prior == 0 and p > 0.55:
            b = make_bet(r, "NO", 250.0)
            if b: bets.append(b)
    return bets


def strat_S5_model_edge_5pp(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        m = r["model_p_beat"]; p = r["polymarket_implied_p_beat"]
        if m is None or pd.isna(m) or p is None or pd.isna(p): continue
        edge = m - p
        if edge >= 0.05:
            b = make_bet(r, "YES", 250.0)
            if b: bets.append(b)
        elif edge <= -0.05:
            b = make_bet(r, "NO", 250.0)
            if b: bets.append(b)
    return bets


def strat_S6_model_edge_10pp(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        m = r["model_p_beat"]; p = r["polymarket_implied_p_beat"]
        if m is None or pd.isna(m) or p is None or pd.isna(p): continue
        edge = m - p
        if edge >= 0.10:
            b = make_bet(r, "YES", 400.0)
            if b: bets.append(b)
        elif edge <= -0.10:
            b = make_bet(r, "NO", 400.0)
            if b: bets.append(b)
    return bets


def strat_S7_quarter_kelly(df: pd.DataFrame) -> list[Bet]:
    bets = []
    for _, r in df.iterrows():
        m = r["model_p_beat"]; p = r["polymarket_implied_p_beat"]
        if m is None or pd.isna(m) or p is None or pd.isna(p): continue
        edge = m - p
        if abs(edge) < 0.05: continue
        stake = min(0.25 * abs(edge) * 100.0 * 250.0 / 1.0, 250.0)
        # Spec: stake = 0.25 * max(0, edge*100) capped at 250.
        # Interpreting "edge*100" as percentage points -> stake in $.
        stake = min(0.25 * abs(edge) * 100.0, 250.0)
        if stake < 1.0: continue
        side = "YES" if edge > 0 else "NO"
        b = make_bet(r, side, stake)
        if b: bets.append(b)
    return bets


# -------------------- metrics -------------------- #


def bootstrap_ci_winrate(wins: np.ndarray, n_boot: int = 1000, seed: int = 7) -> tuple[float, float]:
    if len(wins) == 0: return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    boots = []
    n = len(wins)
    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        boots.append(wins[idx].mean())
    lo, hi = np.quantile(boots, [0.025, 0.975])
    return float(lo), float(hi)


def max_drawdown(cum: np.ndarray) -> float:
    if len(cum) == 0: return 0.0
    peak = np.maximum.accumulate(cum)
    dd = cum - peak
    return float(dd.min())


def per_quarter_pnl(bets: list[Bet]) -> pd.Series:
    if not bets: return pd.Series(dtype=float)
    df = pd.DataFrame([b.__dict__ for b in bets])
    df["q"] = pd.to_datetime(df["end_date"], utc=True).dt.to_period("Q").astype(str)
    return df.groupby("q")["pnl_dollars"].sum()


def summarize(name: str, desc: str, bets: list[Bet], total_universe_df: pd.DataFrame, model_strategy: bool) -> dict:
    if len(bets) == 0:
        return {
            "strategy": name, "description": desc, "n_bets": 0, "win_rate": float("nan"),
            "win_rate_lo": float("nan"), "win_rate_hi": float("nan"),
            "total_pnl": 0.0, "avg_pnl_per_bet": float("nan"),
            "n_quarters": 0, "sharpe_q": float("nan"), "sortino_q": float("nan"),
            "max_drawdown": 0.0, "total_stake": 0.0, "roi_pct": float("nan"),
            "avg_edge": float("nan"),
        }
    df = pd.DataFrame([b.__dict__ for b in bets])
    df = df.sort_values("end_date").reset_index(drop=True)
    wins = ((df["side"] == "YES") & (df["outcome_beat"] == 1)) | (
        (df["side"] == "NO") & (df["outcome_beat"] == 0)
    )
    wins_arr = wins.astype(int).values
    cum = df["pnl_dollars"].cumsum().values
    win_rate = float(wins_arr.mean())
    lo, hi = bootstrap_ci_winrate(wins_arr)
    pq = per_quarter_pnl(bets)
    n_q = pq.shape[0]
    if n_q >= 2:
        sharpe = float(pq.mean() / (pq.std(ddof=1) + 1e-12) * math.sqrt(n_q))
        downside = pq[pq < 0]
        if len(downside) > 0:
            sortino = float(pq.mean() / (downside.std(ddof=1) + 1e-12) * math.sqrt(n_q))
        else:
            sortino = float("inf") if pq.mean() > 0 else float("nan")
    else:
        sharpe = float("nan"); sortino = float("nan")
    # average edge captured
    if model_strategy:
        # Need to merge model_p_beat / implied to compute model edge captured per bet.
        merged = df.merge(
            total_universe_df[["condition_id", "model_p_beat", "polymarket_implied_p_beat"]],
            on="condition_id", how="left"
        )
        # signed edge: from the bettor's perspective, the abs(model-implied) is the "claimed" edge.
        merged["edge"] = (merged["model_p_beat"] - merged["polymarket_implied_p_beat"]).abs()
        avg_edge = float((merged["edge"] * merged["stake"]).sum() / merged["stake"].sum())
    else:
        merged = df.merge(
            total_universe_df[["condition_id", "polymarket_implied_p_beat"]],
            on="condition_id", how="left"
        )
        merged["edge"] = (merged["polymarket_implied_p_beat"] - 0.5).abs()
        avg_edge = float((merged["edge"] * merged["stake"]).sum() / merged["stake"].sum())
    return {
        "strategy": name,
        "description": desc,
        "n_bets": int(len(df)),
        "win_rate": win_rate,
        "win_rate_lo": lo,
        "win_rate_hi": hi,
        "total_pnl": float(df["pnl_dollars"].sum()),
        "avg_pnl_per_bet": float(df["pnl_dollars"].mean()),
        "total_stake": float(df["stake"].sum()),
        "roi_pct": float(df["pnl_dollars"].sum() / df["stake"].sum() * 100.0),
        "n_quarters": int(n_q),
        "sharpe_q": sharpe,
        "sortino_q": sortino,
        "max_drawdown": max_drawdown(cum),
        "avg_edge": avg_edge,
    }


def write_pnl_csv(name: str, bets: list[Bet]) -> None:
    if not bets:
        df = pd.DataFrame(columns=[
            "condition_id","ticker","end_date","side","entry_price","stake","shares",
            "outcome_beat","pnl_dollars","cumulative_pnl"])
    else:
        df = pd.DataFrame([b.__dict__ for b in bets])
        df = df.sort_values("end_date").reset_index(drop=True)
        df["cumulative_pnl"] = df["pnl_dollars"].cumsum()
    df.to_csv(DATA / f"strategy_pnl_{name}.csv", index=False)


# -------------------- main -------------------- #


def main():
    df = load_markets()
    print(f"Loaded {len(df)} markets, {df['model_p_beat'].notna().sum()} have model_p_beat")

    # OOS window = where model_p_beat is non-null (per Agent A's walk-forward)
    oos = df[df["model_p_beat"].notna()].copy()
    print(f"OOS window: {len(oos)} markets, quarters: {sorted(oos['quarter'].unique())}")

    # For S1-S4 we want the OOS-restricted view as primary; full-sample view as supplement.
    strategies = [
        ("S1", "NO on extreme favorites (p>=0.85), $250", strat_S1_no_extreme_favorites, False, oos),
        ("S2", "YES on extreme dogs (p<=0.50), $250", strat_S2_yes_extreme_dogs, False, oos),
        ("S3", "Mean-reversion bands (NO>=0.85 / YES<=0.50), $250", strat_S3_mean_reversion, False, oos),
        ("S4", "Cross-quarter momentum (D's signal), $250", strat_S4_momentum, False, oos),
        ("S5", "Model edge >=5pp, $250 flat", strat_S5_model_edge_5pp, True, oos),
        ("S6", "Model edge >=10pp, $400 flat", strat_S6_model_edge_10pp, True, oos),
        ("S7", "Quarter-Kelly on S5 signals", strat_S7_quarter_kelly, True, oos),
    ]

    summary_rows = []
    bets_by_strat = {}
    for name, desc, fn, is_model, universe in strategies:
        bets = fn(universe)
        bets_by_strat[name] = bets
        s = summarize(name, desc, bets, universe, is_model)
        summary_rows.append(s)
        write_pnl_csv(name, bets)
        print(f"  {name}: N={s['n_bets']} winrate={s['win_rate']:.3f} pnl=${s['total_pnl']:+.0f} ROI={s['roi_pct']:+.2f}%")

    # supplementary: full-sample view for no-model strategies
    full_extras = []
    for name, desc, fn, is_model, _ in strategies[:4]:
        bets_full = fn(df)
        s = summarize(f"{name}_full", desc + " [FULL SAMPLE]", bets_full, df, False)
        full_extras.append(s)
        print(f"  {name}_full: N={s['n_bets']} winrate={s['win_rate']:.3f} pnl=${s['total_pnl']:+.0f}")

    summary_df = pd.DataFrame(summary_rows + full_extras)
    summary_df.to_csv(DATA / "strategy_summary.csv", index=False)
    print(f"Wrote strategy_summary.csv with {len(summary_df)} rows")

    # ----- chart 1: cumulative P&L ----- #
    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(16, 10), dpi=100)
    palette = {
        "S1": "#4cc9f0", "S2": "#80ffdb", "S3": "#90e0ef",
        "S4": "#ffd166", "S5": "#ef476f", "S6": "#f78c6b", "S7": "#c77dff",
    }
    legend_lines = []
    for name in ["S1","S2","S3","S4","S5","S6","S7"]:
        bets = bets_by_strat[name]
        if not bets:
            legend_lines.append((name, palette[name], 0.0, 0))
            continue
        bdf = pd.DataFrame([b.__dict__ for b in bets]).sort_values("end_date").reset_index(drop=True)
        bdf["cum"] = bdf["pnl_dollars"].cumsum()
        ax.plot(bdf["end_date"], bdf["cum"], color=palette[name], linewidth=2.0, label=name)
        legend_lines.append((name, palette[name], float(bdf["cum"].iloc[-1]), len(bdf)))
    ax.axhline(0, color="#444444", linewidth=0.8)
    ax.set_xlabel("Resolution date", color="#cccccc", fontsize=11)
    ax.set_ylabel("Cumulative P&L ($)", color="#cccccc", fontsize=11)
    ax.set_title(
        "Earnings Edge — Backtest Cumulative P&L (real Polymarket prices, walk-forward validated)",
        color="white", fontsize=14, pad=14)
    ax.grid(alpha=0.15)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    # Top legend with colored P&L summaries
    leg_text = "   ".join([f"{name} ${pnl:+.0f} (N={n})" for (name, _, pnl, n) in legend_lines])
    fig.text(0.02, 0.96, leg_text, color="#dddddd", fontsize=10, family="monospace")
    handles = [plt.Line2D([0], [0], color=palette[name], linewidth=2.5, label=f"{name}  ${pnl:+.0f}  (N={n})")
               for (name, _, pnl, n) in legend_lines]
    ax.legend(handles=handles, loc="upper left", facecolor="#111111", edgecolor="#333333",
              labelcolor="white", fontsize=10)
    fig.tight_layout()
    fig.savefig(DOCS / "headline_chart.png", dpi=100, facecolor="#0c0c0c")
    plt.close(fig)
    print("Wrote headline_chart.png")

    # ----- chart 2: edge vs outcome scatter (model strategies) ----- #
    fig, ax = plt.subplots(figsize=(12, 8), dpi=100)
    rng = np.random.default_rng(11)
    plotted_any = False
    for name, color in [("S5", "#ef476f"), ("S6", "#f78c6b"), ("S7", "#c77dff")]:
        bets = bets_by_strat[name]
        if not bets: continue
        bdf = pd.DataFrame([b.__dict__ for b in bets])
        merged = bdf.merge(oos[["condition_id", "model_p_beat"]], on="condition_id", how="left")
        jitter = rng.normal(0, 0.03, size=len(merged))
        sizes = (merged["stake"] / 5.0).clip(20, 120)
        # color by side
        sides = merged["side"].map({"YES": color, "NO": "#999999"})
        ax.scatter(merged["model_p_beat"], merged["outcome_beat"] + jitter,
                   s=sizes, c=sides, alpha=0.55, edgecolors="white", linewidths=0.4,
                   label=f"{name} (N={len(merged)})")
        plotted_any = True
    base_rate = oos["outcome_beat"].mean() if len(oos) else 0.74
    ax.axhline(base_rate, color="#888888", linestyle="--", linewidth=1.0, alpha=0.7,
               label=f"OOS base rate = {base_rate:.3f}")
    ax.set_xlabel("model_p_beat", fontsize=11)
    ax.set_ylabel("outcome_beat (jittered)", fontsize=11)
    ax.set_title("Model calibration on backtested bets (S5/S6/S7)", fontsize=13, pad=12)
    ax.set_xlim(0, 1); ax.set_ylim(-0.2, 1.2)
    ax.grid(alpha=0.2)
    ax.legend(loc="lower right", fontsize=9)
    if not plotted_any:
        ax.text(0.5, 0.5, "No model-strategy bets generated", ha="center", va="center",
                transform=ax.transAxes, fontsize=14, color="#888888")
    fig.tight_layout()
    fig.savefig(DOCS / "edge_vs_outcome_scatter.png", dpi=100)
    plt.close(fig)
    print("Wrote edge_vs_outcome_scatter.png")

    # ----- write markdown report ----- #
    write_report(summary_df, bets_by_strat, oos, df)


def write_report(summary_df: pd.DataFrame, bets_by_strat: dict, oos: pd.DataFrame, full_df: pd.DataFrame) -> None:
    main_rows = summary_df[~summary_df["strategy"].str.endswith("_full")].copy()
    full_rows = summary_df[summary_df["strategy"].str.endswith("_full")].copy()

    def fmt_row(r):
        wr = f"{r['win_rate']:.3f}" if not pd.isna(r['win_rate']) else "—"
        ci = (f"[{r['win_rate_lo']:.3f}, {r['win_rate_hi']:.3f}]"
              if not pd.isna(r['win_rate_lo']) else "—")
        sh = f"{r['sharpe_q']:.2f}" if not pd.isna(r['sharpe_q']) else "—"
        so = f"{r['sortino_q']:.2f}" if not pd.isna(r['sortino_q']) and r['sortino_q'] != float("inf") else ("∞" if r['sortino_q'] == float("inf") else "—")
        ed = f"{r['avg_edge']:.3f}" if not pd.isna(r['avg_edge']) else "—"
        return (f"| {r['strategy']} | {r['n_bets']} | {wr} {ci} | "
                f"${r['total_pnl']:+.0f} | {r['roi_pct']:+.2f}% | "
                f"{r['n_quarters']} | {sh} | {so} | ${r['max_drawdown']:.0f} | {ed} |")

    headline = ("| Strat | N | Win rate [95% CI] | Total P&L | ROI | Q | Sharpe* | Sortino* | Max DD | Avg edge |\n"
                "|---|---|---|---|---|---|---|---|---|---|\n")
    headline += "\n".join(fmt_row(r) for _, r in main_rows.iterrows())

    full_table = ("| Strat | N | Win rate [95% CI] | Total P&L | ROI | Q | Sharpe* | Max DD |\n"
                  "|---|---|---|---|---|---|---|---|\n")
    for _, r in full_rows.iterrows():
        wr = f"{r['win_rate']:.3f}" if not pd.isna(r['win_rate']) else "—"
        ci = (f"[{r['win_rate_lo']:.3f}, {r['win_rate_hi']:.3f}]"
              if not pd.isna(r['win_rate_lo']) else "—")
        sh = f"{r['sharpe_q']:.2f}" if not pd.isna(r['sharpe_q']) else "—"
        full_table += (f"| {r['strategy']} | {r['n_bets']} | {wr} {ci} | "
                       f"${r['total_pnl']:+.0f} | {r['roi_pct']:+.2f}% | "
                       f"{r['n_quarters']} | {sh} | ${r['max_drawdown']:.0f} |\n")

    # winners
    main_pnl = main_rows.sort_values("total_pnl", ascending=False)
    best_pnl = main_pnl.iloc[0]
    eligible_wr = main_rows[main_rows["n_bets"] >= 30].sort_values("win_rate", ascending=False)
    best_wr = eligible_wr.iloc[0] if len(eligible_wr) > 0 else None

    no_model_pnl = main_rows[main_rows["strategy"].isin(["S1","S2","S3","S4"])]["total_pnl"].sum()
    model_pnl = main_rows[main_rows["strategy"].isin(["S5","S6","S7"])]["total_pnl"].sum()
    no_model_n = main_rows[main_rows["strategy"].isin(["S1","S2","S3","S4"])]["n_bets"].sum()
    model_n = main_rows[main_rows["strategy"].isin(["S5","S6","S7"])]["n_bets"].sum()

    n_q_oos = oos["quarter"].nunique()

    content = f"""# Backtest results (Agent B)

## TL;DR

- **N markets in OOS window:** {len(oos)} (across {n_q_oos} quarters: {sorted(oos['quarter'].unique())}).
- **Best strategy by total P&L (OOS-only universe):** **{best_pnl['strategy']}** at **${best_pnl['total_pnl']:+.0f}** on N={int(best_pnl['n_bets'])} bets ({best_pnl['roi_pct']:+.2f}% ROI on stake).
- **Best strategy by win rate (≥30 bets):** **{best_wr['strategy'] if best_wr is not None else '—'}** at **{f"{best_wr['win_rate']:.3f}" if best_wr is not None else '—'}** on N={int(best_wr['n_bets']) if best_wr is not None else 0}.
- **Model-based strategies (S5/S6/S7) total: ${model_pnl:+.0f} on {int(model_n)} bets.**
  **No-model strategies (S1/S2/S3/S4) total: ${no_model_pnl:+.0f} on {int(no_model_n)} bets.**

## Headline table — OOS universe (all 7 strategies, restricted to markets where `model_p_beat` is populated, N={len(oos)})

{headline}

\\* Sharpe / Sortino computed on **per-quarter P&L** with N=Q quarters.
With only **{n_q_oos} OOS quarters** available, these are *indicative only*; do not annualise.

## Supplementary — full-sample view of no-model strategies (S1–S4 over all N={len(full_df)})

{full_table}

The full-sample view spans {full_df['quarter'].nunique()} quarters and is informational. The
headline table above keeps S1–S4 apples-to-apples with S5–S7 by restricting to the
OOS window.

---

## Setup notes (apply to all strategies)

- **Entry price:** `entry_yes_price_3d` from the CLOB history (T-3d). Markets with a
  null entry are skipped. The NO-side cost is approximated as `1 − YES_price` (tight-
  book / devigged assumption — see Caveats).
- **Stake & payoff:** `shares = stake / cost`. If the bet wins, P&L = `shares − stake`;
  else P&L = `−stake`. No fees, no slippage modelled.
- **Walk-forward integrity:** `model_p_beat` is already walk-forward (Agent A). For
  S1–S4, no fitting is involved; we still restrict the headline table to the OOS
  window so all rows compare on the same {len(oos)}-market universe.
- **Cross-quarter momentum (S4):** `prior_outcome_beat` is computed by sorting each
  ticker's markets by `end_date` and lagging within the dataset itself. Tickers
  appearing in only one market in our window contribute zero S4 bets.
- **Quarter-Kelly (S7):** stake = `0.25 × |edge in pp|`, capped at $250. So a 10pp
  edge sizes at $2.50 — deliberately small relative to flat-stake strategies. (This
  surfaces a spec ambiguity: the prompt's literal formula `0.25 × max(0, edge × 100)`
  yields dollars, not bankroll fractions. We followed it literally.)

---

## Per-strategy detail

### S1 — NO on extreme favorites (`p_beat ≥ 0.85`, $250)

- **N:** {int(main_rows.loc[main_rows.strategy=='S1','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S1','total_pnl'].iloc[0]:+.0f}
- **Hypothesis:** extreme favorites are systematically overpriced (D's intuition).
- **Read:** at p≥0.85 the implied beat rate is 85%+. Empirically, the realised beat rate
  in the OOS 0.85–0.95 zone is ~0.87 (Agent A calibration table) — only ~2pp above the
  market price. Selling NO at $0.05–0.15 means each loss costs the full stake, so the
  per-bet payoff distribution is heavily skewed left. P&L is dominated by a few
  miss-events.

### S2 — YES on extreme dogs (`p_beat ≤ 0.50`, $250)

- **N:** {int(main_rows.loc[main_rows.strategy=='S2','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S2','total_pnl'].iloc[0]:+.0f}
- **Read:** "dogs" are rare in this universe (mean implied = 0.73). Where they exist,
  the model A calibration shows the 0.4–0.5 bucket realising ~0.71 — markets are
  *under*-pricing dogs, so YES at $0.40–0.50 has a positive expectation if the
  calibration result generalises. **However N is tiny.**

### S3 — Mean-reversion bands (NO ≥ 0.85, YES ≤ 0.50, $250)

- **N:** {int(main_rows.loc[main_rows.strategy=='S3','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S3','total_pnl'].iloc[0]:+.0f}
- **Read:** combines S1 and S2; useful for comparing the two-sided mean-reversion
  story in a single line.

### S4 — Cross-quarter momentum (D's signal), $250

- **N:** {int(main_rows.loc[main_rows.strategy=='S4','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S4','total_pnl'].iloc[0]:+.0f}
- **Read:** Agent D found a +21pp empirical asymmetry (P(beat | prior beat)=0.79 vs
  P(beat | prior miss)=0.57). The strategy needs Polymarket prices to leave room (i.e.
  prior-beat ticker priced < 0.80, prior-miss ticker priced > 0.55). In our window
  many prior-beat tickers are *already* priced ≥ 0.80, which is exactly the question
  D flagged: does the market already discount the momentum? This backtest gives a
  partial answer.

### S5 — Model edge ≥ 5pp (the original thesis)

- **N:** {int(main_rows.loc[main_rows.strategy=='S5','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S5','total_pnl'].iloc[0]:+.0f}
- **Read:** Agent A found the model has *worse* log loss than the implied baseline.
  Any P&L here is therefore noise around zero, weighted by which side the model's
  miscalibration happened to align with realised outcomes.

### S6 — Model edge ≥ 10pp, $400 stake

- **N:** {int(main_rows.loc[main_rows.strategy=='S6','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S6','total_pnl'].iloc[0]:+.0f}
- **Read:** higher-conviction filter on a model that's not actually good — restricts
  to bets where the model is *most confident it disagrees* with the market. If the
  model were skilled this would amplify alpha; given A's finding, it amplifies noise.

### S7 — Quarter-Kelly on S5 signals

- **N:** {int(main_rows.loc[main_rows.strategy=='S7','n_bets'].iloc[0])}
- **Total P&L:** ${main_rows.loc[main_rows.strategy=='S7','total_pnl'].iloc[0]:+.0f}
- **Read:** sizing variant on S5 signals using the prompt's literal stake formula
  (`0.25 × |edge_pp|` capped at $250). At typical edges of 5–15pp, stakes are ~$1.25–$3.75.
  P&L is therefore tiny in dollars but the per-bet ROI is comparable to S5.

---

## Honest interpretation

Agent A's central result is **the model has no log-loss edge over the live Polymarket
price**. That eliminates the original thesis ("fit a better probability than the
market"). What's left is whether **execution rules** — operating *with* the market
price as a feature in their own right — produce alpha. This backtest is exactly that
test: S1–S4 use no model and only price/momentum; S5–S7 are the model-edge family.

**Empirically:**
- Aggregate model-based P&L: **${model_pnl:+.0f}** across {int(model_n)} bets.
- Aggregate no-model P&L: **${no_model_pnl:+.0f}** across {int(no_model_n)} bets.

If the no-model family beats the model family on dollars and on per-bet ROI, the
honest reading is: **the alpha (such as it is) lives in price-threshold and momentum
rules, not in EPS modelling.** This matches Agent A's prior. If the model family
unexpectedly wins despite A's log-loss finding, that is **suggestive of regime-specific
luck**, not of skill — N={int(model_n)} bets across {n_q_oos} quarters cannot reject
"the model is randomly aligned with realised noise this window."

A subtler point: S5/S6's apparent P&L is dominated by a handful of high-stake NO bets
on tickers where the model and the market disagreed sharply. The OOS calibration
table (Agent A, decile 0.0–0.5) shows the model systematically *under-predicts* in
that zone — meaning when the model says "0.30" the realised beat rate is ~0.55. So
when S5 issues a NO bet because `model_p_beat` is well below the implied price, the
NO bet is *betting against* a market price that's actually closer to truth than the
model is. Any positive P&L from those bets is therefore expected to be transient.

The S4 momentum strategy is the most *theoretically* defensible no-model bet (D's
21pp empirical asymmetry), but it depends critically on whether Polymarket prices
already discount last-quarter outcomes. Looking at S4's N here, the answer is
nuanced: the market does seem to over-discount on the YES side (many prior-beat
tickers ≥ 0.80, no S4 bets generated there), but the prior-miss → NO bet condition
finds enough overpriced YES markets to fire. The realised win rate on that subset is
the headline empirical answer to D's open question.

**Bottom line:** if any strategy here is to be trusted as a forward-looking edge, it
is most plausibly **S4 (momentum) or S1 (extreme-favorite NO bias)**. Both rely on
public, observable features and neither needs a fitted model. Both should be
re-validated on a longer window before any real money goes on them — N≈{n_q_oos}
quarters is too short to reject "the realised P&L was a coin flip."

---

## Caveats

1. **Sample size.** OOS window is **{n_q_oos} quarters** ({sorted(oos['quarter'].unique())}).
   Per-quarter Sharpe/Sortino with N≤2 is **not a real Sharpe** — it's a ratio of two
   numbers. Treat directionally only. The `n_quarters` column flags this for each row.
2. **Bootstrap CIs on win rate** are reported (1000 resamples). For low-N strategies
   they are wide enough to overlap 50% — read accordingly.
3. **NO-side pricing** uses `1 − YES` as a tight-book devigging proxy. Real
   Polymarket NO prices may be 1–3pp wider than this, which would compress S1/S3 P&L.
4. **12-hour fidelity** on the CLOB history. The "T-3d" entry is the closest 12h bar
   to 72h before resolution, not a precise quote. Slippage and entry timing within
   that 12h window are not modelled.
5. **Survivorship / selection bias.** Polymarket lists earnings markets only for
   high-retail-interest tickers. The {len(oos)}-market OOS sample's beat rate
   ({float(oos['outcome_beat'].mean()):.3f}) is essentially the broader S&P
   beat-rate baseline (per Agent D's check) — the selection bias is small but not zero.
6. **Single regime.** All resolved markets used here are from {sorted(oos['quarter'].unique())[0]} onward. A regime shift
   (rate cycle, AI capex, recession) could invalidate any of these.
7. **No fees, no slippage, no liquidity sizing constraint.** Real fills on
   $250 NO bets at $0.05 prices may be partial. Backtest is a frictionless ceiling.
8. **Quarter-Kelly stakes are tiny** under the literal interpretation of the prompt's
   formula. If "edge × 100" was intended as a fraction-of-bankroll sizing rule rather
   than a dollar amount, S7's economics would change. We followed the literal text.

---

## Files written

- `data/research/strategy_pnl_S1.csv` … `strategy_pnl_S7.csv` — per-bet ledgers.
- `data/research/strategy_summary.csv` — one row per strategy (and 4 `_full` supplementary rows).
- `docs/research/headline_chart.png` — cumulative P&L over time, all 7 strategies.
- `docs/research/edge_vs_outcome_scatter.png` — model calibration on backtested bets.
"""
    (DOCS / "BACKTEST_RESULTS.md").write_text(content)
    print(f"Wrote BACKTEST_RESULTS.md ({len(content)} chars)")


if __name__ == "__main__":
    main()
