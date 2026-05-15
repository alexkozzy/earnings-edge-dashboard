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
   * Model-predicted probability of the YES outcome, 0..1. Optional.
   * Populated by scanners that run a trained classifier (e.g. the
   * massive-earnings-edge HGBM beat predictor). When present, the UI
   * should display it alongside `historical_base_rate` so the reader
   * can see both the empirical baseline and the model's view.
   *
   * Schema rule (CLAUDE.md): additive only. Optional so older snapshots
   * without this field still validate.
   */
  model_predicted_prob: z.number().min(0).max(1).nullable().optional(),

  /**
   * Calibration of the model that produced `model_predicted_prob`, measured
   * as out-of-fold Brier score on a walk-forward CV. Lower is better. Used
   * as the inverse weight in any future composite probability blend. Optional.
   */
  model_brier: z.number().min(0).max(1).nullable().optional(),

  /**
   * Edge magnitude in percentage points (NOT bps). E.g. 12.5 means the
   * scanner thinks the fair probability is 12.5pp away from the market.
   */
  edge_magnitude_pp: z.number(),

  /**
   * Polymarket bid/ask spread at signal time, in percentage points.
   * Optional — older snapshots don't include it. When present, the UI
   * should show it next to edge so the user can see how much of the
   * raw edge gets eaten by execution.
   */
  spread_pp: z.number().nullable().optional(),

  /**
   * Edge net of spread cost: sign(edge) * max(0, |edge_pp| - spread_pp).
   * If spread is wider than the edge, this collapses to 0 — meaning the
   * trade pays the bid/ask cost and recovers nothing. The most useful
   * single number for ranking actually-tradeable signals.
   */
  tradeable_edge_pp: z.number().nullable().optional(),

  /**
   * Consensus EPS estimate for this quarter (yfinance's `EPS Estimate`
   * for the upcoming earnings_dates row). Optional. Displayed on the
   * Calendar view as "$X.XX EPS" so the reader can see the bar the
   * company has to clear.
   */
  estimate_eps: z.number().nullable().optional(),

  /**
   * Reporting time relative to the trading session:
   *   - "pre"     before regular session open (BMO / pre-market)
   *   - "post"    after regular session close (AMC / post-market)
   *   - "during"  during the regular session (rare for US listed)
   * Derived from yfinance's earnings timestamp converted to NY local time.
   * Optional — older snapshots don't include it.
   */
  report_time: z.enum(["pre", "post", "during"]).nullable().optional(),

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

  /* ----- Options leg (Phase A2, additive) ----------------------------
   * Scanner-supplied options-implied probability + diagnostics from
   * the ATM straddle. Populated when yfinance returns a usable chain
   * for the ticker; absent on tickers without listed options (e.g.
   * microcaps). All fields are optional/nullable so older snapshots
   * still validate.
   * ------------------------------------------------------------------- */

  /** P(EPS beats Polymarket threshold) derived from straddle implied move. */
  options_predicted_prob: z.number().min(0).max(1).nullable().optional(),
  /** Straddle-implied stock move as fraction-of-spot (0.045 = 4.5%). */
  options_implied_move_pct: z.number().nonnegative().nullable().optional(),
  /** Average call+put IV at ATM, annualized (0.50 = 50%). */
  options_atm_iv: z.number().nonnegative().nullable().optional(),
  /** ATM strike actually used for the straddle. */
  options_atm_strike: z.number().positive().nullable().optional(),
  /** ISO date of the option expiry used (earliest ≥ earnings date). */
  options_expiry_used: z.string().nullable().optional(),
  /** Polymarket-question EPS threshold, parsed from the slug. */
  options_threshold_eps: z.number().nullable().optional(),
  /** Stock-move % required to clear the EPS threshold per sensitivity. */
  options_required_stock_move_pct: z.number().nullable().optional(),
  /** Per-ticker historical |return|/|surprise| sensitivity ratio. */
  options_sensitivity_k: z.number().nullable().optional(),
  /** "panel" or "universe_median_fallback". */
  options_sensitivity_source: z.string().nullable().optional(),
  /** ATM straddle greeks (delta = call+put avg; gamma/theta/vega per leg). */
  options_atm_greeks: z
    .object({
      delta: z.number(),
      gamma: z.number(),
      theta: z.number(),
      vega: z.number(),
    })
    .nullable()
    .optional(),
  /** "ok" or a short diagnostic when the options leg could not size. */
  options_reason: z.string().nullable().optional(),

  /* ----- Vol-arb diagnostic fields (vol-arb pass, additive) ----------
   * Scanner-supplied comparison between options-implied event move (post² −
   * pre² decomposed) and PM-implied stock move (Method B: EPS price →
   * σ_eps via Φ⁻¹ × per-ticker reaction multiplier).
   *
   * NOT in the composite math — these are display-only quality flags
   * until calibration evidence accumulates. See
   * massive-earnings-edge/docs/vol-arb-audit.md and Phase C gating doc.
   * ------------------------------------------------------------------- */

  /** Event-isolated options implied move (sqrt(post² − pre²)). */
  vol_arb_options_event_move_pct: z.number().nullable().optional(),
  /** Raw post-earnings ATM straddle move. */
  vol_arb_options_post_move_pct: z.number().nullable().optional(),
  /** Pre-earnings ATM straddle move (calendar baseline). */
  vol_arb_options_pre_move_pct: z.number().nullable().optional(),
  /** Method B: stock σ implied by inverting EPS-beat market price. */
  vol_arb_pm_event_move_pct: z.number().nullable().optional(),
  /** "B_eps_translation" or "none" when not computable. */
  vol_arb_pm_method: z.string().nullable().optional(),
  /** (options − pm) × 100. Positive = options expensive vs PM. */
  vol_arb_spread_pp: z.number().nullable().optional(),
  /** Spread normalized by SE prior. Use as z-score. */
  vol_arb_spread_normalized: z.number().nullable().optional(),
  /** "A" | "B" | "C" | "below_threshold" | "suppressed" — POST-degradation. */
  vol_arb_tier: z
    .enum(["A", "B", "C", "below_threshold", "suppressed"])
    .nullable()
    .optional(),
  /** Raw (pre-audit-degradation) tier — diagnostic only. */
  vol_arb_tier_raw: z
    .enum(["A", "B", "C", "below_threshold"])
    .nullable()
    .optional(),
  /** True when sqrt(post² − pre²) decomposition succeeded. */
  vol_arb_event_decomposition: z.boolean().nullable().optional(),

  /* Quality-audit flags (vol-arb audit pass, additive). Three checks
     and their derived booleans; all three triggered → signal suppressed
     in the scanner before it reaches the snapshot. */

  /** CV of rolling-8q reaction multiplier; > 0.5 → multiplier_unstable. */
  vol_arb_reaction_multiplier_cv: z.number().nullable().optional(),
  /** k_cv > 0.5; caps tier at C. */
  vol_arb_multiplier_unstable: z.boolean().nullable().optional(),
  /** σ_pm bracket > 20% under ±1pp PM-price perturbation; caps at B. */
  vol_arb_pm_price_sensitive: z.boolean().nullable().optional(),
  /** Bracket fraction itself, for display. */
  vol_arb_pm_bracket_fraction: z.number().nullable().optional(),
  /** Shapiro-Wilk p < 0.05 on standardized surprise distribution; caps at B. */
  vol_arb_normal_questionable: z.boolean().nullable().optional(),
  /** Shapiro p-value, for display. */
  vol_arb_shapiro_p: z.number().nullable().optional(),
  /** Count of quality flags raised (0..3). */
  vol_arb_quality_flags_count: z.number().int().nullable().optional(),

  /** "ok" or short diagnostic. */
  vol_arb_reason: z.string().nullable().optional(),
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

/* -----------------------------------------------------------------------
 * Paper-trading additions (v1.1, additive only).
 *
 * The paper-trading engine logs simulated bets at signal-creation time on
 * currently-open prediction markets, then retroactively marks them won/lost
 * when the underlying earnings event settles.
 *
 * Storage lives in the GH `earnings-edge-data` repo (see lib/dataRepo.ts):
 *   - data/paper_bets_open.jsonl     active, unresolved bets
 *   - data/paper_bets_settled.jsonl  resolved history (immutable append)
 *
 * IMPORTANT: schema is additive. PaperBet fields align with the existing
 * Signal schema (tier `A|B|C`, side `YES|NO`). New fields like sector,
 * industry, market_cap_bucket are OPTIONAL so older snapshots still parse.
 * --------------------------------------------------------------------- */

export const VenueEnum = z.enum(["polymarket", "kalshi"]);
export type Venue = z.infer<typeof VenueEnum>;

export const PaperBetStatusEnum = z.enum([
  "open",
  "settled_win",
  "settled_loss",
  "expired",
]);
export type PaperBetStatus = z.infer<typeof PaperBetStatusEnum>;

export const MarketCapBucketEnum = z.enum(["mega", "large", "mid", "small"]);
export type MarketCapBucket = z.infer<typeof MarketCapBucketEnum>;

export const PaperBetMetadataSchema = z.object({
  /** From Finnhub /stock/profile2 — gross sector. Optional until classified. */
  sector: z.string().optional(),
  /** Finer industry from Finnhub or AV /OVERVIEW. Optional until classified. */
  industry: z.string().optional(),
  /** Optional cap bucket; classified daily by the AV refresh job. */
  market_cap_bucket: MarketCapBucketEnum.optional(),
  /** Confidence tier copied from the parent Signal. */
  confidence_tier: TierEnum,
  /** Edge magnitude (pp) at the moment we logged the bet. */
  edge_at_entry_pp: z.number(),
  /** Track if Polymarket question text changed mid-flight (per spec). */
  market_question_changed: z.boolean().optional(),
});
export type PaperBetMetadata = z.infer<typeof PaperBetMetadataSchema>;

export const PaperBetResolutionSchema = z.object({
  settled_at: z.string().datetime(),
  /** Realized YES/NO outcome of the underlying market. null if expired. */
  actual_outcome: DirectionEnum.nullable(),
  realized_pnl_dollars: z.number(),
});
export type PaperBetResolution = z.infer<typeof PaperBetResolutionSchema>;

export const PaperBetSchema = z.object({
  bet_id: z.string().min(1),
  /** Links back to the Signal that triggered this bet. */
  signal_id: z.string().min(1),
  ticker: z.string().min(1).max(10),
  earnings_date: z.string(),
  market_question: z.string().min(1),
  venue: VenueEnum,
  side: DirectionEnum,
  /** Best-ask price we paid, in cents 0..100. */
  entry_price_cents: z.number().min(0).max(100),
  stake_dollars: z.number().nonnegative(),
  /** stake_dollars / (entry_price_cents/100). */
  shares: z.number().nonnegative(),
  created_at: z.string().datetime(),
  /** Resolution deadline (typically earnings_date + a few days). */
  expires_at: z.string().datetime(),
  status: PaperBetStatusEnum,
  resolution: PaperBetResolutionSchema.nullable(),
  metadata: PaperBetMetadataSchema,
});
export type PaperBet = z.infer<typeof PaperBetSchema>;

/** Per-cohort summary used by the Stats page cohort chart. */
export const CohortSummarySchema = z.object({
  /** Cohort key, e.g. "tier:A" or "sector:Technology". */
  cohort: z.string(),
  /** Display label for the chart legend. */
  label: z.string(),
  n: z.number().int().nonnegative(),
  win_rate: z.number().min(0).max(1).nullable(),
  mean_edge_pp: z.number().nullable(),
  total_pnl_dollars: z.number(),
  /** True if N < 30 — UI should grey out. */
  insufficient: z.boolean(),
});
export type CohortSummary = z.infer<typeof CohortSummarySchema>;

/** Per-sector breakdown row for the Stats page. */
export const SectorBreakdownSchema = CohortSummarySchema;
export type SectorBreakdown = z.infer<typeof SectorBreakdownSchema>;

/** Sample-size threshold below which cohort breakdowns are flagged. */
export const COHORT_MIN_N = 30;

/* -----------------------------------------------------------------------
 * Hedge tool types (v1.3, additive only).
 *
 * Inputs: a user's options/stock position and a selected ticker that has
 * a future earnings event. Outputs: P&L scenarios across earnings-outcome
 * spot moves, paired with a recommended prediction-market hedge sized via
 * Kelly + caps + liquidity floor.
 *
 * Per user directive: when the +EV (model edge) direction conflicts with
 * the position-hedge direction, the recommended action is the EDGE side.
 * The hedge alternative is shown for transparency but not the default.
 * --------------------------------------------------------------------- */

export const InstrumentEnum = z.enum(["stock", "call", "put"]);
export type Instrument = z.infer<typeof InstrumentEnum>;

export const PositionEnum = z.enum(["long", "short"]);
export type PositionSide = z.infer<typeof PositionEnum>;

export const OptionPositionSchema = z.object({
  ticker: z.string().min(1).max(10),
  position: PositionEnum,
  instrument: InstrumentEnum,
  /** Required for call/put; ignored for stock. */
  strike: z.number().positive().optional(),
  /** Required for call/put (ISO date). */
  expiry: z.string().optional(),
  contracts: z.number().positive(),
  /** $ paid per contract (or per share if instrument=stock). */
  cost_basis: z.number().nonnegative(),
});
export type OptionPosition = z.infer<typeof OptionPositionSchema>;

export const HedgeScenarioRowSchema = z.object({
  label: z.string(),
  spot_move_pct: z.number(),
  spot_price: z.number(),
  option_pnl_dollars: z.number(),
  hedge_pnl_dollars: z.number(),
  combined_pnl_dollars: z.number(),
});
export type HedgeScenarioRow = z.infer<typeof HedgeScenarioRowSchema>;

export const HedgeRecommendationSchema = z.object({
  side: DirectionEnum,
  /** Why this side won (edge or hedge). */
  source: z.enum(["edge", "hedge", "agreed"]),
  venue: VenueEnum,
  stake_dollars: z.number().nonnegative(),
  /** Best-ask cents for the chosen side. */
  entry_price_cents: z.number().min(1).max(99),
  estimated_payout_dollars: z.number(),
  estimated_downside_dollars: z.number(),
  /** Which cap actually bound the size. */
  binding_cap: z.enum(["kelly", "per_market", "liquidity", "edge_zero"]),
});
export type HedgeRecommendation = z.infer<typeof HedgeRecommendationSchema>;

export const HedgeResultSchema = z.object({
  ticker: z.string(),
  earnings_date: z.string(),
  days_to_earnings: z.number(),
  signal_tier: TierEnum,
  current_spot: z.number().nullable(),
  spot_source: z.enum(["finnhub", "unavailable"]),
  market_question: z.string(),
  market_implied_prob_yes: z.number().min(0).max(1),
  historical_base_rate: z.number().min(0).max(1),
  edge_magnitude_pp: z.number(),
  edge_direction: DirectionEnum,
  hedge_direction: DirectionEnum,
  conflict: z.boolean(),
  scenarios: z.array(HedgeScenarioRowSchema),
  recommendation: HedgeRecommendationSchema,
  /** Pure-hedge alternative shown for transparency when there's a conflict. */
  hedge_alternative: HedgeRecommendationSchema.nullable(),
  generated_at: z.string().datetime(),
});
export type HedgeResult = z.infer<typeof HedgeResultSchema>;
