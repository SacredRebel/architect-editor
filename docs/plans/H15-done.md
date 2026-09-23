# H15 — clean slate, organic authoring, true size

## H15.0 housekeeping

- Pulled `main` at `5e9249aa` (H14 merge).
- Deleted merged branches (local + remote): `cursor/eco-f0-loop`, `cursor/eco-h1`,
  `cursor/eco-phases-e0-e4`, `eco/h14-atlas-image3d`.
- Rewrote `STATUS.md` with H0–H14 table (H13 not started / folded into H15.2;
  H11 adapter stub superseded by H14; curved walls were single-arc; minimal had no panel).

## What shipped

| Piece | Detail |
|---|---|
| H15.1 mocked atlas | `apps/editor/app/api/image3d/*` + `?mockAtlas=1` on Photo→3D panel; ground-seat in `prepareImage3dGlb` |
| Multi-arc smooth walls | `eco-smooth-wall.ts` — Catmull–Rom, simplify ~0.1 m, openings by arc length, bulge, mitred offset |
| Organic building | `eco-organic-spec/plan` + panel — forms fit/lobed/oval/leaf/shell, shell loft `eaves+rise·(1−ρ^2.2)`, solar &lt;42°, quantities, plain words, one undo/slider |
| GLB recipe | `extras.organicBuildings` + node `organic` / `assembly`; restore via `restoreOrganicBuildings` |
| Minimal surface panel | Boundary from closed organic wall; relaxation + thickness; live area |
| True size | `eco-true-size.ts` — `32′ 9½″ · 9.99 m`, typed lengths, ANSI Z765 gross/net, `extras.area`, target sq ft scale |

Lighting / materials / H3 untouched. Image-to-3D still props/massing only (not walk).

## Checks

```bash
bun packages/plugin-eco/test/check-h15.mjs
bun packages/plugin-eco/test/check-h15-size.mjs
bun packages/plugin-eco/test/render-h15-flows.mjs
```

## Screenshots

- `docs/plans/H15-h14-photo-prop.png`
- `docs/plans/H15-h14-sketch-massing.png`
- `docs/plans/H15-curved-wall-window.png`
- `docs/plans/H15-lobed-building.png`
- `docs/plans/H15-slider-panel.png`
- `docs/plans/H15-minimal-surface.png`

## Known slips (documented, not blockers for checks)

- Live atlas / real PIN still owner-side; local mock covers H15.1 contract.
- Smooth-wall control handles are panel/bulge driven (no freehand canvas tool yet).
- ANSI / live draw readouts are library + organic panel; full draw-tool HUD wiring is partial.

## Commit

`eco(H15): …`
