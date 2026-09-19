# E2 done

Added `eco/1` postMessage bridge (`bridge-types.ts` verbatim, `bridge.ts` origin lock + 3s hello timeout, z-north↔z-south conversion in `coords.ts`). Scene export + load-scene apply stubs; caps currently `['scene']`. Embed shows Exit→`eco:close` after hello. Harness: `packages/plugin-eco/test/bridge.html` (also copied to `out/eco-bridge.html` on static build).

Files: `packages/plugin-eco/src/{bridge,bridge-types,coords,eco-exit-button,index}*`, `test/bridge.html`, `apps/editor/app/embed/page.tsx`, `scripts/eco-static-build.mjs`.

Verified:
- `bun test packages/plugin-eco/src` — z-sign round-trip passes
- `bun run check-types --filter=@eco/plugin-eco`; `bun run build --filter=editor`
- Console transcript (unit):
  ```
  (pass) site z-north converts to world z-south by negating z
  (pass) xz round-trip through the bridge sign flip is identity
  2 pass, 0 fail
  ```
- Manual: `bun run build:static && npx serve out` then open `/eco-bridge.html` for hello→ready→load-site→request-export→scene.
