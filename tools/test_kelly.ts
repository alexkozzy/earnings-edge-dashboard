/**
 * Unit tests for lib/kelly.ts.
 *
 * Run with:  npx tsx tools/test_kelly.ts
 *
 * No test framework — this is a single deliverable for the sizing block.
 * If we accumulate more tests later, promote to vitest or similar.
 */
import assert from "node:assert/strict";
import { computeKelly, parseBankroll, KELLY_CAP_FRAC } from "../lib/kelly";

function approx(actual: number, expected: number, tol = 1e-6, label = "") {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `${label} expected ≈ ${expected}, got ${actual}`,
  );
}

// 1. Positive edge, YES side. p > entry → positive fFull → fRec = 0.25 * fFull (no clamp)
{
  const r = computeKelly({
    side: "YES",
    marketYes: 0.50,
    pYes: 0.60,
    tradeableEdgePp: 10,
  });
  assert.equal(r.reason, "sized");
  // f_full = (0.60 - 0.50) / (1 - 0.50) = 0.20
  approx(r.fFull, 0.20, 1e-9, "YES positive fFull");
  approx(r.fRec, 0.05, 1e-9, "YES positive fRec (capped at 0.05)");
}

// 2. Positive edge, NO side. Mirror case using NVDA-flavoured numbers.
{
  const r = computeKelly({
    side: "NO",
    marketYes: 0.9685,    // NVDA live
    pYes: 0.897,          // model = NO is more likely than market thinks
    tradeableEdgePp: -3.63,
  });
  assert.equal(r.reason, "sized");
  // entry = 1 - 0.9685 = 0.0315; p_NO = 1 - 0.897 = 0.103
  // f_full = (0.103 - 0.0315) / (1 - 0.0315) ≈ 0.0738
  approx(r.entry, 0.0315, 1e-9, "NO entry");
  approx(r.pUsed, 0.103, 1e-3, "NO p_used");
  assert.ok(r.fFull > 0, "fFull > 0 for NVDA NO");
  assert.ok(r.fRec > 0, "fRec > 0 for NVDA NO");
  assert.ok(r.fRec <= KELLY_CAP_FRAC, "fRec capped");
}

// 3. Tradeable edge = 0 → no size (WMT case)
{
  const r = computeKelly({
    side: "YES",
    marketYes: 0.835,
    pYes: 0.854,
    tradeableEdgePp: 0,
  });
  assert.equal(r.reason, "no_tradeable");
  assert.equal(r.fRec, 0);
}

// 4. Negative fFull (fair prob below entry) → no size
{
  const r = computeKelly({
    side: "YES",
    marketYes: 0.80,
    pYes: 0.50,            // user thinks YES is only 50% but market is 80%
    tradeableEdgePp: 30,   // pretend there's "edge" — Kelly should still refuse
  });
  assert.equal(r.reason, "p_below_entry");
  assert.equal(r.fRec, 0);
}

// 5. fFull > cap clamps to 5% (high-conviction big-mismatch trade)
{
  const r = computeKelly({
    side: "YES",
    marketYes: 0.30,
    pYes: 0.90,
    tradeableEdgePp: 60,
  });
  assert.equal(r.reason, "sized");
  // f_full = (0.90 - 0.30) / (1 - 0.30) ≈ 0.857
  approx(r.fFull, 0.857142857, 1e-6, "extreme fFull");
  assert.equal(r.fRec, KELLY_CAP_FRAC, "clamped to KELLY_CAP_FRAC");
}

// 6. null tradeable edge → no size
{
  const r = computeKelly({
    side: "NO",
    marketYes: 0.5,
    pYes: 0.6,
    tradeableEdgePp: null,
  });
  assert.equal(r.reason, "no_tradeable");
  assert.equal(r.fRec, 0);
}

// 7. parseBankroll defaults + clamp
{
  assert.equal(parseBankroll(undefined), 1000);
  assert.equal(parseBankroll(""), 1000);
  assert.equal(parseBankroll("not-a-number"), 1000);
  assert.equal(parseBankroll("50"), 100, "below min clamps to 100");
  assert.equal(parseBankroll("500000"), 500000);
  assert.equal(parseBankroll("99999999"), 1_000_000, "above max clamps");
}

console.log("kelly.ts: 7 cases passed");
