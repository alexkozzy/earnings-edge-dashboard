/**
 * Screenshot pass for the v5 geopolitics tab + verdict-banner check.
 *
 * Captures the home page in all 4 categories + /stats, at desktop / tablet /
 * mobile viewports, after the geopolitics tab landed.
 *
 * Usage: PROD_URL=http://localhost:3331 npx tsx tools/visual/screenshot-v5-geopolitics.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.PROD_URL ?? "http://localhost:3331";

const SHOTS = [
  { name: "home-earnings", path: "/" },
  { name: "home-econ", path: "/?category=econ" },
  { name: "home-crypto", path: "/?category=crypto" },
  { name: "home-geopolitics", path: "/?category=geopolitics" },
  { name: "stats", path: "/stats" },
  { name: "hedge", path: "/hedge" },
] as const;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
] as const;

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("docs", "screenshots", stamp, "v5-geopolitics");
  mkdirSync(outDir, { recursive: true });

  console.log(`Capturing ${BASE_URL} → ${outDir}`);
  const browser = await chromium.launch();
  let captured = 0;
  let errored = 0;
  try {
    for (const shot of SHOTS) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
        });
        const page = await ctx.newPage();
        const url = `${BASE_URL}${shot.path}`;
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
        } catch {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 10_000,
          });
        }
        await page.waitForTimeout(800); // settle
        const filename = `${shot.name}-${vp.name}.png`;
        const filepath = join(outDir, filename);
        try {
          await page.screenshot({ path: filepath, fullPage: true });
          console.log(`  ${filename}`);
          captured++;
        } catch (err) {
          console.error(`  FAILED ${filename}: ${err}`);
          errored++;
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\nCaptured ${captured}, errored ${errored}`);
  console.log(`Output: ${outDir}`);
  if (errored > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
