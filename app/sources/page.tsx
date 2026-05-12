/**
 * /sources — live data-source health dashboard.
 *
 * Server Component reading from gatherSourceHealth() directly (not via the
 * /api/sources/health proxy round-trip — we're already on the server).
 *
 * Renders one card per provider with status dot, last probe latency, last
 * error, rate-limit cap, and the method names this source provides.
 */
import { gatherSourceHealth, type ProviderHealth, type StatusDot } from "@/lib/sourceHealth";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Sources · Earnings Edge",
  description: "Live status of the upstream APIs that feed the dashboard.",
};

const DOT_COLOR: Record<StatusDot, string> = {
  green: "bg-[var(--good)]",
  yellow: "bg-[var(--warn)]",
  red: "bg-[var(--bad)]",
  gray: "bg-[var(--muted)]",
};

const DOT_LABEL: Record<StatusDot, string> = {
  green: "online",
  yellow: "stale",
  red: "down",
  gray: "unconfigured",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function ProviderCard({ p }: { p: ProviderHealth }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-base font-semibold tracking-tight">
          {p.name}
        </h2>
        <span
          className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider"
          title={p.last_success_at ?? "never"}
        >
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 rounded-full ${DOT_COLOR[p.status_dot]}`}
          />
          <span
            className={
              p.status_dot === "green"
                ? "text-[var(--good)]"
                : p.status_dot === "yellow"
                  ? "text-[var(--warn)]"
                  : p.status_dot === "red"
                    ? "text-[var(--bad)]"
                    : "text-[var(--muted)]"
            }
          >
            {DOT_LABEL[p.status_dot]}
          </span>
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="uppercase tracking-wider text-[var(--muted)]">
            Last success
          </dt>
          <dd
            className="mt-0.5 font-mono"
            title={p.last_success_at ?? ""}
          >
            {relativeTime(p.last_success_at)}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider text-[var(--muted)]">
            Latency
          </dt>
          <dd className="mt-0.5 font-mono">
            {p.last_latency_ms === null ? "—" : `${p.last_latency_ms}ms`}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="uppercase tracking-wider text-[var(--muted)]">
            Rate limit
          </dt>
          <dd className="mt-0.5 text-[var(--foreground)]">{p.rate_limit_note}</dd>
        </div>
      </dl>

      <section className="mt-4">
        <h3 className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Methods
        </h3>
        <ul className="mt-1 flex flex-wrap gap-1.5 font-mono text-[11px]">
          {p.methods.map((m) => (
            <li
              key={m}
              className="rounded border border-[var(--border)] bg-black/20 px-1.5 py-0.5 text-[var(--muted)]"
            >
              {m}
            </li>
          ))}
        </ul>
      </section>

      {p.last_error && (
        <section className="mt-4">
          <h3 className="text-xs uppercase tracking-wider text-[var(--bad)]">
            Last error
          </h3>
          <div className="mt-1 rounded border border-[var(--bad)]/40 bg-[var(--bad)]/5 p-2 font-mono text-[11px] text-[var(--bad)]">
            {p.last_error.message}
            <div className="mt-1 text-[var(--muted)]" title={p.last_error.at}>
              {relativeTime(p.last_error.at)}
            </div>
          </div>
        </section>
      )}

      {p.notes.length > 0 && (
        <section className="mt-4">
          <h3 className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Notes
          </h3>
          <ul className="mt-1 space-y-1 text-xs text-[var(--muted)]">
            {p.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export default async function SourcesPage() {
  const health = await gatherSourceHealth();
  const greenCount = health.providers.filter((p) => p.status_dot === "green").length;
  const totalConfigured = health.providers.filter((p) => p.configured).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data sources</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upstream API health. Probed server-side, cached 30s (30min for Alpha Vantage to spare quota).
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-semibold">
            <span
              className={
                greenCount === totalConfigured
                  ? "text-[var(--good)]"
                  : "text-[var(--warn)]"
              }
            >
              {greenCount}
            </span>
            <span className="text-[var(--muted)]">/{totalConfigured}</span>
          </div>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            healthy
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {health.providers.map((p) => (
          <ProviderCard key={p.name} p={p} />
        ))}
      </div>

      <footer className="text-xs text-[var(--muted)] font-mono">
        probed {relativeTime(health.generated_at)} · {health.generated_at}
      </footer>
    </div>
  );
}
