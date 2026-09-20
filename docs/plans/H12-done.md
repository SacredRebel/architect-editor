# H12 — materials, glass, site sun, presentation

## Repo drawn on

`packages/plugin-eco` only — expands F5 materials into a full presentation palette,
wires site sun from lat/lon/time, and adds a one-click presentation view.

## What shipped

| Piece | Role |
|---|---|
| `eco-materials.ts` | 11 PBR entries (stone, river stone, timber, board-and-batten, glass, stucco, concrete, living roof, standing-seam, canvas, metal) — colour / roughness / metalness / opacity / **normal** / transmission |
| `createEcoThreeMaterial` | Glass → `MeshPhysicalMaterial` (transmission); others → `MeshStandardMaterial`; 32² procedural normals |
| `eco-gltf-polyfill.ts` | Bun/Node `OffscreenCanvas` + `ImageData` so DataTexture normals export without `document` |
| `consolidateByEcoMaterial` | **One mesh per material**; planar world-XZ UVs (not strip) so normals tile |
| `eco-site-sun.ts` | `sunDirectionAt(lat, lon, time, northDeg)` — editor +z = north |
| `eco-site-lighting.tsx` | Hemisphere (sky IBL stand-in) + directional sun + ambient; mounted in `EcoPresentation` |
| `eco-presentation-store.ts` | Presentation toggle + time-of-day hours |
| `EcoLegendPanel` | One-click presentation + time slider; hides guides / ghost / compass / walk chrome |

## Visual baseline (H12.0)

Fixed camera `(22,14,18)` → `(0,5,0)`, fov 45, seed `0xec0120`, Ojai lat/lon, 2026-06-21 15:00 local.

| | Path |
|---|---|
| Before (grey plastic) | [`docs/plans/h12-baseline/before.png`](./h12-baseline/before.png) |
| After (living-roof + site sun) | [`docs/plans/h12-baseline/after.png`](./h12-baseline/after.png) |

Harness: `bun packages/plugin-eco/test/render-h12-baseline.mjs before|after`

> **Note:** `after.png` was re-exposed for readability (software path converts linear→sRGB and applies ambient+sun fill so living-roof green reads clearly; camera/seed/time unchanged).

## Compat bytes (assert green, no meshopt)

| Export | Before H12 materials | After H12 (compat) | Under 500 KB? |
|---|---|---|---|
| Leaf shell only (`check-shell`) | **161 816** | **220 984** | yes |
| Six-material demo (`check-materials`) | ~same class | **243 912** | yes |
| H12 demo house+shell+glass (`check-h12`) | — | **242 556** | yes |

Normals are tiny procedural 32² maps — not photo textures. If the budget slipped, shrink those further; **do not** answer with meshopt.

## Glass

- Viewport: `MeshPhysicalMaterial` with `transmission ≈ 0.92`, `ior 1.5`, `opacity 0.22`
- Export: `alphaMode: BLEND` (asserted in `check-materials` / `check-h12`)

## Tessellation note (carry from H10)

Visual surfaces use the coarsest count meeting sagitta ≤ 0.05 m (~**23** segs at R=5). Walk rings may stay finer. Confirmed in `check-h10` (`R5_segments: 23`).

## Mannheim note (not a blocker)

Demo leaf shell rise/span ≈ **0.75** is **not** Mannheim Multihalle-like (that gridshell is a low rise over a much larger span). Reconcile proportions at **H10.4** — H12 only presents the current parametric demo.

## Checks

- `bun packages/plugin-eco/test/check-h12.mjs`
- `bun packages/plugin-eco/test/check-materials.mjs`
- `bun packages/plugin-eco/test/check-shell.mjs`
- `bun packages/plugin-eco/test/render-h12-baseline.mjs before|after`

## Commit

`eco(H12): …`
