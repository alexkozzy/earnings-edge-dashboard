/**
 * Canonical Signal schema for the Earnings Edge Dashboard.
 *
 * This is the dashboard's view of a mispricing signal. The scanner repo
 * has its own internal Signal dataclass with different field names; a
 * snapshot writer (separate task, lives in the scanner repo) is responsible
 * for translating scanner -> dashboard schema.
 *
 * Runtime validation: all snapshots loaded by /api/signals are validated
 * against the Zod schema below before being returned to the UI.
 */
import { z } from "zod";

/** Tier of confidence, controls UI grouping and per-tier calibration. */
export const TierEnum = z.enum(["A", "B", "C"]);
export type Tier = z.infer<typeof TierEnum>;

/** Direction of the proposed bet relative to the market price. */
export const DirectionEnum = z.enum(["YES", "NO"]);
export type Direction = z.infer<typeof DirectionEnum>;

export const SignalSchema = z.object({
  /** Stable signal id used as React key + for resolution joins. */
  id: z.string().min(1),

  /** Equity ticker the prediction is about (e.g. "NVDA"). */
  ticker: z.string().min(1).max(10),

  /** The polymarket / prediction-market question being shorted/longed. */
  market_question: z.string().min(1),

  /** Optional Polymarket slug or external URL for human review. */
  market_url: z.string().url().nullable().optional(),

  /** ISO timestamp when this signal was recorded by the scanner. */
  recorded_at: z.string().datetime(),

  /** Earnings date for the underlying ticker (ISO date or datetime). */
  earnings_date: z.string(),

  /** Tier — A is highest conviction. Used for per-tier calibration. */
  tier: TierEnum,

  /** Direction the scanner says is mispriced. */
  direction: DirectionEnum,

  /** Market-implied probability of the YES outcome, 0..1. */
  market_implied_prob: z.number().min(0).max(1),

  /** Historical base rate of the YES outcome for this kind of question, 0..1. */
  historical_base_rate: z.number().min(0).max(1),

  /**
   * Edge magnitude in percentage points (NOT bps). E.g. 12.5 means the
   * scanner thinks the fair probability is 12.5pp away from the market.
   */
  edge_magnitude_pp: z.number(),

  /** True if the scanner believes the macro/vol regime is stable enough to trust the base rate. */
  regime_stable: z.boolean(),

  /** True if sell-side consensus was revised in the last N days (degrades signal quality). */
  consensus_recently_revised: z.boolean(),

  /** Whether the underlying market has resolved. */
  resolved: z.boolean(),

  /** If resolved, the realized YES outcome (1 = YES occurred, 0 = NO). null otherwise. */
  outcome: z.union([z.literal(0), z.literal(1)]).nullable().optional(),

  /** Optional human-readable note from the scanner (e.g. "thin volume"). */
  note: z.string().nullable().optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

/** Snapshot file shape produced by the scanner. */
export const SignalsSnapshotSchema = z.object({
  /** ISO timestamp of when the snapshot was generated. */
  generated_at: z.string().datetime(),
  /** Schema version, bump on breaking changes. */
  schema_version: z.literal(1),
  signals: z.array(SignalSchema),
});

export type SignalsSnapshot = z.infer<typeof SignalsSnapshotSchema>;

/** A single calibration bucket: predictions in some prob range. */
export const CalibrationBucketSchema = z.object({
  /** Lower edge of bucket, inclusive (e.g. 0.0, 0.1, 0.2 ...). */
  prob_lower: z.number().min(0).max(1),
  /** Upper edge of bucket, exclusive (last bucket inclusive). */
  prob_upper: z.number().min(0).max(1),
  /** Number of resolved signals in this bucket. */
  n: z.number().int().nonnegative(),
  /** Mean predicted probability across signals in the bucket. */
  mean_predicted: z.number().min(0).max(1),
  /** Mean realized outcome across signals in the bucket (0..1). */
  mean_realized: z.number().min(0).max(1),
});

export type CalibrationBucket = z.infer<typeof CalibrationBucketSchema>;

/** Per-tier calibration aggregate. */
export const TierCalibrationSchema = z.object({
  tier: TierEnum,
  n: z.number().int().nonnegative(),
  /** Mean predicted YES probability across resolved signals in this tier. */
  mean_predicted: z.number().min(0).max(1),
  /** Mean realized YES outcome across resolved signals in this tier. */
  mean_realized: z.number().min(0).max(1),
  /** Brier score, lower = better calibration. null if n=0. */
  brier: z.number().min(0).max(1).nullable(),
});

export type TierCalibration = z.infer<typeof TierCalibrationSchema>;

export const CalibrationSummarySchema = z.object({
  generated_at: z.string().datetime(),
  schema_version: z.literal(1),
  /** Total resolved signals across all tiers. */
  total_resolved: z.number().int().nonnegative(),
  buckets: z.array(CalibrationBucketSchema),
  per_tier: z.array(TierCalibrationSchema),
});

export type CalibrationSummary = z.infer<typeof CalibrationSummarySchema>;

/** Threshold below which the calibration tab shows the "insufficient data" fallback. */
export const CALIBRATION_MIN_N = 20;
