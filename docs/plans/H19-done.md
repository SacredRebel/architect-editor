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

## H19.0 — measurement only (corrected 27 Sep)

The first H19.0 table (before 14.99 / after 59.88) is withdrawn. Its before was a 4 s idle rAF sample. Its after sampler counted display refreshes (59.88) while the renderer produced 50 frames a second (HUD 50). Both sides were recaptured with the same harness, same machine and same Chrome, on the same 20 s orbit, counting rendered frames:

| | Before (`a07fde17` = H17.0 + probe) | After (`1147fa69`) |
|---|---|---|
| Rendered fps, median of 1 s bins | **50** | **50** |
| Per-frame fps, 1st percentile | **29.94** | **29.94** |
| Frames: sampler vs HUD | 1000 vs 1000 | 1000 vs 1000 |
| DPR on a 1× display | 1.0 | 1.5 (detect-gpu `medium`) |

The full table, the explanation of the exact match, the probe diff and the method are in `H17-done.md` → *After numbers*.

Commits on `eco/h19`: `b88c1166` (inbox) · `1147fa69` (render-counting probe, harness, check) · `64321121` after capture · `7d611008` before capture. Probe tree: `eco/h17-0-probe` @ `a07fde17`.

**Housekeeping (reply-21 §3).** Five commits here share author `21:49:27-07:00` and committer `21:50:45-07:00`, including `341c4019` and `c52f39a1`, which were made after the `23:44` merge. Both fields frozen means `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` were exported in the Cursor terminal. Neither is set in the user or machine environment (checked), and neither is in `.gitconfig`, so the pin died with that session. Commits from this session carry real times. The four capture/profile commits are pinned deliberately to their artifacts' `capturedAt`.

**Left uncommitted, for the architect.** `bun install` under Bun **1.4.2** (not the pinned 1.3.14; that is what is on PATH here) added one line to `bun.lock`: `"detect-gpu": "^5.0.70"` under `packages/viewer`'s dependencies. `package.json` has declared it since H17.1 and the lockfile never recorded it. The `h0-*` files remain untracked and untouched.

## H19.1 — profile (choose nothing)

No H19 brief file exists in `docs/plans/` or in history. This profile covers the scope the architect named: where the frame goes, CPU vs GPU, shadow passes, upload, materials and worst draw calls, plus reply-21's hitches, load and detected tier. Nothing below is changed yet.

Instrument: `packages/viewer/test/profile-h19-1.mjs` on tree `7165f620`, the after tree plus a `three()` accessor on the `?perf` probe. It runs the same 20 s orbit, served locally as above, on an Intel Xe-LPG over **WebGPU**. `CLAUDE.local.md` says this machine has no GPU; it has an integrated one. Artifacts: `h19-1-profile.json` and `h19-1-load.json`.

### Where the frame goes (budget 20 ms at the 50 fps cap)

| Share | Median | Max | Source |
|---|---|---|---|
| CPU, whole frame (`frame-cpu` around `advance()`) | **1.20 ms** | 2.74 ms (window max 5.7) | HUD tracks |
| CPU, render encode | 0.84 ms | 1.96 ms | HUD tracks |
| GPU, timestamp query | **7.55 ms** | 8.76 ms (window max 10.8) | HUD tracks |
| Submit → GPU done | 15.6 ms | **51.2 ms** | HUD tracks |
| Systems | `pointer` 0.14 ms/frame | 1.2 ms | only track that fired |

The frame is **GPU-weighted and cap-bound**: about 8.8 of 20 ms are used, and CPU work is about an eighth of GPU work. The submit→done spike of 51 ms did not surface as a dropped frame locally (render interval max 34 ms). It is the one candidate here for the production hitch in the first after run (183 ms).

### Passes (6 `render()` calls per frame, every frame)

| # | Target | Camera | Draws | Tris |
|---|---|---|---|---|
| 1 | ShadowMap 1024² + depth | ortho | **0** | 0 |
| 2 | ShadowMap **4096²** + depth (`eco-sun`) | ortho | **0** | 0 |
| 3–5 | output 1380×1057 + depth, three scene passes | perspective | 9 · 1 · 4 | 4,285 · 1,984 · 2,080 |
| 6 | canvas, fullscreen pipeline quad | ortho | 1 | — |

### Attribution (in-page toggles, restored; 8 HUD windows each)

| Condition | GPU ms | CPU ms |
|---|---|---|
| baseline / baseline again | 7.48 / 6.22 | 1.14 / 0.68 |
| shadow casting off, all lights | 6.23 | 0.66 |
| **dpr 1.0** (from 1.5) | **3.42** | 0.67 |

### Lines the profile names (in order of what they block)

1. **The cap, not the work, sets both fps numbers.** `FrameLimiter` `maxFps = 50` (`viewer/index.tsx:457`) on a 60 Hz display. Renders land on vsync, so five intervals are 16.7 ms and every sixth is 33.3 ms. The median target (60) is unreachable, and the per-frame p1 is 30 by construction on any tree. The p1 ≥ 45 target is not a performance problem on this scene; it is a cadence setting.
2. **GPU time is pixels.** AdaptiveDpr starts at `min(cap, devicePixelRatio)` and steps +0.25 up to the tier cap when frames are fast (`adaptive-dpr.tsx:22,46`). On a 1× display at `medium` it settles at 1.5, rendering 2.25× the pixels through the post-processing pipeline. dpr 1.0 cuts GPU time by about 45% (6.2–7.5 → 3.4 ms).
3. **Shadow passes run every frame and draw nothing.** Two directional lights cast: one at 1024² and `eco-sun` at 4096², hard-coded at `plugin-eco/src/eco-site-sky.ts:189` outside the tier sizes (512–2048). The scene has **0 visible casters**, so both passes issue 0 draws. H17.1's "shadow update discipline" sets only `gl.shadowMap.needsUpdate` (`lights.tsx:110,239`). Nothing sets `autoUpdate = false`, and both lights read `shadow.autoUpdate: true`. Measured cost here is within noise (6.23 vs 6.22 ms), because there is nothing to draw. With casters in a real design it becomes two full scene passes per frame, one of them at 4096².
4. **Upload is not per-frame.** Textures 19 → 19, geometries 19 → 19, heap flat over 20 s of motion. Resident GPU memory is **203 MB** for 9 drawables and 8,350 tris. A 4096² depth map alone is 64 MB at 4 bytes a texel, and the pipeline's targets are sized for dpr 1.5.
5. **Materials are few.** 9 unique: 5 `MeshBasicMaterial`, 2 `MeshLambertNodeMaterial`, 1 `MeshBasicNodeMaterial`, 1 `LineBasicMaterial`; 6 are transparent.
6. **Worst draw calls.** `eco-sky` at 2,208 tris (`MeshBasicMaterial`, `frustumCulled: false`), then a 63-tri ground mesh; everything else is ≤ 32 tris. `drawComposition()` reports 0 items. **This scene is the empty site the H17 path has always used**, so it cannot rank item, wall or model draws. Ranking those needs a loaded-design fixture on the same path, and H19.2 should not choose a draw-call cut from this scene.
7. **Load is bytes, not rendering.** Production (`architect-editor-snowy.vercel.app/?perf`), one cold load with cache disabled, in the same Chrome on this machine's connection: TTFB 2.26 s, DCL 2.95 s, **FCP 10.2 s**, load 18.7 s, 164 requests, **6.4 MB transferred, of which 5.9 MB is script**. One chunk (`159orxkje4b4r.js`) is **2.9 MB** and finishes at 18.4 s. The same build on loopback loads in ~270 ms. One sample on one connection; the chunk's contents are not yet identified.
8. **Tier.** detect-gpu returns `medium` for this Xe-LPG. It is now visible as `data-gpu-quality` / `data-gpu-quality-resolved` on `<html>` and in the artifacts; the first after run recorded `null` because the attribute did not exist.

Local trees were measured throughout. The probe tree was not deployed, so no Vercel preview was involved; production was used only for the load line.

```bash
# Chrome --remote-debugging-port=9222 on the after tree's ?perf page
TREE_SHA=<sha> bun packages/viewer/test/profile-h19-1.mjs
LOAD_URL=https://architect-editor-snowy.vercel.app/?perf bun packages/viewer/test/profile-h19-1.mjs --load
```

Next: **H19.2 chooses** from lines 1–7. Not started.
