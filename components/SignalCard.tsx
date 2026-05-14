/**
 * SignalCard — mobile-only single-signal card (table is hidden under sm:).
 * Same data as SignalRow but stacked for narrow screens.
 */
import Link from "next/link";
import type { Signal } from "@/lib/types";
import { parseLiquidity, isThin, formatLiquidity, THIN_LIQUIDITY_USD } from "@/lib/signalLiquidity";

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
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function SignalCard({ signal }: { signal: Signal }) {
  const histProb = signal.historical_base_rate;
  const modelProb = signal.model_predicted_prob ?? null;
  const mktProb = signal.market_implied_prob;
  // If the scanner provided a model probability, that's the canonical "fair"
  // value to colour the directional badge against; otherwise fall back to
  // the empirical historical base rate.
  const fairProb = modelProb ?? histProb;
  const edgeFavorsYes = fairProb > mktProb;
  const directionMatchesEdge =
    (signal.direction === "YES" && edgeFavorsYes) ||
    (signal.direction === "NO" && !edgeFavorsYes);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded-md border px-1.5 py-0.5 text-xs font-mono ${TIER_COLOR[signal.tier]}`}
            >
              {signal.tier}
            </span>
            <Link
              href={`/signal/${encodeURIComponent(signal.id)}`}
              className="font-mono text-base font-semibold hover:text-[var(--accent)] hover:underline"
              title="Open detail / share permalink"
            >
              {signal.ticker}
            </Link>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                signal.direction === "YES"
                  ? "bg-[#4ade8020] text-[var(--good)]"
                  : "bg-[#f8717120] text-[var(--bad)]"
              }`}
            >
              {signal.direction}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)] font-mono">
            <span>earnings {fmtDate(signal.earnings_date)}</span>
            <span aria-hidden="true">·</span>
            <span
              className={isThin(signal) ? "text-[var(--bad)]" : ""}
              title={
                parseLiquidity(signal) === null
                  ? "Liquidity not present in scanner note"
                  : `Top-of-book depth ${formatLiquidity(parseLiquidity(signal))}`
              }
            >
              liq {formatLiquidity(parseLiquidity(signal))}
            </span>
            {isThin(signal) && (
              <span
                className="rounded bg-[#f8717120] px-1 py-0.5 text-[10px] text-[var(--bad)]"
                title={`Top-of-book depth below $${THIN_LIQUIDITY_USD}`}
              >
                THIN
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-lg font-semibold ${
              directionMatchesEdge ? "text-[var(--good)]" : "text-[var(--bad)]"
            }`}
          >
            {fmtPp(signal.edge_magnitude_pp)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            edge
          </div>
        </div>
      </div>

      <div className="mt-3 text-sm text-[var(--foreground)]">
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
        <div className="mt-2 text-xs text-[var(--muted)]">{signal.note}</div>
      )}

      <div
        className={`mt-3 grid gap-3 text-xs ${
          modelProb !== null ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <div>
          <div className="uppercase tracking-wider text-[var(--muted)]">
            market
          </div>
          <div className="font-mono">{fmtPct(mktProb)}</div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-[var(--muted)]">
            base rate
          </div>
          <div className="font-mono">{fmtPct(histProb)}</div>
        </div>
        {modelProb !== null && (
          <div>
            <div
              className="uppercase tracking-wider text-[var(--accent)]"
              title="Model-predicted probability (e.g. HGBM beat classifier)"
            >
              model
            </div>
            <div className="font-mono">{fmtPct(modelProb)}</div>
          </div>
        )}
      </div>

      {(!signal.regime_stable || signal.consensus_recently_revised) && (
        <div className="mt-3 flex gap-1.5 text-xs">
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
        </div>
      )}
    </div>
  );
}
