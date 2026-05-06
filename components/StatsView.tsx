/**
 * StatsView — combined Paper-trading + Calibration tab.
 *
 * Loads /api/stats which returns:
 *   - cohort series (venue / tier / sector / market_cap)
 *   - calibration summary (legacy buckets + per-tier table)
 *
 * Empty state: when total_settled == 0, surface "Insufficient data —
 * N=0 settled, N=Y open paper-trades pending" instead of blank charts.
 */
"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr";
import {
  CALIBRATION_MIN_N,
  COHORT_MIN_N,
  type CalibrationSummary,
} from "@/lib/types";
import type { CohortSeries } from "@/lib/cohorts";
import { PaperTradingChart } from "./PaperTradingChart";
import { CalibrationChart } from "./CalibrationChart";

type CohortDim = "venue" | "tier" | "sector" | "market_cap";

type StatsApi = {
  stats: {
    generated_at: string;
    total_settled: number;
    total_open: number;
    cohorts: Record<CohortDim, CohortSeries[]>;
  };
  calibration:
    | { summary: CalibrationSummary; source: string }
    | { error: string };
};

const DIM_LABELS: Record<CohortDim, string> = {
  venue: "By venue",
  tier: "By tier",
  sector: "By sector",
  market_cap: "By market cap",
};

function fmtPct(p: number | null): string {
  if (p === null) return "—";
  return `${(p * 100).toFixed(1)}%`;
}
function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

export function StatsView({ initialData }: { initialData: StatsApi }) {
  const [dim, setDim] = useState<CohortDim>("venue");
  const { data, error } = useSWR<StatsApi>("/api/stats", jsonFetcher, {
    fallbackData: initialData,
    refreshInterval: 5 * 60_000,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Failed to load stats: {error.message}
      </div>
    );
  }
  const stats = data?.stats;
  const calibration =
    data?.calibration && "summary" in data.calibration
      ? data.calibration.summary
      : null;
  if (!stats) return null;

  const cohorts = stats.cohorts[dim];
  const noSettled = stats.total_settled === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
          <span className="tabular-nums">{stats.total_settled} settled</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{stats.total_open} open</span>
          <span aria-hidden="true">·</span>
          <time className="font-mono text-xs">
            {new Date(stats.generated_at).toISOString().slice(0, 16).replace("T", " ")}Z
          </time>
        </p>
      </div>

      {noSettled ? (
        <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-8 text-sm">
          <h2 className="text-base font-semibold">
            Insufficient data — N={stats.total_settled} settled, N={stats.total_open} open paper-trades pending
          </h2>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Paper-bet results show up here once underlying earnings events report
            and the resolution cron has marked the bets won/lost. The first cohort
            chart will appear after the first batch of bets settles. Cohort
            comparisons stay greyed out until N≥{COHORT_MIN_N} per cohort.
          </p>
        </div>
      ) : (
        <>
          {/* Paper-trading cohort chart */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
                Paper trading — {stats.total_settled} settled bets
              </h2>
              <select
                value={dim}
                onChange={(e) => setDim(e.target.value as CohortDim)}
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm focus:border-[var(--accent)] focus:outline-none"
                aria-label="Cohort grouping"
              >
                {Object.entries(DIM_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <PaperTradingChart series={cohorts} />
            {/* Cohort summary table */}
            <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--panel)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                    <th className="px-4 py-2 font-medium">Cohort</th>
                    <th className="px-4 py-2 text-right font-medium">N</th>
                    <th className="px-4 py-2 text-right font-medium">Win rate</th>
                    <th className="px-4 py-2 text-right font-medium">Mean edge</th>
                    <th className="px-4 py-2 text-right font-medium">Total P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.cohort} className="border-b border-white/[0.06] last:border-b-0">
                      <td className="px-4 py-2">
                        <span style={{ opacity: c.insufficient ? 0.5 : 1 }}>
                          {c.label}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono tabular-nums ${
                          c.insufficient ? "text-[var(--bad)]" : ""
                        }`}
                      >
                        {c.n}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {fmtPct(c.win_rate)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {c.mean_edge_pp === null ? "—" : `${c.mean_edge_pp.toFixed(1)}pp`}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono tabular-nums ${
                          c.total_pnl_dollars >= 0
                            ? "text-[var(--good)]"
                            : "text-[var(--bad)]"
                        }`}
                      >
                        {fmtUsd(c.total_pnl_dollars)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Calibration block — kept from original Calibration page */}
      {calibration && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Calibration — {calibration.total_resolved} resolved signals
          </h2>
          {calibration.total_resolved < CALIBRATION_MIN_N ? (
            <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
              Insufficient data for a reliability diagram (
              {calibration.total_resolved}/{CALIBRATION_MIN_N}). Buckets and
              per-tier scoring become meaningful past the threshold.
            </div>
          ) : (
            <CalibrationChart buckets={calibration.buckets} />
          )}
        </section>
      )}

      <p className="text-xs text-[var(--muted)]">
        Hypothetical P&amp;L based on $250 paper stakes per signal. Not trading
        advice. Real-world slippage and fees may differ.
      </p>
    </div>
  );
}
