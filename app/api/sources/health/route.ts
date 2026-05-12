/**
 * GET /api/sources/health
 *
 * Reports per-provider health (Polymarket, Finnhub, Alpha Vantage, Polygon).
 * Cached server-side: 30s for cheap providers, 30min for Alpha Vantage to
 * respect its 25/day quota.
 *
 * Intended consumer: /sources Server Component (which reads via direct
 * function call) and external monitoring (which can hit this endpoint).
 */
import { gatherSourceHealth } from "@/lib/sourceHealth";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function GET() {
  const all = await gatherSourceHealth();
  return Response.json(all, {
    headers: { "cache-control": "public, max-age=30" },
  });
}
