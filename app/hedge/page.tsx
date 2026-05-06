/**
 * /hedge — position-aware hedger UI.
 *
 * Workflow:
 *   1. Form on the left/top — user enters their option/stock position
 *      and picks a ticker from the future-earnings autocomplete.
 *   2. POST to /api/hedge — returns scenarios + recommendation.
 *   3. Output panel on the right/bottom — scenario table, recommended
 *      hedge with edge/hedge conflict resolution, copy-to-clipboard JSON.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr";
import type { HedgeResult, OptionPosition, SignalsSnapshot } from "@/lib/types";

type SignalsApiResponse = {
  snapshot: SignalsSnapshot;
  source: string;
  filter_meta?: { future_only_returned: number; dropped_past_or_stale: number };
};

function fmtUSD(n: number): string {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function fmtPct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}
function fmtPp(pp: number): string {
  return `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}pp`;
}

export default function HedgePage() {
  // Pull future-earnings signals to populate the ticker dropdown
  const { data: signalsResp } = useSWR<SignalsApiResponse>("/api/signals", jsonFetcher, {
    refreshInterval: 60_000,
  });
  const futureSignals = signalsResp?.snapshot?.signals ?? [];

  // Form state
  const [ticker, setTicker] = useState("");
  const [position, setPosition] = useState<"long" | "short">("long");
  const [instrument, setInstrument] = useState<"stock" | "call" | "put">("call");
  const [strike, setStrike] = useState<string>("");
  const [expiry, setExpiry] = useState<string>("");
  const [contracts, setContracts] = useState<string>("1");
  const [costBasis, setCostBasis] = useState<string>("");

  // Output state
  const [result, setResult] = useState<HedgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Default ticker to first future signal once loaded
  useEffect(() => {
    if (!ticker && futureSignals.length > 0) {
      setTicker(futureSignals[0].ticker);
    }
  }, [futureSignals, ticker]);

  const selectedSignal = useMemo(
    () => futureSignals.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase()),
    [futureSignals, ticker],
  );

  async function calculate() {
    setCalculating(true);
    setError(null);
    setResult(null);
    try {
      const body: OptionPosition = {
        ticker: ticker.toUpperCase(),
        position,
        instrument,
        ...(instrument !== "stock" && strike
          ? { strike: parseFloat(strike) }
          : {}),
        ...(instrument !== "stock" && expiry ? { expiry } : {}),
        contracts: parseFloat(contracts) || 1,
        cost_basis: parseFloat(costBasis) || 0,
      };
      const res = await fetch("/api/hedge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        try {
          const errJson = JSON.parse(errText);
          setError(errJson.error || errText);
        } catch {
          setError(errText);
        }
        return;
      }
      const data = (await res.json()) as HedgeResult;
      setResult(data);
    } catch (e) {
      setError(`network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCalculating(false);
    }
  }

  function copyTradeDetails() {
    if (!result) return;
    const text = JSON.stringify(
      {
        ticker: result.ticker,
        earnings_date: result.earnings_date,
        market_question: result.market_question,
        recommended: result.recommendation,
        hedge_alternative: result.hedge_alternative,
      },
      null,
      2,
    );
    navigator.clipboard?.writeText(text);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hedge</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Position-aware sizing on currently-listed future-earnings markets.
          Edge wins over hedge on conflict (per operator directive).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        {/* ---------- FORM ---------- */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            calculate();
          }}
          className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 h-fit"
        >
          <h2 className="text-sm font-semibold">Your position</h2>

          <Field label="Ticker">
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
              required
            >
              {futureSignals.length === 0 && (
                <option value="">— no future-earnings signals available —</option>
              )}
              {futureSignals.map((s) => (
                <option key={s.id} value={s.ticker}>
                  {s.ticker} — earnings {s.earnings_date} (Tier {s.tier})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Position">
            <div className="flex gap-2">
              <SegBtn active={position === "long"} onClick={() => setPosition("long")}>
                Long
              </SegBtn>
              <SegBtn active={position === "short"} onClick={() => setPosition("short")}>
                Short
              </SegBtn>
            </div>
          </Field>

          <Field label="Instrument">
            <div className="flex gap-2">
              <SegBtn active={instrument === "stock"} onClick={() => setInstrument("stock")}>
                Stock
              </SegBtn>
              <SegBtn active={instrument === "call"} onClick={() => setInstrument("call")}>
                Call
              </SegBtn>
              <SegBtn active={instrument === "put"} onClick={() => setInstrument("put")}>
                Put
              </SegBtn>
            </div>
          </Field>

          {instrument !== "stock" && (
            <>
              <Field label="Strike ($)">
                <input
                  type="number"
                  step="0.01"
                  value={strike}
                  onChange={(e) => setStrike(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
                  placeholder="e.g. 220"
                  required
                />
              </Field>
              <Field label="Expiry">
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
                  required
                />
              </Field>
            </>
          )}

          <Field label={instrument === "stock" ? "Shares" : "Contracts"}>
            <input
              type="number"
              step="1"
              min="1"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
              required
            />
          </Field>

          <Field label={`Cost basis ($/${instrument === "stock" ? "share" : "contract"})`}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
              placeholder="e.g. 4.50"
              required
            />
          </Field>

          <button
            type="submit"
            disabled={calculating || !selectedSignal}
            className="mt-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black hover:bg-[var(--accent)]/90 disabled:opacity-50"
          >
            {calculating ? "Calculating…" : "Calculate hedge"}
          </button>
        </form>

        {/* ---------- OUTPUT ---------- */}
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {!result && !error && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
              {futureSignals.length === 0
                ? "No future-earnings signals available — scanner publishes daily at 14:00 UTC."
                : "Fill in your position above and click Calculate hedge to see scenarios + recommended trade."}
            </div>
          )}

          {result && (
            <>
              {/* Header strip */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-mono text-2xl font-semibold">{result.ticker}</span>
                    <span className="ml-3 text-sm text-[var(--muted)]">
                      Earnings {result.earnings_date} ({result.days_to_earnings.toFixed(0)}d) —
                      Tier {result.signal_tier}
                    </span>
                  </div>
                  <span className="font-mono text-xl">
                    {result.current_spot ? `$${result.current_spot.toFixed(2)}` : "spot N/A"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">{result.market_question}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Stat label="Market YES" value={fmtPct(result.market_implied_prob_yes)} />
                  <Stat label="Hist base rate" value={fmtPct(result.historical_base_rate)} />
                  <Stat
                    label="Edge"
                    value={fmtPp(result.edge_magnitude_pp)}
                    accent="good"
                  />
                  <Stat
                    label="Edge direction"
                    value={result.edge_direction}
                    accent={result.edge_direction === "YES" ? "good" : "bad"}
                  />
                </div>
              </div>

              {/* Scenario grid */}
              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
                <div className="border-b border-[var(--border)] bg-black/20 px-5 py-3">
                  <h3 className="text-sm font-semibold">Scenario P&amp;L</h3>
                  <p className="text-xs text-[var(--muted)]">
                    Spot move at earnings → option position P&amp;L + recommended-hedge P&amp;L.
                    Combined column shows total exposure.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                        <th className="px-4 py-2 font-medium">Scenario</th>
                        <th className="px-4 py-2 text-right font-medium">Spot</th>
                        <th className="px-4 py-2 text-right font-medium">Option P&amp;L</th>
                        <th className="px-4 py-2 text-right font-medium">Hedge P&amp;L</th>
                        <th className="px-4 py-2 text-right font-medium">Combined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.scenarios.map((s) => (
                        <tr
                          key={s.label}
                          className="border-b border-[var(--border)] last:border-b-0"
                        >
                          <td className="px-4 py-2 font-mono">{s.label}</td>
                          <td className="px-4 py-2 text-right font-mono">
                            ${s.spot_price.toFixed(2)}{" "}
                            <span className="text-xs text-[var(--muted)]">
                              ({fmtPp(s.spot_move_pct * 100)})
                            </span>
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-mono ${s.option_pnl_dollars >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
                          >
                            {fmtUSD(s.option_pnl_dollars)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-mono ${s.hedge_pnl_dollars >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
                          >
                            {fmtUSD(s.hedge_pnl_dollars)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-mono font-semibold ${s.combined_pnl_dollars >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
                          >
                            {fmtUSD(s.combined_pnl_dollars)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recommendation */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Recommended trade{" "}
                    {result.conflict && (
                      <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
                        edge ≠ hedge — edge wins per directive
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={copyTradeDetails}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--background)]"
                  >
                    Copy JSON
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <RecRow label="Side">
                    <span
                      className={`font-mono ${result.recommendation.side === "YES" ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
                    >
                      {result.recommendation.side}
                    </span>{" "}
                    on {result.recommendation.venue}
                  </RecRow>
                  <RecRow label="Stake">${result.recommendation.stake_dollars.toFixed(0)}</RecRow>
                  <RecRow label="Entry">{result.recommendation.entry_price_cents}¢</RecRow>
                  <RecRow label="Binding cap">{result.recommendation.binding_cap}</RecRow>
                  <RecRow label="Payout if hits">
                    <span className="text-[var(--good)]">
                      {fmtUSD(result.recommendation.estimated_payout_dollars)}
                    </span>
                  </RecRow>
                  <RecRow label="Downside if misses">
                    <span className="text-[var(--bad)]">
                      {fmtUSD(result.recommendation.estimated_downside_dollars)}
                    </span>
                  </RecRow>
                </div>

                {result.hedge_alternative && (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    <h4 className="text-xs uppercase tracking-wider text-[var(--muted)]">
                      Pure-hedge alternative (not recommended; shown for transparency)
                    </h4>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <RecRow label="Side">
                        <span
                          className={`font-mono ${result.hedge_alternative.side === "YES" ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
                        >
                          {result.hedge_alternative.side}
                        </span>{" "}
                        on {result.hedge_alternative.venue}
                      </RecRow>
                      <RecRow label="Stake">
                        ${result.hedge_alternative.stake_dollars.toFixed(0)}
                      </RecRow>
                      <RecRow label="Entry">{result.hedge_alternative.entry_price_cents}¢</RecRow>
                      <RecRow label="Payout if miss occurs">
                        {fmtUSD(result.hedge_alternative.estimated_payout_dollars)}
                      </RecRow>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div
        className={`font-mono text-base font-semibold ${
          accent === "good" ? "text-[var(--good)]" : accent === "bad" ? "text-[var(--bad)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function RecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[var(--muted)]">{label}: </span>
      <span className="font-mono">{children}</span>
    </div>
  );
}
