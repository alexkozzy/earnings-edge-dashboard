/**
 * Reads the most recent research verdict and parses it for the /stats banner.
 *
 * Server-side only — uses node:fs. Safe to call from a Server Component.
 *
 * Lookup order (most recent first):
 *   1. docs/research/v5/MASTER_VERDICT.md
 *   2. docs/research/v4/MASTER_VERDICT.md
 *   3. docs/research/v3/VERDICT_v3.md
 *   4. docs/research/VERDICT.md (v1)
 *
 * The first file that exists AND contains a parseable `Result: <X>` token
 * wins. If none match, returns `pending`.
 *
 * Expected file shape (loose — only need the marker):
 *   # <Title>
 *   ...
 *   **Result: A** (or B / C)
 *   <summary paragraph>
 *
 * Parsing is intentionally lenient: matches the first `Result: <X>` token
 * (case-insensitive, optional bold markers) anywhere in the file.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type VerdictKind = "A" | "B" | "C" | "pending";

export type Verdict = {
  verdict: VerdictKind;
  summary: string;
  /** Which verdict file was read (for diagnostics). null if pending fallback. */
  source?: string;
};

const VERDICT_PATHS = [
  join(process.cwd(), "docs", "research", "v5", "MASTER_VERDICT.md"),
  join(process.cwd(), "docs", "research", "v4", "MASTER_VERDICT.md"),
  join(process.cwd(), "docs", "research", "v3", "VERDICT_v3.md"),
  join(process.cwd(), "docs", "research", "VERDICT.md"),
] as const;

const RESULT_RE = /\*?\*?\s*Result\s*:\s*([ABC])\b/i;

export async function loadVerdict(): Promise<Verdict> {
  let raw: string | null = null;
  let source: string | undefined;
  for (const path of VERDICT_PATHS) {
    try {
      const candidate = await readFile(path, "utf-8");
      if (RESULT_RE.test(candidate)) {
        raw = candidate;
        source = path;
        break;
      }
    } catch {
      // try next
    }
  }
  if (raw === null) {
    return {
      verdict: "pending",
      summary: "Research session in progress",
    };
  }

  const match = raw.match(RESULT_RE);
  const kind: VerdictKind = match
    ? (match[1].toUpperCase() as "A" | "B" | "C")
    : "pending";

  // Pull a summary: prefer the first non-empty line after the result marker,
  // else the first non-heading line in the file.
  let summary = "";
  if (match) {
    const after = raw.slice((match.index ?? 0) + match[0].length);
    summary = firstParagraphLine(after);
  }
  if (!summary) {
    summary = firstParagraphLine(raw);
  }
  if (!summary) {
    summary =
      kind === "pending"
        ? "Research session in progress"
        : `Verdict ${kind}`;
  }

  return { verdict: kind, summary, source };
}

function firstParagraphLine(text: string): string {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("**Result")) continue;
    // Strip leading markdown emphasis markers for cleanliness.
    const cleaned = line.replace(/^[*_>\-\s]+/, "").trim();
    if (cleaned.length === 0) continue;
    // Cap to a reasonable banner length — stats banner is 1 line.
    return cleaned.length > 240 ? cleaned.slice(0, 237) + "…" : cleaned;
  }
  return "";
}
