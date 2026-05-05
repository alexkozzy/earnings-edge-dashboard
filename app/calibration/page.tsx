import { CalibrationView } from "@/components/CalibrationView";
import { loadCalibrationSummary } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

export default async function CalibrationPage() {
  const result = await loadCalibrationSummary();
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Failed to load calibration: {result.error}
      </div>
    );
  }
  return (
    <CalibrationView
      initialData={{ summary: result.value, source: result.source }}
    />
  );
}
