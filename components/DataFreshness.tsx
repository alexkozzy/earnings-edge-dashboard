/**
 * DataFreshness — visual indicator of how stale the snapshot is.
 *
 * Color levels:
 *   <1h   → muted "fresh"        (no banner; snapshot.generated_at shows inline)
 *   1–6h  → muted "X hours ago"
 *   6–24h → amber: "scanner may be offline"
 *   >24h  → red: "scanner offline — data is stale"
 *
 * Hidden when source = "local-sample" (no real scanner-cadence semantics).
 */
"use client";

import { useEffect, useState } from "react";

function describeAge(ms: number): { label: string; level: "ok" | "stale" | "very_stale" } {
  const minutes = ms / 60_000;
  if (minutes < 60) {
    return { label: `${Math.max(1, Math.round(minutes))} min ago`, level: "ok" };
  }
  const hours = minutes / 60;
  if (hours < 6) {
    return { label: `${hours.toFixed(1)} h ago`, level: "ok" };
  }
  if (hours < 24) {
    return {
      label: `${Math.round(hours)} h ago — scanner may be offline`,
      level: "stale",
    };
  }
  const days = hours / 24;
  return {
    label: `${days.toFixed(1)} days ago — scanner offline, data is stale`,
    level: "very_stale",
  };
}

export function DataFreshness({
  generatedAt,
  source,
}: {
  generatedAt: string;
  source: "remote" | "local-sample";
}) {
  // Render-time "now" can drift from server time; recompute on client mount + every 60s.
  const [now, setNow] = useState<number>(() => Date.parse(generatedAt));
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (source === "local-sample") {
    // Sample data has no real cadence — don't show staleness.
    return null;
  }

  const age = now - Date.parse(generatedAt);
  if (Number.isNaN(age) || age < 0) {
    return null;
  }
  const { label, level } = describeAge(age);
  if (level === "ok") {
    return (
      <span className="text-xs text-[var(--muted)]">
        snapshot {label}
      </span>
    );
  }
  if (level === "stale") {
    return (
      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
        snapshot {label}
      </span>
    );
  }
  return (
    <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300">
      snapshot {label}
    </span>
  );
}
