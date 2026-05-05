"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Live Signals" },
  { href: "/calibration", label: "Calibration" },
  { href: "/hedge", label: "Hedge" },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
