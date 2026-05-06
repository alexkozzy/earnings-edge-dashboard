# UI fixes — v1.1

Notes on the visual issues addressed in the v1.1 UI overhaul.

## Replaced default view: table → Polymarket-style card grid

The previous Live Signals view rendered a wide HTML table at `sm` and
above and a vertical card stack at `xs`. Two issues:

1. **Width pressure**: at viewports between `sm` and `lg` (640–1024px),
   the 9-column table forced columns to scrunch — the "Market question"
   column either wrapped messily or pushed the right-side columns off
   screen. Visual symptom: looked like cards/cells were "overlapping"
   because the long question text crashed into the numeric columns.
2. **Information hierarchy**: tables prioritise comparison across rows,
   but the user's primary task is "scan for the next 1–2 best edges,"
   which a card grid surfaces faster.

Fix: new `components/SignalCardGrid.tsx` renders a 1/2/4-col responsive
grid bucketed by earnings-date timing block (Today / This week / Next
week / Later). Cards are 320–400px wide depending on viewport, never
crash into each other. Power users can flip to the dense table via the
new view toggle.

## Layout container widened: max-w-6xl → max-w-7xl

The 4-col card grid wanted ~80px more horizontal breathing room.
`app/layout.tsx` (header + main) and `components/Footer.tsx` bumped to
`max-w-7xl`. No effect on text-heavy pages because their inner content
keeps its own narrower wrappers.

## SignalControls + view toggle moved into shared row

Previously `SignalControls` had its own full-width row, and the
`EdgeChart` legend below it left an awkward gap. New structure groups
the sort/filter chips (left) and the cards/table view toggle (right)
in one flex row that wraps cleanly to a column under `sm`.

## Edge-magnitude badge color tiering

Per spec: badge is hidden when `|edge| < 5pp`, grey 5–10pp, amber
10–15pp, green ≥15pp. Previous SignalRow showed every edge value with
the same colored text — visually noisy because every signal "looks
important."

## Tier indicator: full-width tier badge → 2px left bar

Cards have a 2px green/amber left bar for Tier A/B (none for C).
Same information as the previous coloured tag, but uses peripheral
vision instead of taking up a full column.

## Notes deferred to a follow-up pass

- **Inter font**: spec calls for Inter, current scaffold uses Geist.
  `tabular-nums` is achievable in Tailwind without changing the family
  (CSS `font-variant-numeric: tabular-nums`); the font swap is purely
  cosmetic and risks layout shifts. Deferred.
- **Bottom drawer detail view**: spec calls for a slide-up drawer when
  a card row is clicked. v1.1 ships row-click → `/signal/[id]` (full
  page), reusing the existing permalink route built by Agent 2. Drawer
  variant is a v1.2 feature.
- **Reference screenshot at docs/reference_polymarket_ui.png is
  missing**. Built from the spec's verbal description — palette tokens,
  border opacity values, padding all match the spec. Pixel-perfect
  parity with the original screenshot can't be confirmed.
