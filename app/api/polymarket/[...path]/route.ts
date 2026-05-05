/**
 * Polymarket gamma-api proxy.
 *
 * The public gamma API (https://gamma-api.polymarket.com) is unauthenticated
 * for read-only market metadata. We still proxy it from the server to:
 *   1. avoid CORS quirks in the browser,
 *   2. share the in-memory cache layer with Finnhub/AlphaVantage,
 *   3. give us a single chokepoint if Polymarket starts requiring keys later.
 *
 * Examples:
 *   /api/polymarket/markets?slug=will-nvda-beat-eps-q3-2025
 */
import type { NextRequest } from "next/server";
import { fetchJsonCached, proxyResponse } from "@/lib/proxy";

const UPSTREAM_BASE = "https://gamma-api.polymarket.com";
// 5min TTL — market prices move, but not so fast we need <1min freshness.
const TTL_MS = 5 * 60 * 1000;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  if (!path || path.length === 0) {
    return Response.json({ error: "Missing path segment" }, { status: 400 });
  }

  const subPath = path.join("/");
  const incomingQuery = req.nextUrl.searchParams;
  const upstream = new URL(`${UPSTREAM_BASE}/${subPath}`);
  for (const [k, v] of incomingQuery.entries()) upstream.searchParams.set(k, v);

  const cacheKey = `pm:${subPath}?${incomingQuery.toString()}`;
  const result = await fetchJsonCached(upstream.toString(), cacheKey, TTL_MS);
  return proxyResponse(result);
}
