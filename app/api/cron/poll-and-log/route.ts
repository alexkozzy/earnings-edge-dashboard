/**
 * GET /api/cron/poll-and-log
 *
 * Consolidated continuous-polling cron (Workstream 4 + Workstream 2 logging).
 * Per orchestrator constraint #1, Vercel Hobby caps total crons at 2 — we
 * fold the spec's separate /poll-signals and /log-paper-bets crons into this
 * single 15-min cadence route.
 *
 * Steps:
 *   1. Load the latest signals snapshot (loadSignalsSnapshot).
 *      In v1.1 the scanner publishes this; we don't compute signals
 *      from raw API data here. If the snapshot is missing/empty we
 *      no-op and report.
 *   2. Pass signals through paperEngine.logPaperBets — appends Tier A/B
 *      signals to the open paper-bets file in the data repo (deduped).
 *
 * Auth: when CRON_SECRET is set, require either ?secret=<token> or the
 * Vercel-injected `Authorization: Bearer <CRON_SECRET>` header. When unset,
 * the route is open — Vercel cron-trigger calls will still work.
 */
import { NextRequest, NextResponse } from "next/server";
import { loadSignalsSnapshot } from "@/lib/snapshots";
import { logPaperBets } from "@/lib/paperEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // generous; Hobby allows up to 60s

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // open if unset
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

  // Step 1: load signals snapshot.
  const snap = await loadSignalsSnapshot();
  if (!snap.ok) {
    return NextResponse.json({
      ok: false,
      started_at: startedAt,
      stage: "load_snapshot",
      error: snap.error,
    });
  }
  const signals = snap.value.signals;

  // Step 2: log paper bets for Tier A/B signals not yet logged.
  let logResult;
  try {
    logResult = await logPaperBets(signals);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      started_at: startedAt,
      stage: "log_paper_bets",
      error: err instanceof Error ? err.message : String(err),
      signals_count: signals.length,
    });
  }

  return NextResponse.json({
    ok: logResult.ok,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    snapshot: {
      source: snap.source,
      generated_at: snap.value.generated_at,
      signals_count: signals.length,
    },
    paper_engine: logResult,
  });
}
