/**
 * PaperTradingChart — FoggleBet-style cohort P&L chart.
 *
 * X-axis: settled_at date.
 * Y-axis: cumulative simulated P&L in dollars.
 * One line per cohort.
 *
 * Sample-size guard (per Correction D in spec): cohorts with N < 30
 * render as dashed + 50% opacity. The legend chip shows N alongside the
 * cohort name and final P&L.
 */
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CohortSeries } from "@/lib/cohorts";

const PALETTE = [
  "#10B981",
  "#3B82F6",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#EF4444",
  "#06B6D4",
  "#84CC16",
  "#F97316",
];

function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

/**
 * Recharts wants a wide-format dataset (one row per x-axis tick, columns
 * keyed by series name). Build that from per-series points lists.
 */
function buildWideData(series: CohortSeries[]): Record<string, number | string>[] {
  const dateSet = new Set<string>();
  for (const s of series) for (const p of s.points) dateSet.add(p.date);
  const dates = Array.from(dateSet).filter(Boolean).sort();

  // For each series, walk dates, carrying the last cumulative_pnl forward
  // when the cohort had no settle that day.
  const lastCum: Record<string, number> = {};
  for (const s of series) lastCum[s.cohort] = 0;

  const wide: Record<string, number | string>[] = [];
  for (const d of dates) {
    const row: Record<string, number | string> = { date: d };
    for (const s of series) {
      const point = s.points.find((p) => p.date === d);
      if (point) lastCum[s.cohort] = point.cumulative_pnl;
      row[s.cohort] = lastCum[s.cohort];
    }
    wide.push(row);
  }
  return wide;
}

export function PaperTradingChart({ series }: { series: CohortSeries[] }) {
  // Filter empty series — recharts crashes on 0-point lines.
  const visible = series.filter((s) => s.n > 0);

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        No settled paper bets yet. Lines will appear here as bets resolve.
      </div>
    );
  }

  const wide = buildWideData(visible);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-5">
      {/* Legend chips */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        {visible.map((s, i) => {
          const color = PALETTE[i % PALETTE.length];
          const pnlClass = s.total_pnl_dollars >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]";
          const opacity = s.insufficient ? 0.5 : 1;
          return (
            <span
              key={s.cohort}
              className="flex items-center gap-2 font-mono"
              style={{ opacity }}
              title={s.insufficient ? `N=${s.n} — insufficient data (need ${30}+)` : `N=${s.n}`}
            >
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4"
                style={{ background: color, borderTop: s.insufficient ? `2px dashed ${color}` : undefined }}
              />
              <span className="text-[var(--foreground)]">{s.label}</span>
              <span className={`tabular-nums ${pnlClass}`}>{fmtUsd(s.total_pnl_dollars)}</span>
              <span className="text-[var(--muted)]">N={s.n}</span>
            </span>
          );
        })}
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={wide} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#6B7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#6B7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmtUsd(Number(v))}
            />
            <Tooltip
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#9CA3AF" }}
              formatter={(value, name) => {
                const s = visible.find((x) => x.cohort === name);
                return [fmtUsd(Number(value)), s?.label ?? String(name)];
              }}
            />
            {visible.map((s, i) => (
              <Line
                key={s.cohort}
                type="monotone"
                dataKey={s.cohort}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={s.insufficient ? 1.5 : 2}
                strokeDasharray={s.insufficient ? "4 3" : undefined}
                strokeOpacity={s.insufficient ? 0.5 : 1}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
