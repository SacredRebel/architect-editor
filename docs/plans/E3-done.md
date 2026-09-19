# E3 done

`eco:load-site` applies heightfield via `commitTerrainField` on the root site (heights − `originElevM`), expands the site polygon, and drives guides/ghost/compass through a viewer presentation + Eco site legend panel. Caps: `['site','scene']`. Fixture: `test/make-fixture.mjs` → `fixture.glb` (~2KB) + b64; harness sends a 64×64 hill + 3 guides + refGlb.

Files: `packages/plugin-eco/src/{apply-site,eco-site-store,eco-guides,eco-ghost,eco-compass,eco-presentation,eco-legend-panel,eco-ui,bridge}*`, `test/{bridge.html,make-fixture.mjs,fixture.glb*}`, `apps/editor/lib/bootstrap.ts`.

Verified: `bun test packages/plugin-eco/src`; `bun run check-types --filter=@eco/plugin-eco`; `bun run build --filter=editor`. Harness: `build:static` then `npx serve out` → `/eco-bridge.html` (hello → load-site → scene). Screenshot: open harness, draw a wall on the hill with guides visible — capture into this folder as `E3-screenshot.png` when reviewing.
