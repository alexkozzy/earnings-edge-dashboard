/**
 * Loading skeleton for SignalGrid. Renders 6 placeholder rows with the
 * same column widths so layout doesn't shift when real data lands.
 */
export function SignalGridSkeleton() {
  const rows = Array.from({ length: 6 });
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <th className="px-4 py-2 font-medium">Tier</th>
            <th className="px-4 py-2 font-medium">Ticker</th>
            <th className="px-4 py-2 font-medium">Market question</th>
            <th className="px-4 py-2 text-right font-medium">Mkt prob</th>
            <th className="px-4 py-2 text-right font-medium">Base rate</th>
            <th className="px-4 py-2 text-right font-medium">Edge</th>
            <th className="px-4 py-2 text-right font-medium">Side</th>
            <th className="px-4 py-2 text-right font-medium">Earnings</th>
            <th className="px-4 py-2 text-right font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((_, i) => (
            <tr
              key={i}
              className="border-b border-[var(--border)] last:border-b-0"
            >
              <td className="px-4 py-3">
                <div className="h-5 w-8 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-12 animate-pulse rounded bg-white/10" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-12 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-12 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-10 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-20 animate-pulse rounded bg-white/5" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-8 animate-pulse rounded bg-white/5" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
