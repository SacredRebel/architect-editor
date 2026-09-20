# H2 done — real trees (ez-tree)

## Repo drawn on

- [pascalorg/plugin-trees](https://github.com/pascalorg/plugin-trees) (MIT) — Nature plugin pattern / preset map  
- [@dgreenheck/ez-tree](https://github.com/dgreenheck/ez-tree) `1.1.0` (MIT) — procedural generation  

## What shipped

| Piece | Role |
|---|---|
| `eco-trees-store.ts` | Six variants (3 oak + 3 chamise/bush); tiny placements (no GLB bytes) |
| `eco-tree-mesh.ts` | Browser: ez-tree `loadPreset`+`generate`; Node: cone/sphere stand-in |
| `eco-trees.tsx` | **InstancedMesh** bark+leaves per variant; **distance gate at 120 m** (Y-scale flatten only — **not** true impostor cards; those land with the world pack) |
| `eco-trees-panel` | Place UI inside My assets (no `packages/editor/**` / bootstrap change) |
| `export-glb` | Bakes trees into `eco:glb` → arrive in the world |
| `eco-scene` | `ecoTrees` serialize / restore / round-trip |

## Variants

`oak-small` · `oak-medium` · `oak-large` · `chamise-a/b/c` (ez-tree Bush 1–3 — chaparral stand-in; ez-tree has no chamise preset)

## Checks

`bun packages/plugin-eco/test/check-trees.mjs` — OK  
- 6 variants; eco:scene round-trip  
- Export with tree **6776 B** > bare **2276 B**  
- 3000 instances → **12** draw calls vs **3000** blob draws (≪ 20%)  
- Impostor distance constant **120 m** — **cards not implemented**; only a cheap silhouette scale past that range

Also: check-export + check-roundtrip green.

## Note for world / Agent C

Lidar scatter of 3,663 pack points stays on the world side; studio places variants and ships them in the GLB. World can instance the same presets from pack points using the same variant ids.
