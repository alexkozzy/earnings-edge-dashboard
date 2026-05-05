/**
 * Finnhub proxy.
 *
 * Path is forwarded under https://finnhub.io/api/v1/. Query string is
 * passed through. The token is injected server-side from FINNHUB_API_KEY
 * and never reaches the browser.
 *
 * Examples (called from the dashboard):
 *   /api/finnhub/quote?symbol=NVDA
 *   /api/finnhub/stock/earnings?symbol=NVDA
 *   /api/finnhub/stock/eps-estimate?symbol=NVDA&freq=quarterly
 */
import type { NextRequest } from "next/server";
import { fetchJsonCached, proxyResponse, requireEnv } from "@/lib/proxy";

const UPSTREAM_BASE = "https://finnhub.io/api/v1";
// 60s TTL — Finnhub free tier is 60 req/min, so this caps us to ~1 upstream
// hit per (path, querystring) per minute.
const TTL_MS = 60_000;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  if (!path || path.length === 0) {
    return Response.json({ error: "Missing path segment" }, { status: 400 });
  }

  let token: string;
  try {
    token = requireEnv("FINNHUB_API_KEY");
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Missing API key" },
      { status: 500 },
    );
  }

  const subPath = path.join("/");
  const incomingQuery = req.nextUrl.searchParams;
  // Strip any client-supplied token to avoid confusion.
  incomingQuery.delete("token");
  const upstream = new URL(`${UPSTREAM_BASE}/${subPath}`);
  for (const [k, v] of incomingQuery.entries()) upstream.searchParams.set(k, v);
  upstream.searchParams.set("token", token);

  // Cache key omits the token so we don't write it into memory.
  const cacheKey = `finnhub:${subPath}?${incomingQuery.toString()}`;
  const result = await fetchJsonCached(upstream.toString(), cacheKey, TTL_MS);
  return proxyResponse(result);
}
