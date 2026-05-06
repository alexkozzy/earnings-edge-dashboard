/**
 * GET /api/cron/resolve
 *
 * Resolution sweep — every 6h. Walks open paper bets, checks Finnhub
 * `/stock/earnings` for actual EPS in each ticker, marks won/lost,
 * moves resolved bets to the settled file.
 *
 * See lib/paperEngine.ts:resolvePaperBets for the full logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolvePaperBets } from "@/lib/paperEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const fromQuery = req.nextUrl.searchParams.get("secret");
  if (fromQuery === secret) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader === `Bearer ${secret}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const startedAt = new Date().toISOString();
  let result;
  try {
    result = await resolvePaperBets();
  } catch (err) {
    return NextResponse.json({
      ok: false,
      started_at: startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return NextResponse.json({
    ok: result.ok,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    resolver: result,
  });
}
