"""Agent C — v3 model variations vs Polymarket-implied baseline.

Tests 5 alternative model classes for predicting Polymarket earnings outcomes.
Walk-forward by quarter. Verdict A iff ANY variant beats the implied baseline
on log loss (by >=0.02), AUC, AND Brier — all three.

See docs/research/v3/PROTOCOL_v3.md for full spec.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

REPO = Path("/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard")
TRAINING_PATH = REPO / "data/research/training_data.parquet"
OUT_DIR = REPO / "data/research/v3/model_variations"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SEED = 42
N_BOOTSTRAP = 1000
MIN_TRAIN = 50

# Baseline numbers from prior v1 session (MODEL_FIT.md, N=443 OOS).
BASELINE = {"log_loss": 0.487, "auc": 0.772, "brier": 0.158}

NUMERIC_FEATURES_FULL = [
    "polymarket_implied_p_beat",
    "lagged_beat_rate_8q",
    "surprise_mean_8q",
    "surprise_stdev_8q",
    "quarters_since_last_miss",
    "sector_beat_rate_prior_8q",
]
NUMERIC_FEATURES_NO_PRICE = [c for c in NUMERIC_FEATURES_FULL if c != "polymarket_implied_p_beat"]
NUMERIC_FEATURES_M5 = [
    "polymarket_implied_p_beat",
    "sector_beat_rate_prior_8q",
    "lagged_beat_rate_8q",
]
CATEGORICAL_FEATURE = "sector"


def load_data() -> pd.DataFrame:
    df = pd.read_parquet(TRAINING_PATH)
    df["end_date"] = pd.to_datetime(df["end_date"], utc=True)
    df["quarter"] = df["end_date"].dt.to_period("Q")
    df = df.sort_values("end_date").reset_index(drop=True)
    return df


def make_pipeline(numeric_features: list[str], use_sector: bool, model) -> Pipeline:
    """Mean-impute numerics, standardize, one-hot sector, then `model`."""
    numeric_pipe = Pipeline([
        ("imp", SimpleImputer(strategy="mean")),
        ("std", StandardScaler()),
    ])
    transformers = [("num", numeric_pipe, numeric_features)]
    if use_sector:
        cat_pipe = Pipeline([
            ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ])
        transformers.append(("cat", cat_pipe, [CATEGORICAL_FEATURE]))
    pre = ColumnTransformer(transformers)
    return Pipeline([("pre", pre), ("clf", model)])


def make_pipeline_no_scale(numeric_features: list[str], use_sector: bool, model) -> Pipeline:
    """Mean-impute numerics (no scaling — for trees), one-hot sector, then `model`."""
    numeric_pipe = Pipeline([("imp", SimpleImputer(strategy="mean"))])
    transformers = [("num", numeric_pipe, numeric_features)]
    if use_sector:
        cat_pipe = Pipeline([
            ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ])
        transformers.append(("cat", cat_pipe, [CATEGORICAL_FEATURE]))
    pre = ColumnTransformer(transformers)
    return Pipeline([("pre", pre), ("clf", model)])


def walk_forward_predict(
    df: pd.DataFrame,
    fit_predict_fn: Callable[[pd.DataFrame, pd.DataFrame], np.ndarray],
) -> pd.DataFrame:
    """Walk forward by quarter. Returns OOS prediction frame for evaluable quarters.

    For each test quarter Q, train = rows with end_date < first day of Q.
    Skip if len(train) < MIN_TRAIN.
    """
    quarters_in_data = sorted(df["quarter"].unique())
    rows = []
    for q in quarters_in_data:
        q_start = q.start_time.tz_localize("UTC")
        train = df[df["end_date"] < q_start]
        test = df[df["quarter"] == q]
        if len(train) < MIN_TRAIN or len(test) == 0:
            continue
        preds = fit_predict_fn(train, test)
        assert len(preds) == len(test), f"pred/test length mismatch: {len(preds)} vs {len(test)}"
        for (_, row), p in zip(test.iterrows(), preds):
            rows.append({
                "condition_id": row["condition_id"],
                "ticker": row["ticker"],
                "end_date": row["end_date"],
                "sector": row["sector"],
                "quarter": str(q),
                "outcome_beat": int(row["outcome_beat"]),
                "implied_p_beat": float(row["polymarket_implied_p_beat"]),
                "pred_p_beat": float(np.clip(p, 1e-6, 1 - 1e-6)),
            })
    return pd.DataFrame(rows)


# =============================================================
# Variant fit/predict closures
# =============================================================


def m1_fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """M1: logistic without polymarket_implied_p_beat."""
    pipe = make_pipeline(
        numeric_features=NUMERIC_FEATURES_NO_PRICE,
        use_sector=True,
        model=LogisticRegression(C=1.0, max_iter=1000, random_state=SEED),
    )
    pipe.fit(train, train["outcome_beat"].values)
    return pipe.predict_proba(test)[:, 1]


def m2_fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """M2: random forest, full feature set."""
    pipe = make_pipeline_no_scale(
        numeric_features=NUMERIC_FEATURES_FULL,
        use_sector=True,
        model=RandomForestClassifier(
            n_estimators=200, max_depth=5, random_state=SEED, n_jobs=-1
        ),
    )
    pipe.fit(train, train["outcome_beat"].values)
    return pipe.predict_proba(test)[:, 1]


def m3_fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """M3: HistGradientBoostingClassifier defaults, full feature set."""
    pipe = make_pipeline_no_scale(
        numeric_features=NUMERIC_FEATURES_FULL,
        use_sector=True,
        model=HistGradientBoostingClassifier(random_state=SEED),
    )
    pipe.fit(train, train["outcome_beat"].values)
    return pipe.predict_proba(test)[:, 1]


def m4_fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """M4: lookup / k-NN on (sector, implied_p) — 10 most-recent past matches."""
    train_sorted = train.sort_values("end_date", ascending=False).reset_index(drop=True)
    fallback = float(train["outcome_beat"].mean())
    preds = np.empty(len(test), dtype=float)
    for i, (_, row) in enumerate(test.iterrows()):
        sector = row["sector"]
        p_implied = float(row["polymarket_implied_p_beat"])
        cands = train_sorted[
            (train_sorted["sector"] == sector)
            & (train_sorted["polymarket_implied_p_beat"] >= p_implied - 0.05)
            & (train_sorted["polymarket_implied_p_beat"] <= p_implied + 0.05)
        ]
        if len(cands) == 0:
            preds[i] = fallback
        else:
            top = cands.head(10)
            preds[i] = float(top["outcome_beat"].mean())
    return preds


def m5_fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """M5: stacked simple — three engineered features, L2 logistic."""
    pipe = make_pipeline(
        numeric_features=NUMERIC_FEATURES_M5,
        use_sector=False,
        model=LogisticRegression(C=1.0, max_iter=1000, random_state=SEED),
    )
    pipe.fit(train, train["outcome_beat"].values)
    return pipe.predict_proba(test)[:, 1]


VARIANTS = {
    "M1": ("Logistic without implied price", m1_fit_predict),
    "M2": ("Random forest (200 trees, depth=5)", m2_fit_predict),
    "M3": ("HistGradientBoosting (default)", m3_fit_predict),
    "M4": ("k-NN: same sector + |Δp|≤0.05, top 10 recent", m4_fit_predict),
    "M5": ("Stacked simple (3 features, L2 logistic)", m5_fit_predict),
}


# =============================================================
# Metrics + bootstrap
# =============================================================


def _safe_auc(y, p):
    if len(np.unique(y)) < 2:
        return float("nan")
    return float(roc_auc_score(y, p))


def metric_triple(y: np.ndarray, p: np.ndarray) -> dict:
    p_clip = np.clip(p, 1e-6, 1 - 1e-6)
    return {
        "log_loss": float(log_loss(y, p_clip, labels=[0, 1])),
        "auc": _safe_auc(y, p_clip),
        "brier": float(brier_score_loss(y, p_clip)),
    }


def bootstrap_ci(
    y: np.ndarray, p: np.ndarray, n: int = N_BOOTSTRAP, seed: int = SEED
) -> dict:
    rng = np.random.default_rng(seed)
    n_obs = len(y)
    ll, au, br = [], [], []
    for _ in range(n):
        idx = rng.integers(0, n_obs, n_obs)
        ys, ps = y[idx], p[idx]
        if len(np.unique(ys)) < 2:
            au.append(float("nan"))
        else:
            au.append(roc_auc_score(ys, ps))
        ll.append(log_loss(ys, ps, labels=[0, 1]))
        br.append(brier_score_loss(ys, ps))
    return {
        "log_loss_lo": float(np.percentile(ll, 2.5)),
        "log_loss_hi": float(np.percentile(ll, 97.5)),
        "auc_lo": float(np.nanpercentile(au, 2.5)),
        "auc_hi": float(np.nanpercentile(au, 97.5)),
        "brier_lo": float(np.percentile(br, 2.5)),
        "brier_hi": float(np.percentile(br, 97.5)),
    }


def calibration_table(y: np.ndarray, p: np.ndarray) -> pd.DataFrame:
    edges = np.linspace(0.0, 1.0, 11)
    bins = np.digitize(p, edges[1:-1])  # 0..9
    rows = []
    for b in range(10):
        mask = bins == b
        n = int(mask.sum())
        if n == 0:
            rows.append({
                "decile": f"{edges[b]:.1f}–{edges[b+1]:.1f}",
                "n": 0,
                "mean_predicted": np.nan,
                "realized_beat_rate": np.nan,
            })
        else:
            rows.append({
                "decile": f"{edges[b]:.1f}–{edges[b+1]:.1f}",
                "n": n,
                "mean_predicted": float(p[mask].mean()),
                "realized_beat_rate": float(y[mask].mean()),
            })
    return pd.DataFrame(rows)


# =============================================================
# Main
# =============================================================


def beats_baseline(metrics: dict) -> dict:
    """Return per-metric pass dict + count + 'beats all three' bool."""
    ll_pass = metrics["log_loss"] < (BASELINE["log_loss"] - 0.02)  # margin per protocol
    auc_pass = metrics["auc"] > BASELINE["auc"]
    br_pass = metrics["brier"] < BASELINE["brier"]
    n_passing = int(ll_pass) + int(auc_pass) + int(br_pass)
    return {
        "ll_beats_baseline": ll_pass,
        "auc_beats_baseline": auc_pass,
        "brier_beats_baseline": br_pass,
        "n_metrics_beating": n_passing,
        "beats_all_three": ll_pass and auc_pass and br_pass,
        "ll_delta_vs_baseline": metrics["log_loss"] - BASELINE["log_loss"],
        "auc_delta_vs_baseline": metrics["auc"] - BASELINE["auc"],
        "brier_delta_vs_baseline": metrics["brier"] - BASELINE["brier"],
    }


def main() -> None:
    df = load_data()
    print(f"loaded {len(df)} rows; quarters in data: "
          f"{sorted(map(str, df['quarter'].unique()))}")
    print(f"outcome_beat rate: {df['outcome_beat'].mean():.3f}")

    # Compute the implied-baseline metrics on the same evaluable rows
    # (sanity check vs prior session's baseline).
    summary_rows = []

    # First run M1 to figure out which rows are in the OOS evaluable set,
    # then compute implied baseline on exactly those rows for fair comparison.
    print("\n--- running variants ---")
    variant_preds: dict[str, pd.DataFrame] = {}
    for code, (label, fn) in VARIANTS.items():
        print(f"  {code}: {label}")
        preds = walk_forward_predict(df, fn)
        variant_preds[code] = preds
        print(f"    N OOS = {len(preds)}")

    # All variants should produce the same OOS index (same walk-forward gate).
    oos_index = variant_preds["M1"][["condition_id"]].copy()
    for code, preds in variant_preds.items():
        if len(preds) != len(oos_index):
            print(f"  WARN: {code} has {len(preds)} OOS, M1 has {len(oos_index)}")

    # Implied baseline computed on the same OOS rows.
    base = variant_preds["M1"][["outcome_beat", "implied_p_beat"]].copy()
    y_base = base["outcome_beat"].values
    p_base = base["implied_p_beat"].values
    base_metrics = metric_triple(y_base, p_base)
    base_ci = bootstrap_ci(y_base, p_base)
    print(f"\nImplied baseline (this session, N={len(y_base)}): "
          f"log_loss={base_metrics['log_loss']:.4f}, "
          f"AUC={base_metrics['auc']:.4f}, "
          f"Brier={base_metrics['brier']:.4f}")
    print(f"  prior session reference: log_loss=0.487, AUC=0.772, Brier=0.158")

    summary_rows.append({
        "variant": "Implied (baseline, recomputed)",
        "label": "Polymarket YES price at T-3d",
        "n_oos": len(y_base),
        **base_metrics,
        **base_ci,
        "ll_beats_baseline": False,
        "auc_beats_baseline": False,
        "brier_beats_baseline": False,
        "n_metrics_beating": 0,
        "beats_all_three": False,
        "ll_delta_vs_baseline": base_metrics["log_loss"] - BASELINE["log_loss"],
        "auc_delta_vs_baseline": base_metrics["auc"] - BASELINE["auc"],
        "brier_delta_vs_baseline": base_metrics["brier"] - BASELINE["brier"],
    })

    # Per-variant metrics
    print("\n--- evaluating variants vs baseline ---")
    for code, (label, _) in VARIANTS.items():
        preds = variant_preds[code]
        y = preds["outcome_beat"].values
        p = preds["pred_p_beat"].values
        m = metric_triple(y, p)
        ci = bootstrap_ci(y, p)
        bb = beats_baseline(m)
        print(f"  {code}  N={len(preds)}  ll={m['log_loss']:.4f}  "
              f"auc={m['auc']:.4f}  brier={m['brier']:.4f}  "
              f"beats_all_three={bb['beats_all_three']}")
        summary_rows.append({
            "variant": code,
            "label": label,
            "n_oos": len(preds),
            **m,
            **ci,
            **bb,
        })
        # Save per-variant outputs
        preds.to_csv(
            OUT_DIR / f"variant_oos_predictions_{code}.csv", index=False
        )
        cal = calibration_table(y, p)
        cal.to_csv(OUT_DIR / f"calibration_{code}.csv", index=False)

    # Save calibration for implied baseline too
    cal_base = calibration_table(y_base, p_base)
    cal_base.to_csv(OUT_DIR / "calibration_implied.csv", index=False)

    summary_df = pd.DataFrame(summary_rows)
    summary_df.to_csv(OUT_DIR / "model_variations_summary.csv", index=False)

    # Quick verdict
    passing = summary_df[summary_df.get("beats_all_three", False) == True]
    passing = passing[passing["variant"] != "Implied (baseline, recomputed)"]
    print("\n=== VERDICT ===")
    if len(passing):
        print(f"PASS — {len(passing)} variant(s) beat baseline on all 3 metrics:")
        for _, r in passing.iterrows():
            print(f"  {r['variant']}: ll={r['log_loss']:.4f}, "
                  f"auc={r['auc']:.4f}, brier={r['brier']:.4f}")
    else:
        print("NO VARIANT beats baseline on all 3 metrics (with margin).")

    # Save a small JSON for consumption by the markdown writer
    verdict = {
        "baseline_recomputed": {**base_metrics, "n": int(len(y_base))},
        "baseline_prior_session": BASELINE,
        "variants": {
            r["variant"]: {
                "n_oos": int(r["n_oos"]),
                "log_loss": r["log_loss"],
                "log_loss_ci": [r["log_loss_lo"], r["log_loss_hi"]],
                "auc": r["auc"],
                "auc_ci": [r["auc_lo"], r["auc_hi"]],
                "brier": r["brier"],
                "brier_ci": [r["brier_lo"], r["brier_hi"]],
                "beats_all_three": bool(r["beats_all_three"]),
                "n_metrics_beating": int(r["n_metrics_beating"]),
            }
            for _, r in summary_df.iterrows()
        },
    }
    with open(OUT_DIR / "verdict.json", "w") as f:
        json.dump(verdict, f, indent=2)
    print(f"\nartifacts in {OUT_DIR}")


if __name__ == "__main__":
    main()
