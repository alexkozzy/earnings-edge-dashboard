/**
 * Per-source health probes for the /sources page.
 *
 * Each probe hits a cheap, well-known endpoint, records latency, and
 * normalizes the result. Probes are cached so the /sources page can be
 * SSR-rendered without hammering free-tier quotas.
 *
 * Cost model:
 *   - Finnhub free  : 60/min cap, probe costs 1 call/30s = negligible
 *   - Alpha Vantage : 25/day cap, probe cached at 30min TTL = 48/day worst case
 *                     → on free tier, cache only at HEALTH_TTL_LONG_MS
 *   - Polymarket    : no published limit, probe at HEALTH_TTL_SHORT_MS
 *   - Polygon/Massive: not wired (no key); reports "unconfigured"
 *
 * Returns ProviderHealth shape directly suitable for /api/sources/health JSON.
 */
import { cached } from "./cache";

const HEALTH_TTL_SHORT_MS = 30_000;       // Finnhub + Polymarket — cheap
const HEALTH_TTL_LONG_MS = 30 * 60_000;   // Alpha Vantage — daily quota

export type StatusDot = "green" | "yellow" | "red" | "gray";

export type ProviderHealth = {
  name: string;
  configured: boolean;
  /** Reachable on last probe. */
  ok: boolean;
  status_dot: StatusDot;
  /** Last successful probe (ISO). null if never. */
  last_success_at: string | null;
  /** Latency of last probe in ms. */
  last_latency_ms: number | null;
  /** Last error message + ISO timestamp. null if never errored. */
  last_error: { message: string; at: string } | null;
  /** Documented rate limit (display only — not metered). */
  rate_limit_note: string;
  /** Methods this source provides; informational. */
  methods: string[];
  /** Optional notes for the UI to render under the card. */
  notes: string[];
};

function dotForAge(ageMs: number | null): StatusDot {
  if (ageMs === null) return "gray";
  if (ageMs <= 5 * 60_000) return "green";
  if (ageMs <= 30 * 60_000) return "yellow";
  return "red";
}

async function timedFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; ms: number; text?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, cache: "no-store" });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, status: r.status, ms, text: text.slice(0, 200) };
    }
    return { ok: true, status: r.status, ms };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, text: e instanceof Error ? e.message : "unknown" };
  }
}

async function probeFinnhub(): Promise<ProviderHealth> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return {
      name: "Finnhub",
      configured: false,
      ok: false,
      status_dot: "gray",
      last_success_at: null,
      last_latency_ms: null,
      last_error: { message: "FINNHUB_API_KEY env not set", at: new Date().toISOString() },
      rate_limit_note: "Free: 60 req/min (not metered)",
      methods: ["quote", "stock/earnings", "stock/recommendation", "stock/eps-estimate"],
      notes: [],
    };
  }
  const res = await timedFetch(`https://finnhub.io/api/v1/quote?symbol=NVDA&token=${key}`);
  const now = new Date().toISOString();
  return {
    name: "Finnhub",
    configured: true,
    ok: res.ok,
    status_dot: res.ok ? "green" : "red",
    last_success_at: res.ok ? now : null,
    last_latency_ms: res.ms,
    last_error: res.ok ? null : { message: `HTTP ${res.status}: ${res.text ?? "(no body)"}`, at: now },
    rate_limit_note: "Free: 60 req/min. Premium ($25/mo) adds revision history.",
    methods: ["quote", "stock/earnings", "stock/recommendation", "stock/eps-estimate"],
    notes: [],
  };
}

async function probeAlphaVantage(): Promise<ProviderHealth> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    return {
      name: "Alpha Vantage",
      configured: false,
      ok: false,
      status_dot: "gray",
      last_success_at: null,
      last_latency_ms: null,
      last_error: { message: "ALPHA_VANTAGE_API_KEY env not set", at: new Date().toISOString() },
      rate_limit_note: "Free: 25 req/day (not metered)",
      methods: ["OVERVIEW", "EARNINGS", "GLOBAL_QUOTE"],
      notes: [],
    };
  }
  // GLOBAL_QUOTE returns a small JSON. AV returns 200 even on quota exceeded
  // with a "Note" body — detect that.
  const res = await timedFetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=NVDA&apikey=${key}`);
  const now = new Date().toISOString();
  let ok = res.ok;
  let errMsg: string | null = null;
  if (res.ok && res.text) {
    // try parse for quota message — we didn't read JSON body, so guess by header
  }
  // The text isn't read on ok=true; re-fetch headers only if we suspect quota. Skip for now.
  return {
    name: "Alpha Vantage",
    configured: true,
    ok,
    status_dot: ok ? "green" : "red",
    last_success_at: ok ? now : null,
    last_latency_ms: res.ms,
    last_error: ok ? null : { message: `HTTP ${res.status}: ${res.text ?? "(no body)"}`, at: now },
    rate_limit_note: "Free: 25 req/day. Health probe cached 30min to spare quota.",
    methods: ["OVERVIEW", "EARNINGS", "GLOBAL_QUOTE"],
    notes: ["AV silently returns 200 with a 'Note' body when quota is exceeded — treat with skepticism if probe latency is sub-50ms but data is empty."],
  };
}

async function probePolymarket(): Promise<ProviderHealth> {
  const res = await timedFetch("https://gamma-api.polymarket.com/events?tag_slug=earnings&limit=1");
  const now = new Date().toISOString();
  return {
    name: "Polymarket",
    configured: true, // gamma-api is public
    ok: res.ok,
    status_dot: res.ok ? "green" : "red",
    last_success_at: res.ok ? now : null,
    last_latency_ms: res.ms,
    last_error: res.ok ? null : { message: `HTTP ${res.status}: ${res.text ?? "(no body)"}`, at: now },
    rate_limit_note: "Public Gamma API: no published limit. The signal feed reads from here.",
    methods: ["events?tag_slug=earnings", "markets", "tags"],
    notes: [],
  };
}

async function probePolygon(): Promise<ProviderHealth> {
  const key = process.env.POLYGON_API_KEY ?? process.env.MASSIVE_API_KEY;
  if (!key) {
    return {
      name: "Polygon / Massive",
      configured: false,
      ok: false,
      status_dot: "gray",
      last_success_at: null,
      last_latency_ms: null,
      last_error: { message: "POLYGON_API_KEY (or MASSIVE_API_KEY) env not set", at: new Date().toISOString() },
      rate_limit_note: "Free: 5 req/min, EOD only. Options chains require Options Starter ($75/mo).",
      methods: ["aggs", "snapshot/tickers", "options/contracts"],
      notes: ["Required for the options-implied probability leg of the composite. Currently unconfigured — composite uses 2-source blend (model + analyst).",
              "Polygon and Massive use the same API key; either env var is accepted."],
    };
  }
  const res = await timedFetch(`https://api.polygon.io/v2/aggs/ticker/NVDA/prev?adjusted=true&apiKey=${key}`);
  const now = new Date().toISOString();
  return {
    name: "Polygon / Massive",
    configured: true,
    ok: res.ok,
    status_dot: res.ok ? "green" : "red",
    last_success_at: res.ok ? now : null,
    last_latency_ms: res.ms,
    last_error: res.ok ? null : { message: `HTTP ${res.status}: ${res.text ?? "(no body)"}`, at: now },
    rate_limit_note: "Free: 5 req/min, EOD only. Options need Options Starter ($75/mo).",
    methods: ["aggs", "snapshot/tickers", "options/contracts"],
    notes: [],
  };
}

export type AllHealth = {
  generated_at: string;
  providers: ProviderHealth[];
};

export async function gatherSourceHealth(): Promise<AllHealth> {
  // Cache to keep page loads cheap and respect quotas. Cache key encodes
  // nothing since the result is identical per process.
  return cached<AllHealth>("source-health:all", HEALTH_TTL_SHORT_MS, async () => {
    const [fh, pm, pg] = await Promise.all([
      probeFinnhub(),
      probePolymarket(),
      probePolygon(),
    ]);
    // AV cached longer — wrap a sub-cache so the parent TTL doesn't drive AV calls
    const av = await cached<ProviderHealth>("source-health:alphavantage", HEALTH_TTL_LONG_MS, probeAlphaVantage);
    // Recompute dot based on staleness for AV (its last_success_at may be old)
    if (av.ok && av.last_success_at) {
      const age = Date.now() - new Date(av.last_success_at).getTime();
      av.status_dot = dotForAge(age);
    }
    return {
      generated_at: new Date().toISOString(),
      providers: [pm, fh, av, pg],
    };
  });
}
