#!/usr/bin/env python3
"""Generate the 3 verdict charts from strategy_summary.csv + per-bet ledgers."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "research"
DOCS = ROOT / "docs" / "research"
DOCS.mkdir(parents=True, exist_ok=True)

# Dark theme
plt.style.use("dark_background")
ACCENT = "#fb923c"   # orange
GOOD = "#34d399"     # emerald
BAD = "#fb7185"      # rose
NEUTRAL = "#a1a1aa"  # zinc-400


def load_summary():
    df = pd.read_csv(DATA / "strategy_summary.csv")
    return df


def chart1_headline_pnl():
    """Cumulative P&L per strategy across all categories, time on X."""
    summary = load_summary()
    # Strategies with per-bet ledgers in this/prior session
    strategies = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "E4", "E6", "EC1", "EC2", "EC3", "CR2"]
    fig, ax = plt.subplots(figsize=(16, 10), dpi=100)
    fig.patch.set_facecolor("#0a0a0a")
    ax.set_facecolor("#0a0a0a")

    palette = ["#fb923c", "#34d399", "#fb7185", "#60a5fa", "#a78bfa", "#facc15", "#22d3ee",
               "#f472b6", "#fbbf24", "#ef4444", "#10b981", "#94a3b8", "#06b6d4"]

    legend_lines = []

    for i, code in enumerate(strategies):
        path = DATA / f"strategy_pnl_{code}.csv"
        if not path.exists() or path.stat().st_size < 100:
            continue
        try:
            df = pd.read_csv(path)
        except Exception:
            continue
        if "pnl_dollars" in df.columns:
            pnl_col = "pnl_dollars"
        elif "pnl" in df.columns:
            pnl_col = "pnl"
        else:
            continue
        date_col = None
        for c in ["end_date", "decision_time", "entry_decision_time", "date"]:
            if c in df.columns:
                date_col = c
                break
        if date_col is None:
            continue
        try:
            df[date_col] = pd.to_datetime(df[date_col], utc=True, errors="coerce")
        except Exception:
            continue
        df = df.dropna(subset=[date_col])
        df = df.sort_values(date_col)
        df["cum"] = df[pnl_col].cumsum()
        if len(df) == 0:
            continue
        color = palette[i % len(palette)]
        ax.plot(df[date_col], df["cum"], label=f"{code}", color=color, linewidth=1.6, alpha=0.85)
        # endpoint label
        last_pnl = df["cum"].iloc[-1]
        legend_lines.append(f"{code}: {'+'  if last_pnl>=0 else ''}${last_pnl:,.0f} (N={len(df)})")

    ax.axhline(0, color=NEUTRAL, linewidth=0.8, alpha=0.5, linestyle="--")
    ax.set_title("Earnings Edge — Backtest cumulative P&L (real Polymarket prices, walk-forward validated)",
                 fontsize=14, color="#f3f4f6", pad=14)
    ax.set_xlabel("Bet decision date", color=NEUTRAL)
    ax.set_ylabel("Cumulative P&L ($)", color=NEUTRAL)
    ax.tick_params(colors=NEUTRAL)
    for spine in ax.spines.values():
        spine.set_color("#27272a")

    # Custom legend in top-left, two columns
    if legend_lines:
        legend = ax.legend(loc="upper left", ncol=2, frameon=False, fontsize=9, labelcolor=NEUTRAL,
                           title="Strategy   |   Final P&L (N)", title_fontsize=10)
        legend.get_title().set_color("#f3f4f6")

    out = DOCS / "headline_pnl.png"
    plt.tight_layout()
    plt.savefig(out, facecolor=fig.get_facecolor(), dpi=100)
    plt.close()
    print(f"wrote {out}")


def chart2_category_comparison():
    """Bar chart of Sharpe per strategy, colored by category. Threshold line at 0.75."""
    summary = load_summary()
    # Map each row to a category
    cat_map = {
        "S1": "earnings", "S2": "earnings", "S3": "earnings", "S4": "earnings",
        "S5": "earnings", "S6": "earnings", "S7": "earnings",
        "E4": "earnings", "E6": "earnings",
        "EC1": "econ", "EC2": "econ", "EC3": "econ", "EC4": "econ",
        "CR1": "crypto", "CR2": "crypto", "CR3": "crypto",
    }
    cat_color = {"earnings": "#60a5fa", "econ": "#facc15", "crypto": "#fb7185"}

    rows = []
    for _, r in summary.iterrows():
        code = r["strategy"]
        if "_full" in code:
            continue  # skip duplicate full-sample rows
        cat = cat_map.get(code)
        if not cat:
            continue
        # Sharpe — prefer the new sharpe column, fall back to sharpe_q
        sharpe = r.get("sharpe")
        if pd.isna(sharpe):
            sharpe = r.get("sharpe_q")
        n = r.get("n_bets", 0)
        if pd.isna(sharpe):
            continue
        rows.append({"code": code, "cat": cat, "sharpe": float(sharpe), "n": int(n)})

    if not rows:
        print("no rows for chart2")
        return

    rows_df = pd.DataFrame(rows).sort_values("sharpe", ascending=True)

    fig, ax = plt.subplots(figsize=(14, 9), dpi=100)
    fig.patch.set_facecolor("#0a0a0a")
    ax.set_facecolor("#0a0a0a")

    colors = [cat_color[c] for c in rows_df["cat"]]
    bars = ax.barh(rows_df["code"], rows_df["sharpe"], color=colors, edgecolor="#27272a", linewidth=0.8)

    # Annotate N on each bar
    for bar, (_, r) in zip(bars, rows_df.iterrows()):
        x = bar.get_width()
        y = bar.get_y() + bar.get_height() / 2
        x_pos = x + (0.15 if x >= 0 else -0.15)
        ha = "left" if x >= 0 else "right"
        ax.text(x_pos, y, f"N={r['n']}, Sharpe={r['sharpe']:+.2f}",
                color=NEUTRAL, va="center", ha=ha, fontsize=9)

    # Threshold line at 0.75
    ax.axvline(0.75, color=GOOD, linewidth=1.5, linestyle="--", alpha=0.7,
               label="Primary threshold (Sharpe ≥ 0.75)")
    ax.axvline(0, color=NEUTRAL, linewidth=0.8, alpha=0.5)

    ax.set_title("Sharpe by strategy — none clears the primary threshold",
                 fontsize=14, color="#f3f4f6", pad=14)
    ax.set_xlabel("Walk-forward Sharpe (per-bet)", color=NEUTRAL)
    ax.set_ylabel("Strategy code", color=NEUTRAL)
    ax.tick_params(colors=NEUTRAL)
    for spine in ax.spines.values():
        spine.set_color("#27272a")

    # Category legend
    handles = [plt.Rectangle((0,0), 1, 1, fc=cat_color[c]) for c in cat_color]
    labels = [f"{c} ({sum(1 for r in rows if r['cat']==c)} strategies)" for c in cat_color]
    handles.append(plt.Line2D([0], [0], color=GOOD, linestyle="--", linewidth=1.5))
    labels.append("Primary threshold")
    legend = ax.legend(handles, labels, loc="lower right", frameon=False, fontsize=10, labelcolor=NEUTRAL)

    plt.tight_layout()
    out = DOCS / "category_comparison.png"
    plt.savefig(out, facecolor=fig.get_facecolor(), dpi=100)
    plt.close()
    print(f"wrote {out}")


def chart3_robustness_matrix():
    """Robustness checks heatmap. With no strategies passing primary, this is sparse."""
    # Strategies that came closest by point-estimate Sharpe (top-3 candidates)
    candidates = [
        {"code": "CR2", "category": "crypto",
         "primary_sharpe": 1.57, "primary_n": 66, "primary_ci_lo": -0.42,
         "ablation": None, "period_split": None, "stripped": "PASS",
         "notes": "Far-OTM crypto NO ≤14d"},
        {"code": "EC2", "category": "econ",
         "primary_sharpe": 0.76, "primary_n": 66, "primary_ci_lo": -1.83,
         "ablation": None, "period_split": None, "stripped": "FAIL",
         "notes": "Pre-release drift fade"},
        {"code": "E6", "category": "earnings",
         "primary_sharpe": 0.48, "primary_n": 56, "primary_ci_lo": None,
         "ablation": None, "period_split": None, "stripped": "FAIL",
         "notes": "Edge ≥10pp tier $400"},
    ]
    # Build rows: [strategy, "primary_pass", "primary_n>=80", "ci_lo>=0.30", "ablation", "period_split", "stripped"]
    rows = []
    for c in candidates:
        rows.append({
            "code": c["code"],
            "Sharpe ≥ 0.75": "PASS" if c["primary_sharpe"] >= 0.75 else "FAIL",
            "N ≥ 80": "PASS" if c["primary_n"] >= 80 else f"FAIL (N={c['primary_n']})",
            "CI lo ≥ 0.30": "PASS" if c["primary_ci_lo"] is not None and c["primary_ci_lo"] >= 0.30
                            else (f"FAIL (lo={c['primary_ci_lo']:+.2f})" if c["primary_ci_lo"] is not None else "FAIL (no CI)"),
            "Ablation ≥ 0.40": "N/A (primary failed)",
            "Period split ≥ 0.40": "N/A (primary failed)",
            "Top-decile-strip > 0": c["stripped"] if c["stripped"] is not None else "N/A",
        })

    if not rows:
        print("no candidates for chart3")
        return

    columns = list(rows[0].keys())[1:]
    cell_text = [[r[c] for c in columns] for r in rows]

    # Color cells: PASS=green, FAIL=rose, N/A=neutral
    def color(text):
        if "PASS" in text: return "#064e3b"
        if "FAIL" in text: return "#7f1d1d"
        return "#27272a"

    cell_colors = [[color(t) for t in row] for row in cell_text]

    fig, ax = plt.subplots(figsize=(14, 4.5), dpi=100)
    fig.patch.set_facecolor("#0a0a0a")
    ax.set_facecolor("#0a0a0a")
    ax.axis("off")

    row_labels = [r["code"] for r in rows]
    table = ax.table(cellText=cell_text,
                     rowLabels=row_labels,
                     colLabels=columns,
                     cellColours=cell_colors,
                     loc="center",
                     cellLoc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.0, 2.4)

    # Style cells
    for (i, j), cell in table.get_celld().items():
        cell.set_edgecolor("#3f3f46")
        cell.set_text_props(color="#f3f4f6")
        if i == 0:
            cell.set_facecolor("#18181b")
            cell.set_text_props(color="#fb923c", fontweight="bold")
        elif j == -1:
            cell.set_facecolor("#18181b")
            cell.set_text_props(color="#fb923c", fontweight="bold")

    ax.set_title("Robustness matrix — top 3 candidate strategies\n(All failed primary; downstream checks N/A)",
                 fontsize=13, color="#f3f4f6", pad=20)

    out = DOCS / "robustness_matrix.png"
    plt.tight_layout()
    plt.savefig(out, facecolor=fig.get_facecolor(), dpi=100, bbox_inches="tight")
    plt.close()
    print(f"wrote {out}")


if __name__ == "__main__":
    chart1_headline_pnl()
    chart2_category_comparison()
    chart3_robustness_matrix()
