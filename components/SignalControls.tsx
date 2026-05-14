/**
 * SignalControls — sort dropdown + filter chips wired to URL search params.
 *
 * URL contract:
 *   ?sort   = "edge" (default) | "tier" | "earnings" | "ticker" | "liq"
 *   ?filter = "all" (default) | "tierA" | "tierAB" | "stable" | "fresh"
 *   ?minLiq = "0" (default) | "100" | "500" | "1000"
 *
 * Sharing a link like /?sort=tier&filter=tierA&minLiq=500 reproduces the
 * view exactly.
 *
 * Stays a client component — depends on usePathname/useRouter/useSearchParams.
 */
"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type SortKey = "edge" | "tier" | "earnings" | "ticker" | "liq";
export type FilterKey = "all" | "tierA" | "tierAB" | "stable" | "fresh";
export type MinLiq = 0 | 100 | 500 | 1000;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "edge", label: "Largest gap" },
  { value: "tier", label: "Tier" },
  { value: "earnings", label: "Earnings date" },
  { value: "ticker", label: "Ticker A→Z" },
  { value: "liq", label: "Liquidity (deep first)" },
];

const MIN_LIQ_OPTIONS: { value: MinLiq; label: string }[] = [
  { value: 0, label: "All" },
  { value: 100, label: "$100" },
  { value: 500, label: "$500" },
  { value: 1000, label: "$1k" },
];

const FILTER_CHIPS: { value: FilterKey; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Show everything" },
  { value: "tierA", label: "Tier A only", title: "Highest-conviction signals only" },
  { value: "tierAB", label: "Tier A + B", title: "Drop low-conviction signals" },
  { value: "stable", label: "Regime stable", title: "Hide signals where macro/vol regime is unstable" },
  { value: "fresh", label: "Fresh consensus", title: "Hide signals where sell-side consensus was recently revised" },
];

export function readControlsFromSearch(search: URLSearchParams): {
  sort: SortKey;
  filter: FilterKey;
  minLiq: MinLiq;
} {
  const rawSort = search.get("sort") ?? "";
  const rawFilter = search.get("filter") ?? "";
  const rawMinLiq = search.get("minLiq") ?? "";
  const sort: SortKey = (
    ["edge", "tier", "earnings", "ticker", "liq"] as SortKey[]
  ).includes(rawSort as SortKey)
    ? (rawSort as SortKey)
    : "edge";
  const filter: FilterKey = (
    ["all", "tierA", "tierAB", "stable", "fresh"] as FilterKey[]
  ).includes(rawFilter as FilterKey)
    ? (rawFilter as FilterKey)
    : "all";
  const parsedLiq = Number(rawMinLiq);
  const minLiq: MinLiq =
    parsedLiq === 100 || parsedLiq === 500 || parsedLiq === 1000 ? parsedLiq : 0;
  return { sort, filter, minLiq };
}

export function SignalControls() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { sort, filter, minLiq } = readControlsFromSearch(
    search ? new URLSearchParams(search.toString()) : new URLSearchParams(),
  );

  const update = useCallback(
    (key: "sort" | "filter" | "minLiq", value: string) => {
      const next = new URLSearchParams(search?.toString() ?? "");
      // Clear default values from URL to keep links clean.
      const isDefault =
        (key === "sort" && value === "edge") ||
        (key === "filter" && value === "all") ||
        (key === "minLiq" && (value === "0" || value === ""));
      if (isDefault) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, search],
  );

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Sort
        </label>
        <select
          value={sort}
          onChange={(e) => update("sort", e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          aria-label="Sort signals by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => update("filter", chip.value)}
              title={chip.title}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]",
              ].join(" ")}
              aria-pressed={active}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Min liq
        </label>
        <div className="flex gap-1">
          {MIN_LIQ_OPTIONS.map((opt) => {
            const active = minLiq === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("minLiq", String(opt.value))}
                title={
                  opt.value === 0
                    ? "Include all signals regardless of depth"
                    : `Hide markets with top-of-book depth below ${opt.label}`
                }
                className={[
                  "rounded-md border px-2 py-1 text-xs font-mono transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]",
                ].join(" ")}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
