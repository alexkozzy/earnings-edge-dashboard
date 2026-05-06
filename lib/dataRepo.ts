/**
 * GitHub data repo helper — read from Pages, write via Contents API.
 *
 * Vercel serverless functions have a read-only filesystem (except /tmp,
 * which is wiped between invocations). We can NOT persist paper-bet
 * state on the local filesystem. Instead:
 *
 *   READ  → public GitHub Pages URL (cache-friendly, no auth required)
 *   WRITE → GitHub Contents API on `alexkozzy/earnings-edge-data`
 *           using a personal access token in env var GH_DATA_PAT
 *
 * The token must have `contents:write` scope on the data repo only
 * (fine-grained PAT recommended). See DEPLOYMENT.md.
 *
 * If GH_DATA_PAT is unset, write operations fail loudly with a clear
 * error message. We never silently fall back to local writes — those
 * would get lost on the next cold start.
 */

const DEFAULT_REPO = "alexkozzy/earnings-edge-data";
const DEFAULT_BRANCH = "main";
const DEFAULT_PAGES_BASE = "https://alexkozzy.github.io/earnings-edge-data";

function repoSlug(): string {
  return process.env.GH_DATA_REPO ?? DEFAULT_REPO;
}

function branch(): string {
  return process.env.GH_DATA_BRANCH ?? DEFAULT_BRANCH;
}

function pagesBase(): string {
  // SNAPSHOT_BASE_URL doubles as the Pages base when configured. Strip
  // trailing slash. Fall back to the default Pages URL if unset.
  const env = process.env.SNAPSHOT_BASE_URL ?? process.env.GH_DATA_PAGES_URL;
  return (env ?? DEFAULT_PAGES_BASE).replace(/\/$/, "");
}

function token(): string {
  const t = process.env.GH_DATA_PAT;
  if (!t) {
    throw new Error(
      "GH_DATA_PAT not configured — paper bets cannot persist. " +
        "Set with: vercel env add GH_DATA_PAT production",
    );
  }
  return t;
}

/* ---------------------------- READ via Pages ---------------------------- */

export type ReadResult<T> =
  | { ok: true; value: T; etag?: string }
  | { ok: false; status: number; error: string };

/**
 * Read a file from the data repo via GitHub Pages.
 * Returns ok:false with status 404 if the file doesn't exist yet.
 */
export async function readFromPages(repoPath: string): Promise<ReadResult<string>> {
  // Cache-bust with a timestamp param — GH Pages can serve up to 10min stale.
  const url = `${pagesBase()}/${repoPath}?t=${Date.now()}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.status === 404) return { ok: false, status: 404, error: "not found" };
    if (!r.ok) return { ok: false, status: r.status, error: `Pages returned ${r.status}` };
    const text = await r.text();
    return { ok: true, value: text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

/** Read + parse JSONL file into an array of T. Tolerates blank lines. */
export async function readJsonl<T>(repoPath: string): Promise<ReadResult<T[]>> {
  const r = await readFromPages(repoPath);
  if (!r.ok) {
    // 404 → return empty array, not an error. First-run case.
    if (r.status === 404) return { ok: true, value: [] };
    return r;
  }
  const out: T[] = [];
  for (const line of r.value.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      // Skip corrupt lines but flag in console — better than dying.
      // eslint-disable-next-line no-console
      console.warn(`[dataRepo] skipping unparseable JSONL line in ${repoPath}`);
    }
  }
  return { ok: true, value: out };
}

/* -------------------------- WRITE via Contents API -------------------------- */

type ContentsApiFile = { sha: string; content: string; encoding: "base64" };

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `https://api.github.com/repos/${repoSlug()}/${path}`;
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

/** Look up the current sha + contents (base64) of a file, or null if 404. */
async function getFile(repoPath: string): Promise<ContentsApiFile | null> {
  const r = await ghFetch(`contents/${encodeURIComponent(repoPath)}?ref=${branch()}`);
  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`GitHub getFile ${repoPath} failed (${r.status}): ${text}`);
  }
  return (await r.json()) as ContentsApiFile;
}

function b64encode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function b64decode(s: string): string {
  return Buffer.from(s, "base64").toString("utf8");
}

/**
 * Atomic-ish write: read sha, PUT new contents with that sha. If the file
 * was changed concurrently, GitHub returns 409 and we surface that to the
 * caller — DO NOT auto-retry blindly, the cron schedules are spread out
 * enough that real conflicts indicate something is wrong.
 */
export async function writeFile(opts: {
  repoPath: string;
  content: string;
  message: string;
}): Promise<{ ok: true; sha: string; commit: string } | { ok: false; error: string }> {
  let existingSha: string | undefined;
  try {
    const cur = await getFile(opts.repoPath);
    existingSha = cur?.sha;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "getFile failed" };
  }

  const body: Record<string, unknown> = {
    message: opts.message,
    content: b64encode(opts.content),
    branch: branch(),
  };
  if (existingSha) body.sha = existingSha;

  let r: Response;
  try {
    r = await ghFetch(`contents/${encodeURIComponent(opts.repoPath)}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, error: `GitHub PUT ${opts.repoPath} failed (${r.status}): ${text}` };
  }
  const j = (await r.json()) as { content: { sha: string }; commit: { sha: string } };
  return { ok: true, sha: j.content.sha, commit: j.commit.sha };
}

/**
 * Append lines to a JSONL file. Reads current content via Contents API
 * (NOT Pages — Pages can be 10min stale and we'd lose recent appends),
 * concatenates, writes back.
 *
 * For real workloads this is racy — two crons could clobber each other.
 * Our crons are spaced (15min and 6h, never overlap), so single-writer
 * is acceptable for v1.1.
 */
export async function appendJsonl<T>(opts: {
  repoPath: string;
  rows: T[];
  message: string;
}): Promise<{ ok: true; appended: number; commit: string } | { ok: false; error: string }> {
  if (opts.rows.length === 0) {
    return { ok: true, appended: 0, commit: "(noop)" };
  }
  let current = "";
  try {
    const cur = await getFile(opts.repoPath);
    if (cur) current = b64decode(cur.content);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "getFile failed" };
  }

  const newLines = opts.rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const next = current.endsWith("\n") || current === "" ? current + newLines : current + "\n" + newLines;
  const w = await writeFile({
    repoPath: opts.repoPath,
    content: next,
    message: opts.message,
  });
  if (!w.ok) return w;
  return { ok: true, appended: opts.rows.length, commit: w.commit };
}

/**
 * Replace JSONL file contents entirely. Use for `paper_bets_open.jsonl`
 * after marking some bets settled (the open-bets file shrinks; settled
 * ones move to the settled-bets file via append).
 */
export async function replaceJsonl<T>(opts: {
  repoPath: string;
  rows: T[];
  message: string;
}): Promise<{ ok: true; commit: string } | { ok: false; error: string }> {
  const content = opts.rows.length === 0 ? "" : opts.rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const w = await writeFile({ repoPath: opts.repoPath, content, message: opts.message });
  if (!w.ok) return w;
  return { ok: true, commit: w.commit };
}

/** Convenience: read a JSON file (not JSONL) via Contents API (fresh). */
export async function readJsonFresh<T>(repoPath: string): Promise<ReadResult<T>> {
  let cur: ContentsApiFile | null;
  try {
    cur = await getFile(repoPath);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "getFile failed",
    };
  }
  if (!cur) return { ok: false, status: 404, error: "not found" };
  try {
    return { ok: true, value: JSON.parse(b64decode(cur.content)) as T };
  } catch (err) {
    return {
      ok: false,
      status: 200,
      error: err instanceof Error ? err.message : "JSON parse failed",
    };
  }
}

export const dataRepoConfig = {
  repoSlug,
  branch,
  pagesBase,
  /** Constant paths used by paperEngine + cron routes. */
  paths: {
    paperBetsOpen: "data/paper_bets_open.jsonl",
    paperBetsSettled: "data/paper_bets_settled.jsonl",
    finnhubQuota: "data/finnhub_quota.json",
    sectorCache: "data/sector_cache.json",
    signalsLatest: "data/signals_latest.json",
  },
};
