/**
 * tools/validate_snapshot.ts
 *
 * Validates a snapshot JSON file against the dashboard's canonical Zod schema
 * (`lib/types.ts`). Used to catch scanner→dashboard schema drift in CI before
 * the dashboard renders bad data at runtime.
 *
 * Usage:
 *   npx tsx tools/validate_snapshot.ts <path-to-snapshot.json>
 *   npx tsx tools/validate_snapshot.ts ../earnings-edge/data/snapshots/signals_latest.json
 *
 * Exits:
 *   0 — validation passed
 *   1 — validation failed (with human-readable mismatch report)
 *   2 — invocation error (file not found, malformed JSON, missing argv)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  SignalsSnapshotSchema,
  CalibrationSummarySchema,
} from "../lib/types";

type Mode = "signals" | "calibration" | "auto";

function detectMode(filename: string, json: unknown): Mode {
  if (filename.includes("calibration")) return "calibration";
  if (filename.includes("signals")) return "signals";
  // Auto-detect by shape
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    if ("signals" in obj && Array.isArray(obj.signals)) return "signals";
    if ("buckets" in obj && "per_tier" in obj) return "calibration";
  }
  return "auto";
}

function pickSchema(mode: Mode) {
  switch (mode) {
    case "signals":
      return { schema: SignalsSnapshotSchema, label: "SignalsSnapshot" };
    case "calibration":
      return { schema: CalibrationSummarySchema, label: "CalibrationSummary" };
    default:
      throw new Error(
        "Could not detect snapshot kind from filename or shape. " +
          "Pass --mode=signals or --mode=calibration.",
      );
  }
}

function formatIssues(issues: z.core.$ZodIssue[]): string {
  const lines: string[] = [];
  for (const issue of issues) {
    // Type-narrowing on Zod 4 issue subtypes is brittle; use a loose record
    // accessor so we get whichever fields actually exist at runtime without
    // tripping the type checker on union narrowing.
    const i = issue as unknown as Record<string, unknown>;
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    let detail = issue.message;
    if (issue.code === "invalid_type") {
      const expected = i.expected ?? "?";
      const received = i.received ?? "?";
      detail = `expected ${expected}, got ${received}`;
    } else if (issue.code === "invalid_value") {
      // v4 renamed invalid_enum_value → invalid_value for enum-like fields
      const received = i.received ?? i.input ?? "?";
      const values = i.values;
      const valuesStr = Array.isArray(values)
        ? values.map((v) => JSON.stringify(v)).join(", ")
        : "(unknown set)";
      detail = `value ${JSON.stringify(received)} not one of ${valuesStr}`;
    } else if (issue.code === "unrecognized_keys") {
      const keys = i.keys;
      const keyList = Array.isArray(keys) ? keys.join(", ") : "?";
      detail = `unrecognized keys: ${keyList} (dashboard schema does not accept these)`;
    } else if (issue.code === "too_small" || issue.code === "too_big") {
      const received = i.received ?? "?";
      detail = `${issue.message} (received: ${String(received)})`;
    }
    lines.push(`  • ${path}: ${detail}`);
  }
  return lines.join("\n");
}

function summarizeArray(arr: unknown[]): string {
  if (arr.length === 0) return "(empty)";
  const sample = arr[0] as Record<string, unknown>;
  const keys = Object.keys(sample).sort();
  return `${arr.length} item(s); first item keys: [${keys.join(", ")}]`;
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  let mode: Mode | "auto" = "auto";
  let path: string | undefined;
  for (const a of args) {
    if (a.startsWith("--mode=")) {
      const v = a.slice("--mode=".length);
      if (v === "signals" || v === "calibration") mode = v;
      else {
        console.error(`error: unknown --mode value: ${v}`);
        return 2;
      }
    } else if (!a.startsWith("--")) {
      path = a;
    }
  }
  if (!path) {
    console.error("usage: tsx tools/validate_snapshot.ts <path> [--mode=signals|calibration]");
    return 2;
  }
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`error: file not found: ${abs}`);
    return 2;
  }
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (e) {
    console.error(`error: could not read file: ${(e as Error).message}`);
    return 2;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`error: malformed JSON in ${abs}: ${(e as Error).message}`);
    return 2;
  }

  const detected = mode === "auto" ? detectMode(abs, parsed) : mode;
  const { schema, label } = pickSchema(detected as Mode);

  console.log(`validating ${abs}`);
  console.log(`schema: ${label}`);
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.signals)) {
      console.log(`shape: signals = ${summarizeArray(obj.signals)}`);
    }
    if (Array.isArray(obj.buckets)) {
      console.log(`shape: buckets = ${summarizeArray(obj.buckets)}`);
    }
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    console.log(`✅ PASS — snapshot validates against ${label}`);
    return 0;
  }
  console.error(`❌ FAIL — ${result.error.issues.length} issue(s):`);
  console.error(formatIssues(result.error.issues));

  // Extra: if it's a SignalsSnapshot and the top-level structure is right
  // but individual signals fail, give a per-signal summary so the writer
  // knows which records to fix first.
  if (detected === "signals" && typeof parsed === "object" && parsed !== null) {
    const sigs = (parsed as { signals?: unknown[] }).signals;
    if (Array.isArray(sigs)) {
      let bad = 0;
      let good = 0;
      const SignalSchema = SignalsSnapshotSchema.shape.signals.element;
      for (let i = 0; i < sigs.length; i++) {
        const r = SignalSchema.safeParse(sigs[i]);
        if (r.success) good++;
        else bad++;
      }
      console.error(`\nper-signal: ${good} ok / ${bad} bad of ${sigs.length}`);
    }
  }
  return 1;
}

process.exit(main(process.argv));
