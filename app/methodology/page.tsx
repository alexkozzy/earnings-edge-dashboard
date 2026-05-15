/**
 * /methodology — describes how the dashboard's numbers are produced.
 *
 * Linked from the top nav next to /sources. Static content. The composite-
 * weighting language and Kelly parameters are read directly from the code
 * (lib/probabilities/composite.ts, lib/kelly.ts) — verified before write,
 * not invented. Tier thresholds live in the scanner repo and are described
 * as upstream-defined here.
 */
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Methodology · Earnings Edge",
  description:
    "How the dashboard turns scanner signals + analyst recs into a composite probability, tier, and recommended size.",
};

export default function MethodologyPage() {
  return (
    <article className="flex flex-col gap-6">
      <header className="border-b border-[var(--border)] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          What the numbers mean, how they're combined, and where we make
          choices that are visible in the math.
        </p>
      </header>

      <Section title="The three-leg composite">
        <p>
          Each signal carries up to three independent probability estimates
          of the YES outcome:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Model</strong> — scanner-supplied (
            <code className="font-mono">Signal.model_predicted_prob</code>).
            Today this is the HGBM beat classifier from{" "}
            <code className="font-mono">massive-earnings-edge</code>.
          </li>
          <li>
            <strong>Analyst</strong> — Bayesian update on the historical base
            rate using recent Finnhub sell-side recommendations. Implemented
            in <code className="font-mono">lib/probabilities/analystConsensus.ts</code>{" "}
            as <code className="font-mono">sigmoid(logit(prior) + α · skew)</code>.
          </li>
          <li>
            <strong>Options</strong> — implied probability from straddle
            pricing. Currently <em>null on every signal</em>: the dashboard
            relies on the free Polygon plan, which does not include the
            options chain. The composite runs on a 2-of-3 blend.
          </li>
        </ul>
        <p>
          The composite is a Brier-weighted blend (
          <code className="font-mono">lib/probabilities/composite.ts</code>):
        </p>
        <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
{`weight_i = 1 / brier_or_prior_i           // 1/brier for model, 1/0.20 = 5 for analyst & options
composite = sum(p_i * weight_i) / sum(weight_i)   // over available legs only`}
        </pre>
        <p>
          When a leg is missing it's excluded from the weighted average — so
          today's 2-of-3 blend uses model + analyst weights only. If the
          model leg is also missing, the composite collapses to the analyst
          estimate. If all three are missing,{" "}
          <code className="font-mono">composite</code> is <code className="font-mono">null</code>{" "}
          and the dashboard renders "—".
        </p>
        <p className="text-sm text-[var(--muted)]">
          The 5× weight on analyst and options is a placeholder prior; it
          will be re-tuned once enough resolved bets exist to measure each
          leg's empirical Brier independently. The high-uncertainty flag
          triggers when sources disagree by more than 15pp.
        </p>
      </Section>

      <Section title="Tier definitions (A / B / C)">
        <p>
          Tier is assigned upstream by the scanner; the dashboard treats it
          as a given input. Within the dashboard:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Tier A</strong> — highest conviction. Shown by default
            in every filter; counted in calibration aggregates.
          </li>
          <li>
            <strong>Tier B</strong> — middle conviction. Shown in default
            and "Tier A + B" filters.
          </li>
          <li>
            <strong>Tier C</strong> — lowest conviction. Shown only when the
            "All" filter is selected. The paper-trading engine{" "}
            <strong>skips Tier C signals entirely</strong> (
            <code className="font-mono">lib/paperEngine.ts:155</code>) — they
            won't show up on /stats.
          </li>
        </ul>
        <p className="text-sm text-[var(--muted)]">
          The exact edge / liquidity / regime thresholds that decide
          A vs B vs C live in the scanner repo, not the dashboard. They are
          documented at the source of truth where they can drift with model
          retraining without requiring a dashboard deploy.
        </p>
      </Section>

      <Section title="Execution cost — raw edge vs tradeable edge">
        <p>
          The raw <strong>edge</strong> is the gap between the composite
          probability and the market-implied probability, in percentage
          points. Entering a trade at the displayed price costs the bid/ask
          spread, so the dashboard also reports{" "}
          <strong>tradeable edge</strong>:
        </p>
        <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
{`tradeable_edge_pp = sign(edge_pp) * max(0, |edge_pp| - spread_pp)`}
        </pre>
        <p>
          If the spread is wider than the raw edge, tradeable edge collapses
          to 0 — the trade pays the bid/ask cost and recovers nothing. The
          recommended-size block treats this as the no-size condition.
        </p>
      </Section>

      <Section title="Kelly sizing">
        <p>
          On every signal-detail page, the <strong>Sizing</strong> block
          computes a fractional-Kelly bankroll fraction:
        </p>
        <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
{`f_full = (p − entry) / (1 − entry)
f_rec  = clamp(0.25 * f_full, 0, 0.05)`}
        </pre>
        <p>
          where <code className="font-mono">entry</code> is the price paid
          per share on the recommended side and{" "}
          <code className="font-mono">p</code> is the trader's fair
          probability of that side winning (composite ⟶ model ⟶ base rate
          fallback chain). 25% of full Kelly is a conservative bet-size
          choice from the fractional-Kelly literature — it cuts variance
          sharply with a small expected-return penalty. The 5% hard cap is a
          tail-risk guard for model-uncertainty we don't otherwise quantify.
          When tradeable edge ≤ 0, sizing forces <code className="font-mono">f_rec = 0</code>{" "}
          regardless of model confidence.
        </p>
        <p className="text-sm text-[var(--muted)]">
          Bankroll defaults to $1,000. Override with{" "}
          <code className="font-mono">?bankroll=N</code> on the signal URL
          (clamped to $100–$1M).
        </p>
      </Section>

      <Section title="Vol-arb leg — options σ vs Polymarket σ">
        <p>
          For every ticker with a live Polymarket EPS-beat market this week,
          the scanner compares two independently-derived estimates of the
          earnings-event stock-return σ:
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            <strong>Options-implied event σ.</strong> ATM straddles at two
            yfinance expiries — one strictly before the earnings date, one
            on or after — are extracted. The event-isolated piece is the
            sqrt of squared-vol subtraction:
            <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
{`event_move_pct = sqrt( max(0, post_IM² − pre_IM²) )`}
            </pre>
            This strips out the calendar vol that the post-earnings expiry
            would carry anyway. When no pre-earnings expiry exists in the
            (now, earnings_date) window, the scanner falls back to the raw
            post-earnings move and flags{" "}
            <code className="font-mono">event_vol_decomposition=false</code>.
          </li>
          <li>
            <strong>PM-implied stock σ (Method B).</strong> Inverts the
            Polymarket beat-market price into an EPS σ, then translates to
            stock σ via the per-ticker reaction multiplier:
            <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
{`σ_eps   = (μ − T) / Φ⁻¹(market_yes)
σ_stock = σ_eps × reaction_multiplier_k`}
            </pre>
            where μ is the Finnhub consensus EPS, T is the Polymarket
            threshold parsed from the slug, and{" "}
            <code className="font-mono">k</code> is the rolling-8q median
            of |stock_move%| / |eps_surprise%| from the training panel.
            Output is in stock-move % units, expressed as a fraction of
            spot.
          </li>
        </ol>
        <p>
          The divergence is the difference + a normalized z-score:
        </p>
        <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
{`vol_spread_pp         = (options σ − PM σ) × 100
vol_spread_normalized = vol_spread_pp / sqrt(σ_options_SE² + σ_PM_SE²)`}
        </pre>
        <p>
          Standard errors are placeholder priors (1pp each) until forward
          accumulation produces measured residuals. z-scores in the table
          right now are therefore inflated; treat the{" "}
          <em>direction and ordering</em> as informative, not the absolute
          values. Tier assignment is{" "}
          <code className="font-mono">|z| &gt; 2</code> AND decomposition
          succeeded AND chain not thin = Tier A;{" "}
          <code className="font-mono">|z| &gt; 1.5</code> = Tier B;{" "}
          <code className="font-mono">|z| &gt; 1.0</code> = Tier C.
        </p>
        <p>
          <strong>Method A (stock-reaction strike fit) was not built</strong>{" "}
          because neither Polymarket (26/26 earnings markets are{" "}
          <code className="font-mono">beat_miss</code> Y/N) nor Kalshi
          (probed live — zero earnings or stock-price markets in their open
          inventory) currently lists the per-strike "close above $X on
          date Y" markets Method A requires. If/when either venue restores
          that supply, the classifier in{" "}
          <code className="font-mono">src/market_type.py</code> will
          recognize them and Method A can be implemented as a follow-up.
        </p>
        <p>
          <strong>Quality audit + tier degradation.</strong> Every
          live signal runs through three stability/sensitivity checks
          before its tier is emitted:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Multiplier stability.</strong> Coefficient of variation
            of the rolling-8q reaction multiplier{" "}
            <code className="font-mono">k</code>. CV &gt; 0.5 means{" "}
            <code className="font-mono">k</code> whips quarter-to-quarter
            and Method B's point-estimate translation is unreliable.{" "}
            <strong>Caps the signal at Tier C.</strong>
          </li>
          <li>
            <strong>PM-price sensitivity.</strong> Recompute{" "}
            <code className="font-mono">σ_pm</code> at the live market
            price ±1pp. If the resulting bracket exceeds 20% of central,
            the Φ⁻¹ inversion is unstable in this regime (typically deep
            ITM/OTM Polymarket prices).{" "}
            <strong>Caps the signal at Tier B.</strong>
          </li>
          <li>
            <strong>Distribution shape.</strong> Shapiro-Wilk test on the
            ticker's standardized EPS surprise distribution. p &lt; 0.05
            flags Method B's normal-CDF assumption as biased for this
            ticker (typically skewed names where surprises cluster on one
            side). <strong>Caps the signal at Tier B.</strong>
          </li>
        </ul>
        <p>
          All three flags raised → signal is <strong>suppressed</strong>{" "}
          in the scanner before reaching the snapshot. Each flag also
          appears on the signal-detail page so readers can see <em>why</em>
          a tier landed where it did. The audit live-run on the current
          14-ticker universe degraded 7 signals to{" "}
          <code className="font-mono">suppressed</code>, 5 to Tier B, and
          2 (including NVDA) to Tier C — zero signals survived clean.
          That's the honest measurement of how much methodology noise the
          pipeline carries today.
        </p>
        <p>
          <strong>Composite weight: zero.</strong> The vol-arb leg ships
          as a display-only diagnostic on{" "}
          <Link href="/vol-arb" className="text-[var(--accent)] hover:underline">
            /vol-arb
          </Link>
          {" "}and as quality flags on{" "}
          <code className="font-mono">/signal/[id]</code>. It is{" "}
          <em>not</em> fed into the composite probability used for sizing.
          Promoting an uncalibrated leg into the composite would degrade
          composite v1 (the only composite that has cleared a Brier bar);
          we wait for forward accumulation or a paid historical-chain feed
          to validate the leg before adding it.
        </p>
        <p className="text-sm text-[var(--muted)]">
          References: Patell & Wolfson (1979) for event-window vol
          decomposition; Brenner & Subrahmanyam (1988) for straddle-mid as
          implied move; standard sell-side "$0.01 EPS surprise → k%
          move" sensitivity tables for the reaction multiplier.
        </p>
      </Section>

      <Section title="Backtest — v1.0 walk-forward, N = 566">
        <p>
          The first end-to-end backtest is live. Walk-forward by quarter
          across the historical earnings panel, comparing per-leg and
          composite Brier scores plus a hypothetical paper-P&L curve.
          Full report (numbers, reliability diagram, P&L chart):
        </p>
        <p>
          <a
            href="/backtest-v2.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            → backtest-v2.html (preliminary)
          </a>
        </p>
        <p>
          <strong>Headline result:</strong> composite v1 (model + analyst)
          Brier <span className="font-mono">0.1373</span>; adding a
          realized-vol proxy for the options leg makes it{" "}
          <em>worse</em> at <span className="font-mono">0.1469</span>. The
          Phase A4 acceptance bar (Δ Brier ≤ −0.01 favoring v2) is{" "}
          <strong>not cleared.</strong> Production stays on composite v1.
        </p>
        <p className="text-sm text-[var(--muted)]">
          Honest caveat: realized vol is a known-weak proxy for pre-earnings
          IV. The negative result above is evidence that <em>this proxy</em>{" "}
          doesn't help — not that real implied vol won't. The proper v2
          test (with historical option chains from a paid feed) is gated
          per <code className="font-mono">docs/options-data-audit.md</code>.
        </p>
      </Section>

      <Section title="Known limitations">
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            <strong>Threshold vs consensus mismatch.</strong> The Polymarket
            threshold is a fixed dollar EPS, not always equal to current
            consensus. The historical base rate measures "beat consensus"
            which is a slightly different question. Treat the model leg as
            biased toward whatever the median consensus-vs-threshold
            relationship has been historically.
          </li>
          <li>
            <strong>Options leg live but uncalibrated.</strong> The options
            leg is now populated from yfinance straddle prices (Phase A2);
            the composite uses it via the existing 1/brier weighting. It is{" "}
            <em>not</em> validated by backtest — historical option chains
            are gated behind paid data, so the backtest above uses a
            realized-vol proxy and reports a negative result for it.
          </li>
          <li>
            <strong>Calibration N=0.</strong> Calibration on{" "}
            <code className="font-mono">/stats</code> is N=0 settled.
            Reported edges are unverified by live paper bets until the
            paper engine accumulates a settled history.
          </li>
          <li>
            <strong>Vol-arb leg uncalibrated.</strong> The vol-arb
            diagnostic above runs but has no validation: historical option
            chains are paid-only, and Method A is supply-blocked across
            both Polymarket and Kalshi. Forward accumulation (live
            snapshots once per scan) is the slow free path to validate it.
          </li>
        </ol>
      </Section>

      <p className="text-xs text-[var(--muted)]">
        Read-only. Not investment advice. Signals are produced by the
        scanner project; this site only visualizes the published snapshot.
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="mb-3 font-mono text-base font-semibold tracking-tight">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-[var(--foreground)] leading-relaxed">
        {children}
      </div>
    </section>
  );
}
