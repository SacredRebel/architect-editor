# H19 — performance close-out

## H19.0a — hygiene (checks green)

Branch `eco/h19`.

### What was wrong

`main` at H18 was production READY on **build**, but `bun run checks` was not green. Biome format/import drift and type errors meant READY had meant “build only.” From this phase on, READY in this lane means **build and checks**, and done-files quote both.

### Commit 1 — formatting only

`biome format --write` then `biome check --write --linter-enabled=false` (organize imports; no lint autofixes).

- Diff is Biome’s output only: whitespace, wrapping, quotes, and import/export order.
- `bun run build` green **before** and **after** this commit.
- Lint autofixes that change control flow (optional chaining, `Math.pow` → `**`, dependency-array edits, removing unused members, etc.) were **not** applied. Those files remain listed under “deferred lint wants” below as warnings/infos; they do not fail `biome check` at error level after the format pass.

### Commit 2 — type errors (and the one biome error)

Named from the machine proof, fixed in `plugin-geometry` without `!` / `as any` / `@ts-ignore`:

| Site | Fix |
|---|---|
| `sol.meta.edgeMean` (`build.ts`) | Local narrow + `?? 0` — `Record<string, number>` index access |
| `unitsPerPixel` (`floorplan-overlay.tsx`) | Initially null-guarded; follow-up `3039f529` returns `null` when render context is absent (no invented `0.01` scale) |

Also required for `bun run checks` green (surfaced once geometry was fixed):

| Site | Fix |
|---|---|
| `apps/editor/lib/local-scene-store.ts` | Guard `prev` after index lookup before spread |
| `apps/editor/lib/mock-image3d.ts` | Copy slice into a fresh `Uint8Array` for `Response` body |
| `packages/editor` `PaintHoverInfo` | Re-export existing type (WebXR plugin import) |
| `apps/editor/draco3dgltf.d.ts` | Module declaration so editor tsc sees `draco3dgltf` |
| `apps/editor/tsconfig.json` | Exclude `out/`; include the d.ts |
| `first-person-controls.tsx` forEach | Block body so `dispose()` return is not an iterable callback value (sole biome **error**) |

No upstream-only blocker: all fixes stayed in this fork’s tree.

### Commit 3 — gate

CI already ran `bun run check` and `bun run check-types` as separate steps. Replaced them with a single **`bun run checks`** step in `.github/workflows/ci.yml` so the named lane gate cannot drift. Added `.cache/` to `.gitignore`.

### Deferred lint wants (not error-level; left for later)

Biome still reports **warnings/infos** (optional chain, import type, exhaustive-deps infos, `Math.pow`, unused private members, etc.). They do not fail `bun run checks`. Full autofix was refused for H19.0a commit 1 because those edits are semantic.

### Leftovers for the architect (not deleted, not committed)

```
packages/plugin-eco/test/h0-b64-chunks.json
packages/plugin-eco/test/h0-cdp-params.json
packages/plugin-eco/test/h0-chunk-0.txt
packages/plugin-eco/test/h0-chunk-1.txt
packages/plugin-eco/test/h0-chunk-2.txt
packages/plugin-eco/test/h0-chunk-3.txt
packages/plugin-eco/test/h0-inject-0.js
packages/plugin-eco/test/h0-inject-1.js
packages/plugin-eco/test/h0-inject-2.js
packages/plugin-eco/test/h0-inject-3.js
packages/plugin-eco/test/h0-probe-expr.js
packages/plugin-eco/test/h0-probe-result.json
packages/plugin-eco/test/h0-two-rooms.b64.txt
packages/plugin-eco/test/make-chunk-exprs.mjs
packages/plugin-eco/test/make-h0-probe-expr.mjs
```

### Gate (H19.0a)

| Check | Result |
|---|---|
| `bun run checks` | green |
| `bun run build` | green |

Commits on `eco/h19`: `1416c8d3` (format) · `3535b230` (types) · `992bf63e` (CI + ignore + docs) · `3039f529` (overlay null). Merged to `main` as **`121d1ebc`** (merge commit, not squash).

Next: **H19.0** — re-measure FPS (before/after table in `H17-done.md`); change nothing else in that commit.
