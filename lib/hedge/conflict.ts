/**
 * conflict — edge-side vs hedge-side resolver.
 *
 * Two independent questions:
 *
 *   1. EDGE SIDE: which side does our base rate say is overpriced?
 *      - If fairProb > marketProbYes → YES is underpriced (buy YES is +EV)
 *      - Else                        → NO is underpriced (buy NO is +EV)
 *
 *   2. HEDGE SIDE: which side offsets the user's option position downside?
 *      - Long call / long stock → benefits from beat. Hedge buys NO.
 *      - Long put / short stock → benefits from miss. Hedge buys YES.
 *      - Short call             → benefits from miss/inline. Hedge buys YES.
 *      - Short put              → benefits from beat/inline. Hedge buys NO.
 *
 * Per user directive: when EDGE ≠ HEDGE, the recommended action is the EDGE
 * side. Edge takes priority over pure hedging. We surface a conflict_flag
 * and a pure-hedge alternative for transparency.
 *
 * The "Will X beat" market convention: YES means "beat", NO means "miss".
 */
import type { OptionPosition, Direction } from "../types";

export type ConflictResult = {
  edge_side: Direction;
  hedge_side: Direction;
  conflicts: boolean;
  recommended_side: Direction;
  rationale: string;
};

export function resolveSide(
  pos: OptionPosition,
  fairProb: number,
  marketProbYes: number,
): ConflictResult {
  const edgeSide: Direction = fairProb > marketProbYes ? "YES" : "NO";
  const hedgeSide = hedgeSideForPosition(pos);
  const conflicts = edgeSide !== hedgeSide;

  // User-directed: edge wins.
  const recommended = edgeSide;

  let rationale: string;
  if (!conflicts) {
    rationale = `Edge and hedge agree on ${recommended}: position benefits from a ${recommended === "YES" ? "miss" : "beat"} hedge AND base rate says ${recommended} is +EV.`;
  } else {
    rationale = `Conflict: hedge would say ${hedgeSide} (offsets your option downside), but edge says ${edgeSide} (+${((edgeSide === "YES" ? fairProb - marketProbYes : marketProbYes - fairProb) * 100).toFixed(1)}pp). Per edge-priority rule, recommending ${recommended}.`;
  }

  return {
    edge_side: edgeSide,
    hedge_side: hedgeSide,
    conflicts,
    recommended_side: recommended,
    rationale,
  };
}

/**
 * What side of the prediction market hedges this option position?
 *
 * The hedge is the side that PAYS OFF when the option position LOSES.
 *
 * Long call: loses on miss → buy YES (which loses on miss too)? NO.
 *   Long call loses on miss; hedge needs to PAY on miss; NO pays on miss.
 *   → Hedge = NO.
 *
 * Long put: loses on beat → hedge = YES.
 * Long stock: loses on miss → hedge = NO.
 * Short stock: loses on beat → hedge = YES.
 * Short call: loses on beat → hedge = YES.
 * Short put: loses on miss → hedge = NO.
 *
 * Wait, let me redo. "YES" in the market = beat. YES contract pays $1 on beat.
 *
 *   Long call:    pays on beat → already long beat → hedge with NO (pays on miss).
 *   Short call:   pays on miss → already long miss → hedge with YES (pays on beat).
 *   Long put:     pays on miss → already long miss → hedge with YES (pays on beat).
 *   Short put:    pays on beat → already long beat → hedge with NO (pays on miss).
 *   Long stock:   pays on beat → hedge with NO.
 *   Short stock:  pays on miss → hedge with YES.
 */
function hedgeSideForPosition(pos: OptionPosition): Direction {
  if (pos.instrument === "stock") {
    return pos.position === "long" ? "NO" : "YES";
  }
  if (pos.instrument === "call") {
    return pos.position === "long" ? "NO" : "YES";
  }
  // put
  return pos.position === "long" ? "YES" : "NO";
}
