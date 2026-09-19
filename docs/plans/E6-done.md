# E6 done

GLB + walk export to the world. `export-glb.ts` builds design meshes (wall/slab boxes + placed assets), mirrors into z-south (`scale.z = -1`), and stamps `extras.walk` on the GLB scene and root node. `export-walk.ts` derives `EcoWalk`: slabs → floors, walls → solids, door openings split wall solids. Eco site panel **Send to world / Download GLB**; bridge answers `eco:request-export` `glb` with `eco:glb` (caps include `glb`). Rings are open (host closes). Acceptance: `bun packages/plugin-eco/test/check-export.mjs` (also hooked from `make-fixture.mjs`).

Files: `packages/plugin-eco/src/{export-glb,export-walk,level-y,bridge,eco-legend-panel,index}*`, `test/{check-export.mjs,make-fixture.mjs}`.

Verified: `bun run check-types --filter=@eco/plugin-eco`; `bun packages/plugin-eco/test/check-export.mjs` → floors ≥ 2, south wall door split, north wall z < 0, scene+node `extras.walk`.
