/**
 * /_diag — admin page that pretty-prints /api/diag.
 *
 * Pass ?key=<DIAG_TOKEN> to unlock if the token is set. Otherwise it's
 * an open page (no secrets are returned by /api/diag — only presence
 * flags and upstream reachability).
 *
 * Underscore prefix to keep it visually distinct from real product pages.
 */
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type DiagResponse = {
  generated_at: string;
  runtime: {
    node: string;
    platform: string;
    vercel_env: string;
    vercel_region: string | null;
    commit: string | null;
  };
  env: { name: string; set: boolean; required: boolean; length: number; notes?: string }[];
  probes: { name: string; url: string; ok: boolean; status?: number; ms?: number; error?: string }[];
  issues: string[];
  status: "OK" | "DEGRADED";
};

async function fetchDiag(key: string | undefined): Promise<DiagResponse | { error: string }> {
  // Build absolute URL from request headers — server-side fetch needs an
  // absolute URL when called from a Server Component.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/diag${key ? `?key=${encodeURIComponent(key)}` : ""}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return { error: `diag returned ${r.status}` };
  return (await r.json()) as DiagResponse;
}

export default async function DiagPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const sp = await searchParams;
  const data = await fetchDiag(sp.key);

  if ("error" in data) {
    return (
      <div className="rounded-lg border border-[var(--bad)] bg-[var(--panel)] p-6 text-sm text-[var(--bad)]">
        Diag fetch failed: {data.error}
        {data.error.includes("401") && (
          <div className="mt-3 text-xs text-[var(--muted)]">
            DIAG_TOKEN is required. Append <code>?key=&lt;token&gt;</code> to the URL.
          </div>
        )}
      </div>
    );
  }

  const statusColor = data.status === "OK" ? "text-[var(--good)]" : "text-[var(--warn)]";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Diagnostics</h1>
        <span className={`font-mono text-sm font-semibold ${statusColor}`}>
          {data.status}
        </span>
      </div>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">Runtime</h2>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 font-mono text-xs">
          <div>node: {data.runtime.node}</div>
          <div>platform: {data.runtime.platform}</div>
          <div>vercel_env: {data.runtime.vercel_env}</div>
          <div>vercel_region: {data.runtime.vercel_region ?? "—"}</div>
          <div>commit: {data.runtime.commit ?? "—"}</div>
          <div>generated_at: {data.generated_at}</div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">Environment variables</h2>
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Set</th>
                <th className="px-4 py-2 font-medium">Required</th>
                <th className="px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.env.map((e) => (
                <tr key={e.name} className="border-b border-[var(--border)]">
                  <td className="px-4 py-2 font-mono">{e.name}</td>
                  <td className="px-4 py-2 font-mono">
                    {e.set ? (
                      <span className="text-[var(--good)]">YES ({e.length})</span>
                    ) : (
                      <span className={e.required ? "text-[var(--bad)]" : "text-[var(--muted)]"}>NO</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {e.required ? "yes" : "no"}
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--muted)]">{e.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">Upstream probes</h2>
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-black/20 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="px-4 py-2 font-medium">Probe</th>
                <th className="px-4 py-2 font-medium">OK</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">ms</th>
                <th className="px-4 py-2 font-medium">URL / error</th>
              </tr>
            </thead>
            <tbody>
              {data.probes.map((p) => (
                <tr key={p.name} className="border-b border-[var(--border)]">
                  <td className="px-4 py-2 font-mono">{p.name}</td>
                  <td className="px-4 py-2 font-mono">
                    <span className={p.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}>
                      {p.ok ? "yes" : "no"}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{p.status ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.ms ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[var(--muted)]">
                    {p.error ?? p.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.issues.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">Issues</h2>
          <ul className="list-disc rounded-lg border border-[var(--warn)]/40 bg-[var(--panel)] p-4 pl-8 text-sm text-[var(--warn)]">
            {data.issues.map((i, idx) => (
              <li key={idx} className="font-mono">
                {i}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-[var(--muted)]">
        This page does not display secret values, only their presence and length. Safe to share for support.
      </p>
    </div>
  );
}
