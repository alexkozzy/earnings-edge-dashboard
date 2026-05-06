/**
 * CategoryTabs — sub-nav for the home page selecting which market category
 * the live-signals view shows.
 *
 * URL contract:
 *   ?category = "earnings" (default) | "econ" | "crypto"
 *
 * Earnings is the only category currently wired to live data. Econ + crypto
 * render a placeholder informing the user the multi-category feed isn't live
 * yet (see `app/api/signals/route.ts` and `docs/research/PROTOCOL.md`).
 *
 * Stays a client component — depends on usePathname / useSearchParams.
 */
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type Category = "earnings" | "econ" | "crypto";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "earnings", label: "Earnings" },
  { value: "econ", label: "Econ data" },
  { value: "crypto", label: "Crypto" },
];

export function readCategoryFromSearch(
  search: URLSearchParams | null,
): Category {
  const raw = search?.get("category") ?? "";
  if (raw === "econ" || raw === "crypto") return raw;
  return "earnings";
}

export function CategoryTabs() {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = readCategoryFromSearch(
    search ? new URLSearchParams(search.toString()) : null,
  );

  return (
    <nav
      aria-label="Market category"
      className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-3"
    >
      {CATEGORIES.map((cat) => {
        const isActive = cat.value === active;
        // Default category clears the param to keep URLs clean.
        const next = new URLSearchParams(search?.toString() ?? "");
        if (cat.value === "earnings") {
          next.delete("category");
        } else {
          next.set("category", cat.value);
        }
        const qs = next.toString();
        const href = `${pathname}${qs ? `?${qs}` : ""}`;
        return (
          <Link
            key={cat.value}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={[
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {cat.label}
          </Link>
        );
      })}
    </nav>
  );
}
