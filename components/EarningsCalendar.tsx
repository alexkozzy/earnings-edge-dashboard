"use client";

/**
 * Calendar view — Mon/Tue/Wed/Thu/Fri columns for a given week, each split
 * into Pre Market / Post Market sections. Each card shows ticker logo,
 * EPS estimate, beat probability (market-implied) with a green/red dot.
 *
 * Week navigation via URL search param `?week=YYYY-MM-DD` (Monday-anchored).
 * Defaults to the current trading week.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { Signal } from "@/lib/types";
import { TickerLogo } from "./TickerLogo";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri";
type Bucket = "pre" | "post" | "during" | "unknown";

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
const DAY_LABEL: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};
const BUCKET_LABEL: Record<Bucket, string> = {
  pre: "Pre Market",
  post: "Post Market",
  during: "During Session",
  unknown: "Time Unknown",
};
const BUCKET_ORDER: Bucket[] = ["pre", "during", "post", "unknown"];

function parseDateUTC(iso: string): Date | null {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mondayOf(d: Date): Date {
  // Returns the Monday (UTC) of the week containing d.
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offset = day === 0 ? -6 : 1 - day; // back to Monday
  const m = new Date(d);
  m.setUTCDate(m.getUTCDate() + offset);
  m.setUTCHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDay(d: Date): string {
  return String(d.getUTCDate());
}

function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function fmtEps(eps: number | null | undefined): string {
  if (eps === null || eps === undefined) return "— EPS";
  const sign = eps < 0 ? "-" : "";
  return `${sign}$${Math.abs(eps).toFixed(2)} EPS`;
}

function bucketFor(s: Signal): Bucket {
  const t = s.report_time;
  if (t === "pre" || t === "post" || t === "during") return t;
  return "unknown";
}

function EarningsCardRow({ signal }: { signal: Signal }) {
  const pct = signal.market_implied_prob;
  const dot = pct >= 0.5 ? "bg-[var(--good)]" : "bg-[var(--bad)]";
  return (
    <Link
      href={`/signal/${encodeURIComponent(signal.id)}`}
      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[var(--panel)]/60 px-3 py-2 transition-colors hover:border-white/[0.12] hover:bg-[var(--panel)]"
    >
      <TickerLogo ticker={signal.ticker} size={32} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-sm font-semibold leading-tight">
          {signal.ticker}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
          {fmtEps(signal.estimate_eps)}
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center justify-end gap-1.5 font-mono text-sm font-semibold tabular-nums">
          <span className={`inline-block size-2 rounded-full ${dot}`} aria-hidden="true" />
          {fmtPct(pct)}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          beats
        </div>
      </div>
    </Link>
  );
}

function ColumnHeader({ d, label }: { d: Date; label: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2 text-sm font-medium text-[var(--foreground)]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="tabular-nums">{shortDay(d)}</span>
    </div>
  );
}

function DayColumn({
  day,
  date,
  signals,
}: {
  day: DayKey;
  date: Date;
  signals: Signal[];
}) {
  const byBucket: Record<Bucket, Signal[]> = {
    pre: [], post: [], during: [], unknown: [],
  };
  for (const s of signals) byBucket[bucketFor(s)].push(s);

  const hasAny = signals.length > 0;
  return (
    <div className="flex flex-col gap-3 border-l border-white/[0.04] px-3 py-2 first:border-l-0 first:pl-0">
      <ColumnHeader d={date} label={DAY_LABEL[day]} />
      {!hasAny ? (
        <div className="rounded-lg border border-dashed border-white/[0.06] py-10 text-center text-xs text-[var(--muted)]">
          <span className="block text-[10px] uppercase tracking-widest opacity-70">
            $
          </span>
          <span className="mt-2 block">No earnings</span>
        </div>
      ) : (
        BUCKET_ORDER.map((b) => {
          const list = byBucket[b];
          if (list.length === 0) return null;
          return (
            <div key={b}>
              <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
                {BUCKET_LABEL[b]}
              </div>
              <div className="flex flex-col gap-2">
                {list
                  .sort((a, b2) => a.ticker.localeCompare(b2.ticker))
                  .map((s) => (
                    <EarningsCardRow key={s.id} signal={s} />
                  ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function EarningsCalendar({ signals }: { signals: Signal[] }) {
  const search = useSearchParams();
  const weekParam = search?.get("week") ?? null;

  // Anchor Monday of the displayed week
  const monday = useMemo(() => {
    if (weekParam) {
      const d = parseDateUTC(weekParam);
      if (d) return mondayOf(d);
    }
    return mondayOf(new Date());
  }, [weekParam]);

  const days = useMemo(
    () => DAY_ORDER.map((k, i) => ({ key: k, date: addDays(monday, i) })),
    [monday],
  );

  // Bucket signals into the columns of the displayed week.
  const buckets = useMemo(() => {
    const out: Record<DayKey, Signal[]> = {
      mon: [], tue: [], wed: [], thu: [], fri: [],
    };
    for (const s of signals) {
      const d = parseDateUTC(s.earnings_date);
      if (!d) continue;
      // Match by YYYY-MM-DD
      const day = days.find((dd) => ymd(dd.date) === ymd(d));
      if (day) out[day.key].push(s);
    }
    return out;
  }, [signals, days]);

  const prevWeek = ymd(addDays(monday, -7));
  const nextWeek = ymd(addDays(monday, 7));
  const hasAnyThisWeek = days.some((d) => buckets[d.key].length > 0);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)]/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Link
          href={`?week=${prevWeek}`}
          aria-label="Previous week"
          className="rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--foreground)]"
        >
          ‹
        </Link>
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--muted)]">
          Week of {ymd(monday)}
        </div>
        <Link
          href={`?week=${nextWeek}`}
          aria-label="Next week"
          className="rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--foreground)]"
        >
          ›
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-0 sm:grid-cols-3 lg:grid-cols-5">
        {days.map(({ key, date }) => (
          <DayColumn key={key} day={key} date={date} signals={buckets[key]} />
        ))}
      </div>

      {!hasAnyThisWeek && (
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          No earnings in this week. Navigate forward to find upcoming markets.
        </p>
      )}
    </div>
  );
}
