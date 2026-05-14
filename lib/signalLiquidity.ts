/**
 * Liquidity parser for Signal objects.
 *
 * The snapshot schema (lib/types.ts) does not carry a structured liquidity
 * field — the scanner instead stamps it into the `note` string, e.g.
 *   "model=0.854 | market=0.835 | liq=$56 | THIN"
 *
 * We expose two helpers:
 *   - parseLiquidity(signal) → number | null   (best-effort $ depth)
 *   - isThin(signal)         → boolean         (parsed THIN flag, or liq < $100)
 *
 * On parse failure we return null rather than throwing so the row still
 * renders ("—" in place of a value).
 *
 * If/when the scanner adds a structured `liquidity_usd` field, prefer it
 * over the note-string parse. The Signal type carries no such field today
 * so the structured branch is a documented future-extension.
 */
import type { Signal } from "@/lib/types";

/** Threshold below which a market is flagged THIN (matches scanner convention). */
export const THIN_LIQUIDITY_USD = 100;

/**
 * Best-effort liquidity in dollars. Returns null when no liquidity is
 * recoverable from the signal. Never throws.
 */
export function parseLiquidity(signal: Signal): number | null {
  // Structured-field fallback for future schema versions. Keep this check
  // defensive — the current schema doesn't include any of these names, but
  // a future additive bump might add `liquidity_usd` and we want to pick it
  // up without dashboard changes.
  const sigAny = signal as unknown as Record<string, unknown>;
  for (const k of ["liquidity_usd", "liquidity", "liq", "top_of_book_depth", "tob_depth"]) {
    const v = sigAny[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      return v;
    }
  }

  // Fallback: parse from note string. Scanner emits `liq=$NNN` or `liq=NNN`.
  const note = signal.note;
  if (!note) return null;
  const m = /\bliq\s*=\s*\$?(\d+(?:\.\d+)?)/i.exec(note);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * True when the signal has either an explicit THIN tag in the note or
 * a parsed liquidity below the THIN threshold.
 */
export function isThin(signal: Signal): boolean {
  if (signal.note && /\bTHIN\b/i.test(signal.note)) return true;
  const liq = parseLiquidity(signal);
  if (liq === null) return false;
  return liq < THIN_LIQUIDITY_USD;
}

/** "$1.1k", "$41", "—" for null. Right-aligned use by callers. */
export function formatLiquidity(liq: number | null): string {
  if (liq === null) return "—";
  if (liq >= 1000) {
    const k = liq / 1000;
    // 1 decimal for <10k ($1.1k), no decimals for ≥10k ($12k)
    return k >= 10 ? `$${Math.round(k)}k` : `$${k.toFixed(1)}k`;
  }
  return `$${Math.round(liq)}`;
}
