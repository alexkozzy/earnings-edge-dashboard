"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr";
import type { SignalsSnapshot } from "@/lib/types";
import { SignalCardGrid } from "./SignalCardGrid";
import { SignalGrid } from "./SignalGrid";
import { SignalGridSkeleton } from "./SignalGridSkeleton";
import { EdgeChart } from "./EdgeChart";
import { DataFreshness } from "./DataFreshness";
import { SignalControls } from "./SignalControls";
import { useState } from "react";

type ApiResponse = {
  snapshot: SignalsSnapshot;
  source: "remote" | "local-sample";
};

export function LiveSignalsView({
  initialData,
}: {
  initialData: ApiResponse | null;
}) {
  // "cards" is the new v1.1 default; "table" is the dense power-user view.
  const [view, setView] = useState<"cards" | "table">("cards");

  const { data, error, isLoading } = useSWR<ApiResponse>(
    "/api/signals",
    jsonFetcher,
    {
      fallbackData: initialData ?? undefined,
      // Re-poll every 60s — snapshots refresh on the scanner cadence.
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );

  // Hard-error state — proxy or snapshot URL is failing
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-300">
        <div className="font-medium">Failed to load signals</div>
        <div className="mt-2 font-mono text-xs text-red-300/80">
          {error.message}
        </div>
        <div className="mt-3 text-xs text-[var(--muted)]">
          Check that the SNAPSHOT_BASE_URL is reachable, or wait for the scanner
          to publish a new snapshot.
        </div>
      </div>
    );
  }

  // Initial load with no fallback — show skeleton, not empty layout
  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Live Signals</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Loading…</p>
          </div>
        </div>
        <SignalGridSkeleton />
      </div>
    );
  }

  const snapshot = data?.snapshot;
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
        No snapshot available. The scanner may not have published any signals yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Signals</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span>
              {snapshot.signals.length} signal
              {snapshot.signals.length === 1 ? "" : "s"}
            </span>
            <span aria-hidden="true">·</span>
            <DataFreshness
              generatedAt={snapshot.generated_at}
              source={data?.source ?? "local-sample"}
            />
            {data?.source === "local-sample" && (
              <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-mono text-[var(--accent)]">
                SAMPLE
              </span>
            )}
            {isLoading && (
              <span className="text-xs text-[var(--muted)]">refreshing…</span>
            )}
          </p>
        </div>
      </div>
      <EdgeChart signals={snapshot.signals} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SignalControls />
        <div className="flex items-center gap-1 self-start rounded-md border border-[var(--border)] bg-[var(--panel)] p-0.5 text-xs sm:self-center">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`rounded px-2 py-1 transition-colors ${
              view === "cards"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            aria-pressed={view === "cards"}
          >
            Cards
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded px-2 py-1 transition-colors ${
              view === "table"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            aria-pressed={view === "table"}
          >
            Table
          </button>
        </div>
      </div>
      {view === "cards" ? (
        <SignalCardGrid signals={snapshot.signals} />
      ) : (
        <SignalGrid signals={snapshot.signals} />
      )}
    </div>
  );
}
