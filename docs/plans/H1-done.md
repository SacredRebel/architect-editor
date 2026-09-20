# H1 done — GLB optimise + hard audit

## Repo drawn on

[pascalorg/skills](https://github.com/pascalorg/skills) · skill `glb-web-export` (MIT — confirmed in skill frontmatter / README).

Adapted: measure → decide → apply → verify. Used `@gltf-transform/*`, `meshoptimizer` (allowed). Did **not** vendor unclear-licence code. **No Draco** — decoder wasm is either a CDN (forbidden in embed) or past the 200 KB binary limit. No KTX/`ktx` CLI — JPEG resize for textured assets.

## Profiles

| Profile | What it does | When |
|---|---|---|
| `compat` (default eco:glb) | dedup / prune / weld / quantize | Parametric exports — **must** fit under 500 KB here |
| `web` | same + meshopt | Optional **headroom** for already-dense assets |

**Rule:** compression is headroom, not the plan. Sibling cabins pack (~85 KB, 1 220 tris, empty `extensionsRequired`) is the bar — generate sparse, do not decimate after the fact. If a model needs meshopt to fit, the geometry is wrong first.

World note (spatial-map `4a9a618`): `MeshoptDecoder` is wired through `makeGltfLoader()`, so `web`/`EXT_meshopt_compression` no longer throws in the world. Still not the primary budget strategy.

## Hard audit ceilings (fail the export)

| Rule | Ceiling / assert |
|---|---|
| Compat file size | **≤ 500 KB** |
| AABB each axis | **∈ [0.5 m, 500 m]** (catches cm / feet-as-metres) |
| Y-up + z-south | `extras.walk` present; named north walls have **z < 0** (H0 convention) |
| Mesh / draw budget | **meshes ≤ materials** and **drawCalls ≤ materials** (one mesh per material, never per element) |
| Texture edges | **power-of-two**, **≤ 512 px** (optimiser resize matches) |

`assertHardGlbAudit` **throws** — wired into `exportEcoGlb` before return. Failed audit = no `eco:glb` / no download; legend shows the error.

## Size on screen

After every successful export the legend shows the pack numbers, e.g. **`2.1 MB → 428.8 KB`** or **`16.4 KB → 16.4 KB`** (`formatExportSizeLabel` from before→after bytes). Bridge updates `eco-export-store`; host still gets `eco:error` on failure.

## What shipped

| Piece | Role |
|---|---|
| `src/glb-audit.ts` | Report + **`assertHardGlbAudit`** + size formatters + stated ceilings |
| `src/glb-optimise.ts` | `compat` · `web`; texture resize **512** |
| `exportEcoGlb` | Optimise → stamp walk → **hard-audit** → `sizeLabel` |
| `src/eco-export-store.ts` | UI status / size / error for the legend |
| `eco-legend-panel.tsx` | Shows size string + audit failure |
| `test/check-glb-h1.mjs` | House under budget **without** meshopt; hard-fails corrupt / empty / cm / km / mesh-per-element / bad textures; Oak Leaf numbers |

Also fixed `stampWalkExtras` JSON chunk padding: spaces (`0x20`) per glTF spec.

## Numbers — real Oak Leaf

Source: [`oak-leaf-massing.glb`](https://raw.githubusercontent.com/SacredRebel/sulphur-mountain-world/main/models/oak-leaf-massing.glb) — thin curved shells + ribbed roofs (the topology weld/meshopt handle worst).

| Profile | Bytes | Triangles | `extensionsRequired` | Under 500 KB? |
|---|---|---|---|---|
| Raw | **2 154 696** | 51 348 | `[]` | no |
| `compat` | **1 319 580** | 51 348 | `KHR_mesh_quantization` | **no** |
| `web` (meshopt) | **439 112** (20.4%) | 51 348 | meshopt + quantization | **yes** |

**Finding:** the massing only clears 500 KB with meshopt headroom. That is a real density finding for the Python-built GLB, not a pipeline failure. Parametric studio exports stay on `compat` and must not need meshopt (asserted in `check-glb-h1.mjs`).

### Pipeline proof (stand-in, not the budget)

| Asset | Before | After | Notes |
|---|---|---|---|
| Parametric house (`compat`) | ~16.4 KB raw | ~16.4 KB stamped | No meshopt; under 500 KB; sizeLabel shown |

## Hard audit failures (deliberate)

- Corrupt bytes → parse throw  
- Empty scene → `HARD FAIL: no triangles`  
- 5000 m cube → `HARD FAIL: … above max 500 m`  
- 0.08 m “house” → `HARD FAIL: … below min 0.5 m`  
- 5 meshes / 1 material → `HARD FAIL: one mesh per material`  
- Non-PoT or 1024² texture → `HARD FAIL` (ceiling **512**)

## World probe (engine side)

`window.world.probeModel(url)` → `{ meshes, triangles, floors, solids }` — reads `extras.walk` the same way `structures.ts` does. Use it on a hosted export URL during the H0 human pass so a green probe means the world would see the walk data, not only that the file parses.

## Route checks

Do **not** grep HTML/RSC for “This page could not be found” — that string is in every page payload including `/`. Use the `x-matched-path` response header. Studio iframe target: `https://architect-editor-snowy.vercel.app/embed` (world fix `1baefa4`; overridable with `?builder=`).

## Checks

- `bun packages/plugin-eco/test/check-glb-h1.mjs test/oak-leaf.glb` — OK  
- `bun packages/plugin-eco/test/check-export.mjs` — OK  
- `bun packages/plugin-eco/test/check-trees.mjs` — OK  
- `bun packages/plugin-eco/test/check-materials.mjs` / `check-h12.mjs` / `check-shell.mjs` — OK  

## Commit

`eco(H1): …` on this change set.
