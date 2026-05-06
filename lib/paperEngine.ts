/**
 * Paper-trading engine.
 *
 * Two operations:
 *   1. logPaperBets(signals): for each Tier A/B signal not already logged
 *      (dedup on ticker+earnings_date+side), append a paper-bet row to the
 *      open bets file. Stake = $250.
 *   2. resolvePaperBets(): for each open bet, check if the underlying
 *      earnings event has settled (Finnhub /stock/earnings actual EPS is
 *      now populated). If yes, mark the bet won/lost, move it to the
 *      settled file.
 *
 * Both operations require GH_DATA_PAT (write access to earnings-edge-data).
 * If unset, both operations fail loudly — no silent local-write fallback.
 */
import {
  appendJsonl,
  dataRepoConfig,
  readJsonl,
  replaceJsonl,
} from "./dataRepo";
import type { Direction, PaperBet, Signal } from "./types";

const PAPER_STAKE_DOLLARS = 250;
/** Resolution-window cushion past earnings_date in days. */
const EXPIRY_DAYS_AFTER_EARNINGS = 21;

function dedupKey(ticker: string, earningsDate: string, side: Direction): string {
  return `${ticker}:${earningsDate}:${side}`;
}

function uuidLike(): string {
  // crypto.randomUUID is available in Node 20+ and edge runtimes.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback that's good enough for paper-trading IDs.
  return `bet_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Convert a Signal to the side we'd actually bet on.
 *
 * The Signal already carries `direction` from the scanner — that IS the
 * cheap side. We bet on it.
 */
function sideFromSignal(s: Signal): Direction {
  return s.direction;
}

/**
 * Estimate entry price in cents.
 *
 * We don't have a live orderbook in v1.1 — best-ask data would need a
 * Polymarket CLOB call per signal. Approximate entry price as:
 *
 *   if betting YES → entry ≈ market_implied_prob * 100
 *   if betting NO  → entry ≈ (1 - market_implied_prob) * 100
 *
 * Add a 1ct slippage cushion. This is a known approximation and is
 * documented in DEPLOYMENT.md; v1.2 should replace with real orderbook.
 */
function estimateEntryCents(s: Signal): number {
  const implied = s.market_implied_prob;
  const raw = s.direction === "YES" ? implied * 100 : (1 - implied) * 100;
  const withSlip = raw + 1; // 1ct conservative slip
  return Math.max(1, Math.min(99, Math.round(withSlip)));
}

function expiryFromEarnings(iso: string): string {
  const base = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(base.getTime())) {
    // Unparseable earnings date — give it 30d from now as a safety net.
    return new Date(Date.now() + 30 * 86400_000).toISOString();
  }
  return new Date(base.getTime() + EXPIRY_DAYS_AFTER_EARNINGS * 86400_000).toISOString();
}

/** Heuristic venue inference from market_url. Default polymarket. */
function inferVenue(s: Signal): "polymarket" | "kalshi" {
  const u = (s.market_url ?? "").toLowerCase();
  if (u.includes("kalshi")) return "kalshi";
  return "polymarket";
}

export type LogResult = {
  ok: boolean;
  considered: number;
  logged: number;
  skipped_existing: number;
  skipped_tier_c: number;
  error?: string;
  commit?: string;
};

/**
 * Log paper bets for Tier A/B signals not already in the open file.
 */
export async function logPaperBets(signals: Signal[]): Promise<LogResult> {
  const result: LogResult = {
    ok: false,
    considered: signals.length,
    logged: 0,
    skipped_existing: 0,
    skipped_tier_c: 0,
  };

  // Step 1: read existing open bets to dedup.
  const open = await readJsonl<PaperBet>(dataRepoConfig.paths.paperBetsOpen);
  if (!open.ok) {
    result.error = `read open bets: ${open.error}`;
    return result;
  }
  const existingKeys = new Set(
    open.value.map((b) => dedupKey(b.ticker, b.earnings_date, b.side)),
  );

  // Step 2: filter to logging candidates.
  const newBets: PaperBet[] = [];
  for (const sig of signals) {
    if (sig.tier === "C") {
      result.skipped_tier_c += 1;
      continue;
    }
    if (sig.resolved) continue;
    const side = sideFromSignal(sig);
    const key = dedupKey(sig.ticker, sig.earnings_date, side);
    if (existingKeys.has(key)) {
      result.skipped_existing += 1;
      continue;
    }
    const entryCents = estimateEntryCents(sig);
    const shares = PAPER_STAKE_DOLLARS / (entryCents / 100);
    newBets.push({
      bet_id: uuidLike(),
      signal_id: sig.id,
      ticker: sig.ticker,
      earnings_date: sig.earnings_date,
      market_question: sig.market_question,
      venue: inferVenue(sig),
      side,
      entry_price_cents: entryCents,
      stake_dollars: PAPER_STAKE_DOLLARS,
      shares: Math.round(shares * 100) / 100,
      created_at: new Date().toISOString(),
      expires_at: expiryFromEarnings(sig.earnings_date),
      status: "open",
      resolution: null,
      metadata: {
        confidence_tier: sig.tier,
        edge_at_entry_pp: sig.edge_magnitude_pp,
      },
    });
    existingKeys.add(key);
  }

  if (newBets.length === 0) {
    result.ok = true;
    return result;
  }

  // Step 3: append to open bets.
  const append = await appendJsonl<PaperBet>({
    repoPath: dataRepoConfig.paths.paperBetsOpen,
    rows: newBets,
    message: `paper-engine: log ${newBets.length} bets (${new Date().toISOString().slice(0, 16)}Z)`,
  });
  if (!append.ok) {
    result.error = `append: ${append.error}`;
    return result;
  }

  result.ok = true;
  result.logged = newBets.length;
  result.commit = append.commit;
  return result;
}

/* ------------------------- Resolution ------------------------- */

export type ResolveResult = {
  ok: boolean;
  examined: number;
  settled: number;
  expired: number;
  still_open: number;
  error?: string;
  commits?: string[];
};

type FinnhubEarningsRow = {
  symbol: string;
  period: string; // ISO date of report
  actual: number | null;
  estimate: number | null;
  surprise: number | null;
  surprisePercent: number | null;
  quarter?: number;
  year?: number;
};

async function fetchFinnhubEarnings(ticker: string): Promise<FinnhubEarningsRow[] | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(
    ticker,
  )}&token=${key}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as FinnhubEarningsRow[];
  } catch {
    return null;
  }
}

/**
 * Find the earnings row matching the bet's earnings_date (within 7 days).
 * Returns null if no match or no actual EPS yet.
 */
function findMatchingQuarter(
  rows: FinnhubEarningsRow[],
  earningsDate: string,
): FinnhubEarningsRow | null {
  const target = new Date(
    earningsDate.length === 10 ? `${earningsDate}T00:00:00Z` : earningsDate,
  ).getTime();
  if (Number.isNaN(target)) return null;
  const tolMs = 7 * 86400_000;
  const candidates = rows
    .filter((r) => r.actual !== null && r.estimate !== null)
    .map((r) => ({
      row: r,
      delta: Math.abs(new Date(r.period).getTime() - target),
    }))
    .filter((c) => Number.isFinite(c.delta) && c.delta <= tolMs)
    .sort((a, b) => a.delta - b.delta);
  return candidates[0]?.row ?? null;
}

function isExpired(bet: PaperBet, now = Date.now()): boolean {
  const exp = new Date(bet.expires_at).getTime();
  return Number.isFinite(exp) && exp < now;
}

/**
 * Resolve open bets. For each bet:
 *   - If the earnings event has been reported and we have an actual EPS,
 *     mark won/lost based on direction = beat/miss.
 *   - If past expiry without a settle, mark `expired`.
 *   - Otherwise leave open.
 *
 * Settled and expired bets are moved out of the open file into the
 * settled file. The open file is rewritten with only still-open bets.
 */
export async function resolvePaperBets(): Promise<ResolveResult> {
  const result: ResolveResult = {
    ok: false,
    examined: 0,
    settled: 0,
    expired: 0,
    still_open: 0,
    commits: [],
  };

  const open = await readJsonl<PaperBet>(dataRepoConfig.paths.paperBetsOpen);
  if (!open.ok) {
    result.error = `read open: ${open.error}`;
    return result;
  }
  result.examined = open.value.length;
  if (open.value.length === 0) {
    result.ok = true;
    return result;
  }

  // Group bets by ticker so we hit Finnhub once per ticker.
  const byTicker = new Map<string, PaperBet[]>();
  for (const b of open.value) {
    if (!byTicker.has(b.ticker)) byTicker.set(b.ticker, []);
    byTicker.get(b.ticker)!.push(b);
  }

  const stillOpen: PaperBet[] = [];
  const newlySettled: PaperBet[] = [];

  for (const [ticker, bets] of byTicker.entries()) {
    const rows = await fetchFinnhubEarnings(ticker);
    for (const bet of bets) {
      if (isExpired(bet)) {
        const settled: PaperBet = {
          ...bet,
          status: "expired",
          resolution: {
            settled_at: new Date().toISOString(),
            actual_outcome: null,
            realized_pnl_dollars: -bet.stake_dollars, // assume total loss for prudent accounting
          },
        };
        newlySettled.push(settled);
        result.expired += 1;
        continue;
      }
      const match = rows ? findMatchingQuarter(rows, bet.earnings_date) : null;
      if (!match) {
        stillOpen.push(bet);
        continue;
      }
      const beat = (match.actual ?? 0) > (match.estimate ?? 0);
      const won =
        (bet.side === "YES" && beat) || (bet.side === "NO" && !beat);
      const realizedPnl = won
        ? bet.shares * 1.0 - bet.stake_dollars
        : -bet.stake_dollars;
      const settled: PaperBet = {
        ...bet,
        status: won ? "settled_win" : "settled_loss",
        resolution: {
          settled_at: new Date().toISOString(),
          actual_outcome: beat ? "YES" : "NO",
          realized_pnl_dollars: Math.round(realizedPnl * 100) / 100,
        },
      };
      newlySettled.push(settled);
      result.settled += 1;
    }
  }

  result.still_open = stillOpen.length;

  // No state changes — bail.
  if (newlySettled.length === 0) {
    result.ok = true;
    return result;
  }

  // 1. Append settled to settled file.
  const appendSettled = await appendJsonl<PaperBet>({
    repoPath: dataRepoConfig.paths.paperBetsSettled,
    rows: newlySettled,
    message: `paper-engine: settle ${newlySettled.length} bets (${result.settled} resolved, ${result.expired} expired)`,
  });
  if (!appendSettled.ok) {
    result.error = `append settled: ${appendSettled.error}`;
    return result;
  }
  result.commits!.push(appendSettled.commit);

  // 2. Replace open file with the still-open subset.
  const replaceOpen = await replaceJsonl<PaperBet>({
    repoPath: dataRepoConfig.paths.paperBetsOpen,
    rows: stillOpen,
    message: `paper-engine: prune ${newlySettled.length} settled from open file`,
  });
  if (!replaceOpen.ok) {
    result.error = `replace open: ${replaceOpen.error}`;
    return result;
  }
  result.commits!.push(replaceOpen.commit);

  result.ok = true;
  return result;
}
