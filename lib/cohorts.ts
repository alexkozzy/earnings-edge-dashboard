/**
 * Cohort analytics — aggregate settled paper bets into cohort summaries
 * for the Stats page chart.
 *
 * Lives server-side. Reads paper_bets_settled.jsonl via dataRepo (Pages),
 * groups by the requested dimension, computes win rate / mean edge / total
 * P&L per cohort. Sample-size guard at COHORT_MIN_N (= 30) per the spec's
 * Correction D — under that threshold, the cohort is flagged
 * `insufficient: true` and the UI greys it out.
 */
import { dataRepoConfig, readJsonl } from "./dataRepo";
import {
  COHORT_MIN_N,
  type CohortSummary,
  type PaperBet,
} from "./types";

export type CohortDimension = "venue" | "tier" | "sector" | "market_cap";

/** Return the cohort key + label for a settled bet under a given dimension. */
function cohortKey(b: PaperBet, dim: CohortDimension): { key: string; label: string } {
  switch (dim) {
    case "venue":
      return { key: `venue:${b.venue}`, label: b.venue.charAt(0).toUpperCase() + b.venue.slice(1) };
    case "tier":
      return { key: `tier:${b.metadata.confidence_tier}`, label: `Tier ${b.metadata.confidence_tier}` };
    case "sector": {
      const s = b.metadata.sector ?? "Unknown";
      return { key: `sector:${s}`, label: s };
    }
    case "market_cap": {
      const c = b.metadata.market_cap_bucket ?? "unknown";
      return { key: `cap:${c}`, label: c.charAt(0).toUpperCase() + c.slice(1) };
    }
  }
}

function isSettled(b: PaperBet): boolean {
  return b.status === "settled_win" || b.status === "settled_loss";
}

export type CohortPoint = {
  date: string;
  cumulative_pnl: number;
  n_so_far: number;
};

/** A single cohort line in the chart, with cumulative P&L over time. */
export type CohortSeries = {
  cohort: string;
  label: string;
  n: number;
  win_rate: number | null;
  mean_edge_pp: number | null;
  total_pnl_dollars: number;
  insufficient: boolean;
  points: CohortPoint[];
};

export type StatsPayload = {
  generated_at: string;
  total_settled: number;
  total_open: number;
  /** Resolved per dimension on demand. */
  cohorts: Record<CohortDimension, CohortSeries[]>;
};

function emptyStatsPayload(now = new Date().toISOString()): StatsPayload {
  return {
    generated_at: now,
    total_settled: 0,
    total_open: 0,
    cohorts: {
      venue: [],
      tier: [],
      sector: [],
      market_cap: [],
    },
  };
}

/** Build the cohort series for one dimension, sorted by total P&L desc. */
function buildSeries(
  settled: PaperBet[],
  dim: CohortDimension,
): CohortSeries[] {
  const groups = new Map<string, { label: string; bets: PaperBet[] }>();
  for (const b of settled) {
    const { key, label } = cohortKey(b, dim);
    if (!groups.has(key)) groups.set(key, { label, bets: [] });
    groups.get(key)!.bets.push(b);
  }

  const series: CohortSeries[] = [];
  for (const [key, { label, bets }] of groups.entries()) {
    // Sort bets by settled_at ASC for cumulative chart.
    const sorted = [...bets].sort((a, b) => {
      const ta = a.resolution?.settled_at ?? "";
      const tb = b.resolution?.settled_at ?? "";
      return ta.localeCompare(tb);
    });

    let cum = 0;
    const points: CohortPoint[] = [];
    let wins = 0;
    let edgeSum = 0;
    let edgeN = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      const b = sorted[i];
      const pnl = b.resolution?.realized_pnl_dollars ?? 0;
      cum += pnl;
      points.push({
        date: (b.resolution?.settled_at ?? "").slice(0, 10),
        cumulative_pnl: Math.round(cum * 100) / 100,
        n_so_far: i + 1,
      });
      if (b.status === "settled_win") wins += 1;
      if (Number.isFinite(b.metadata.edge_at_entry_pp)) {
        edgeSum += b.metadata.edge_at_entry_pp;
        edgeN += 1;
      }
    }

    const n = sorted.length;
    series.push({
      cohort: key,
      label,
      n,
      win_rate: n > 0 ? wins / n : null,
      mean_edge_pp: edgeN > 0 ? edgeSum / edgeN : null,
      total_pnl_dollars: Math.round(cum * 100) / 100,
      insufficient: n < COHORT_MIN_N,
      points,
    });
  }

  // Sort by total_pnl_dollars desc; insufficient cohorts sink to bottom.
  series.sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
    return b.total_pnl_dollars - a.total_pnl_dollars;
  });
  return series;
}

/**
 * Build the entire stats payload from the data repo's settled bets file.
 * Returns an empty payload if the file is missing (first-run case).
 */
export async function buildStatsPayload(): Promise<StatsPayload> {
  const settledRead = await readJsonl<PaperBet>(dataRepoConfig.paths.paperBetsSettled);
  const openRead = await readJsonl<PaperBet>(dataRepoConfig.paths.paperBetsOpen);

  if (!settledRead.ok && !openRead.ok) {
    // Both unreachable — return empty stats; UI shows insufficient-data state.
    return emptyStatsPayload();
  }

  const settled = settledRead.ok ? settledRead.value.filter(isSettled) : [];
  const openCount = openRead.ok ? openRead.value.length : 0;

  return {
    generated_at: new Date().toISOString(),
    total_settled: settled.length,
    total_open: openCount,
    cohorts: {
      venue: buildSeries(settled, "venue"),
      tier: buildSeries(settled, "tier"),
      sector: buildSeries(settled, "sector"),
      market_cap: buildSeries(settled, "market_cap"),
    },
  };
}

/** Convenience: a flat array of CohortSummary rows for one dimension. */
export function summariesFromSeries(series: CohortSeries[]): CohortSummary[] {
  return series.map((s) => ({
    cohort: s.cohort,
    label: s.label,
    n: s.n,
    win_rate: s.win_rate,
    mean_edge_pp: s.mean_edge_pp,
    total_pnl_dollars: s.total_pnl_dollars,
    insufficient: s.insufficient,
  }));
}
