/**
 * GET /api/composite/[ticker]
 *
 * Pulls live Finnhub recommendation data for `ticker`, joins with the
 * scanner's signal in `signals_latest.json`, computes the composite
 * three-source probability.
 *
 * Server-side cache: 5 min per ticker. Finnhub free tier is 60 req/min,
 * so a 36-ticker universe pulled once every 5 min = 7.2 calls/min worst
 * case — well under the cap.
 *
 * Phase A2: the options-implied probability now comes from the snapshot
 * itself (scanner computes it from yfinance + Black-Scholes greeks; see
 * massive-earnings-edge/docs/options-leg-methodology.md). When the snapshot
 * carries `options_predicted_prob`, the leg is populated and the composite
 * uses it. When absent (older snapshot or microcap with no listed options),
 * the composite falls back to a 2-of-3 blend exactly as before.
 */
import { fetchJsonCached, requireEnv } from "@/lib/proxy";
import { computeAnalystProb, type RecommendationRow } from "@/lib/probabilities/analystConsensus";
import { computeComposite } from "@/lib/probabilities/composite";
import { loadSignalsSnapshot } from "@/lib/snapshots";
import type { Signal } from "@/lib/types";

export const dynamic = "force-dynamic";

const COMPOSITE_TTL_MS = 5 * 60_000;
const DEFAULT_NON_MODEL_BRIER = 0.20;

async function findSignal(ticker: string): Promise<Signal | null> {
  // Import the snapshot directly — avoids server-to-server fetch.
  const result = await loadSignalsSnapshot();
  if (!result.ok) return null;
  const t = ticker.toUpperCase();
  return result.value.signals.find((s) => s.ticker === t) ?? null;
}

async function fetchRecommendations(ticker: string): Promise<RecommendationRow[] | null> {
  let token: string;
  try {
    token = requireEnv("FINNHUB_API_KEY");
  } catch {
    return null;
  }
  const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(ticker)}&token=${token}`;
  const cacheKey = `finnhub:recs:${ticker}`;
  const result = await fetchJsonCached<RecommendationRow[]>(url, cacheKey, COMPOSITE_TTL_MS);
  if (!result.ok) return null;
  return result.data;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await ctx.params;
  const upper = ticker.toUpperCase();

  const [signal, recs] = await Promise.all([findSignal(upper), fetchRecommendations(upper)]);

  if (!signal) {
    return Response.json(
      { error: `No signal for ${upper} in the latest snapshot.` },
      { status: 404 },
    );
  }

  const prior = signal.historical_base_rate;
  const analyst = computeAnalystProb(prior, recs);

  const optionsProb =
    signal.options_predicted_prob !== null &&
    signal.options_predicted_prob !== undefined
      ? signal.options_predicted_prob
      : null;
  const optionsReason =
    signal.options_reason ??
    "Options leg not present on this snapshot (scanner produced no chain for this ticker).";

  const composite = computeComposite(
    {
      probability: signal.model_predicted_prob ?? null,
      brier_or_prior: signal.model_brier ?? DEFAULT_NON_MODEL_BRIER,
      label: "model",
    },
    {
      probability: analyst.probability,
      brier_or_prior: DEFAULT_NON_MODEL_BRIER,
      label: "analyst",
    },
    {
      probability: optionsProb,
      brier_or_prior: DEFAULT_NON_MODEL_BRIER,
      label: "options",
    },
  );

  return Response.json({
    ticker: upper,
    earnings_date: signal.earnings_date,
    market_implied_prob: signal.market_implied_prob,
    historical_base_rate: prior,
    sources: {
      model: {
        probability: signal.model_predicted_prob ?? null,
        brier: signal.model_brier ?? null,
      },
      analyst,
      options: {
        probability: optionsProb,
        reason: optionsProb === null ? optionsReason : undefined,
        implied_move_pct: signal.options_implied_move_pct ?? null,
        atm_iv: signal.options_atm_iv ?? null,
        atm_strike: signal.options_atm_strike ?? null,
        expiry_used: signal.options_expiry_used ?? null,
        threshold_eps: signal.options_threshold_eps ?? null,
        required_stock_move_pct: signal.options_required_stock_move_pct ?? null,
        sensitivity_k: signal.options_sensitivity_k ?? null,
        sensitivity_source: signal.options_sensitivity_source ?? null,
        greeks: signal.options_atm_greeks ?? null,
      },
    },
    composite,
    composite_edge_pp: composite.composite === null
      ? null
      : parseFloat(((composite.composite - signal.market_implied_prob) * 100).toFixed(2)),
    generated_at: new Date().toISOString(),
  });
}
