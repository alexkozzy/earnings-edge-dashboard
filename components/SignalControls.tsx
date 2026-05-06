/**
 * SignalControls — sort dropdown + filter chips wired to URL search params.
 *
 * URL contract:
 *   ?sort = "edge" (default) | "tier" | "earnings" | "ticker"
 *   ?filter = "all" (default) | "tierA" | "tierAB" | "stable" | "fresh"
 *
 * Sharing a link like /?sort=tier&filter=tierA reproduces the view exactly.
 *
 * Stays a client component — depends on usePathname/useRouter/useSearchParams.
 */
"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type SortKey = "edge" | "tier" | "earnings" | "ticker";
export type FilterKey = "all" | "tierA" | "tierAB" | "stable" | "fresh";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "edge", label: "Largest gap" },
  { value: "tier", label: "Tier" },
  { value: "earnings", label: "Earnings date" },
  { value: "ticker", label: "Ticker A→Z" },
];

const FILTER_CHIPS: { value: FilterKey; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Show everything" },
  { value: "tierA", label: "Tier A only", title: "Highest-conviction signals only" },
  { value: "tierAB", label: "Tier A + B", title: "Drop low-conviction signals" },
  { value: "stable", label: "Regime stable", title: "Hide signals where macro/vol regime is unstable" },
  { value: "fresh", label: "Fresh consensus", title: "Hide signals where sell-side consensus was recently revised" },
];

export function readControlsFromSearch(search: URLSearchParams): { sort: SortKey; filter: FilterKey } {
  const rawSort = search.get("sort") ?? "";
  const rawFilter = search.get("filter") ?? "";
  const sort: SortKey = (
    ["edge", "tier", "earnings", "ticker"] as SortKey[]
  ).includes(rawSort as SortKey)
    ? (rawSort as SortKey)
    : "edge";
  const filter: FilterKey = (
    ["all", "tierA", "tierAB", "stable", "fresh"] as FilterKey[]
  ).includes(rawFilter as FilterKey)
    ? (rawFilter as FilterKey)
    : "all";
  return { sort, filter };
}

export function SignalControls() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { sort, filter } = readControlsFromSearch(
    search ? new URLSearchParams(search.toString()) : new URLSearchParams(),
  );

  const update = useCallback(
    (key: "sort" | "filter", value: string) => {
      const next = new URLSearchParams(search?.toString() ?? "");
      // Clear default values from URL to keep links clean.
      if ((key === "sort" && value === "edge") || (key === "filter" && value === "all")) {
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
    </div>
  );
}
