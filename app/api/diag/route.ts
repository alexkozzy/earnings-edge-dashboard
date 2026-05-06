/**
 * GET /api/diag
 *
 * Operational diagnostic for v1.1. Returns the state of every env var,
 * upstream API reachability, and the latest snapshot/paper-bet timestamps.
 *
 * Protected by DIAG_TOKEN. Pass `?key=<token>` or header
 * `x-diag-token: <token>`. If DIAG_TOKEN is unset the route is OPEN —
 * acceptable for v1.1 because no secrets are returned (only presence flags).
 *
 * Designed to be called BEFORE upgrading any plan or paying for anything,
 * so the user can see what's actually configured.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EnvCheck = {
  name: string;
  set: boolean;
  required: boolean;
  /** Length of the value, never the value itself. */
  length: number;
  notes?: string;
};

type UpstreamCheck = {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  ms?: number;
  error?: string;
};

const ENV_VARS: { name: string; required: boolean; notes?: string }[] = [
  { name: "FINNHUB_API_KEY", required: true, notes: "60 req/min free tier" },
  { name: "ALPHA_VANTAGE_API_KEY", required: false, notes: "25 req/day backstop" },
  { name: "SNAPSHOT_BASE_URL", required: false, notes: "GitHub Pages snapshot base; fallback to local sample if unset" },
  { name: "GH_DATA_PAT", required: true, notes: "Required for paper-bet persistence (contents:write on earnings-edge-data)" },
  { name: "GH_DATA_REPO", required: false, notes: "Default: alexkozzy/earnings-edge-data" },
  { name: "CRON_SECRET", required: false, notes: "If set, cron routes require ?secret=... or matching Vercel cron auth header" },
  { name: "DIAG_TOKEN", required: false, notes: "If set, /api/diag and /_diag require ?key=..." },
];

function checkAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const expected = process.env.DIAG_TOKEN;
  if (!expected) return { ok: true };
  const fromQuery = req.nextUrl.searchParams.get("key");
  const fromHeader = req.headers.get("x-diag-token");
  if (fromQuery === expected || fromHeader === expected) return { ok: true };
  return { ok: false, reason: "missing or wrong DIAG_TOKEN" };
}

async function probe(name: string, url: string, timeoutMs = 4000): Promise<UpstreamCheck> {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
    return { name, url, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (err) {
    return {
      name,
      url,
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const env: EnvCheck[] = ENV_VARS.map(({ name, required, notes }) => {
    const v = process.env[name] ?? "";
    return { name, set: v.length > 0, required, length: v.length, notes };
  });

  // Upstream probes — keep these cheap; they hit lightweight endpoints.
  const finnhubKey = process.env.FINNHUB_API_KEY ?? "";
  const snapshotBase = (process.env.SNAPSHOT_BASE_URL ?? "").replace(/\/$/, "");
  const dataRepo = process.env.GH_DATA_REPO ?? "alexkozzy/earnings-edge-data";

  const probes = await Promise.all([
    probe(
      "finnhub.quote(AAPL)",
      finnhubKey
        ? `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${finnhubKey}`
        : "https://finnhub.io/api/v1/quote?symbol=AAPL",
    ),
    snapshotBase
      ? probe("snapshot.signals_latest", `${snapshotBase}/signals_latest.json`)
      : Promise.resolve<UpstreamCheck>({
          name: "snapshot.signals_latest",
          url: "(SNAPSHOT_BASE_URL unset)",
          ok: false,
          error: "SNAPSHOT_BASE_URL not configured",
        }),
    probe(
      "github.contents",
      `https://api.github.com/repos/${dataRepo}/contents/data/paper_bets_open.jsonl`,
    ),
  ]);

  // Redact upstream probe URLs that contain the token.
  for (const p of probes) {
    if (finnhubKey) p.url = p.url.replace(finnhubKey, "***");
  }

  const issues: string[] = [];
  for (const e of env) {
    if (e.required && !e.set) issues.push(`missing required env: ${e.name}`);
  }
  for (const p of probes) {
    if (!p.ok) issues.push(`upstream not reachable: ${p.name} (${p.error ?? `status ${p.status}`})`);
  }

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      runtime: {
        node: process.version,
        platform: process.platform,
        vercel_env: process.env.VERCEL_ENV ?? "(not vercel)",
        vercel_region: process.env.VERCEL_REGION ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
      env,
      probes,
      issues,
      status: issues.length === 0 ? "OK" : "DEGRADED",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
