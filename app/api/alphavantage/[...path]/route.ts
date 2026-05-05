/**
 * Alpha Vantage proxy.
 *
 * Alpha Vantage uses a single endpoint (https://www.alphavantage.co/query)
 * and routes via the `function` query param. We treat the [...path] as
 * cosmetic / namespacing; the real query is whatever the client sends in
 * `?function=...`.
 *
 * The free tier is 25 req/day, so we cache aggressively (4 hours).
 */
import type { NextRequest } from "next/server";
import { fetchJsonCached, proxyResponse, requireEnv } from "@/lib/proxy";

const UPSTREAM = "https://www.alphavantage.co/query";
const TTL_MS = 4 * 60 * 60 * 1000;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;

  let key: string;
  try {
    key = requireEnv("ALPHA_VANTAGE_API_KEY");
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Missing API key" },
      { status: 500 },
    );
  }

  const incomingQuery = req.nextUrl.searchParams;
  incomingQuery.delete("apikey");
  const upstream = new URL(UPSTREAM);
  for (const [k, v] of incomingQuery.entries()) upstream.searchParams.set(k, v);
  upstream.searchParams.set("apikey", key);

  const cacheKey = `av:${path.join("/")}:?${incomingQuery.toString()}`;
  const result = await fetchJsonCached(upstream.toString(), cacheKey, TTL_MS);
  return proxyResponse(result);
}
