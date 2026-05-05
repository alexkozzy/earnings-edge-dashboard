"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr";
import {
  CALIBRATION_MIN_N,
  type CalibrationSummary,
} from "@/lib/types";
import { CalibrationChart } from "./CalibrationChart";

type ApiResponse = {
  summary: CalibrationSummary;
  source: "remote" | "local-sample" | "missing";
};

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function CalibrationView({ initialData }: { initialData: ApiResponse }) {
  const { data, error } = useSWR<ApiResponse>("/api/calibration", jsonFetcher, {
    fallbackData: initialData,
    refreshInterval: 5 * 60_000,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Failed to load calibration: {error.message}
      </div>
    );
  }

  const summary = data?.summary;
  if (!summary) return null;

  const insufficient = summary.total_resolved < CALIBRATION_MIN_N;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calibration</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {summary.total_resolved} resolved signal
          {summary.total_resolved === 1 ? "" : "s"} as of{" "}
          <time dateTime={summary.generated_at} className="font-mono">
            {new Date(summary.generated_at).toISOString().slice(0, 16).replace("T", " ")}Z
          </time>
          {data?.source === "missing" && (
            <span className="ml-2 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-mono text-[var(--accent)]">
              NO SUMMARY YET
            </span>
          )}
        </p>
      </div>

      {insufficient ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-sm">
          <h2 className="text-base font-semibold">
            Insufficient data ({summary.total_resolved}/{CALIBRATION_MIN_N})
          </h2>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            We don&apos;t show a reliability diagram or per-tier scoring until at
            least {CALIBRATION_MIN_N} signals have resolved. Small samples
            produce wildly noisy calibration estimates that are worse than no
            estimate at all. The scanner needs to keep running through more
            earnings cycles before this view becomes meaningful.
          </p>
        </div>
      ) : (
        <>
          <CalibrationChart buckets={summary.buckets} />
          <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold">Per-tier calibration</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="px-4 py-2 font-medium">Tier</th>
                  <th className="px-4 py-2 text-right font-medium">n</th>
                  <th className="px-4 py-2 text-right font-medium">Predicted</th>
                  <th className="px-4 py-2 text-right font-medium">Realized</th>
                  <th className="px-4 py-2 text-right font-medium">Δ (pp)</th>
                  <th className="px-4 py-2 text-right font-medium">Brier</th>
                </tr>
              </thead>
              <tbody>
                {summary.per_tier.map((row) => {
                  const delta =
                    (row.mean_realized - row.mean_predicted) * 100;
                  return (
                    <tr key={row.tier} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3 font-mono text-sm font-semibold">
                        {row.tier}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {row.n}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {fmtPct(row.mean_predicted)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {fmtPct(row.mean_realized)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono text-sm ${
                          Math.abs(delta) < 5
                            ? "text-[var(--good)]"
                            : "text-[var(--bad)]"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {row.brier === null ? "—" : row.brier.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
