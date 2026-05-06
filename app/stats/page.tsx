/**
 * /stats — combined paper-trading + calibration view (renamed from
 * /calibration in v1.1). The old /calibration URL still works, see
 * app/calibration/page.tsx which redirects here.
 */
import { StatsView } from "@/components/StatsView";
import { VerdictBanner } from "@/components/VerdictBanner";
import { buildStatsPayload } from "@/lib/cohorts";
import { loadCalibrationSummary } from "@/lib/snapshots";
import { loadVerdict } from "@/lib/verdict";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stats — Earnings Edge Dashboard",
  description: "Paper-trading P&L cohorts + signal calibration history.",
};

export default async function StatsPage() {
  const [stats, cal, verdict] = await Promise.all([
    buildStatsPayload(),
    loadCalibrationSummary(),
    loadVerdict(),
  ]);
  const calibration = cal.ok
    ? { summary: cal.value, source: cal.source }
    : { error: cal.error };
  return (
    <div className="flex flex-col gap-5">
      <VerdictBanner verdict={verdict} />
      <StatsView initialData={{ stats, calibration }} />
    </div>
  );
}
