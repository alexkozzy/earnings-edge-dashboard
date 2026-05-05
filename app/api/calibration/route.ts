/**
 * GET /api/calibration
 *
 * Returns the calibration summary, or an empty summary if none is published
 * yet. The UI shows the n<20 fallback for empty/insufficient summaries.
 */
import { loadCalibrationSummary } from "@/lib/snapshots";

export async function GET() {
  const result = await loadCalibrationSummary();
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json({
    summary: result.value,
    source: result.source,
  });
}
