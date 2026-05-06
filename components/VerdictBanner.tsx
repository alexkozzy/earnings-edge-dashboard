/**
 * VerdictBanner — top-of-/stats banner reflecting the research session
 * verdict from `docs/research/VERDICT.md` (parsed by `lib/verdict.ts`).
 *
 * Renders a coloured panel keyed off the verdict letter:
 *   A → green   (strategy passed primary + robustness)
 *   B → neutral (failed at least one threshold)
 *   C → amber   (data-constrained: too many N<80 cohorts)
 *   pending → blue (file not yet written)
 *
 * Pure presentational; data comes from the server via props.
 */
import type { Verdict } from "@/lib/verdict";

const STYLES: Record<
  Verdict["verdict"],
  { className: string; label: string; pillClass: string }
> = {
  A: {
    className: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
    label: "Verdict A",
    pillClass: "bg-emerald-500/20 text-emerald-200",
  },
  B: {
    className: "bg-zinc-900/60 text-zinc-300 border-zinc-700/40",
    label: "Verdict B",
    pillClass: "bg-zinc-500/20 text-zinc-200",
  },
  C: {
    className: "bg-amber-900/40 text-amber-300 border-amber-700/40",
    label: "Verdict C",
    pillClass: "bg-amber-500/20 text-amber-200",
  },
  pending: {
    className: "bg-blue-900/30 text-blue-300 border-blue-700/40",
    label: "Verdict: pending",
    pillClass: "bg-blue-500/20 text-blue-200",
  },
};

export function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const style = STYLES[verdict.verdict];
  const pendingMsg =
    verdict.verdict === "pending"
      ? "Verdict: pending — research session in progress"
      : null;

  return (
    <aside
      role="status"
      aria-label="Research verdict"
      className={[
        "flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3",
        style.className,
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex w-fit items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wider",
          style.pillClass,
        ].join(" ")}
      >
        {style.label}
      </span>
      <span className="text-sm sm:text-sm">
        {pendingMsg ?? verdict.summary}
      </span>
    </aside>
  );
}
