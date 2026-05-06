/**
 * GET /api/stats
 *
 * Aggregated paper-trading stats for the Stats page.
 * Reads settled + open bets from the data repo, groups by cohort
 * dimensions (venue, tier, sector, market_cap), returns cumulative P&L
 * series + summary rows.
 */
import { NextResponse } from "next/server";
import { buildStatsPayload } from "@/lib/cohorts";
import { loadCalibrationSummary } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await buildStatsPayload();
  // Calibration summary is a separate snapshot file; bundle it in
  // /api/stats so the Stats page only needs one fetch.
  const cal = await loadCalibrationSummary();
  return NextResponse.json({
    stats,
    calibration: cal.ok
      ? { summary: cal.value, source: cal.source }
      : { error: cal.error },
  });
}
