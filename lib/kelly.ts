/**
 * Kelly sizing for binary prediction-market bets.
 *
 * Per-bet payoff structure: pay `entry` (0..1) per share, collect $1.00 if
 * the bet wins, lose `entry` otherwise.
 *
 * Full Kelly fraction (b=1 binary case, b = (1-entry)/entry from the user's
 * perspective):
 *
 *   f_full = (p - entry) / (1 - entry)
 *
 * where p is the trader's fair probability of the recommended side winning.
 *
 * The dashboard recommends `0.25 * f_full` capped at 5% of bankroll. The
 * fractional-Kelly literature shows that 0.25-0.5 of full Kelly cuts variance
 * sharply with only a small EV penalty; the additional 5% hard cap is a
 * tail-risk guard for the composite-prob uncertainty we don't quantify.
 *
 * IMPORTANT: this is a pure function. The page that consumes it is
 * responsible for picking `p` (composite > model > base_rate fallback chain).
 */

import type { Direction } from "@/lib/types";

export const KELLY_FRACTION = 0.25;
export const KELLY_CAP_FRAC = 0.05;
/** Tradeable-edge magnitudes smaller than this round to zero (no size). */
export const TRADEABLE_EDGE_EPSILON_PP = 0.01;

export type KellyResult = {
  /** Recommended bankroll fraction (0..0.05). Zero when no edge or invalid. */
  fRec: number;
  /** Unclamped, raw Kelly fraction. Can be negative or >0.05. */
  fFull: number;
  /** Entry price on the recommended side, 0..1. */
  entry: number;
  /** Fair probability of the recommended side winning, 0..1. */
  pUsed: number;
  /** Recommended side (echoed back for downstream display). */
  side: Direction;
  /**
   * Short machine code for why fRec was zeroed (or "sized" if non-zero).
   *   "sized"            — fRec > 0
   *   "no_tradeable"     — tradeable edge magnitude ≤ epsilon
   *   "p_below_entry"    — fair prob < entry price → -EV at this market
   *   "invalid_inputs"   — NaN / non-finite / entry not in (0,1)
   */
  reason: "sized" | "no_tradeable" | "p_below_entry" | "invalid_inputs";
  /** Human-readable message for the UI when reason !== "sized". */
  message: string;
};

export type KellyInput = {
  /** Recommended side. */
  side: Direction;
  /** Polymarket YES price 0..1. */
  marketYes: number;
  /** Trader's fair P(YES) (composite > model > base rate). */
  pYes: number;
  /**
   * Tradeable edge in pp from the snapshot, sign-conventionful (negative
   * means market YES is too high, i.e. NO is cheap). May be null/undefined.
   */
  tradeableEdgePp: number | null | undefined;
};

/**
 * Convert a signed tradeable edge in pp to "has tradeable edge?" boolean.
 * The sign matches the YES-favoured edge convention; we only care about
 * magnitude here — the side decision lives upstream in the scanner.
 */
function hasTradeableEdge(tradeableEdgePp: number | null | undefined): boolean {
  if (tradeableEdgePp === null || tradeableEdgePp === undefined) return false;
  if (!Number.isFinite(tradeableEdgePp)) return false;
  return Math.abs(tradeableEdgePp) >= TRADEABLE_EDGE_EPSILON_PP;
}

/** Compute the recommended Kelly fraction. Pure; no side effects. */
export function computeKelly(input: KellyInput): KellyResult {
  const { side, marketYes, pYes, tradeableEdgePp } = input;

  const entry = side === "YES" ? marketYes : 1 - marketYes;
  const pUsed = side === "YES" ? pYes : 1 - pYes;

  const base: Pick<KellyResult, "side" | "entry" | "pUsed"> = { side, entry, pUsed };

  // Tradeable edge — if the spread ate everything, force size to 0
  if (!hasTradeableEdge(tradeableEdgePp)) {
    return {
      ...base,
      fFull: 0,
      fRec: 0,
      reason: "no_tradeable",
      message: "No size — tradeable edge ≤ 0",
    };
  }

  // Sanity-check inputs
  if (!Number.isFinite(entry) || !Number.isFinite(pUsed) || entry <= 0 || entry >= 1) {
    return {
      ...base,
      fFull: 0,
      fRec: 0,
      reason: "invalid_inputs",
      message: "No size — invalid prices",
    };
  }

  const fFull = (pUsed - entry) / (1 - entry);

  if (fFull <= 0) {
    return {
      ...base,
      fFull,
      fRec: 0,
      reason: "p_below_entry",
      message: "No size — fair prob below entry price",
    };
  }

  const fRec = Math.min(KELLY_CAP_FRAC, Math.max(0, KELLY_FRACTION * fFull));
  return {
    ...base,
    fFull,
    fRec,
    reason: "sized",
    message: "",
  };
}

/** Clamp bankroll to the sane $[100, 1,000,000] range. Returns 1000 on NaN/missing. */
export function parseBankroll(raw: string | undefined | null): number {
  if (raw === null || raw === undefined || raw === "") return 1000;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1000;
  return Math.min(1_000_000, Math.max(100, n));
}
