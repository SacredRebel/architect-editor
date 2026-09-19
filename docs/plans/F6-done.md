# F6 done

Orthographic drawing exports (plan / section / elevations) at true paper scale.

## Built

- `eco-drawings` — layout math (`1:N` → paper cm → PNG pixels at DPI), plan strokes from walls/slabs, canvas paint (white ground, black linework, poché walls, scale bar, north arrow on plans).
- `eco-drawings-panel` — scale 1:50/100/200, DPI 150/300, view picker, section line inputs, PNG download.
- `test/check-drawings.mjs` — 20 m building at 1:100 → 20 cm paper ± 1 mm at 150 DPI.

## Verified

- `bun packages/plugin-eco/test/check-drawings.mjs`
- `bun run check-types --filter=@eco/plugin-eco`

## Decision

Drawings are 2D measured linework from the scene graph (not a Three.js beauty pass), so scale is exact and headless-testable. Elevations are schematic wall cuts; enough for proposal boards, not construction docs.
