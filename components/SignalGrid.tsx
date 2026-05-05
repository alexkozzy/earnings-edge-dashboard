import type { Signal } from "@/lib/types";
import { SignalRow } from "./SignalRow";
import { SignalCard } from "./SignalCard";

export function SignalGrid({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        No live signals in the latest snapshot. Waiting for the scanner to
        publish a new <code className="font-mono">signals_latest.json</code>.
      </div>
    );
  }

  // Sort by tier (A before B before C), then by edge_magnitude_pp descending.
  const tierOrder: Record<Signal["tier"], number> = { A: 0, B: 1, C: 2 };
  const sorted = [...signals].sort((a, b) => {
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return Math.abs(b.edge_magnitude_pp) - Math.abs(a.edge_magnitude_pp);
  });

  return (
    <>
      {/* Desktop / tablet: table */}
      <div className="hidden overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="px-4 py-2 font-medium">Tier</th>
              <th className="px-4 py-2 font-medium">Ticker</th>
              <th className="px-4 py-2 font-medium">Market question</th>
              <th className="px-4 py-2 text-right font-medium">Mkt prob</th>
              <th className="px-4 py-2 text-right font-medium">Base rate</th>
              <th className="px-4 py-2 text-right font-medium">Edge</th>
              <th className="px-4 py-2 text-right font-medium">Side</th>
              <th className="px-4 py-2 text-right font-medium">Earnings</th>
              <th className="px-4 py-2 text-right font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card stack (one card per signal, stacked vertically) */}
      <div className="flex flex-col gap-3 sm:hidden">
        {sorted.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
      </div>
    </>
  );
}
