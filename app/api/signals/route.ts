/**
 * GET /api/signals
 *
 * Returns the current SignalsSnapshot. Source is either the remote
 * snapshot URL (SNAPSHOT_BASE_URL env var) or the bundled sample.
 */
import { loadSignalsSnapshot } from "@/lib/snapshots";

export async function GET() {
  const result = await loadSignalsSnapshot();
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json({
    snapshot: result.value,
    source: result.source,
  });
}
