/**
 * Composite beat probability across (up to) three independent sources.
 *
 * Sources
 *   1. Model     — scanner-supplied (`Signal.model_predicted_prob`).
 *      Weight = 1 / model_brier  (low Brier = high confidence)
 *   2. Analyst   — Bayesian update from Finnhub recommendations
 *                  (`lib/probabilities/analystConsensus.ts`).
 *      Weight = 1 / 0.20 = 5  (fixed prior — to be re-tuned with outcomes)
 *   3. Options   — implied probability from straddle pricing.
 *      Weight = 1 / 0.20 = 5  (fixed prior)
 *      Currently null on free Polygon — requires Options Starter ($75/mo).
 *
 * If a source is missing (probability=null) it's excluded from the blend.
 * `variance` is max-minus-min across the AVAILABLE sources; if it exceeds
 * `HIGH_UNCERTAINTY_THRESHOLD`, the UI should flag the signal.
 */

export type SourceProb = {
  probability: number | null;
  brier_or_prior: number;  // for weight = 1/this
  label: string;
};

export type CompositeResult = {
  composite: number | null;
  variance: number;
  high_uncertainty: boolean;
  weights_used: Record<string, number>;
  sources_used: string[];
  sources_missing: string[];
};

const HIGH_UNCERTAINTY_THRESHOLD = 0.15;

export function computeComposite(
  model: SourceProb,
  analyst: SourceProb,
  options: SourceProb,
): CompositeResult {
  const all = [model, analyst, options];
  const available = all.filter((s): s is SourceProb & { probability: number } =>
    s.probability !== null && Number.isFinite(s.probability),
  );
  const sourcesMissing = all
    .filter((s) => s.probability === null || !Number.isFinite(s.probability ?? NaN))
    .map((s) => s.label);

  if (available.length === 0) {
    return {
      composite: null,
      variance: 0,
      high_uncertainty: false,
      weights_used: {},
      sources_used: [],
      sources_missing: sourcesMissing,
    };
  }

  let totalW = 0;
  let weightedSum = 0;
  const weightsUsed: Record<string, number> = {};
  for (const s of available) {
    const w = 1 / Math.max(s.brier_or_prior, 0.01);
    totalW += w;
    weightedSum += s.probability * w;
    weightsUsed[s.label] = parseFloat(w.toFixed(3));
  }
  const composite = parseFloat((weightedSum / totalW).toFixed(4));

  const probs = available.map((s) => s.probability);
  const variance = parseFloat((Math.max(...probs) - Math.min(...probs)).toFixed(4));

  return {
    composite,
    variance,
    high_uncertainty: variance > HIGH_UNCERTAINTY_THRESHOLD,
    weights_used: weightsUsed,
    sources_used: available.map((s) => s.label),
    sources_missing: sourcesMissing,
  };
}
