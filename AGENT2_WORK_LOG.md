# Agent 2 work log

Continuous log of Agent 2's work on the dashboard + data integration side.
Append-only. Agent 1 is concurrently working the scanner repo.

---

## [Session start] Pre-flight + state setup

- Read mandate. Confirmed scope: dashboard repo + data repo only; scanner repo is read-only.
- Auth checks:
  - `gh auth status`: **gh CLI not installed** (`command not found`). Blocks Deliverable 2 (data repo + Pages).
  - `vercel whoami`: **vercel CLI not installed** (`command not found`). Blocks Deliverable 3 (deploy).
  - Tried `npm i -g vercel` and `brew install gh` — both denied by sandbox per "user authorized USING but not INSTALLING."
- Surfaced install commands to user via main chat.
- Continuing with everything not blocked on those CLIs:
  - Deliverable 1: validation harness (TypeScript only, needs only `tsx`)
  - Deliverable 4 P1/P2/P3: all dashboard-internal polish features
  - Documentation files

## Disclosure: snapshot writer pre-existed in scanner repo

Before this Agent 2 reframing, I (in orchestrator role) wrote
`/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge/src/snapshot_writer.py`
(~350 lines) as the bridge between Scanner.Signal and Dashboard.Signal. Per
the new "do not touch scanner repo" rule, I will NOT modify it further.

Agent 1 may use it as-is, replace it, or merge concerns. Documented in
INTEGRATION_NOTES.md.

---

## [+10m] Validation harness done

Built `tools/validate_snapshot.ts` — Zod-validates any snapshot JSON
against `SignalsSnapshotSchema` or `CalibrationSummarySchema` from
`lib/types.ts`. Per-issue mismatch report with line-level diagnostics.
Wired as `npm run validate:snapshot`. `tsx` pinned as devDep.

Tested against `tools/sample_snapshot.json` — **PASS** (8 signals
across 3 tiers, all 16 fields present).

Will catch Agent 1's snapshot-writer schema mismatches (already
documented in INTEGRATION_NOTES.md) when Agent 1 produces a real
snapshot.

## [+15m] CRITICAL schema-divergence catalog written

Added detailed table to INTEGRATION_NOTES.md showing the 13 field/enum
mismatches between the kickoff prompt and the dashboard's actual
`lib/types.ts`. Most consequential: tier is `A|B|C` not
`HIGH|MEDIUM|LOW|INELIGIBLE`. Field-by-field rewrite map provided so
Agent 1 can fix the snapshot writer.

## [+25m] P1 polish committed (9327789)

- `SignalGridSkeleton.tsx` — 6-row animate-pulse placeholder
- `DataFreshness.tsx` — staleness banner (muted/amber/red by age)
- `SignalCard.tsx` — mobile single-signal card; SignalGrid hides
  table under sm: and shows card stack
- `app/icon.svg` — minimal "E" favicon
- `app/layout.tsx` — OG/Twitter meta tags + mobile-responsive padding
- `app/hedge/page.tsx` — placeholder route flagged "v1.1 coming soon"
- Removed 5 boilerplate Next.js SVGs from public/

Build green: 8 routes (was 7), 0 type errors.

## [+30m] First validator type fix + rebuild

Build initially failed on `tools/validate_snapshot.ts` because Zod 4
narrowed `$ZodIssueInvalidType` and `received`/`expected` are no longer
on the type. Refactored to use a loose record accessor for issue
subfields. Build green again, harness still PASS.

## [+35m] P2 sort+filter URL params committed (e993779)

- `SignalControls.tsx` — sort dropdown + filter chips, reads/writes
  `?sort=tier&filter=tierA` via `useSearchParams` + `router.replace`.
  Defaults stripped from URL to keep links clean.
- `SignalGrid` refactored to read controls from search params, applies
  filter then sort. Empty-filter state shows "no signals match" message.

Sort: largest gap (default), tier, earnings date, ticker A→Z.
Filter chips: All, Tier A only, Tier A+B, Regime stable, Fresh consensus.

## [+45m] P3 committed (0c9296f)

- `Footer.tsx` — replaces inline footer; build timestamp from
  `next.config.ts` BUILD_TIME env, "dev" fallback
- `KeyboardShortcuts.tsx` — global keydown handler with help overlay.
  Bindings: g/c/h navigate, / focus controls, ? toggle help, Esc close.
  Ignores when typing in form fields or with cmd/ctrl/alt modifiers.
- `app/signal/[id]/page.tsx` — server-rendered single-signal permalink
  with dynamic OG meta. Wired into SignalRow + SignalCard ticker links.
- `next.config.ts` — captures BUILD_TIME at build time.

Build: 11 routes, all green.

## [+50m] Data repo pre-created (a989d91 in earnings-edge-data)

Pre-created `~/Dropbox/claude shenanigans/earnings-edge-data/` so when
user installs `gh`, only `gh repo create --source=. --push` + the Pages
API call is needed. Local `git init -b main` + initial commit done.

---

## SESSION SUMMARY (everything that shipped without `gh`/`vercel`)

### Dashboard repo
| Commit | Description |
|---|---|
| `9327789` | P1+P2 polish: skeletons, mobile, freshness, OG, /hedge, validator |
| `e993779` | P2: sort+filter URL params |
| `0c9296f` | P3: Footer w/ build time, KeyboardShortcuts overlay, /signal/[id] permalink |

11 routes, build green, validator harness PASS against sample.

### Data repo (pre-created locally)
| Commit | Description |
|---|---|
| `a989d91` | init: data repo with sample snapshot + calibration placeholder |

### Documentation
- `AGENT2_WORK_LOG.md` (this file) — chronological work log
- `INTEGRATION_NOTES.md` — schema-divergence catalog + data repo URL pattern + snapshot-writer field mapping for Agent 1

### Blocked (require user action)
- Deploy Steps A–F (data repo push, dashboard repo push, vercel link, env vars, deploy, smoke test) — needs `gh` + `vercel` CLIs installed by user

### Messages for Agent 1 (read INTEGRATION_NOTES.md for details)
1. Existing `src/snapshot_writer.py` in scanner repo maps to the WRONG dashboard schema (kickoff prompt vs actual `lib/types.ts`). Field-by-field rewrite map provided.
2. Once snapshot writer is fixed, target the GitHub Pages URL `https://<user>.github.io/earnings-edge-data/data/signals_latest.json` for publish (URL goes live after user runs `gh repo create` on the pre-created data repo).
3. Scanner repo has zero commits — please do `git init` + initial commit when convenient.

### Production URL
TBD — user runs `vercel --prod --yes` after env vars are set.
