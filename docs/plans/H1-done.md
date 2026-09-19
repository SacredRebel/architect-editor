# H1 done — GLB optimise + hard audit

## Repo drawn on

[pascalorg/skills](https://github.com/pascalorg/skills) · skill `glb-web-export` (MIT — confirmed in skill frontmatter / README).

Adapted: measure → decide → apply → verify. Used `@gltf-transform/*`, `meshoptimizer`, `draco3dgltf` (allowed in Agent A brief). Did **not** vendor unclear-licence code. No KTX/`ktx` CLI (Windows/embed constraint) — JPEG resize for textured assets; meshopt for the `web` download profile.

## What shipped

| Piece | Role |
|---|---|
| `src/glb-audit.ts` | Audit report + **`assertHardGlbAudit`** — throws, does not warn |
| `src/glb-optimise.ts` | `compat` (quantize, world eco:glb) · `web` (meshopt + quantize, architects download) |
| `exportEcoGlb` | Always optimises → stamps walk → **hard-audits** before return |
| `test/check-glb-h1.mjs` | House export passes; corrupt / empty / 5 km box **fail**; large stand-in → &lt;500 KB |

Also fixed `stampWalkExtras` JSON chunk padding: spaces (`0x20`) per glTF spec (nulls broke `@gltf-transform` parse).

## Numbers

| Asset | Before | After | Notes |
|---|---|---|---|
| Parametric house (`compat`) | 8 664 B raw export | 12 612 B stamped | Walk extras grow JSON; under 500 KB; check-export / roundtrip green |
| Oak Leaf **stand-in** (1.96 MB high-poly massing, Oak Leaf scale ~51×12×28 m) | **1 964 540 B** | **87 860 B** (4.5%) | `web` profile; triangles unchanged 83 456; requires `EXT_meshopt_compression` + `KHR_mesh_quantization` |

Live Oak Leaf `refGlb` from spatial-map is ~2.15 MB base64 (~2.1 MB binary). Same pipeline applies:  
`bun packages/plugin-eco/test/check-glb-h1.mjs path/to/oak-leaf.glb`  
(Browser sandbox could not POST the live payload to localhost; stand-in proves the gate.)

## Hard audit failures (deliberate)

- Corrupt bytes → parse throw  
- Empty scene → `HARD FAIL: no triangles`  
- 5000 m cube → `HARD FAIL: world extent … above max`

## Loader note for Agent B

`web` output needs MeshoptDecoder (drei `useGLTF` has it; raw Three / model-viewer need it wired). World `eco:glb` uses **`compat`** so plain `GLTFLoader` keeps working.

## Checks

- `bun packages/plugin-eco/test/check-glb-h1.mjs test/oak-leaf-standin.glb` — OK  
- `bun packages/plugin-eco/test/check-export.mjs` — OK (13 152 B)  
- `bun packages/plugin-eco/test/check-roundtrip.mjs` — OK (18 252 B)

## Commit

`eco(H1): …` on this change set.
