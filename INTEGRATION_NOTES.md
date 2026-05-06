# Integration notes — Scanner ↔ Dashboard

Append-only coordination log between Agent 1 (scanner repo) and Agent 2
(dashboard + data repos). Both agents must read this file before starting
related work.

Format:
```
## [HH:MM] Agent N: <what you found / what you did>
```

---

## [Session start] Agent 2: Pre-existing snapshot writer

Before the Agent-1/Agent-2 split was formalized, the orchestrator wrote a
snapshot writer at:

  `/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge/src/snapshot_writer.py`

It maps Scanner.Signal → Dashboard.Signal per the 18-field schema gap and
exposes a `main()` CLI compatible with `earnings-edge snapshot` (not yet
wired into `cli.py`).

**Agent 1's call** to: (a) keep + wire into CLI, (b) replace, or (c) merge
with Agent 1's own design. Agent 2 will not touch this file.

The dashboard's `lib/types.ts` is the canonical Signal contract. If
snapshot_writer.py emits fields that don't validate against
`SignalsSnapshotSchema`, the writer is wrong — fix the writer, not types.

## [Session start] Agent 2: Validation harness

Agent 2 is building `tools/validate_snapshot.ts` in the dashboard repo
that takes any snapshot JSON path and validates against the Zod schema
derived from `lib/types.ts`. Once it's working, Agent 1 can run it on
their snapshot writer's output to verify before publishing:

```bash
cd ~/Dropbox/claude\ shenanigans/earnings-edge-dashboard
npx tsx tools/validate_snapshot.ts ../earnings-edge/data/snapshots/signals_latest.json
```

Exits 0 on pass, 1 on fail with human-readable mismatch report.

## [Session start] Agent 2: Data repo URL pending

`gh` CLI isn't installed yet. Once user installs:
- `brew install gh` (Apple Silicon) or `npm i -g gh` (won't work — gh is not on npm)
- `gh auth login`

Agent 2 will create `earnings-edge-data` repo and enable Pages. The URL
pattern will be:

  `https://<github-username>/earnings-edge-data/data/signals_latest.json`

Agent 1's snapshot writer should target this URL once it's confirmed live.
Agent 2 will update this note with the actual URL when Pages provisions.

## [Session start] Agent 2: Scanner repo state observation

`/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge/` was
git-init'd but **has zero commits** — every file shows as untracked. Agent 1
is presumably about to commit. Agent 2 won't touch this. If Agent 1 reads
this and is unaware: please make an initial commit so the scanner repo
has a baseline state that agents can diff against.

## [Agent 2 +1m] CRITICAL: dashboard schema diverges from kickoff prompt

The dashboard agent built `lib/types.ts` with a SIMPLER `SignalSchema` than
the kickoff prompt specified. Differences relevant to Agent 1's snapshot
writer:

| Kickoff prompt said | Dashboard actually uses |
|---|---|
| `tier: 'HIGH'\|'MEDIUM'\|'LOW'\|'INELIGIBLE'` | `tier: 'A'\|'B'\|'C'` |
| `direction: 'YES_CHEAP'\|'NO_CHEAP'` | `direction: 'YES'\|'NO'` |
| `market_implied_prob_yes` | `market_implied_prob` |
| `historical_base_rate_beat` | `historical_base_rate` |
| `condition_id` | `market_url` (URL string, not condition id) |
| `consensus_threshold` | (not present) |
| `consensus_tightness_adjusted` | (not present) |
| `slippage_adjusted_gap_pp` | (not present) |
| `book_depth_at_target_cents` | (not present) |
| `current_spot_estimate` | (not present) |
| `n_quarters` | (not present) |
| `ineligible_reason` | `note` (free-form string) |
| `company_name` | (not present) |
| `resolved: { actual_eps, outcome: 'BEAT'\|'MISS', resolved_at }` | `resolved: bool` + `outcome: 0\|1\|null` |

Implication for `snapshot_writer.py` in scanner repo: it currently maps
to the KICKOFF schema, which the dashboard's Zod validator will REJECT.

Agent 1 — if you keep the existing snapshot_writer.py, it needs a rewrite
to match `lib/types.ts`. Field mappings:

```python
# Scanner field            → Dashboard field
"symbol"                  → "ticker"
"title"                   → "market_question"
"url"                     → "market_url"  (URL string, not condition_id)
"market_implied_prob"     → "market_implied_prob"  (no _yes suffix)
"base_rate_prob"          → "historical_base_rate"  (no _beat suffix)
"gross_edge_bps" / 100    → "edge_magnitude_pp"
"edge_direction".upper()  → "direction"  ("yes" → "YES", "no" → "NO")
"scouted_at"              → "recorded_at"
"resolves_at_utc"         → "earnings_date"

# Tier mapping (HIGH/MEDIUM/LOW → A/B/C):
"HIGH"  → "A"
"MEDIUM"→ "B"
"LOW"   → "C"
"INELIGIBLE" → drop the signal entirely (not in dashboard enum)

# Resolved (when resolution_post-pass populates):
{outcome: "BEAT"} → resolved=true, outcome=1
{outcome: "MISS"} → resolved=true, outcome=0
None              → resolved=false, outcome=null

# id field — dashboard requires unique stable id:
id = f"{venue}:{market_id}:{quarter}"
```

Agent 2 will run the validation harness against the existing snapshot
writer's output once Agent 1 produces a real snapshot. Will append the
mismatch report here.

## [Agent 2 +30m] Data repo pre-created locally

Created `/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-data/`
with `git init -b main`, sample snapshot copied, calibration placeholder
written, README + .gitignore. Initial commit `a989d91`.

When user installs `gh`, the remaining steps to publish to Pages are:

```bash
cd ~/Dropbox/claude\ shenanigans/earnings-edge-data
gh repo create earnings-edge-data --public --source=. --remote=origin --push
gh api repos/$(gh api user -q .login)/earnings-edge-data/pages -X POST \
  -F source[branch]=main -F source[path]=/
```

Pages URL pattern (once live): `https://<user>.github.io/earnings-edge-data/data/signals_latest.json`

Agent 1: snapshot writer should target this URL in its publish step.
