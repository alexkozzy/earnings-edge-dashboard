/**
 * /signal/[id] — single-signal permalink page.
 *
 * Useful for sharing a specific candidate via Discord/Twitter/email.
 * Reads the same /api/signals snapshot, finds the signal by id,
 * renders the full detail. Returns notFound() if id is unknown.
 *
 * Server component — no SWR polling here, this is a "snapshot of a
 * moment" view. Reload to refresh.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { Signal, SignalsSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchSignal(id: string): Promise<{ signal: Signal; snapshot: SignalsSnapshot } | null> {
  // Build absolute URL from incoming request headers (server-side fetch
  // requires absolute origin; relative paths only work client-side).
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const url = `${proto}://${host}/api/signals`;
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 60 } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { snapshot: SignalsSnapshot };
  const sig = data.snapshot.signals.find((s) => s.id === id);
  if (!sig) return null;
  return { signal: sig, snapshot: data.snapshot };
}

type CompositeResponse = {
  ticker: string;
  sources: {
    model: { probability: number | null; brier: number | null };
    analyst: {
      probability: number;
      meta: {
        source: "blended" | "prior-only";
        prior: number;
        skew: number;
        n_recs: number;
        period: string | null;
        alpha: number;
      };
    };
    options: { probability: number | null; reason?: string };
  };
  composite: {
    composite: number | null;
    variance: number;
    high_uncertainty: boolean;
    sources_used: string[];
    sources_missing: string[];
  };
  composite_edge_pp: number | null;
};

async function fetchComposite(ticker: string): Promise<CompositeResponse | null> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  try {
    const r = await fetch(`${proto}://${host}/api/composite/${encodeURIComponent(ticker)}`, {
      next: { revalidate: 300 },
    });
    if (!r.ok) return null;
    return (await r.json()) as CompositeResponse;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchSignal(id);
  if (!result) {
    return { title: "Signal not found · Earnings Edge" };
  }
  const { signal } = result;
  const edgeStr = `${signal.edge_magnitude_pp >= 0 ? "+" : ""}${signal.edge_magnitude_pp.toFixed(1)}pp`;
  return {
    title: `${signal.ticker} · ${edgeStr} · Earnings Edge`,
    description: `${signal.market_question} — market ${(signal.market_implied_prob * 100).toFixed(0)}%, base rate ${(signal.historical_base_rate * 100).toFixed(0)}%, edge ${edgeStr}, tier ${signal.tier}.`,
    openGraph: {
      title: `${signal.ticker}: ${edgeStr} edge`,
      description: signal.market_question,
    },
  };
}

function fmtPct(p: number) {
  return `${(p * 100).toFixed(1)}%`;
}
function fmtPp(pp: number) {
  return `${pp >= 0 ? "+" : ""}${pp.toFixed(2)}pp`;
}
function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

const TIER_COLOR: Record<Signal["tier"], string> = {
  A: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]",
  B: "bg-[#fbbf2420] text-[var(--warn)] border-[var(--warn)]",
  C: "bg-[#94949b20] text-[var(--muted)] border-[var(--muted)]",
};

export default async function SignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchSignal(id);
  if (!result) notFound();
  const { signal, snapshot } = result;
  const composite = await fetchComposite(signal.ticker);
  const fairProb = signal.historical_base_rate;
  const mktProb = signal.market_implied_prob;
  const edgeFavorsYes = fairProb > mktProb;
  const directionMatchesEdge =
    (signal.direction === "YES" && edgeFavorsYes) ||
    (signal.direction === "NO" && !edgeFavorsYes);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/"
          className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
        >
          ← back to all signals
        </Link>
      </div>

      <header className="flex flex-col gap-2 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-block rounded-md border px-2 py-0.5 text-sm font-mono ${TIER_COLOR[signal.tier]}`}
            >
              Tier {signal.tier}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight font-mono">
              {signal.ticker}
            </h1>
            <span
              className={`rounded px-2 py-0.5 font-mono text-sm ${
                signal.direction === "YES"
                  ? "bg-[#4ade8020] text-[var(--good)]"
                  : "bg-[#f8717120] text-[var(--bad)]"
              }`}
            >
              {signal.direction}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--foreground)] max-w-3xl">
            {signal.market_url ? (
              <a
                href={signal.market_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--accent)] hover:underline"
              >
                {signal.market_question} ↗
              </a>
            ) : (
              signal.market_question
            )}
          </p>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-3xl font-semibold ${
              directionMatchesEdge ? "text-[var(--good)]" : "text-[var(--bad)]"
            }`}
          >
            {fmtPp(signal.edge_magnitude_pp)}
          </div>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            edge
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Market-implied" value={fmtPct(mktProb)} />
        <Stat label="Historical base rate" value={fmtPct(fairProb)} />
        <Stat label="Earnings date" value={fmtDate(signal.earnings_date)} />
      </section>

      {composite && <ThreeProbabilities data={composite} marketProb={mktProb} />}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <h2 className="mb-3 text-xs uppercase tracking-wider text-[var(--muted)]">
          Quality flags
        </h2>
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <li>
            <span className="text-[var(--muted)]">Regime stable: </span>
            <span
              className={`font-mono ${signal.regime_stable ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
            >
              {signal.regime_stable ? "yes" : "no"}
            </span>
          </li>
          <li>
            <span className="text-[var(--muted)]">Consensus revised recently: </span>
            <span
              className={`font-mono ${signal.consensus_recently_revised ? "text-[var(--warn)]" : "text-[var(--good)]"}`}
            >
              {signal.consensus_recently_revised ? "yes" : "no"}
            </span>
          </li>
          <li>
            <span className="text-[var(--muted)]">Resolved: </span>
            <span className="font-mono">
              {signal.resolved
                ? signal.outcome === 1
                  ? "YES (1)"
                  : signal.outcome === 0
                    ? "NO (0)"
                    : "yes (no outcome)"
                : "pending"}
            </span>
          </li>
          {signal.note && (
            <li className="sm:col-span-2">
              <span className="text-[var(--muted)]">Note: </span>
              <span className="font-mono text-xs">{signal.note}</span>
            </li>
          )}
        </ul>
      </section>

      <footer className="text-xs text-[var(--muted)] font-mono">
        recorded {signal.recorded_at} · snapshot {snapshot.generated_at}
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ProbPill({
  label,
  prob,
  tooltip,
  unavailable,
}: {
  label: string;
  prob: number | null;
  tooltip?: string;
  unavailable?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-black/20 px-3 py-2" title={tooltip}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">
        {prob === null ? (
          <span
            className="text-[var(--muted)]"
            title={unavailable ?? "Unavailable"}
          >
            —
          </span>
        ) : (
          `${(prob * 100).toFixed(1)}%`
        )}
      </div>
    </div>
  );
}

function ThreeProbabilities({
  data,
  marketProb,
}: {
  data: CompositeResponse;
  marketProb: number;
}) {
  const { sources, composite, composite_edge_pp } = data;
  const compositePct =
    composite.composite === null ? "—" : `${(composite.composite * 100).toFixed(1)}%`;
  const edgePct =
    composite_edge_pp === null
      ? "—"
      : `${composite_edge_pp >= 0 ? "+" : ""}${composite_edge_pp.toFixed(2)}pp`;
  const edgeColor =
    composite_edge_pp !== null && composite_edge_pp > 0
      ? "text-[var(--good)]"
      : composite_edge_pp !== null && composite_edge_pp < 0
        ? "text-[var(--bad)]"
        : "text-[var(--muted)]";
  const variancePct = `${(composite.variance * 100).toFixed(1)}pp`;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Three probabilities
        </h2>
        {composite.high_uncertainty && (
          <span
            className="rounded bg-[var(--warn)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--warn)]"
            title={`Sources disagree by ${variancePct}, above the 15pp uncertainty threshold.`}
          >
            HIGH UNCERTAINTY ({variancePct})
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ProbPill
          label="Model"
          prob={sources.model.probability}
          tooltip={`HGBM beat classifier. Brier ${sources.model.brier ?? "—"}.`}
          unavailable="Scanner did not provide a model probability."
        />
        <ProbPill
          label="Analyst"
          prob={sources.analyst.probability}
          tooltip={`Bayesian: sigmoid(logit(${(sources.analyst.meta.prior * 100).toFixed(0)}%) + ${sources.analyst.meta.alpha}·${sources.analyst.meta.skew}) over ${sources.analyst.meta.n_recs} Finnhub recommendations. Period ${sources.analyst.meta.period ?? "n/a"}.`}
        />
        <ProbPill
          label="Options"
          prob={sources.options.probability}
          unavailable={sources.options.reason}
        />
        <div className="col-span-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2 sm:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-[var(--accent)]">
            Composite
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-[var(--accent)]">
            {compositePct}
          </div>
        </div>
        <div className="col-span-2 rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 sm:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Composite − Market
          </div>
          <div className={`mt-1 font-mono text-lg font-semibold ${edgeColor}`}>
            {edgePct}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted)]">
        Sources used: <span className="font-mono">{composite.sources_used.join(", ") || "none"}</span>.
        {composite.sources_missing.length > 0 && (
          <>
            {" "}
            Missing:{" "}
            <span className="font-mono">{composite.sources_missing.join(", ")}</span>.
          </>
        )}{" "}
        Market is at {(marketProb * 100).toFixed(1)}%.
      </p>
    </section>
  );
}
