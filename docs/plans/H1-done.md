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
| `test/check-glb-h1.mjs` | House export passes; corrupt / empty / 5 km box **fail**; **real Oak Leaf** → &lt;500 KB |

Also fixed `stampWalkExtras` JSON chunk padding: spaces (`0x20`) per glTF spec (nulls broke `@gltf-transform` parse).

## Numbers — real Oak Leaf (acceptance)

Source: [`oak-leaf-massing.glb`](https://raw.githubusercontent.com/SacredRebel/sulphur-mountain-world/main/models/oak-leaf-massing.glb)

| | Before | After (`web`) |
|---|---|---|
| Bytes | **2 154 696** | **439 112** (20.4%) |
| Triangles | 51 348 | 51 348 (unchanged) |
| Textures | 0 | 0 |
| Extent (m) | 55.45 × 14.8 × 49.9 | same |
| Extensions | — | `EXT_meshopt_compression`, `KHR_mesh_quantization` |

Hard audit passes at `maxBytes: 500 KB`. Fixture: `packages/plugin-eco/test/oak-leaf.glb` → `oak-leaf.web.glb`.

### Pipeline proof (stand-in, not the budget)

| Asset | Before | After | Notes |
|---|---|---|---|
| Parametric house (`compat`) | 8 664 B raw | 12 612 B stamped | Walk extras grow JSON |
| High-poly stand-in (different topology) | 1 964 540 B | 87 860 B | Proves the gate only — **not** the Oak Leaf number |

## Hard audit failures (deliberate)

- Corrupt bytes → parse throw  
- Empty scene → `HARD FAIL: no triangles`  
- 5000 m cube → `HARD FAIL: world extent … above max`

## Loader note for Agent B

`web` output needs MeshoptDecoder (drei `useGLTF` has it; raw Three / model-viewer need it wired). World `eco:glb` uses **`compat`** so plain `GLTFLoader` keeps working.

## Checks

- `bun packages/plugin-eco/test/check-glb-h1.mjs test/oak-leaf.glb` — OK (real Oak Leaf)
- `bun packages/plugin-eco/test/check-export.mjs` — OK
- `bun packages/plugin-eco/test/check-roundtrip.mjs` — OK

## Commit

`eco(H1): …` on this change set.
