/**
 * /stats — combined paper-trading + calibration view (renamed from
 * /calibration in v1.1). The old /calibration URL still works, see
 * app/calibration/page.tsx which redirects here.
 */
import { StatsView } from "@/components/StatsView";
import { buildStatsPayload } from "@/lib/cohorts";
import { loadCalibrationSummary } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stats — Earnings Edge Dashboard",
  description: "Paper-trading P&L cohorts + signal calibration history.",
};

export default async function StatsPage() {
  const stats = await buildStatsPayload();
  const cal = await loadCalibrationSummary();
  const calibration = cal.ok
    ? { summary: cal.value, source: cal.source }
    : { error: cal.error };
  return <StatsView initialData={{ stats, calibration }} />;
}
