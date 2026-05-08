/**
 * GeopoliticsOverview — read-only summary of the geopolitics research universe.
 *
 * Sourced from the v5 cycle-1 universe.parquet, snapshotted to
 * `lib/geopolitics_stats.json` and bundled at build time. To refresh, re-run
 * `scripts/research_v5_universe.py` (it regenerates the JSON).
 *
 * Honest framing per SESSION_CONFIG (no overstatement):
 *   - shows raw counts + research status; no "edge demonstrated" copy
 *   - links to /stats verdict banner for the live A/B/C result
 */
import statsJson from "@/lib/geopolitics_stats.json";

type SubTagCounts = Record<string, number>;
type Top10Row = {
  question: string;
  volume_num: number;
  entry_yes_price_3d: number;
  outcome_yes_won: number;
  sub_tag: string;
};

const stats = statsJson as {
  generated_at: string;
  total_markets_with_entry: number;
  raw_harvested: number;
  date_range: { earliest: string; latest: string };
  sub_category_counts: SubTagCounts;
  sub_tag_counts: SubTagCounts;
  liquidity_tier_counts: SubTagCounts;
  outcome_yes_won_count: number;
  outcome_no_won_count: number;
  research_status: {
    v5_cycle_1_verdict: string;
    v5_cycle_2_status: string;
  };
  top_10_by_volume: Top10Row[];
};

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function GeopoliticsOverview() {
  const yesPct =
    stats.outcome_yes_won_count /
    (stats.outcome_yes_won_count + stats.outcome_no_won_count);

  const subCatRows = Object.entries(stats.sub_category_counts).sort(
    (a, b) => b[1] - a[1],
  );
  const subTagRows = Object.entries(stats.sub_tag_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const tierRows = Object.entries(stats.liquidity_tier_counts).sort((a, b) => {
    const order = ["<5K", "5-15K", "15-50K", "50-200K", ">200K"];
    return order.indexOf(a[0]) - order.indexOf(b[0]);
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Hero — research status framing */}
      <div className="rounded-xl border border-white/[0.06] bg-[var(--panel)] p-6">
        <h2 className="text-base font-semibold">Geopolitics — research universe</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Read-only snapshot of {stats.total_markets_with_entry.toLocaleString()}{" "}
          resolved Polymarket geopolitics markets harvested for v5 research. This
          tab does not display live signals — see{" "}
          <a className="text-[var(--accent)] hover:underline" href="/stats">
            /stats
          </a>{" "}
          for the current verdict and{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-xs">
            docs/research/v5/
          </code>{" "}
          for the protocol-level details.
        </p>
        <p className="mt-3 max-w-3xl text-xs text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">Cycle 1:</strong>{" "}
          {stats.research_status.v5_cycle_1_verdict} ·{" "}
          <strong className="text-[var(--foreground)]">Cycle 2:</strong>{" "}
          {stats.research_status.v5_cycle_2_status}
        </p>
      </div>

      {/* Headline counts grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Markets in universe" value={stats.total_markets_with_entry.toLocaleString()} />
        <Stat label="Raw harvested" value={stats.raw_harvested.toLocaleString()} />
        <Stat label="YES-resolved rate" value={`${(yesPct * 100).toFixed(1)}%`} />
        <Stat label="Date range" value={`${stats.date_range.earliest} → ${stats.date_range.latest}`} />
      </div>

      {/* Sub_category + Sub_tag tables */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Sub-category distribution">
          <Table
            rows={subCatRows.map(([k, v]) => [k, v.toLocaleString()])}
            cols={["sub_category", "n"]}
          />
        </Panel>
        <Panel title="Top 10 sub-tags">
          <Table
            rows={subTagRows.map(([k, v]) => [k, v.toLocaleString()])}
            cols={["sub_tag", "n"]}
          />
        </Panel>
      </div>

      <Panel title="Liquidity tier distribution">
        <Table
          rows={tierRows.map(([k, v]) => [k, v.toLocaleString()])}
          cols={["liquidity_tier", "n"]}
        />
      </Panel>

      {/* Top 10 by volume */}
      <Panel title="Top 10 by total volume">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="px-2 py-1 font-medium">Question</th>
                <th className="px-2 py-1 text-right font-medium">Volume</th>
                <th className="px-2 py-1 text-right font-medium">T-3d entry</th>
                <th className="px-2 py-1 text-right font-medium">Resolved</th>
                <th className="px-2 py-1 font-medium">Sub-tag</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_10_by_volume.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-white/[0.04] hover:bg-white/[0.03]"
                >
                  <td className="max-w-md truncate px-2 py-1.5">
                    {row.question}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {formatVolume(row.volume_num)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {row.entry_yes_price_3d.toFixed(3)}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-medium ${
                      row.outcome_yes_won === 1
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {row.outcome_yes_won === 1 ? "YES" : "NO"}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--muted)]">
                    {row.sub_tag}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-[var(--muted)]">
        Snapshot generated {new Date(stats.generated_at).toISOString().split("T")[0]} ·
        Source:{" "}
        <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">
          data/research/v5/markets/universe.parquet
        </code>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-[var(--panel)] p-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-[var(--panel)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Table({ rows, cols }: { rows: string[][]; cols: string[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[var(--muted)]">
        <tr>
          {cols.map((c) => (
            <th key={c} className="px-2 py-1 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-white/[0.04]">
            {row.map((cell, j) => (
              <td
                key={j}
                className={`px-2 py-1 ${
                  j === 0 ? "" : "font-mono text-right"
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
