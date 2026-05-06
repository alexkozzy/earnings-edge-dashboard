/**
 * GET /api/signals
 *
 * Returns the current SignalsSnapshot, FILTERED to future earnings only.
 *
 * Source: remote snapshot URL (SNAPSHOT_BASE_URL env var) or bundled sample.
 *
 * Why filter here:
 *   The upstream scanner publishes a raw snapshot that may contain stale
 *   signals (past earnings that the scanner hasn't yet re-pruned). The user
 *   has explicitly required: only future earnings appear in the UI. We
 *   filter at the API layer so EVERY consumer (LiveSignalsView, /signal/[id],
 *   the cron paper-bet-logger) gets the same future-only set.
 *
 * The filter mirrors `lib/paperEngine.isFutureEarnings`:
 *   - earnings_date must be parseable
 *   - >= 12h in the future (markets need time to settle pre-event)
 *   - <= 90 days out (markets typically don't exist that far ahead)
 *
 * Returns counts so the UI can show "showing 4 of 8 (4 dropped: past or stale)".
 */
import { loadSignalsSnapshot } from "@/lib/snapshots";
import { isFutureEarnings } from "@/lib/paperEngine";
import type { Signal } from "@/lib/types";

export async function GET() {
  const result = await loadSignalsSnapshot();
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  const now = new Date();
  const all = result.value.signals;
  const future: Signal[] = [];
  const droppedPast: string[] = [];
  for (const s of all) {
    if (isFutureEarnings(s.earnings_date, now)) {
      future.push(s);
    } else {
      droppedPast.push(`${s.ticker}:${s.earnings_date}`);
    }
  }

  return Response.json({
    snapshot: {
      ...result.value,
      signals: future,
    },
    source: result.source,
    filter_meta: {
      total_in_snapshot: all.length,
      future_only_returned: future.length,
      dropped_past_or_stale: droppedPast.length,
      dropped_examples: droppedPast.slice(0, 10),
      filter_applied_at: now.toISOString(),
      filter_rule: "earnings_date in [now+12h, now+90d]",
    },
  });
}
