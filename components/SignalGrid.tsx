"use client";

import { useSearchParams } from "next/navigation";
import type { Signal } from "@/lib/types";
import { SignalRow } from "./SignalRow";
import { SignalCard } from "./SignalCard";
import { readControlsFromSearch } from "./SignalControls";
import type { SortKey, FilterKey, MinLiq } from "./SignalControls";
import { parseLiquidity } from "@/lib/signalLiquidity";

const TIER_ORDER: Record<Signal["tier"], number> = { A: 0, B: 1, C: 2 };

function applyFilter(signals: Signal[], filter: FilterKey): Signal[] {
  switch (filter) {
    case "tierA":
      return signals.filter((s) => s.tier === "A");
    case "tierAB":
      return signals.filter((s) => s.tier === "A" || s.tier === "B");
    case "stable":
      return signals.filter((s) => s.regime_stable);
    case "fresh":
      return signals.filter((s) => !s.consensus_recently_revised);
    case "all":
    default:
      return signals;
  }
}

/**
 * Apply minLiq filter. Signals with unparseable liquidity (null) are kept
 * unless the filter is >0 — when the user explicitly asked for a depth
 * floor, "unknown" is treated as "doesn't meet floor" (conservative).
 */
function applyMinLiq(signals: Signal[], minLiq: MinLiq): Signal[] {
  if (minLiq <= 0) return signals;
  return signals.filter((s) => {
    const liq = parseLiquidity(s);
    return liq !== null && liq >= minLiq;
  });
}

function applySort(signals: Signal[], sort: SortKey): Signal[] {
  const out = [...signals];
  switch (sort) {
    case "tier":
      out.sort((a, b) => {
        const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        if (t !== 0) return t;
        return Math.abs(b.edge_magnitude_pp) - Math.abs(a.edge_magnitude_pp);
      });
      break;
    case "earnings":
      out.sort((a, b) => a.earnings_date.localeCompare(b.earnings_date));
      break;
    case "ticker":
      out.sort((a, b) => a.ticker.localeCompare(b.ticker));
      break;
    case "liq":
      out.sort((a, b) => {
        // Deep first; null treated as -1 so it falls to the bottom
        const la = parseLiquidity(a) ?? -1;
        const lb = parseLiquidity(b) ?? -1;
        return lb - la;
      });
      break;
    case "edge":
    default:
      out.sort(
        (a, b) =>
          Math.abs(b.edge_magnitude_pp) - Math.abs(a.edge_magnitude_pp),
      );
      break;
  }
  return out;
}

export function SignalGrid({ signals }: { signals: Signal[] }) {
  const search = useSearchParams();
  const { sort, filter, minLiq } = readControlsFromSearch(
    search ? new URLSearchParams(search.toString()) : new URLSearchParams(),
  );

  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        No live signals in the latest snapshot. Waiting for the scanner to
        publish a new <code className="font-mono">signals_latest.json</code>.
      </div>
    );
  }

  const afterLiq = applyMinLiq(signals, minLiq);
  const filtered = applyFilter(afterLiq, filter);
  const sorted = applySort(filtered, sort);

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        No signals match the current filter. Try{" "}
        <span className="font-mono">All</span> or a wider filter.
      </div>
    );
  }

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
              <th
                className="px-4 py-2 text-right font-medium text-[var(--accent)]"
                title="Model-predicted probability (when scanner provides one)"
              >
                Model
              </th>
              <th className="px-4 py-2 text-right font-medium">Edge</th>
              <th className="px-4 py-2 text-right font-medium">Side</th>
              <th
                className="hidden px-4 py-2 text-right font-medium md:table-cell"
                title="Top-of-book depth in USD. Parsed from scanner note. Hidden on narrow screens."
              >
                Liquidity
              </th>
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
