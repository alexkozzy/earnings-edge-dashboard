/**
 * CategoryPlaceholder — shown on the home page when the user selects a
 * category that doesn't yet have a live signal feed (econ / crypto).
 *
 * Copy is intentionally explicit about what's wired and what isn't, so a
 * casual visitor doesn't think the dashboard is broken. See PROTOCOL.md for
 * the research-session context.
 */
import type { Category } from "./CategoryTabs";

const LABELS: Record<Category, string> = {
  earnings: "Earnings",
  econ: "Econ data",
  crypto: "Crypto",
  geopolitics: "Geopolitics",
};

export function CategoryPlaceholder({ category }: { category: Category }) {
  const label = LABELS[category];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-[var(--panel)] p-6 text-sm">
      <h2 className="text-base font-semibold">
        {label} — research-only, not yet wired
      </h2>
      <p className="max-w-2xl text-[var(--muted)]">
        Multi-category live signals are not yet wired. The Earnings Edge
        research session tested 13 strategies across earnings, econ, and crypto
        categories — see <a href="/stats" className="text-[var(--accent)] hover:underline">/stats</a> for the verdict.
      </p>
      <p className="max-w-2xl text-[var(--muted)]">
        To enable live {category === "econ" ? "econ" : "crypto"} signals, the
        scanner would need to add tag-based scrapers (gamma-api{" "}
        <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-xs">
          tag_slug=...
        </code>
        ).
      </p>
    </div>
  );
}
