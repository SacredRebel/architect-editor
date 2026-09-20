# H12 — materials, glass, site sun, presentation

## STATUS

- **Done:** materials library, real glass (transmission + `alphaMode: BLEND`), one mesh per material, compat under 500 KB, baseline PNGs, presentation chrome.
- **Done — lighting:** `EcoSiteLighting` wired to the **world lighting contract** (spatial-map `af1f0bd` / `docs/lighting-contract.md`). NOAA sun, SRGB + ACES + dusk exposure, PMREM sky IBL sampled at the origin, contract sun/shadow/skylight. Materials were **not** retuned in this pass (ACES was already the viewer tone map; IBL change may shift reads later).

## Repo drawn on

`packages/plugin-eco` — materials palette, glass, presentation chrome, and contract lighting ported from spatial-map `src/world/{sun,sky}.ts`.

## What shipped

| Piece | Role |
|---|---|
| `eco-materials.ts` | 11 PBR entries (stone, river stone, timber, board-and-batten, glass, stucco, concrete, living roof, standing-seam, canvas, metal) — colour / roughness / metalness / opacity / **normal** / transmission |
| `createEcoThreeMaterial` | Glass → `MeshPhysicalMaterial` (transmission); others → `MeshStandardMaterial`; 32² procedural normals |
| `eco-gltf-polyfill.ts` | Bun/Node `OffscreenCanvas` + `ImageData` so DataTexture normals export without `document` |
| `consolidateByEcoMaterial` | **One mesh per material**; planar world-XZ UVs (not strip) so normals tile |
| `eco-site-sun.ts` | **NOAA** `sunPosition` / `instantAt` / `sunDirectionAt` (contract site defaults) |
| `eco-site-sky.ts` | Contract sky keys, Preetham sun transmission, equirect bake, `DirectionalLight` + skylight hemi fill |
| `eco-site-lighting.tsx` | SRGB + ACES + `0.75 × sky.exposure`; PMREM env at origin; mutes viewer theme lights |
| `eco-presentation-store.ts` | Presentation toggle + time-of-day hours (local `America/Los_Angeles`) |
| `EcoLegendPanel` | One-click presentation + time slider; hides guides / ghost / compass / walk chrome |

## Lighting contract (mounted)

| Item | Value |
|---|---|
| `outputColorSpace` | `SRGBColorSpace` |
| `toneMapping` | `ACESFilmicToneMapping` |
| `toneMappingExposure` | `0.75 × sky.exposure` |
| `sky.exposure` | `1 + 0.9 × (1 − smoothstep(alt°, −2, 30))` |
| Sun | NOAA + refraction; default lat **34.4331**, lng **−119.1554**, `America/Los_Angeles` |
| Sun light | `DirectionalLight(0xffffff, 3)`; intensity / colour from sky.ts; shadows **4096²**, bias **−0.0004**, normalBias **0.6** |
| Skylight | `(0.1 + 1.5 × day) × skylightScale` (hemi fill only; **not** IBL) |
| Environment | Equirect bake of sky → **PMREM**; direction-only (= origin) |
| Atmosphere | turbidity **4**, rayleigh **1.0**, mieCoefficient **0.005** |

**Removed:** provisional hemi+ambient stub used as the sky/IBL stand-in.

## Visual baseline (H12.0)

Fixed camera `(22,14,18)` → `(0,5,0)`, fov 45, seed `0xec0120`, Ojai lat/lon, 2026-06-21 15:00 local.

| | Path |
|---|---|
| Before (grey plastic) | [`docs/plans/h12-baseline/before.png`](./h12-baseline/before.png) |
| After (living-roof + harness sun) | [`docs/plans/h12-baseline/after.png`](./h12-baseline/after.png) |

Harness: `bun packages/plugin-eco/test/render-h12-baseline.mjs before|after`

> Harness PNGs stay regression-only (fixed shade). Editor presentation uses the contract path above.

## Compat bytes (assert green, no meshopt)

| Export | Before H12 materials | After H12 (compat) | Under 500 KB? |
|---|---|---|---|
| Leaf shell only (`check-shell`) | **161 816** | **220 984** | yes |
| Six-material demo (`check-materials`) | ~same class | **243 912** | yes |
| H12 demo house+shell+glass (`check-h12`) | — | **242 556** | yes |

## Glass

- Viewport: `MeshPhysicalMaterial` with `transmission ≈ 0.92`, `ior 1.5`, `opacity 0.22`
- Export: `alphaMode: BLEND` (asserted in `check-materials` / `check-h12`)

## Checks

- `bun packages/plugin-eco/test/check-h12.mjs`
- `bun packages/plugin-eco/test/check-lighting.mjs`
- `bun packages/plugin-eco/test/check-materials.mjs`
- `bun packages/plugin-eco/test/check-shell.mjs`

## Commit

`eco(H12): …` / `eco(lighting): …`
