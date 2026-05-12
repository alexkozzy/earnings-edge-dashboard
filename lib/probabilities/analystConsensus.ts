/**
 * Analyst-consensus implied probability of an earnings beat.
 *
 * Free Finnhub gives the most recent month's recommendation snapshot via
 * /stock/recommendation. We combine it with the empirical base rate
 * (already in the snapshot's `historical_base_rate`) via a Bayesian-style
 * logistic adjustment.
 *
 * Method
 * ------
 *   skew      = (strongBuy + buy - sell - strongSell) / max(total, 1), in [-1, 1]
 *   prior     = historical_base_rate  (in [0,1])
 *   posterior = sigmoid(logit(prior) + ALPHA * skew)
 *
 * ALPHA is a calibration constant. Higher = more weight on analyst skew.
 * Started at 0.5 (modest pull) — should be re-tuned once we have settled
 * outcomes to score it against. Documented in the return value as
 * `meta.alpha` so it's visible in `/api/composite/[ticker]`.
 *
 * Edge cases:
 *   - No recommendations available → return prior unchanged, mark
 *     `meta.source = "prior-only"`.
 *   - Total recs = 0 → same.
 *
 * NOTE: Free Finnhub returns only the most recent month's snapshot, not
 * historical revisions. To get the Tier-S revision-trend feature would
 * require Finnhub Premium ($25/mo).
 */

export type RecommendationRow = {
  symbol: string;
  period: string;          // YYYY-MM-DD start of month
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
};

const ALPHA = 0.5;

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export type AnalystResult = {
  probability: number;
  meta: {
    source: "blended" | "prior-only";
    prior: number;
    skew: number;
    n_recs: number;
    period: string | null;
    alpha: number;
  };
};

export function computeAnalystProb(
  prior: number,
  recs: RecommendationRow[] | null,
): AnalystResult {
  const safePrior = clamp(prior, 0.001, 0.999);
  if (!recs || recs.length === 0) {
    return {
      probability: safePrior,
      meta: { source: "prior-only", prior: safePrior, skew: 0, n_recs: 0, period: null, alpha: ALPHA },
    };
  }
  // Use the most recent period's row.
  const sorted = [...recs].sort((a, b) => b.period.localeCompare(a.period));
  const r = sorted[0];
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (total === 0) {
    return {
      probability: safePrior,
      meta: { source: "prior-only", prior: safePrior, skew: 0, n_recs: 0, period: r.period, alpha: ALPHA },
    };
  }
  const skew = (r.strongBuy + r.buy - r.sell - r.strongSell) / total;
  const posterior = clamp(sigmoid(logit(safePrior) + ALPHA * skew), 0.001, 0.999);
  return {
    probability: posterior,
    meta: {
      source: "blended",
      prior: safePrior,
      skew: parseFloat(skew.toFixed(4)),
      n_recs: total,
      period: r.period,
      alpha: ALPHA,
    },
  };
}
