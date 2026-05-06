/**
 * Visual screenshot tool — Phase 1 of v1.2 verification loop.
 *
 * Spawns a headless Chromium via Playwright, navigates to the production
 * deployment (or PROD_URL override), and captures full-page PNGs for the
 * key routes at three viewports (desktop / tablet / mobile).
 *
 * Output: docs/screenshots/<ISO-timestamp>/
 *   home-1440.png
 *   home-768.png
 *   home-375.png
 *   stats-1440.png
 *   stats-768.png
 *   stats-375.png
 *   layout-dump-home-1440.json   (positioned-element diagnostics)
 *   layout-dump-home-768.json
 *   layout-dump-home-375.json
 *
 * Usage: npm run screenshot
 *        PROD_URL=http://localhost:3000 npm run screenshot
 */

import { chromium, Browser, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL =
  process.env.PROD_URL ?? "https://earnings-edge-dashboard.vercel.app";

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
] as const;

const ROUTES = [
  { name: "home", path: "/" },
  { name: "stats", path: "/stats" },
  { name: "hedge", path: "/hedge" },
] as const;

type LayoutDumpEntry = {
  tag: string;
  cls: string;
  position: string;
  zIndex: string;
  overflow: string;
  rect: { x: number; y: number; w: number; h: number };
};

async function dumpLayout(page: Page): Promise<LayoutDumpEntry[]> {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("*"))
      .map((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls:
            typeof el.className === "string"
              ? el.className.slice(0, 100)
              : "",
          position: cs.position,
          zIndex: cs.zIndex,
          overflow: cs.overflow,
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
        };
      })
      .filter(
        (e) =>
          e.position === "absolute" ||
          e.position === "fixed" ||
          e.position === "sticky" ||
          (e.zIndex !== "auto" && e.zIndex !== "0"),
      );
  });
}

async function captureRoute(
  browser: Browser,
  outDir: string,
  route: (typeof ROUTES)[number],
  viewport: (typeof VIEWPORTS)[number],
): Promise<void> {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const url = `${BASE_URL}${route.path}`;

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch (err) {
    // Networkidle can time out on long-polling apps; fall back to domcontentloaded.
    console.warn(`networkidle timeout for ${url}, falling back…`, err);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  }
  // Settle animations / lazy mounts.
  await page.waitForTimeout(800);

  const screenshotPath = join(outDir, `${route.name}-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  saved ${screenshotPath}`);

  // Layout diagnostics only at desktop + mobile for the home page (smallest signal-to-noise).
  if (route.name === "home") {
    const dump = await dumpLayout(page);
    const dumpPath = join(
      outDir,
      `layout-dump-${route.name}-${viewport.name}.json`,
    );
    writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
    console.log(`  saved ${dumpPath} (${dump.length} positioned elements)`);
  }

  await ctx.close();
}

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("docs", "screenshots", stamp);
  mkdirSync(outDir, { recursive: true });

  console.log(`Capturing ${BASE_URL} → ${outDir}`);
  const browser = await chromium.launch();

  try {
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        console.log(`→ ${route.path} @ ${viewport.width}x${viewport.height}`);
        await captureRoute(browser, outDir, route, viewport);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ${ROUTES.length * VIEWPORTS.length} screenshots in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
