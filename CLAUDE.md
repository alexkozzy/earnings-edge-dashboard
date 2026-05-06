# CLAUDE.md — earnings-edge-dashboard

Read this before writing code. Then read `STATE.md` for current state.

## Where to look first

- **`STATE.md`** — what's working, broken, deferred. Verification commands. Open issues in priority. **Read every session.**
- **`INTEGRATION_NOTES.md`** — schema-divergence catalog (scanner uses old kickoff fields; dashboard's `lib/types.ts` is canonical).
- **`VISUAL_DIFF.md`** — running visual-bug log + fix verifications.
- **`AGENTS.md`** — single line: this is Next.js 16, breaking changes vs your training data.

## Stack

- **Next.js 16** (App Router). API routes under `app/api/*/route.ts`. Page routes under `app/*/page.tsx`.
- **TypeScript strict.** Zod schemas in `lib/types.ts` are the source of truth.
- **Tailwind v4** (CSS-config flavor; see `app/globals.css`). No `tailwind.config.js`.
- **Recharts** for stats page; **SWR** for client data fetching.
- **Playwright** at `tools/visual/screenshot.ts` for the screenshot loop.
- **Vercel Hobby** deploy target — important constraints below.

## Working-directory conventions

- All code in `app/`, `lib/`, `tools/`. No `src/`.
- Tests are minimal and ad-hoc; the contract you actually rely on is the Zod schema + the verification commands in STATE.md.
- Snapshots go to `tools/sample_snapshot.json` (fallback) or are read live from `SNAPSHOT_BASE_URL`.
- Generated screenshots go to `docs/screenshots/<UTC-timestamp>/`. Don't commit them by default — `.gitignore` excludes the dir tree below `docs/screenshots/`.

## Pre-deploy checklist (paste-ready)

```bash
# 1. Build clean
npm run build 2>&1 | tail -10
# Must be 0 errors. 18 routes (or current count) must all show.

# 2. Lint
npm run lint 2>&1 | tail -5

# 3. Validate any snapshot you touched
npx tsx tools/validate_snapshot.ts path/to/snapshot.json

# 4. Visual verify (if UI touched)
npm run screenshot

# 5. Confirm no secrets staged
git status --porcelain | grep -E '\.env|config\.local'
# Must be empty.

# 6. Deploy
vercel --prod
```

After deploy, run the post-deploy block from `STATE.md` → "Verification commands". HTTP 200 is necessary but not sufficient — for cron flows you must verify the data repo got a fresh commit and the file content actually changed.

## Common pitfalls

### Vercel Hobby cron limits

- **Max 1 cron per route per day.** `vercel.json` schema-validates on push. `*/15 * * * *` will be rejected.
- Currently: `0 14 * * *` (poll-and-log) and `0 20 * * *` (resolve). Don't change without checking with the user — they declined the Pro upgrade.
- For sub-daily cadence: GitHub Actions on this (public) repo gives unlimited free minutes; the workflow file would `curl` `/api/cron/poll-and-log` with `Authorization: Bearer $CRON_SECRET`. Not yet written. See STATE.md P1 #2.

### `vercel env pull` lies

`vercel env pull --environment=production` returns Sensitive-classified vars as empty strings even when set in production. Misleading. **Use `vercel env ls production`** (lists names) to verify presence. Listed env vars in STATE.md → "Critical configuration".

### `vercel.json` schema is strict

No `_comment_*` keys, no extra fields. Validation is server-side; failures show as deploy errors that look unrelated. Keep this file minimal.

### Build size cap

Vercel Hobby has a per-function size cap (~50MB compressed). Watch `recharts` bundle weight on the stats page. If a route's individual size warning appears at build time, lazy-load with `dynamic()` rather than ignoring it.

### Next.js 16 specifics

- App Router only. Pages Router patterns from your training data are wrong.
- `cookies()`, `headers()`, `params` are async — `await` them.
- Server actions and route handlers run in different runtimes; check `node_modules/next/dist/docs/` if a runtime-specific API misbehaves.

### Hedge endpoint Finnhub wrapper

`/api/finnhub/[...path]` proxy wraps responses as `{ data: <upstream>, cached: bool }`. Endpoints calling the proxy must unwrap before reading fields. The hedge route had a bug here originally — see `app/api/hedge/route.ts:fetchFinnhubSpot`.

### Schema is additive only

`lib/types.ts` — adding fields = make them optional. Renaming = breaking. If you need a structural rename, mark old deprecated and support both for one release cycle. **Never** edit `Tier` enum or `Direction` enum without a migration plan; downstream paper bets reference these by string.

## Conventions for any change

- Screenshot loop is mandatory for UI changes. HTTP 200 is not enough.
- Future-only filter is enforced in two places (defense-in-depth: `lib/paperEngine.isFutureEarnings` + `app/api/signals/route.ts`). Don't refactor to a single source unless you preserve both call sites.
- Paper bets log Tier A and B only. Tier C is informational and explicitly skipped with a counter — preserve that on any `paperEngine.ts` edit.
- All persistence flows through `lib/dataRepo.ts` (GitHub Contents API). Vercel `/tmp` is wiped between invocations; do **not** add filesystem persistence.
- Public-repo-only. Verify before every push: `git status --porcelain | grep -E '\.env|config\.local'` must be empty.

## When you're stuck

- API key issues → `vercel env ls production`, not `vercel env pull`.
- Snapshot 404s → check `SNAPSHOT_BASE_URL` is set; check the data repo at `~/Dropbox/claude shenanigans/earnings-edge-data/` actually committed.
- Cron 401s on prod → expected for unauthenticated curls. Cron itself uses internal Vercel auth, not the bearer.
- Hedge 503 with "Finnhub returned no usable price" → verify proxy isn't returning cached error; check `FINNHUB_API_KEY` in env list.
- Visual regression → `npm run screenshot`; diff against `docs/screenshots/` baseline if one exists.

## Pointer to scanner

The Python scanner lives at `~/Dropbox/claude shenanigans/earnings-edge/`. Schema mismatch is documented in this repo's `INTEGRATION_NOTES.md`. The scanner has its own `CLAUDE.md` with Python-specific conventions.
