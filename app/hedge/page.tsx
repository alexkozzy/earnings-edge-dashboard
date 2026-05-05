/**
 * /hedge — placeholder for the position-aware hedger UI.
 *
 * The hedge tool maps an IBKR options position CSV to per-symbol P&L
 * sensitivity around earnings, intersects with live mispricing signals,
 * and recommends sized hedge trades. That's a substantial feature with
 * its own focused build session — not in v1.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hedge · Earnings Edge",
  description:
    "Position-aware hedging tool — coming in a future release.",
};

export default function HedgePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hedge</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Position-aware hedging using live mispricing signals.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8">
        <div className="flex items-center gap-3">
          <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-mono text-[var(--accent)]">
            v1.1
          </span>
          <h2 className="text-lg font-medium">Hedge tool coming soon</h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          The hedge tool will let you upload an IBKR Flex Query CSV of your open
          options positions, compute per-symbol earnings P&amp;L sensitivity,
          intersect with the live mispricing signals on this page, and surface
          sized prediction-market trades that hedge or trade with the edge.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
          <li>
            • Per-position payoff scenarios (long/short calls, puts, verticals,
            calendars)
          </li>
          <li>
            • Kelly-fractioned (0.25× cap) sized trades with hard liquidity caps
          </li>
          <li>
            • When the +EV direction conflicts with the hedge direction, the UI
            defaults to the +EV side per operator directive
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--foreground)] hover:bg-[var(--panel)]"
          >
            ← Live Signals
          </Link>
          <Link
            href="/calibration"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--foreground)] hover:bg-[var(--panel)]"
          >
            Calibration →
          </Link>
        </div>
      </div>
    </div>
  );
}
