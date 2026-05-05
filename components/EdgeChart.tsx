"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Signal } from "@/lib/types";

const TIER_COLOR: Record<Signal["tier"], string> = {
  A: "#4f9dff",
  B: "#fbbf24",
  C: "#94949b",
};

type Point = {
  x: number; // market-implied prob (0..1)
  y: number; // historical base rate (0..1)
  ticker: string;
  question: string;
  tier: Signal["tier"];
  edge: number;
  id: string;
};

export function EdgeChart({ signals }: { signals: Signal[] }) {
  // ResponsiveContainer measures the parent in the DOM; during SSR there is
  // no DOM and Recharts logs width/height = -1 warnings. Defer to mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (signals.length === 0) return null;

  const byTier: Record<Signal["tier"], Point[]> = { A: [], B: [], C: [] };
  for (const s of signals) {
    byTier[s.tier].push({
      x: s.market_implied_prob,
      y: s.historical_base_rate,
      ticker: s.ticker,
      question: s.market_question,
      tier: s.tier,
      edge: s.edge_magnitude_pp,
      id: s.id,
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Edge map</h2>
        <p className="text-xs text-[var(--muted)]">
          Points above the diagonal: base rate &gt; market price (long YES edge).
          Below: short YES edge.
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
                value: "Market-implied probability",
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
                value: "Historical base rate",
                angle: -90,
                position: "insideLeft",
                fill: "#94949b",
                fontSize: 12,
              }}
            />
            {/* Fair-line: y = x */}
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
              cursor={{ stroke: "#4f9dff", strokeWidth: 1 }}
              contentStyle={{
                background: "#111114",
                border: "1px solid #1f2026",
                borderRadius: 6,
                color: "#e6e6e6",
                fontSize: 12,
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                return (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-xs">
                    <div className="font-mono font-semibold">{p.ticker}</div>
                    <div className="mt-1 max-w-xs text-[var(--muted)]">
                      {p.question}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 font-mono">
                      <span className="text-[var(--muted)]">Mkt</span>
                      <span>{(p.x * 100).toFixed(0)}%</span>
                      <span className="text-[var(--muted)]">Base rate</span>
                      <span>{(p.y * 100).toFixed(0)}%</span>
                      <span className="text-[var(--muted)]">Edge</span>
                      <span>{p.edge.toFixed(1)}pp</span>
                      <span className="text-[var(--muted)]">Tier</span>
                      <span>{p.tier}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "#94949b", paddingTop: 8 }}
            />
            {(["A", "B", "C"] as const).map((tier) => (
              <Scatter
                key={tier}
                name={`Tier ${tier}`}
                data={byTier[tier]}
                fill={TIER_COLOR[tier]}
              >
                {byTier[tier].map((point) => (
                  <Cell key={point.id} fill={TIER_COLOR[tier]} />
                ))}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
