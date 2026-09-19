# E4 done

"My assets" host panel: import ≤8MB `.glb`/`.gltf`, placeholder thumbnails, Place → plugin-managed meshes with TransformControls. Assets serialize into `eco:scene` as `ecoAssets` (bytes stripped with `eco:error` if total >20MB). localStorage keeps names/hashes/thumbs only. Caps: `['site','scene','assets']`.

Files: `packages/plugin-eco/src/{eco-assets-store,eco-assets-panel,eco-placed-assets,eco-presentation,eco-ui,bridge,index}*`, `apps/editor/lib/bootstrap.ts`.

Verified: `bun run check-types --filter=@eco/plugin-eco`; `bun run build --filter=editor`. Manual: place two copies of `test/fixture.glb`, rotate one, export/reload scene via harness.
