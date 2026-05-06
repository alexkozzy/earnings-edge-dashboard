import { Suspense } from "react";
import { LiveSignalsView } from "@/components/LiveSignalsView";
import { CategoryTabs, type Category } from "@/components/CategoryTabs";
import { CategoryPlaceholder } from "@/components/CategoryPlaceholder";
import { loadSignalsSnapshot } from "@/lib/snapshots";

// Always render fresh on each request — we don't want to ship stale signals
// to viewers who load the page during a CDN cache window.
export const dynamic = "force-dynamic";

function parseCategory(raw: string | string[] | undefined): Category {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "econ" || v === "crypto") return v;
  return "earnings";
}

export default async function HomePage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = parseCategory(sp.category);

  let body: React.ReactNode;
  if (category !== "earnings") {
    body = <CategoryPlaceholder category={category} />;
  } else {
    const result = await loadSignalsSnapshot();
    if (!result.ok) {
      body = (
        <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
          Failed to load snapshot: {result.error}
        </div>
      );
    } else {
      body = (
        <LiveSignalsView
          initialData={{
            snapshot: result.value,
            source: result.source === "missing" ? "local-sample" : result.source,
          }}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* CategoryTabs uses useSearchParams → must be inside Suspense in Next 16. */}
      <Suspense fallback={<div className="h-9" />}>
        <CategoryTabs />
      </Suspense>
      {body}
    </div>
  );
}
