# F5 done

Materials palette + merge-by-material glTF export.

## Built

- `eco-materials` — eight palette entries (stone, river stone, timber, glass, stucco, concrete, living roof, metal) with colour / roughness / metalness / opacity; assignment store + wall/slab/shell defaults.
- `eco-materials-panel` host panel — swatches, defaults, per-shell assignment.
- GLB export consolidates tagged meshes to **one mesh per material** (`consolidateByEcoMaterial`); glass uses opacity so exporter writes `alphaMode: BLEND`.
- Shell render/export picks the resolved Eco material.

## Verified

- `bun packages/plugin-eco/test/check-materials.mjs` — 6 materials, 6 meshes, glass `BLEND`
- `bun packages/plugin-eco/test/check-export.mjs`
- `bun packages/plugin-eco/test/check-shell.mjs`
- `bun run check-types --filter=@eco/plugin-eco`

## Decision

Merge strips UVs so box (UV) and shell (no UV) geometries can share a material bucket. Placed assets stay outside the merge so their own materials are untouched.
