"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalibrationBucket } from "@/lib/types";

export function CalibrationChart({ buckets }: { buckets: CalibrationBucket[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (buckets.length === 0) return null;
  const points = buckets.map((b) => ({
    x: b.mean_predicted,
    y: b.mean_realized,
    n: b.n,
    label: `${(b.prob_lower * 100).toFixed(0)}–${(b.prob_upper * 100).toFixed(0)}%`,
  }));

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Reliability diagram</h2>
        <p className="text-xs text-[var(--muted)]">
          Predicted vs realized YES rate. Diagonal = perfect calibration.
        </p>
      </div>
      <div className="h-80 w-full">
        {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 32, left: 16 }}>
            <CartesianGrid stroke="#1f2026" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              stroke="#94949b"
              fontSize={12}
              label={{
                value: "Mean predicted probability",
                position: "insideBottom",
                offset: -16,
                fill: "#94949b",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              stroke="#94949b"
              fontSize={12}
              label={{
                value: "Realized rate",
                angle: -90,
                position: "insideLeft",
                fill: "#94949b",
                fontSize: 12,
              }}
            />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ]}
              stroke="#94949b"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
            <Tooltip
              contentStyle={{
                background: "#111114",
                border: "1px solid #1f2026",
                borderRadius: 6,
                color: "#e6e6e6",
                fontSize: 12,
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof points)[number];
                return (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-xs">
                    <div className="font-mono font-semibold">
                      Bucket {p.label}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono">
                      <span className="text-[var(--muted)]">Predicted</span>
                      <span>{(p.x * 100).toFixed(1)}%</span>
                      <span className="text-[var(--muted)]">Realized</span>
                      <span>{(p.y * 100).toFixed(1)}%</span>
                      <span className="text-[var(--muted)]">n</span>
                      <span>{p.n}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Scatter data={points} fill="#4f9dff" />
          </ScatterChart>
        </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
