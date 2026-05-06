# Earnings Edge Dashboard — Continuous improvement with forced verification (verbatim user spec)

You are working on `~/Dropbox/claude shenanigans/earnings-edge-dashboard/` for the next 2–3 hours autonomously. Production is at `https://earnings-edge-dashboard.vercel.app/`. Permissions are pre-approved. Do not ask for confirmation on standard operations.

## Why this prompt exists

The previous v1.1 build reported "complete" but **the live site does not match the user's specification**. The Live Signals UI still has overlap bugs and does not visually match the Polymarket reference. The user has flagged this twice. HTTP 200 status codes are not acceptable as a success metric — visual correctness is.

This prompt is the corrective. It mandates a verification loop the previous build did not have.

## The hard rule (read this twice)

**You may not declare any UI workstream complete until you have:**
1. Taken a screenshot of the deployed production site using Playwright
2. Compared it to the reference image at `~/Dropbox/claude shenanigans/earnings-edge-dashboard/docs/reference_polymarket_ui.png`
3. Either matched the reference on the criteria below, OR documented in `VISUAL_DIFF.md` exactly what differs and why
4. Iterated at least once if the first screenshot doesn't match

Status code checks are necessary but not sufficient. A 200 response with a broken layout is a failure, not a success.

## Set up the verification loop FIRST

Before any other work:

```bash
cd ~/Dropbox/claude\ shenanigans/earnings-edge-dashboard
npm install --save-dev @playwright/test
npx playwright install chromium
mkdir -p tools/visual docs/screenshots
```

Create `tools/visual/screenshot.ts`:

```ts
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROD_URL = process.env.PROD_URL || 'https://earnings-edge-dashboard.vercel.app';
const ROUTES = ['/', '/stats', '/hedge'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

(async () => {
  const browser = await chromium.launch();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, '../../docs/screenshots', ts);
  fs.mkdirSync(outDir, { recursive: true });

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await page.goto(PROD_URL + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500); // let any client-side rendering settle
      const safeRoute = route === '/' ? 'home' : route.replace(/\//g, '_');
      const file = path.join(outDir, `${safeRoute}_${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`✓ ${file}`);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\nScreenshots in: ${outDir}`);
})();
```

Add to package.json:
```json
"scripts": {
  "screenshot": "tsx tools/visual/screenshot.ts"
}
```

**Run this every time after a deploy.** That's the verification loop.

## Workstream priorities (ordered by user pain)

### Priority 1 — Fix the overlap bug, for real this time

The user has reported the live signals page has overlapping elements. Your first action after the screenshot tooling lands:

1. Run `npm run screenshot` against current production. Open the resulting PNGs.
2. Identify what overlaps. Use Playwright's `page.evaluate()` to dump computed styles for any element with overflow issues:

```ts
const overlapping = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  return all
    .map(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className,
        position: cs.position,
        zIndex: cs.zIndex,
        overflow: cs.overflow,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      };
    })
    .filter(e => e.position === 'absolute' || e.position === 'fixed' || e.zIndex !== 'auto');
});
```

3. Walk the DOM tree from each overlapping element up to the root. Document the actual cause (parent overflow, absolute positioning, z-index conflict, margin collapse, flexbox shrink) in `docs/UI_FIXES.md`.
4. Fix the **root cause**, not the symptom. If a parent container is `overflow: hidden` clipping cards, fix the parent. If two grids are absolutely positioned on top of each other, remove one.
5. Commit + push + wait for Vercel deploy + re-screenshot. Verify the bug is gone in the new screenshot.
6. **Do not move to priority 2 until the overlap screenshot looks correct.**

### Priority 2 — Make Live Signals visually match Polymarket

The reference is at `docs/reference_polymarket_ui.png`. The criteria for "match":

| Criterion | Spec | How to verify |
|---|---|---|
| Background | `#0E1320` to `#0F1525` dark navy | Sample pixel from screenshot, check hex |
| Card background | `#1A1F2E` | Sample pixel |
| Card border | `1px solid rgba(255,255,255,0.06)` | Inspect element |
| Card padding | 20px | Computed style |
| Grid columns | 4 desktop / 2 tablet / 1 mobile | Screenshots at 1440/768/375 |
| Section header | "Pre Market" muted grey above column groups | Visual |
| Per-row | logo + ticker bold + EPS muted + green dot + percentage + "beats" | Visual |
| Row divider | 1px subtle inside cards | Visual |
| Logo | 40×40 rounded-square Clearbit fetch | Inspect img src |
| Percentage formatting | Large bold number + trailing "beats" small grey | Visual |

**Iteration loop:**
```
loop:
  edit components
  npm run build (must pass)
  git commit + push
  wait 60s for Vercel deploy
  npm run screenshot
  open screenshot, compare to reference
  if matches all criteria: break
  else: identify what's wrong, log to VISUAL_DIFF.md, continue
```

You may need 3–5 iterations. Budget 45 minutes. If after 5 iterations it still doesn't match, write a detailed `VISUAL_DIFF.md` explaining what's blocking and stop on this workstream — do not declare done.

### Priority 3 — Verify the cron jobs are actually firing and writing data

The previous build set up Vercel cron at 14:00 UTC and 20:00 UTC daily. Verify they are firing and writing to the data repo:

```bash
cd ~/Dropbox/claude\ shenanigans/earnings-edge-data
git log --oneline --since="48 hours ago" data/
```

If no commits in the last 48 hours of cron-firing windows, the cron isn't running. Check Vercel logs:

```bash
vercel logs https://earnings-edge-dashboard.vercel.app/api/cron/poll-signals --prod | tail -50
```

Common failure modes:
- `CRON_SECRET` env var missing or empty → 401 on the cron call
- Cron route imports a module not in production bundle → 500
- Cron route writes to `/data` instead of pushing to GH Pages → no error but no committed data
- Hobby plan rejected the cron schedule on deploy → check `vercel.json` and deploy logs

Fix whichever is broken. Add a manual trigger endpoint `/api/cron/manual?key=<DIAG_TOKEN>` that runs the cron logic on-demand, so you can test without waiting 24 hours.

### Priority 4 — Stats page cohort chart visual quality

Compare current `/stats` rendering to the FoggleBet reference (`docs/reference_foggle_bet_stats.png` — copy the user's first screenshot there if not already). Iterate on:
- Line colors (palette in v1.1 prompt, hex codes)
- Legend layout (top, with units)
- Y-axis units displayed as `+X.XXu` not raw dollars
- X-axis date formatting matches the reference (`Apr 4`, `Apr 12`, etc.)
- Empty state when N<30 in any cohort: dashed line, 50% opacity, tooltip explanation

Same iteration loop as priority 2.

### Priority 5 — Continuous data improvement (passive — runs while you work other tasks)

The crons are doing the actual data accumulation. Your job is to make sure they're working and the resulting data flows into the stats page correctly. Do not try to manually pull more data faster — the rate limits are real and matter.

For each cron firing:
- Verify `data/paper_bets_open.jsonl` got new rows
- Verify the resolution sweep correctly settled bets where Finnhub now has actuals
- Verify the stats page reflects new settled data

If any of these fails, fix it. Do not pretend the data flow is working when the file isn't growing.

## Issues to surface, not paper over

- **Vercel deploy fails repeatedly** → halt and surface. Don't keep trying with broken builds.
- **Screenshots can't reach production** (Vercel SSO gate, deploy preview only) → check if production is public; if it's behind preview auth, surface the URL pattern needed.
- **Playwright can't install on this OS/arch** → fall back to `puppeteer` or surface to user.
- **Reference image missing** → look in user's screenshot upload directory; if not present, ask user to confirm path.
- **Visual diff not matching after 5 iterations on same component** → stop, write detailed diff doc, surface to user. Don't keep iterating blindly.
- **Cron not firing** → fix the obvious config issues; if root cause unclear, surface Vercel log excerpts to user.

## Things you must NOT do

- Do not declare any UI workstream complete based on HTTP status alone. Screenshots are required.
- Do not skip the Playwright verification loop because it "feels slow." It is the only thing preventing the third repeat of this bug.
- Do not commit to the data repo manually to fake data accumulation. The crons are the source of truth.
- Do not increase Alpha Vantage usage above 20/day. Hard limit.
- Do not rewrite the existing Signal schema in `lib/types.ts` — additions only.
- Do not push broken builds to production. `npm run build` must pass.
- Do not commit `.env.local`, `config.local.yaml`, or any file with API keys.

## Continuous logging

Maintain `~/Dropbox/claude shenanigans/earnings-edge-dashboard/CONTINUOUS_WORK_LOG.md` with timestamped entries every 15 min:

```
## [HH:MM] <action>
- workstream: <which priority>
- before-screenshot: <path>
- after-screenshot: <path>
- diff observed: <one-line>
- commit SHA (if any)
- next: <what's next>
```

Visual screenshots committed to `docs/screenshots/` so user can browse them.

## Final report (when 2-3h budget exhausted OR all priorities done)

Append to log:
- Production URL
- Last 3 screenshots (path + brief description of what they show)
- Workstream status: Priority 1 ✅/⚠️/❌, Priority 2 ✅/⚠️/❌, etc.
- Cron status: firing? writing? settling?
- Open issues for next session
- Specific things user needs to verify themselves (mobile view, color accuracy, etc.)

## Order of execution

1. Set up Playwright + screenshot tooling. (~10 min)
2. Take baseline screenshots of current production. Document existing issues with paths to specific screenshots in `VISUAL_DIFF.md`.
3. Workstream 1 — overlap bug. Iterate until screenshot is clean.
4. Workstream 2 — Polymarket visual match. Iterate up to 5 times.
5. Workstream 3 — cron verification. Add manual trigger if useful.
6. Workstream 4 — stats page polish.
7. Workstream 5 — observe data accumulation; troubleshoot if not working.
8. Final report.
