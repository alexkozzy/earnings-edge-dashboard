/**
 * One-off screenshot pass for the D2 category tabs work.
 *
 * Captures /, /?category=econ, /?category=crypto, and /stats at 1440px.
 *
 * Usage: PROD_URL=http://localhost:3331 npx tsx tools/visual/screenshot-categories.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.PROD_URL ?? "http://localhost:3331";

const SHOTS = [
  { name: "home-earnings-1440", path: "/" },
  { name: "home-econ-1440", path: "/?category=econ" },
  { name: "home-crypto-1440", path: "/?category=crypto" },
  { name: "stats-verdict-1440", path: "/stats" },
] as const;

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("docs", "screenshots", stamp, "category-tabs");
  mkdirSync(outDir, { recursive: true });

  console.log(`Capturing ${BASE_URL} → ${outDir}`);
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      const url = `${BASE_URL}${shot.path}`;
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      } catch (err) {
        console.warn(`networkidle timeout for ${url}, falling back…`, err);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
      }
      await page.waitForTimeout(800);
      const out = join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log(`  saved ${out}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nDone. ${SHOTS.length} screenshots in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
