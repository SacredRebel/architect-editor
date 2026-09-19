# E1 done

Env-gated static export (`ECO_STATIC=1`, `basePath`/`assetPrefix` from `ECO_BASE_PATH`, default `/builder`) via `apps/editor` `build:static`. Added `/embed` full-viewport editor (sets `window.ecoEmbedded` when framed). Scene API callers capability-detect and fall back to localStorage; static build temporarily hides `app/api` then restores it; export nested under `out/builder/` for `npx serve out` → `/builder/embed`.

Files: `apps/editor/next.config.ts`, `package.json`, `scripts/eco-static-build.mjs`, `app/embed/page.tsx`, `lib/eco-mode.ts`, `lib/local-scene-store.ts`, scene/scenes/import clients, `save-button.tsx`, `scene-loader.tsx`, `turbo.json`.

Verified: `bun run build --filter=editor` (non-static); `bun run build:static` succeeds with `/embed` and `eco: plugin registered` in the static page pass.
