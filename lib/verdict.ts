/**
 * Reads `docs/research/VERDICT.md` if present and parses out the research
 * verdict (A / B / C / pending) plus a 1-line summary for the /stats banner.
 *
 * Server-side only — uses node:fs. Safe to call from a Server Component.
 *
 * If the file doesn't exist or doesn't contain a parseable verdict marker,
 * we return `{ verdict: "pending", summary: "Research session in progress" }`
 * so the banner can render a neutral state. The orchestrator writes
 * VERDICT.md at the end of the research session; until then everything is
 * pending.
 *
 * Expected file shape (loose — we only need the marker):
 *   # <Title>
 *   ...
 *   **Result: A** (or B / C)
 *   <one-paragraph summary, first line is taken as the banner summary>
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
};

const VERDICT_PATH = join(process.cwd(), "docs", "research", "VERDICT.md");

const RESULT_RE = /\*?\*?\s*Result\s*:\s*([ABC])\b/i;

export async function loadVerdict(): Promise<Verdict> {
  let raw: string;
  try {
    raw = await readFile(VERDICT_PATH, "utf-8");
  } catch {
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

  return { verdict: kind, summary };
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
