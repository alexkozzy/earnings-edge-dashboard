/**
 * Footer — build timestamp (server-side) + repo link.
 *
 * The build timestamp is captured at build time via process.env.BUILD_TIME
 * (set in next.config.js). Falls back to "dev" when running `next dev`.
 *
 * Disclaimer copy stays close to the original layout footer; this
 * component just adds metadata + the keyboard-shortcut hint.
 */
const BUILD_TIME =
  process.env.NEXT_PUBLIC_BUILD_TIME ||
  process.env.BUILD_TIME ||
  "dev";

const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ||
  "https://github.com/"; // overridden via env once repo URL known

export function Footer() {
  const buildLabel =
    BUILD_TIME === "dev"
      ? "dev build"
      : `built ${BUILD_TIME}`;

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--panel)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="max-w-2xl">
          Read-only. Not investment advice. Signals are produced by the
          scanner project; this site only visualizes the published snapshot.
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
          <span title="Press ? for keyboard shortcuts">
            <kbd className="rounded border border-[var(--border)] px-1 py-0.5">?</kbd>{" "}
            shortcuts
          </span>
          <span aria-hidden="true">·</span>
          <span>{buildLabel}</span>
          <span aria-hidden="true">·</span>
          {REPO_URL !== "https://github.com/" ? (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent)] hover:underline"
            >
              source ↗
            </a>
          ) : (
            <span>source: tbd</span>
          )}
        </div>
      </div>
    </footer>
  );
}
