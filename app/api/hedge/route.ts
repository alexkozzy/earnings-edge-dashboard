/**
 * POST /api/hedge
 *
 * Body: OptionPosition { ticker, position, instrument, strike?, expiry?, contracts, cost_basis }
 *
 * Returns: HedgeResult — current spot from Finnhub, scenario grid (5 spot
 * moves), sizer-driven recommendation (+EV side wins on conflict per spec),
 * pure-hedge alternative shown for transparency.
 *
 * Constraints:
 *   - Ticker must currently be in /api/signals (future-earnings only)
 *   - Spot price required from Finnhub /quote — if unavailable, returns 503
 *   - All sizing capped at $250 per market (kelly.max_position_per_market_usd
 *     in scanner config; we hardcode the same value here)
 *
 * No Black-Scholes. Intrinsic value at each scenario spot. v1.3 approximation;
 * v1.4 may add IV decay if the user requests it.
 */
import { z } from "zod";
import { OptionPositionSchema, type HedgeResult, type Signal } from "@/lib/types";
import { resolveSide } from "@/lib/hedge/conflict";
import { sizeBet } from "@/lib/hedge/sizer";
import { buildScenarioGrid } from "@/lib/hedge/optionPayoff";
import { loadSignalsSnapshot } from "@/lib/snapshots";
import { isFutureEarnings } from "@/lib/paperEngine";

const PER_MARKET_CAP = 250;
const STAKE_FOR_SHARES = PER_MARKET_CAP; // $1 per share at settlement, so shares = stake/(price/100)

function daysBetween(isoFuture: string, now: Date): number {
  const iso = isoFuture.length === 10 ? `${isoFuture}T00:00:00Z` : isoFuture;
  const t = new Date(iso).getTime();
  return (t - now.getTime()) / 86400_000;
}

async function fetchFinnhubSpot(ticker: string, baseUrl: string): Promise<number | null> {
  // Use our own proxy so the Finnhub key stays server-side.
  const res = await fetch(`${baseUrl}/api/finnhub/quote?symbol=${encodeURIComponent(ticker)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { c?: number };
  return typeof data.c === "number" && data.c > 0 ? data.c : null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = OptionPositionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const pos = parsed.data;

  // Validate call/put has strike + expiry
  if (pos.instrument !== "stock") {
    if (pos.strike === undefined || pos.expiry === undefined) {
      return Response.json(
        { error: `${pos.instrument} requires strike and expiry` },
        { status: 400 },
      );
    }
  }

  // Find the matching signal (future-earnings only, already filtered)
  const snap = await loadSignalsSnapshot();
  if (!snap.ok) {
    return Response.json({ error: `snapshot load failed: ${snap.error}` }, { status: 503 });
  }
  const now = new Date();
  const futureSignals = snap.value.signals.filter((s) =>
    isFutureEarnings(s.earnings_date, now),
  );
  const sig: Signal | undefined = futureSignals.find(
    (s) => s.ticker.toUpperCase() === pos.ticker.toUpperCase(),
  );
  if (!sig) {
    return Response.json(
      {
        error: `no future-earnings signal for ticker ${pos.ticker}. Available: ${futureSignals.map((s) => s.ticker).join(", ")}`,
      },
      { status: 404 },
    );
  }

  // Fetch current spot from Finnhub via our proxy
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const spot = await fetchFinnhubSpot(pos.ticker, baseUrl);
  if (spot === null) {
    return Response.json(
      { error: "Finnhub /quote returned no usable price; cannot compute scenarios" },
      { status: 503 },
    );
  }

  // Resolve edge vs hedge direction
  const conflict = resolveSide(pos, sig.historical_base_rate, sig.market_implied_prob);

  // Size the recommended trade (edge side per spec)
  const recSize = sizeBet({
    fairProb: sig.historical_base_rate,
    marketProbYes: sig.market_implied_prob,
    betSide: conflict.recommended_side,
    bankroll: 5000,
    perMarketCap: PER_MARKET_CAP,
  });

  // If there's a conflict, also size the pure-hedge alternative for display
  let hedgeAlt: HedgeResult["hedge_alternative"] = null;
  if (conflict.conflicts) {
    const altSize = sizeBet({
      fairProb: sig.historical_base_rate,
      marketProbYes: sig.market_implied_prob,
      betSide: conflict.hedge_side,
      bankroll: 5000,
      perMarketCap: PER_MARKET_CAP,
    });
    // For the pure hedge, force-stake $250 even if Kelly says less (it's a hedge, not an EV bet).
    const hedgeStake = PER_MARKET_CAP;
    const hedgeShares = hedgeStake / (altSize.entry_price_cents / 100);
    hedgeAlt = {
      side: conflict.hedge_side,
      source: "hedge",
      venue: "polymarket",
      stake_dollars: hedgeStake,
      entry_price_cents: altSize.entry_price_cents,
      estimated_payout_dollars: Math.round((hedgeShares * 100 - hedgeStake) * 100) / 100,
      estimated_downside_dollars: -hedgeStake,
      binding_cap: "per_market",
    };
  }

  // Build scenario grid using the new option payoff logic
  const scenarioGrid = buildScenarioGrid(pos, spot);
  const scenarios = scenarioGrid.map((row) => {
    // Hedge P&L: if recommended side hits in this scenario, realized = stake*(100/price -1).
    // Approximation: assume the bet hits in scenarios where the bet's directional thesis matches the move.
    // Beat-side scenarios (positive move) → YES bet wins; miss-side → NO bet wins.
    const move = row.spot_move_pct;
    const yesBetWins = move >= 0;
    const recSideHits =
      (recSize.entry_price_cents > 0 &&
        ((conflict.recommended_side === "YES" && yesBetWins) ||
          (conflict.recommended_side === "NO" && !yesBetWins)));
    const hedgePnl = recSideHits ? recSize.payout_if_hits : recSize.downside_if_misses;
    return {
      label: row.label,
      spot_move_pct: row.spot_move_pct,
      spot_price: Math.round(row.spot_price * 100) / 100,
      option_pnl_dollars: Math.round(row.option_pnl * 100) / 100,
      hedge_pnl_dollars: Math.round(hedgePnl * 100) / 100,
      combined_pnl_dollars: Math.round((row.option_pnl + hedgePnl) * 100) / 100,
    };
  });

  const result: HedgeResult = {
    ticker: sig.ticker,
    earnings_date: sig.earnings_date,
    days_to_earnings: Math.round(daysBetween(sig.earnings_date, now) * 10) / 10,
    signal_tier: sig.tier,
    current_spot: spot,
    spot_source: "finnhub",
    market_question: sig.market_question,
    market_implied_prob_yes: sig.market_implied_prob,
    historical_base_rate: sig.historical_base_rate,
    edge_magnitude_pp: Math.abs(sig.edge_magnitude_pp),
    edge_direction: conflict.edge_side,
    hedge_direction: conflict.hedge_side,
    conflict: conflict.conflicts,
    scenarios,
    recommendation: {
      side: conflict.recommended_side,
      source: conflict.conflicts ? "edge" : "agreed",
      venue: "polymarket",
      stake_dollars: recSize.recommended_stake,
      entry_price_cents: recSize.entry_price_cents,
      estimated_payout_dollars: Math.round(recSize.payout_if_hits * 100) / 100,
      estimated_downside_dollars: Math.round(recSize.downside_if_misses * 100) / 100,
      binding_cap:
        recSize.binding_constraint === "per_market_cap"
          ? "per_market"
          : recSize.binding_constraint === "kelly"
            ? "kelly"
            : recSize.binding_constraint === "liquidity"
              ? "liquidity"
              : "edge_zero",
    },
    hedge_alternative: hedgeAlt,
    generated_at: now.toISOString(),
  };

  return Response.json(result);
}
