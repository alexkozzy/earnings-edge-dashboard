/**
 * Snapshot loader.
 *
 * The scanner repo writes two files to a published location (e.g. GitHub
 * Pages on the scanner repo, or committed to this repo's /public/ dir on
 * a CI cadence):
 *
 *   - signals_latest.json     -> the SignalsSnapshot we display in /
 *   - calibration_summary.json -> the CalibrationSummary we display in /calibration
 *
 * We resolve the source URL/path in this order:
 *   1. If SNAPSHOT_BASE_URL is set, fetch from `${SNAPSHOT_BASE_URL}/<file>`.
 *   2. Otherwise, read the bundled tools/sample_snapshot.json (dev fallback).
 *
 * All loads validate against the Zod schemas in lib/types.ts. If validation
 * fails, the API route returns 500 with the validation message — the UI
 * is meant to show its empty state, not render garbage.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CalibrationSummary,
  CalibrationSummarySchema,
  SignalsSnapshot,
  SignalsSnapshotSchema,
} from "./types";
import { cached } from "./cache";

const SNAPSHOT_TTL_MS = 60_000;

export type LoadResult<T> =
  | { ok: true; value: T; source: "remote" | "local-sample" | "missing" }
  | { ok: false; error: string };

async function readLocalJson<T>(relPath: string): Promise<T> {
  // Scope to the project's tools/ subfolder to keep Turbopack's file tracer
  // from pulling the entire project tree into the serverless bundle.
  const abs = path.join(process.cwd(), "tools", relPath);
  const raw = await fs.readFile(abs, "utf8");
  return JSON.parse(raw) as T;
}

async function fetchRemoteJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Remote snapshot ${url} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function loadSignalsSnapshot(): Promise<LoadResult<SignalsSnapshot>> {
  const base = process.env.SNAPSHOT_BASE_URL;
  return cached(`snapshot:signals:${base ?? "local"}`, SNAPSHOT_TTL_MS, async () => {
    try {
      let raw: unknown;
      let source: "remote" | "local-sample";
      if (base) {
        raw = await fetchRemoteJson<unknown>(`${base.replace(/\/$/, "")}/signals_latest.json`);
        source = "remote";
      } else {
        raw = await readLocalJson<unknown>("sample_snapshot.json");
        source = "local-sample";
      }
      const parsed = SignalsSnapshotSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false as const,
          error: `Snapshot validation failed: ${parsed.error.message}`,
        };
      }
      return { ok: true as const, value: parsed.data, source };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Unknown error loading snapshot",
      };
    }
  });
}

export async function loadCalibrationSummary(): Promise<LoadResult<CalibrationSummary>> {
  const base = process.env.SNAPSHOT_BASE_URL;
  return cached(`snapshot:calibration:${base ?? "local"}`, SNAPSHOT_TTL_MS, async () => {
    try {
      let raw: unknown;
      let source: "remote" | "local-sample" | "missing";
      if (base) {
        try {
          raw = await fetchRemoteJson<unknown>(
            `${base.replace(/\/$/, "")}/calibration_summary.json`,
          );
          source = "remote";
        } catch {
          // Calibration may not exist yet — return an empty stub so the
          // UI shows the n<20 fallback rather than an error toast.
          return {
            ok: true as const,
            value: emptyCalibration(),
            source: "missing" as const,
          };
        }
      } else {
        // No remote configured: try local file, fall back to empty stub.
        try {
          raw = await readLocalJson<unknown>("sample_calibration.json");
          source = "local-sample";
        } catch {
          return {
            ok: true as const,
            value: emptyCalibration(),
            source: "missing" as const,
          };
        }
      }
      const parsed = CalibrationSummarySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false as const,
          error: `Calibration validation failed: ${parsed.error.message}`,
        };
      }
      return { ok: true as const, value: parsed.data, source };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Unknown error loading calibration",
      };
    }
  });
}

function emptyCalibration(): CalibrationSummary {
  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    total_resolved: 0,
    buckets: [],
    per_tier: [],
  };
}
