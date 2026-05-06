#!/usr/bin/env python3
"""Fit logistic regression with walk-forward CV.

Walk-forward by year-quarter:
  - For each test quarter Qt, train on rows with end_date < first day of Qt.
  - Predict on Qt's rows. Concatenate out-of-sample predictions.

Reports AUC + 95% bootstrap CI, Brier, calibration table, log-loss vs:
  - naive base-rate baseline
  - polymarket-implied baseline
"""
import json
import pickle
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (brier_score_loss, log_loss, roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parents[2]
TRAIN = ROOT / "data/research/training_data.parquet"
JSONL = ROOT / "data/research/earnings_markets_with_entry.jsonl"
MODEL_OUT = ROOT / "data/research/model.pkl"
CALIB_CSV = ROOT / "data/research/calibration_table.csv"

NUMERIC_FEATURES = [
    "polymarket_implied_p_beat",
    "lagged_beat_rate_8q",
    "surprise_mean_8q",
    "surprise_stdev_8q",
    "quarters_since_last_miss",
    "sector_beat_rate_prior_8q",
]


def quarter_key(iso_dt):
    dt = datetime.fromisoformat(iso_dt)
    return (dt.year, (dt.month - 1) // 3 + 1)


def quarter_first_day(yq):
    y, q = yq
    m = (q - 1) * 3 + 1
    return datetime(y, m, 1, tzinfo=timezone.utc)


def build_X(df, sectors):
    X = df[NUMERIC_FEATURES].astype(float).values
    # one-hot sector (without dropping; small)
    sec_oh = pd.get_dummies(df["sector"]).reindex(columns=sectors, fill_value=0)
    return np.hstack([X, sec_oh.values.astype(float)]), sec_oh.columns.tolist()


def safe_logloss(y, p, eps=1e-15):
    p = np.clip(p, eps, 1 - eps)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def bootstrap_auc_ci(y, p, n=1000, seed=42):
    rng = np.random.default_rng(seed)
    n_pos = (y == 1).sum()
    n_neg = (y == 0).sum()
    if n_pos < 2 or n_neg < 2:
        return (np.nan, np.nan)
    aucs = []
    idx = np.arange(len(y))
    for _ in range(n):
        s = rng.choice(idx, size=len(idx), replace=True)
        ys, ps = y[s], p[s]
        if len(np.unique(ys)) < 2:
            continue
        aucs.append(roc_auc_score(ys, ps))
    if not aucs:
        return (np.nan, np.nan)
    return (float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5)))


def main():
    df = pd.read_parquet(TRAIN)
    print(f"loaded training_data: shape={df.shape}", flush=True)

    df = df.copy()
    df["yq"] = df["end_date"].apply(quarter_key)
    df = df.sort_values("end_date").reset_index(drop=True)

    # Drop rows with missing target or polymarket implied price
    df = df.dropna(subset=["outcome_beat", "polymarket_implied_p_beat"])
    print(f"after dropping missing target/implied: {df.shape}", flush=True)

    # Sectors used for one-hot
    sectors = sorted(df["sector"].unique())
    print(f"sectors: {sectors}", flush=True)

    quarters = sorted(df["yq"].unique())
    print(f"quarters: {len(quarters)} -> {quarters}", flush=True)

    # Walk-forward: skip earliest quarter(s) without enough train data.
    oos_idx = []
    oos_pred = []
    oos_pred_baseline_implied = []
    oos_pred_baseline_naive = []
    oos_y = []
    oos_quarters = []

    for qi, q in enumerate(quarters):
        train_mask = df["yq"].apply(lambda x: x < q)
        test_mask = df["yq"] == q
        n_train = train_mask.sum()
        n_test = test_mask.sum()
        if n_train < 30 or n_test < 5:
            print(f"  skip Q={q} (n_train={n_train}, n_test={n_test})", flush=True)
            continue

        train_df = df[train_mask]
        test_df = df[test_mask]

        Xtr, _ = build_X(train_df, sectors)
        Xte, _ = build_X(test_df, sectors)
        ytr = train_df["outcome_beat"].astype(int).values
        yte = test_df["outcome_beat"].astype(int).values

        pipe = Pipeline([
            ("impute", SimpleImputer(strategy="mean")),
            ("scale", StandardScaler()),
            ("lr", LogisticRegression(C=1.0, max_iter=1000, penalty="l2")),
        ])
        pipe.fit(Xtr, ytr)
        p_test = pipe.predict_proba(Xte)[:, 1]

        # Naive baseline = train base rate
        base_rate = float(ytr.mean())

        oos_idx.extend(test_df.index.tolist())
        oos_pred.extend(p_test.tolist())
        oos_pred_baseline_implied.extend(test_df["polymarket_implied_p_beat"].values.tolist())
        oos_pred_baseline_naive.extend([base_rate] * len(test_df))
        oos_y.extend(yte.tolist())
        oos_quarters.extend([q] * len(test_df))

        print(f"  Q={q} n_train={n_train} n_test={n_test} "
              f"test_base_rate={float(yte.mean()):.3f} "
              f"model_mean_p={p_test.mean():.3f}", flush=True)

    if not oos_pred:
        print("FATAL: no walk-forward predictions made.", flush=True)
        return

    y_arr = np.array(oos_y, dtype=int)
    p_arr = np.array(oos_pred, dtype=float)
    p_imp = np.array(oos_pred_baseline_implied, dtype=float)
    p_naive = np.array(oos_pred_baseline_naive, dtype=float)

    print(f"\n=== OOS METRICS (N={len(y_arr)}) ===", flush=True)
    auc = roc_auc_score(y_arr, p_arr)
    auc_imp = roc_auc_score(y_arr, p_imp)
    print(f"AUC (model):           {auc:.4f}", flush=True)
    auc_lo, auc_hi = bootstrap_auc_ci(y_arr, p_arr, n=1000)
    print(f"AUC 95% CI (model):    [{auc_lo:.4f}, {auc_hi:.4f}]", flush=True)
    print(f"AUC (poly implied):    {auc_imp:.4f}", flush=True)

    brier = brier_score_loss(y_arr, p_arr)
    brier_imp = brier_score_loss(y_arr, p_imp)
    brier_naive = brier_score_loss(y_arr, p_naive)
    print(f"Brier (model):         {brier:.4f}", flush=True)
    print(f"Brier (poly implied):  {brier_imp:.4f}", flush=True)
    print(f"Brier (naive):         {brier_naive:.4f}", flush=True)

    ll = safe_logloss(y_arr, p_arr)
    ll_imp = safe_logloss(y_arr, p_imp)
    ll_naive = safe_logloss(y_arr, p_naive)
    print(f"LogLoss (model):         {ll:.4f}", flush=True)
    print(f"LogLoss (poly implied):  {ll_imp:.4f}", flush=True)
    print(f"LogLoss (naive baseline):{ll_naive:.4f}", flush=True)
    delta_imp = ll_imp - ll
    print(f"\nDelta vs poly implied: {delta_imp:+.4f}  "
          f"(positive = model BEATS Polymarket)", flush=True)
    if delta_imp > 0:
        print("  -> Model beats Polymarket-implied baseline on log loss.", flush=True)
    else:
        print("  -> Model does NOT beat Polymarket-implied baseline. No edge from model.",
              flush=True)

    # Calibration: deciles of predicted prob -> realized rate
    bins = np.linspace(0.0, 1.0, 11)
    bin_idx = np.digitize(p_arr, bins, right=True)
    rows = []
    for b in range(1, 11):
        sel = bin_idx == b
        n = int(sel.sum())
        if n == 0:
            rows.append({"decile": b, "lo": float(bins[b-1]),
                         "hi": float(bins[b]), "n": 0,
                         "mean_pred": None, "realized": None})
            continue
        rows.append({
            "decile": b,
            "lo": float(bins[b-1]),
            "hi": float(bins[b]),
            "n": n,
            "mean_pred": float(p_arr[sel].mean()),
            "realized": float(y_arr[sel].mean()),
        })
    calib_df = pd.DataFrame(rows)
    calib_df.to_csv(CALIB_CSV, index=False)
    print(f"\nwrote calibration table -> {CALIB_CSV.name}", flush=True)
    print(calib_df.to_string(index=False), flush=True)

    # Fit final model on ALL data (for agent B's optional use; B should still rely on
    # walk-forward predictions when scoring its own backtest)
    Xfull, _ = build_X(df, sectors)
    yfull = df["outcome_beat"].astype(int).values
    pipe_full = Pipeline([
        ("impute", SimpleImputer(strategy="mean")),
        ("scale", StandardScaler()),
        ("lr", LogisticRegression(C=1.0, max_iter=1000, penalty="l2")),
    ])
    pipe_full.fit(Xfull, yfull)

    # Feature importance: coef × stdev of feature
    feat_names = NUMERIC_FEATURES + [f"sector={s}" for s in sectors]
    coefs = pipe_full.named_steps["lr"].coef_[0]
    # stdev on (imputed, NOT scaled) X
    Xim = pipe_full.named_steps["impute"].transform(Xfull)
    stds = Xim.std(axis=0)
    importance = pd.DataFrame({
        "feature": feat_names,
        "coef": coefs,  # this is on standardized X
        "stdev_raw": stds,
        "abs_coef": np.abs(coefs),
    }).sort_values("abs_coef", ascending=False)

    importance_path = ROOT / "data/research/feature_importance.csv"
    importance.to_csv(importance_path, index=False)
    print(f"\nwrote feature importance -> {importance_path.name}", flush=True)
    print(importance.to_string(index=False), flush=True)

    # Pickle the FULL-data model
    with MODEL_OUT.open("wb") as fh:
        pickle.dump({
            "pipeline": pipe_full,
            "feature_names": feat_names,
            "numeric_features": NUMERIC_FEATURES,
            "sectors": sectors,
        }, fh)
    print(f"wrote model -> {MODEL_OUT.name}", flush=True)

    # Update the JSONL with model_p_beat (out-of-sample where available, else null)
    pred_lookup = {idx: p for idx, p in zip(oos_idx, p_arr)}
    cid_to_pred = {df.loc[idx, "condition_id"]: float(pred_lookup[idx])
                   for idx in oos_idx}

    rows_jsonl = []
    if JSONL.exists():
        with JSONL.open() as fh:
            for line in fh:
                if line.strip():
                    rows_jsonl.append(json.loads(line))
    for r in rows_jsonl:
        r["model_p_beat"] = cid_to_pred.get(r["condition_id"])
    with JSONL.open("w") as fh:
        for r in rows_jsonl:
            fh.write(json.dumps(r) + "\n")
    n_with_model = sum(1 for r in rows_jsonl if r["model_p_beat"] is not None)
    print(f"updated {JSONL.name}: total={len(rows_jsonl)} "
          f"with_model_p_beat={n_with_model}", flush=True)

    # Save metrics summary
    summary = {
        "n_oos": int(len(y_arr)),
        "auc_model": float(auc),
        "auc_ci_low": float(auc_lo),
        "auc_ci_high": float(auc_hi),
        "auc_implied": float(auc_imp),
        "brier_model": float(brier),
        "brier_implied": float(brier_imp),
        "brier_naive": float(brier_naive),
        "logloss_model": float(ll),
        "logloss_implied": float(ll_imp),
        "logloss_naive": float(ll_naive),
        "delta_logloss_vs_implied": float(delta_imp),
        "model_beats_implied_on_logloss": bool(delta_imp > 0),
        "quarters_used": [list(q) for q in sorted(set(oos_quarters))],
    }
    (ROOT / "data/research/model_metrics.json").write_text(
        json.dumps(summary, indent=2))
    print(f"\nSUMMARY: {json.dumps(summary, indent=2)}", flush=True)


if __name__ == "__main__":
    main()
