# Visual diff — research session 2026-05-06

## D1 — visual matches: SKIPPED (references missing)

Both reference images are still not on disk:

- `docs/reference_polymarket_ui.png` — missing
- `docs/reference_foggle_bet_stats.png` — missing

Verified via `find ~ -name "reference_polymarket*" -o -name "reference_foggle*" 2>/dev/null` — zero hits.

Per STATE.md ("User has stated these are 'available' but they haven't reached the docs/ directory") this is the same state as the last session. D1 is therefore skipped this session. When the references land, run `npm run screenshot` and diff against them.

## D2 — category-tabs screenshots (this session)

Captured at 1440px on `localhost:3331` against the freshly-built dev server:

- `docs/screenshots/2026-05-06T18-59-10-085Z/category-tabs/home-earnings-1440.png`
- `docs/screenshots/2026-05-06T18-59-10-085Z/category-tabs/home-econ-1440.png`
- `docs/screenshots/2026-05-06T18-59-10-085Z/category-tabs/home-crypto-1440.png`
- `docs/screenshots/2026-05-06T18-59-10-085Z/category-tabs/stats-verdict-1440.png`

Spot-check observations:
- Sub-tab control renders just below main nav on `/`, blue accent on the active tab (matches main-nav active style)
- Earnings tab default — full signals UI intact (4 signals, EdgeChart, controls, card grid)
- Econ + Crypto — placeholder card with research-only copy and `/stats` link
- `/stats` — verdict banner top-of-page in blue (pending state); rest of stats UI intact
