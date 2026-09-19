# F1 done

Curved walls for Eco export / walk (Pascal already stores `curveOffset` sagitta).

## Built

- **Walk export** (`export-walk.ts`): curved walls are **one solid per door-split run**; centerline sampled every **0.5 m**, ring = left face + right face (thickness normals). Door gaps measured in **run metres** (arc length when curved), mapped from Pascal chord-local door `position[0]`.
- **GLB proxy + Walk colliders**: sample curved walls into short cuboids at the same 0.5 m step.
- **Acceptance script** `test/check-curved-wall.mjs`: 20 m chord, 2 m bow → ≥40 pts/face; door at 4 m along arc → 2 solids.
- Draw/edit UX: existing wall sagitta handle + inspector `curveOffset` (Shift/straight snap via core `normalizeWallCurveOffset`). Documented in Eco panel.

## Verified

- `bun packages/plugin-eco/test/check-curved-wall.mjs`
- `bun packages/plugin-eco/test/check-export.mjs`
- `bun packages/plugin-eco/test/check-roundtrip.mjs`
- `bun run check-types --filter=@eco/plugin-eco`

## Decision

Reuse Pascal’s `curveOffset` rather than inventing a second curve format. World-facing export is the gap that F1 closes; authoring already had a sagitta control.
