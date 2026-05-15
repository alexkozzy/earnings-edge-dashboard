/**
 * /vol-arb — volatility arbitrage detection layer.
 *
 * For every (ticker × live Polymarket EPS market) the scanner emits, we
 * compare:
 *
 *   options σ — event-isolated implied move from the ATM straddle:
 *               sqrt(max(0, post_expiry_IM² − pre_expiry_IM²))
 *
 *   PM σ      — stock σ implied by inverting the EPS-beat market price:
 *               σ_eps = (μ − T) / Φ⁻¹(market_yes)
 *               σ_stock = σ_eps × per-ticker reaction multiplier
 *
 * A positive `vol_arb_spread_pp` means options are expensive vs what
 * Polymarket's beat pricing implies for stock σ. A negative spread is
 * the reverse. The z-score normalizes by a 1pp default SE prior; tighten
 * once forward accumulation gives us measured residuals.
 *
 * Display-only diagnostic. NOT in the composite math. See methodology.
 */
import Link from "next/link";
import { loadSignalsSnapshot } from "@/lib/snapshots";
import type { Signal } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata = {
  title: "Vol-arb · Earnings Edge",
  description:
    "Options-implied event σ vs Polymarket-implied event σ across this week's earnings universe.",
};

type Row = Pick<
  Signal,
  | "id"
  | "ticker"
  | "earnings_date"
  | "vol_arb_options_event_move_pct"
  | "vol_arb_options_post_move_pct"
  | "vol_arb_options_pre_move_pct"
  | "vol_arb_pm_event_move_pct"
  | "vol_arb_pm_method"
  | "vol_arb_spread_pp"
  | "vol_arb_spread_normalized"
  | "vol_arb_tier"
  | "vol_arb_event_decomposition"
  | "vol_arb_reason"
>;

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtPp(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

function tierBadge(tier: Row["vol_arb_tier"]): string {
  switch (tier) {
    case "A":
      return "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]";
    case "B":
      return "bg-[#fbbf2420] text-[var(--warn)] border-[var(--warn)]";
    case "C":
      return "bg-[#94949b20] text-[var(--muted)] border-[var(--muted)]";
    default:
      return "text-[var(--muted)]";
  }
}

export default async function VolArbPage() {
  const result = await loadSignalsSnapshot();
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Failed to load snapshot: {result.error}
      </div>
    );
  }
  const rows: Row[] = (result.value.signals as Row[])
    .filter(
      (s) =>
        s.vol_arb_options_event_move_pct !== null &&
        s.vol_arb_options_event_move_pct !== undefined &&
        s.vol_arb_pm_event_move_pct !== null &&
        s.vol_arb_pm_event_move_pct !== undefined,
    )
    .sort(
      (a, b) =>
        Math.abs(b.vol_arb_spread_normalized ?? 0) -
        Math.abs(a.vol_arb_spread_normalized ?? 0),
    );

  if (rows.length === 0) {
    return (
      <article className="flex flex-col gap-6">
        <Header rowCount={0} generatedAt={result.value.generated_at} />
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
          No vol-arb data in the latest snapshot. The scanner publishes
          vol_arb diagnostics only for tickers with both a live Polymarket
          EPS market and a usable options chain. Wait for the next scan or
          trigger one manually.
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-6">
      <Header rowCount={rows.length} generatedAt={result.value.generated_at} />
      <Scatter rows={rows} />
      <Table rows={rows} />
      <footer className="text-xs text-[var(--muted)]">
        Display-only diagnostic. <strong>NOT</strong> used to size paper
        bets. Read-only. Not investment advice. Methodology + caveats:{" "}
        <Link href="/methodology" className="text-[var(--accent)] hover:underline">
          /methodology
        </Link>
        .
      </footer>
    </article>
  );
}

function Header({ rowCount, generatedAt }: { rowCount: number; generatedAt: string }) {
  return (
    <header className="border-b border-[var(--border)] pb-3">
      <h1 className="text-2xl font-semibold tracking-tight">Vol-arb</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Options-implied event σ vs Polymarket-implied event σ across this
        week's earnings universe. {rowCount} ticker{rowCount === 1 ? "" : "s"} ·
        snapshot{" "}
        <span className="font-mono">{generatedAt.slice(0, 19)}Z</span>
      </p>
    </header>
  );
}

function Scatter({ rows }: { rows: Row[] }) {
  // Pure-SVG inline scatter. No recharts. Each ticker is one dot, x = options
  // event move %, y = PM event move %. Diagonal reference line shows zero
  // spread. Dot color encodes z-score magnitude + sign.
  const W = 640;
  const H = 360;
  const pad = { left: 56, right: 24, top: 24, bottom: 40 };
  const xMax = Math.max(
    0.16,
    ...rows.map((r) => r.vol_arb_options_event_move_pct ?? 0),
  );
  const yMax = Math.max(
    0.16,
    ...rows.map((r) => r.vol_arb_pm_event_move_pct ?? 0),
  );
  const axMax = Math.ceil(Math.max(xMax, yMax) * 100) / 100; // unified scale
  const px = (v: number) => pad.left + (v / axMax) * (W - pad.left - pad.right);
  const py = (v: number) => H - pad.bottom - (v / axMax) * (H - pad.top - pad.bottom);

  const ticks = [0, 0.05, 0.1, 0.15, 0.2].filter((t) => t <= axMax);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">
        Options σ vs PM σ
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Scatter of options-implied event move vs PM-implied event move per ticker"
      >
        {/* axes */}
        <line x1={pad.left} y1={H - pad.bottom} x2={W - pad.right} y2={H - pad.bottom} stroke="#374151" />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={H - pad.bottom} stroke="#374151" />
        {/* diagonal (zero-spread reference) */}
        <line
          x1={px(0)}
          y1={py(0)}
          x2={px(axMax)}
          y2={py(axMax)}
          stroke="#6b7280"
          strokeDasharray="4 3"
        />
        {/* x ticks + labels */}
        {ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={px(t)} y1={H - pad.bottom} x2={px(t)} y2={H - pad.bottom + 5} stroke="#374151" />
            <text x={px(t)} y={H - pad.bottom + 18} fontSize="10" fill="#9ca3af" textAnchor="middle">
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* y ticks + labels */}
        {ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.left - 5} y1={py(t)} x2={pad.left} y2={py(t)} stroke="#374151" />
            <text x={pad.left - 8} y={py(t) + 3} fontSize="10" fill="#9ca3af" textAnchor="end">
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* axis labels */}
        <text x={W / 2} y={H - 8} fontSize="11" fill="#9ca3af" textAnchor="middle">
          options event move (annualized → expiry, ATM straddle %)
        </text>
        <text
          x={14}
          y={H / 2}
          fontSize="11"
          fill="#9ca3af"
          textAnchor="middle"
          transform={`rotate(-90, 14, ${H / 2})`}
        >
          PM event move (Method B inversion)
        </text>
        {/* dots */}
        {rows.map((r) => {
          const x = r.vol_arb_options_event_move_pct ?? 0;
          const y = r.vol_arb_pm_event_move_pct ?? 0;
          const z = r.vol_arb_spread_normalized ?? 0;
          // Magnitude → radius; sign → color.
          const radius = Math.min(8, 3 + Math.abs(z) * 0.5);
          const fill = z > 1 ? "#10b981" : z < -1 ? "#f87171" : "#6b7280";
          return (
            <g key={r.id}>
              <circle
                cx={px(x)}
                cy={py(y)}
                r={radius}
                fill={fill}
                fillOpacity={0.55}
                stroke={fill}
                strokeWidth={1.2}
              />
              <text
                x={px(x) + radius + 4}
                y={py(y) + 4}
                fontSize="10"
                fill="#e5e7eb"
                fontFamily="ui-monospace,monospace"
              >
                {r.ticker}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Diagonal = zero spread. Above diagonal = PM-priced σ exceeds options-priced
        σ (options cheap). Below diagonal = options expensive vs PM. Dot
        size/color scales with z = spread_pp / SE.
      </p>
    </section>
  );
}

function Table({ rows }: { rows: Row[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium tracking-tight">
        Per-ticker table (sorted by |z|)
      </h2>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 text-right font-medium">Options event σ</th>
              <th className="px-3 py-2 text-right font-medium">PM event σ</th>
              <th className="px-3 py-2 text-right font-medium">Spread (pp)</th>
              <th className="px-3 py-2 text-right font-medium">z</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Decomp</th>
              <th className="px-3 py-2 font-medium">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const z = r.vol_arb_spread_normalized;
              const spread = r.vol_arb_spread_pp;
              const spreadColor =
                (spread ?? 0) > 0
                  ? "text-[var(--good)]"
                  : (spread ?? 0) < 0
                    ? "text-[var(--bad)]"
                    : "text-[var(--muted)]";
              return (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-md border px-1.5 py-0.5 text-xs font-mono ${tierBadge(r.vol_arb_tier)}`}>
                      {r.vol_arb_tier ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold">
                    <Link
                      href={`/signal/${encodeURIComponent(r.id)}`}
                      className="hover:text-[var(--accent)] hover:underline"
                    >
                      {r.ticker}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtPct(r.vol_arb_options_event_move_pct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtPct(r.vol_arb_pm_event_move_pct)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${spreadColor}`}>
                    {fmtPp(spread)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${spreadColor}`}>
                    {fmtPp(z)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                    {r.vol_arb_pm_method ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-xs">
                    {r.vol_arb_event_decomposition ? (
                      <span className="text-[var(--good)]">✓</span>
                    ) : (
                      <span className="text-[var(--muted)]" title="No pre-earnings expiry available — using raw post-earnings IM">
                        −
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                    {r.earnings_date}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
