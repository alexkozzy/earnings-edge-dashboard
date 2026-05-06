import Link from "next/link";
import type { Signal } from "@/lib/types";

const TIER_COLOR: Record<Signal["tier"], string> = {
  A: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]",
  B: "bg-[#fbbf2420] text-[var(--warn)] border-[var(--warn)]",
  C: "bg-[#94949b20] text-[var(--muted)] border-[var(--muted)]",
};

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

function fmtPp(pp: number): string {
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

function fmtDate(iso: string): string {
  // Treat plain dates as UTC midnight to avoid TZ surprises in SSR/CSR.
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function SignalRow({ signal }: { signal: Signal }) {
  const fairProb = signal.historical_base_rate;
  const mktProb = signal.market_implied_prob;
  const edgeFavorsYes = fairProb > mktProb;
  const directionMatchesEdge =
    (signal.direction === "YES" && edgeFavorsYes) ||
    (signal.direction === "NO" && !edgeFavorsYes);

  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--panel)]">
      <td className="px-4 py-3">
        <span
          className={`inline-block rounded-md border px-1.5 py-0.5 text-xs font-mono ${TIER_COLOR[signal.tier]}`}
        >
          {signal.tier}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-sm font-semibold">
        <Link
          href={`/signal/${encodeURIComponent(signal.id)}`}
          className="hover:text-[var(--accent)] hover:underline"
          title="Open detail / share permalink"
        >
          {signal.ticker}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="max-w-md">
          {signal.market_url ? (
            <a
              href={signal.market_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent)] hover:underline"
            >
              {signal.market_question}
            </a>
          ) : (
            signal.market_question
          )}
        </div>
        {signal.note && (
          <div className="mt-1 text-xs text-[var(--muted)]">{signal.note}</div>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {fmtPct(mktProb)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {fmtPct(fairProb)}
      </td>
      <td
        className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
          directionMatchesEdge ? "text-[var(--good)]" : "text-[var(--bad)]"
        }`}
      >
        {fmtPp(signal.edge_magnitude_pp)}
      </td>
      <td className="px-4 py-3 text-right text-xs">
        <span
          className={`inline-block rounded px-1.5 py-0.5 font-mono ${
            signal.direction === "YES"
              ? "bg-[#4ade8020] text-[var(--good)]"
              : "bg-[#f8717120] text-[var(--bad)]"
          }`}
        >
          {signal.direction}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-[var(--muted)] font-mono">
        {fmtDate(signal.earnings_date)}
      </td>
      <td className="px-4 py-3 text-right text-xs">
        <div className="flex justify-end gap-1">
          {!signal.regime_stable && (
            <span
              title="Regime not stable"
              className="rounded bg-[#f8717120] px-1.5 py-0.5 font-mono text-[var(--bad)]"
            >
              REG
            </span>
          )}
          {signal.consensus_recently_revised && (
            <span
              title="Consensus recently revised"
              className="rounded bg-[#fbbf2420] px-1.5 py-0.5 font-mono text-[var(--warn)]"
            >
              REV
            </span>
          )}
          {signal.regime_stable && !signal.consensus_recently_revised && (
            <span className="text-[var(--muted)]">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
