import { LiveSignalsView } from "@/components/LiveSignalsView";
import { loadSignalsSnapshot } from "@/lib/snapshots";

// Always render fresh on each request — we don't want to ship stale signals
// to viewers who load the page during a CDN cache window.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await loadSignalsSnapshot();
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Failed to load snapshot: {result.error}
      </div>
    );
  }
  return (
    <LiveSignalsView
      initialData={{
        snapshot: result.value,
        source: result.source === "missing" ? "local-sample" : result.source,
      }}
    />
  );
}
