"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr";
import type { SignalsSnapshot } from "@/lib/types";
import { SignalGrid } from "./SignalGrid";
import { EdgeChart } from "./EdgeChart";

type ApiResponse = {
  snapshot: SignalsSnapshot;
  source: "remote" | "local-sample";
};

export function LiveSignalsView({
  initialData,
}: {
  initialData: ApiResponse;
}) {
  const { data, error, isLoading } = useSWR<ApiResponse>(
    "/api/signals",
    jsonFetcher,
    {
      fallbackData: initialData,
      // Re-poll every 60s — snapshots refresh on the scanner cadence.
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Failed to load signals: {error.message}
      </div>
    );
  }

  const snapshot = data?.snapshot;
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Signals</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {snapshot.signals.length} signal
            {snapshot.signals.length === 1 ? "" : "s"} from snapshot generated{" "}
            <time dateTime={snapshot.generated_at} className="font-mono">
              {new Date(snapshot.generated_at).toISOString().slice(0, 16).replace("T", " ")}Z
            </time>
            {data?.source === "local-sample" && (
              <span className="ml-2 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-mono text-[var(--accent)]">
                SAMPLE
              </span>
            )}
            {isLoading && (
              <span className="ml-2 text-xs text-[var(--muted)]">refreshing…</span>
            )}
          </p>
        </div>
      </div>
      <EdgeChart signals={snapshot.signals} />
      <SignalGrid signals={snapshot.signals} />
    </div>
  );
}
