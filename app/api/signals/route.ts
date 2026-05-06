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
 *
 * Optional `?category=earnings|econ|crypto` query param:
 *   - earnings (default, omitted) → current behavior
 *   - econ | crypto              → empty array + placeholder message. There
 *     are no live econ/crypto scanners yet; the research session at
 *     `docs/research/PROTOCOL.md` tested strategies across these categories
 *     but no live data feed is wired. Returning a structured placeholder
 *     keeps the API contract explicit so the UI can render an informative
 *     empty state instead of guessing.
 */
import { loadSignalsSnapshot } from "@/lib/snapshots";
import { isFutureEarnings } from "@/lib/paperEngine";
import type { Signal } from "@/lib/types";

type Category = "earnings" | "econ" | "crypto";

function parseCategory(raw: string | null): Category {
  if (raw === "econ" || raw === "crypto") return raw;
  return "earnings";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = parseCategory(url.searchParams.get("category"));

  // Non-earnings categories: structured placeholder. No live feed yet.
  if (category !== "earnings") {
    const now = new Date();
    return Response.json({
      snapshot: {
        generated_at: now.toISOString(),
        signals: [] as Signal[],
      },
      source: "placeholder",
      category,
      placeholder_message:
        "Multi-category live signals are not yet wired. The Earnings Edge research session tested 13 strategies across earnings, econ, and crypto categories — see /stats for the verdict. To enable live econ or crypto signals, the scanner would need to add tag-based scrapers (gamma-api tag_slug=...).",
      filter_meta: {
        total_in_snapshot: 0,
        future_only_returned: 0,
        dropped_past_or_stale: 0,
        dropped_examples: [] as string[],
        filter_applied_at: now.toISOString(),
        filter_rule: "category-placeholder; no live feed",
      },
    });
  }

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
    category,
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
