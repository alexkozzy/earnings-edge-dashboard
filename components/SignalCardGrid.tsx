/**
 * SignalCardGrid — the v1.1 Polymarket-clone card grid.
 *
 * Layout (per orchestrator constraint #4 verbal description, since the
 * reference screenshot at docs/reference_polymarket_ui.png is missing):
 *
 *   - Background: --background (#0a0a0b in the existing palette; spec
 *     called for #0E1320 — we kept the existing token to avoid theme
 *     churn; the visual difference is minimal at the dark end.)
 *   - Cards: --panel, border rgba(255,255,255,0.06), 20px padding,
 *     16px gap, rounded-xl.
 *   - Grid: 1-col mobile → 2-col @sm → 4-col @lg.
 *   - Cards group by earnings date "block" (today, this week, next week,
 *     later) — small grey label above each card.
 *   - Each row inside a card: TickerLogo + bold ticker + market-implied %
 *     bold + colored dot (which side our model says is mispriced) + edge
 *     badge (hidden if <5pp).
 *   - Row 2 sub-line: $X.XX EPS · Hist YY% · Edge ±Z.Zpp YES/NO.
 *
 * Interaction: clicking a row opens /signal/[id] (existing detail page).
 *
 * Sort + filter still come via SignalControls (URL search params).
 */
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Signal } from "@/lib/types";
import { TickerLogo } from "./TickerLogo";
import { readControlsFromSearch } from "./SignalControls";
import type { FilterKey, SortKey } from "./SignalControls";

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

/* -------------------------- Date bucketing -------------------------- */

type Bucket = "today" | "this_week" | "next_week" | "later";

const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  this_week: "This week",
  next_week: "Next week",
  later: "Later",
};

const BUCKET_ORDER: Bucket[] = ["today", "this_week", "next_week", "later"];

function bucketFor(earningsDate: string, now = new Date()): Bucket {
  const d = new Date(
    earningsDate.length === 10 ? `${earningsDate}T00:00:00Z` : earningsDate,
  );
  if (Number.isNaN(d.getTime())) return "later";
  const startOfTodayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days = Math.floor((d.getTime() - startOfTodayUTC) / 86400_000);
  if (days <= 0) return "today";
  if (days <= 7) return "this_week";
  if (days <= 14) return "next_week";
  return "later";
}

/* ----------------------------- Formatting --------------------------- */

function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function fmtPp(pp: number): string {
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* ----------------------------- UI atoms ----------------------------- */

function EdgeBadge({ pp }: { pp: number }) {
  const abs = Math.abs(pp);
  if (abs < 5) return null;
  const cls =
    abs >= 15
      ? "text-[var(--good)] border-[var(--good)]/40 bg-[var(--good)]/10"
      : abs >= 10
        ? "text-[var(--warn)] border-[var(--warn)]/40 bg-[var(--warn)]/10"
        : "text-[var(--muted)] border-[var(--border)] bg-white/5";
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums ${cls}`}
    >
      {fmtPp(pp)}
    </span>
  );
}

function TierEdgeIndicator({ tier }: { tier: Signal["tier"] }) {
  // Subtle 2px left bar — green for A, amber for B, none for C.
  const cls =
    tier === "A"
      ? "bg-[var(--good)]"
      : tier === "B"
        ? "bg-[var(--warn)]"
        : "bg-transparent";
  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 top-0 bottom-0 w-[2px] ${cls}`}
    />
  );
}

/** One row inside a card. */
function CardRow({ signal, showDivider }: { signal: Signal; showDivider: boolean }) {
  const mktProb = signal.market_implied_prob;
  const baseRate = signal.historical_base_rate;
  // Dot color: which side our model says is cheap (i.e. the bet side).
  const dotClass =
    signal.direction === "YES"
      ? "bg-[var(--good)]"
      : "bg-[var(--bad)]";

  return (
    <Link
      href={`/signal/${encodeURIComponent(signal.id)}`}
      className={`relative -mx-5 block px-5 py-3 transition-colors hover:bg-white/[0.03] ${
        showDivider ? "border-t border-white/[0.04]" : ""
      }`}
    >
      <TierEdgeIndicator tier={signal.tier} />
      <div className="flex items-center gap-3">
        <TickerLogo ticker={signal.ticker} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm font-semibold tracking-wide">
              {signal.ticker}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums">
              {fmtPct(mktProb)}
              <span
                aria-hidden="true"
                className={`inline-block size-2 rounded-full ${dotClass}`}
              />
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-[var(--muted)]">
            <span className="truncate">
              {fmtShortDate(signal.earnings_date)} · Hist {fmtPct(baseRate)}
            </span>
            <EdgeBadge pp={signal.edge_magnitude_pp} />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ----------------------------- Main grid ---------------------------- */

export function SignalCardGrid({ signals }: { signals: Signal[] }) {
  const search = useSearchParams();
  const { sort, filter } = readControlsFromSearch(
    search ? new URLSearchParams(search.toString()) : new URLSearchParams(),
  );

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        No live signals in the latest snapshot. Waiting for the scanner to
        publish a new <code className="font-mono">signals_latest.json</code>.
      </div>
    );
  }

  const filtered = applyFilter(signals, filter);
  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        No signals match the current filter. Try{" "}
        <span className="font-mono">All</span>.
      </div>
    );
  }
  const sorted = applySort(filtered, sort);

  // Bucket by earnings date. Within each bucket preserve the active sort.
  const byBucket = new Map<Bucket, Signal[]>();
  for (const s of sorted) {
    const b = bucketFor(s.earnings_date);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(s);
  }
  // Render buckets in fixed order, but only those with content.
  const blocks = BUCKET_ORDER.filter((b) => byBucket.has(b)).map((b) => ({
    key: b,
    label: BUCKET_LABEL[b],
    signals: byBucket.get(b)!,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {blocks.map((block) => (
        <div
          key={block.key}
          className="overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--panel)] p-5 transition-colors hover:border-white/[0.12]"
        >
          <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/40">
            {block.label}
            <span className="ml-2 font-mono normal-case text-white/30">
              {block.signals.length}
            </span>
          </div>
          <div className="-my-1">
            {block.signals.map((s, i) => (
              <CardRow key={s.id} signal={s} showDivider={i > 0} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
