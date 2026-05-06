/**
 * optionPayoff — empirical scenario P&L grid.
 *
 * v1 APPROXIMATION: this uses INTRINSIC VALUE ONLY at the scenario spot price.
 * No Black-Scholes, no implied vol, no time decay modeling. The reasoning:
 *   - The user only cares about the post-earnings move (single discrete event).
 *   - Time decay between "now" and "the morning after earnings" is a small
 *     wedge relative to the move itself for short-dated front-month options.
 *   - Including IV crush would be more accurate but requires live IV data we
 *     don't have a budget for in v1. Document the limitation; iterate later.
 *
 * Long call payoff at spot S, strike K:    max(S - K, 0)
 * Long put  payoff at spot S, strike K:    max(K - S, 0)
 * Short side flips sign of the above.
 * Long stock at cost C, qty N:             (S - C) * N
 * Short stock at cost C, qty N:            (C - S) * N
 *
 * For options, contracts are 100-multiplier. Cost basis is per-contract
 * (i.e. premium paid in dollars per contract, NOT per share). P&L is total
 * dollars across all contracts.
 */
import type { OptionPosition } from "../types";

export type ScenarioRow = {
  label: string;
  spot_move_pct: number;
  spot_price: number;
  option_pnl: number;
};

export const DEFAULT_SCENARIOS: Array<{ label: string; move: number }> = [
  { label: "Sharp miss", move: -0.15 },
  { label: "Miss", move: -0.075 },
  { label: "Inline", move: 0 },
  { label: "Beat", move: 0.075 },
  { label: "Sharp beat", move: 0.15 },
];

/**
 * P&L for a single option/stock position at a given spot price.
 *
 * Returns total dollars, accounting for contracts × 100 multiplier on options
 * and for short positions (negative P&L sign flipped).
 */
export function positionPnlAtSpot(
  pos: OptionPosition,
  spotAtScenario: number,
): number {
  const { instrument, position, strike, contracts, cost_basis } = pos;

  if (instrument === "stock") {
    // Stock: contracts is share count; cost_basis is per-share.
    const longPnl = (spotAtScenario - cost_basis) * contracts;
    return position === "long" ? longPnl : -longPnl;
  }

  if (strike === undefined) {
    // Defensive: should be validated upstream. Treat as zero-payoff.
    return 0;
  }

  // Intrinsic value at scenario spot.
  let intrinsic: number;
  if (instrument === "call") {
    intrinsic = Math.max(spotAtScenario - strike, 0);
  } else {
    intrinsic = Math.max(strike - spotAtScenario, 0);
  }

  // 100-multiplier per contract.
  const valuePerContract = intrinsic * 100;
  const totalValue = valuePerContract * contracts;
  const totalCost = cost_basis * contracts;

  // Long: P&L = current value - cost paid. Short: opposite.
  const longPnl = totalValue - totalCost;
  return position === "long" ? longPnl : -longPnl;
}

/**
 * Build the full scenario grid for an option position.
 *
 * Spot at each scenario = currentSpot * (1 + move).
 */
export function buildScenarioGrid(
  pos: OptionPosition,
  currentSpot: number,
  scenarios = DEFAULT_SCENARIOS,
): ScenarioRow[] {
  return scenarios.map((s) => {
    const spotPrice = currentSpot * (1 + s.move);
    return {
      label: s.label,
      spot_move_pct: s.move,
      spot_price: round2(spotPrice),
      option_pnl: round2(positionPnlAtSpot(pos, spotPrice)),
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
