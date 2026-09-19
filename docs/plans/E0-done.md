# E0 done

Scaffolded `@eco/plugin-eco` (empty `Plugin` manifest) and registered it from `apps/editor/lib/bootstrap.ts` only when `NEXT_PUBLIC_ECO=1`. Logged `eco: plugin registered` on plugin module load.

Files: `packages/plugin-eco/*`, `apps/editor/lib/bootstrap.ts`, `apps/editor/package.json`, `apps/editor/next.config.ts`, `turbo.json`, `docs/plans/E0-notes.md`, `docs/plans/E0-done.md`, `docs/plans/ECO-DEVPLAN-01.md`.

Verified: `bun run check-types` and `bun run build --filter=editor` with `NEXT_PUBLIC_ECO` unset; plugin is not discovered unless `NEXT_PUBLIC_ECO=1`.
