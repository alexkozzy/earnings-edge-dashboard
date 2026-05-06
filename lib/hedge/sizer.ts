/**
 * sizer — Kelly fraction × per-market cap × liquidity floor.
 *
 * Inputs:
 *   - fairProb:      our estimate (historical_base_rate) of P(YES), 0..1
 *   - marketProbYes: market-implied probability of YES, 0..1
 *   - betSide:       "YES" | "NO" — the side we're sizing
 *   - bankroll:      total bankroll for Kelly computation
 *   - perMarketCap:  hard cap per market (default $250)
 *   - liquidityCap:  estimated max we can fill at the quoted price
 *
 * Kelly formula for binary contracts:
 *   side = YES, entry = marketProbYes
 *   p = fairProb (prob of YES)
 *   q = 1 - p
 *   b = (1 - entry) / entry  — net odds received (payoff per dollar staked)
 *   f* = (p*b - q) / b
 *
 * For NO side, swap p and q and entry = 1 - marketProbYes.
 *
 * Final stake = MIN(kelly_fraction × bankroll, perMarketCap, liquidityCap),
 * floored at 0 (no negative-kelly bets).
 *
 * Per spec note on the user's rule: even if the Kelly recommends one side
 * (the +EV side), the *direction* selection is done in conflict.ts. This
 * function only sizes once the side is known.
 */

export type SizeInputs = {
  fairProb: number;        // 0..1
  marketProbYes: number;   // 0..1
  betSide: "YES" | "NO";
  bankroll: number;
  perMarketCap?: number;
  liquidityCap?: number;
};

export type SizeResult = {
  /** Raw Kelly fraction (can be 0 or negative; clipped to 0 in stake). */
  kelly_fraction: number;
  /** Kelly-implied stake before caps. */
  kelly_stake: number;
  /** Final stake after MIN() of caps. */
  recommended_stake: number;
  /** Which constraint bound the size. */
  binding_constraint: "kelly" | "per_market_cap" | "liquidity";
  /** Entry price for the chosen side, in cents 0..100. */
  entry_price_cents: number;
  /** Estimated payout if the bet hits (gross, before subtracting stake). */
  payout_if_hits: number;
  /** Estimated downside if the bet misses (= -recommended_stake). */
  downside_if_misses: number;
};

const DEFAULT_PER_MARKET_CAP = 250;
const DEFAULT_LIQUIDITY_CAP = 500; // assumed thin-market default in v1

export function sizeBet(inp: SizeInputs): SizeResult {
  const perCap = inp.perMarketCap ?? DEFAULT_PER_MARKET_CAP;
  const liqCap = inp.liquidityCap ?? DEFAULT_LIQUIDITY_CAP;

  // Entry price for the side we're sizing.
  const entry =
    inp.betSide === "YES" ? inp.marketProbYes : 1 - inp.marketProbYes;
  // Probability our side hits (under our fairProb estimate of YES).
  const pHit = inp.betSide === "YES" ? inp.fairProb : 1 - inp.fairProb;
  const qMiss = 1 - pHit;

  // Avoid div-by-zero on degenerate markets.
  const safeEntry = clamp(entry, 0.01, 0.99);
  const odds = (1 - safeEntry) / safeEntry; // b in classic Kelly

  const kellyRaw = (pHit * odds - qMiss) / odds;
  const kellyFraction = Math.max(0, kellyRaw);
  const kellyStake = round2(kellyFraction * inp.bankroll);

  // Apply caps.
  const candidates: Array<{ value: number; tag: SizeResult["binding_constraint"] }> = [
    { value: kellyStake, tag: "kelly" },
    { value: perCap, tag: "per_market_cap" },
    { value: liqCap * 0.5, tag: "liquidity" }, // 50% liquidity floor
  ];
  candidates.sort((a, b) => a.value - b.value);
  const bound = candidates[0];
  const recommended = Math.max(0, round2(bound.value));

  // Payout: at $1 settle, you get shares = stake / entry. Profit = shares * (1 - entry).
  // payout_if_hits = shares - stake = stake * (1 - entry) / entry  (just the profit)
  // BUT user spec wants the full payoff (the $403 in the example given $250 stake at 0.62).
  // Example: $250 / 0.62 = ~$403 in proceeds when contract settles to $1. So the spec
  // means GROSS proceeds = stake / entry. Implement that.
  const payoutIfHits = recommended > 0 ? round2(recommended / safeEntry) : 0;
  const downsideIfMisses = -recommended;

  const entryCents = Math.round(safeEntry * 100);

  return {
    kelly_fraction: round4(kellyFraction),
    kelly_stake: kellyStake,
    recommended_stake: recommended,
    binding_constraint: bound.tag,
    entry_price_cents: entryCents,
    payout_if_hits: payoutIfHits,
    downside_if_misses: downsideIfMisses,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
