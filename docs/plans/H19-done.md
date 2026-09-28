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

The first H19.0 table (before 14.99 / after 59.88) is withdrawn. Its before was a 4 s idle rAF sample. Its after sampler counted display refreshes (59.88) while the renderer produced 50 frames a second. Both sides were recaptured with one harness, one Chrome and the same 20 s orbit on the same empty site. This time frames are counted from the renderer and render time is measured beside them:

| | Before `a0ca4ca4` (H17.0 + probe) | After `272ba6b6` (H17.1 applied) |
|---|---|---|
| **renderMs median / p99** | **4.13 / 4.92** | **6.82 / 9.50** |
| Rendered fps (median of 1 s bins) | 50 | 50 |
| Per-frame fps p1 | 29.94 | 29.94 |
| Frames sampler vs HUD | 1000 vs 1000 | 1000 vs 1001 |
| DPR on a 1× display | 1.0 | 1.5 (detect-gpu `medium`) |

Full table, method, probe diff and the plain paragraph on what H17.1 bought: `H17-done.md` → *After numbers*. Pair commit `43bc8119`. Superseded pairs are named there.

**Housekeeping (reply-21 §3).** Five commits here share author `21:49:27-07:00` and committer `21:50:45-07:00`, including `341c4019` and `c52f39a1`, which were made after the `23:44` merge. Both fields being frozen means `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` were exported in the Cursor terminal. Neither is set in the user or machine environment or in `.gitconfig`, so the pin ended with that session. Commits from this session carry real times. Capture and profile commits are pinned deliberately to their artifacts' `capturedAt`. One consequence: `0efe5b37` (captured 05:09:50Z) sits on a parent committed at 05:11:16Z, because the check was committed before the artifact.

**Tooling.** Bun on this machine is **1.4.2**; the repository pins **1.3.14**. The pin is unchanged this phase, and all checks ran on 1.4.2. `bun install` under 1.4.2 added the one `detect-gpu` line the lockfile had been missing since H17.1. It is committed on its own as `15f35580 chore: lock detect-gpu`. The `h0-*` files remain untracked and untouched.

**The command that failed.** In the final gate run of the previous report, `bun run checks` exited 1; `bun run build`, `check-h17-perf` and its `--self-test` exited 0. Biome's formatter rejected `packages/viewer/test/h19-1-profile.json`: the profile script writes `JSON.stringify(…, null, 2)`, which puts each element of a short number array on its own line, while Biome wants `[1380, 1057]` on one. That's content-identical JSON, fixed in `9597cd9c`, and checks were green before the done commit. The three background `next start` tasks that reported exit 127 were servers I stopped myself.

## H19.1 — profile (choose nothing)

**Scope.** The H19 brief never reached the repository (`docs/plans/inbox/2026-09-26-brief-H19.md` had not arrived when this was written). The scope used is the one quoted in the architect's reply: CPU vs GPU bound, time in shadow passes, time in geometry upload, the number of distinct materials and programs, and the worst draw calls by cost.

**Instrument.** `packages/viewer/test/profile-h19-1.mjs` runs on tree `272ba6b6`, over the same 20 s orbit on the empty site. It first clears the origin's storage and reloads with a WebGPU call hook installed. Artifact `h19-1-profile.json` (`cf088a8a`). The hardware is an Intel Xe-LPG over WebGPU; `CLAUDE.local.md`'s "no GPU" is wrong for this box. Production load timing: `h19-1-load.json` (`a53f689c`).

**`three()` and the production bundle.** It ships but is inert. The accessor is in the built chunk (`three:()=>u()` in `apps/editor/.next/static/chunks/3de-pdz6v6j4z.js`), along with the rest of upstream's probe (`drawComposition`, `projectNode`, …). `window.__pascalPerf` is assigned only inside `PerfMonitor`'s effect, and `PerfMonitor` mounts only when `perf || PERF_OVERLAY_ENABLED` (`viewer/index.tsx:851`); no host passes `perf`. It can't be made absent without a product change, because the gate is a runtime check of `location.search` (`lib/gpu-perf.ts:10`), not a build constant. Removing it would mean turning upstream's `PerfMonitor` into a dynamic import.

### Line 1 — the frame is capped at 50 fps, so fps cannot show a gain

`FrameLimiter` advances the renderer only on a 1000/fps ms grid, and the viewer's `maxFps` defaults to **50**.
- **Where it comes from:** upstream Pascal. `FrameLimiter` arrived with upstream's viewer (`5c16aa42`). Upstream made the cap a prop in `f8838200` (#671, "make the frame cap configurable"), keeping 50 as "the value the viewer has always used". H17.1 did not set or tier it.
- **Is it ours to change?** Not in this phase. The only `<Viewer>` in `apps/editor` is mounted by upstream's `<Editor>` (`packages/editor/src/components/editor/index.tsx:1168, 1530`), which passes no `maxFps`. Raising it means editing upstream packages outside `plugin-eco`. It's also a product trade (GPU and battery vs judder on 60 Hz+ displays), not a performance fix.
- **Consequences:** "60 fps median" was never reachable. Renders land on vsync, so on a 60 Hz display every sixth interval is 33 ms and the per-frame p1 is 30 by construction. Every fps number in H17 and H19.0 is the cap. **Until the cap is lifted, only render time can show an improvement**, so the capture now reports `renderMs` median and p99 beside the interval.

### Line 2 — AdaptiveDpr renders 2.25× the pixels on a 1× display

detect-gpu resolves this box to `medium`, and AdaptiveDpr climbs to that tier's cap of 1.5 on a devicePixelRatio-1 display. That is 2.25× the pixels for no visible gain, at the same 50 fps. It is a regression H17.1 shipped: `renderMs` went 4.13 → 6.82 ms (p99 4.92 → 9.50), and dpr 1.0 in-page cuts GPU time about in half (6.1 → 3.2 ms). The same loop also has the sampler's fault: `adaptive-dpr.tsx` judges "fast" from its own rAF interval (`dt < 17`), which on a 60 Hz display is always true. So it climbs to the cap whatever the GPU cost, and only main-thread jank can bring it down. Addressed in H19.2a (the clamp); the meter itself is named here, not chosen.

### Line 3 — CPU vs GPU

| Share of the 20 ms frame (50 fps cap) | Median | Max |
|---|---|---|
| CPU, whole frame (`frame-cpu` around `advance()`) | 1.11 ms | 2.38 ms |
| CPU, render encode | 0.82 ms | 1.73 ms |
| GPU, device timestamps | **7.29 ms** | 8.50 ms |
| Submit → GPU done | 16.3 ms | 28.8 ms |

**GPU-bound within the cap**: GPU work is about 6× CPU work, and both fit under 20 ms with room to spare. The only per-frame system track that fired is `pointer`, at 0.14 ms a frame.

### Line 4 — where the GPU time goes, pass by pass

Device timestamps per render context, keyed by context id and order within the frame. Over 396 resolves the passes sum exactly to the frame's 6.03 ms:

| # | Pass | GPU ms | Share | Draws · tris |
|---|---|---|---|---|
| 2 | output 1380×1057, main scene pass (MRT) | **3.34** | 55% | 9 · 4,285 |
| 1 | canvas, post-processing composite | 1.51 | 25% | 1 |
| 5 | output 1380×1057, second scene pass | 0.59 | 10% | 1 · 1,984 |
| 6 | output 1380×1057, third scene pass | 0.59 | 10% | 4 · 2,080 |
| 3 | ShadowMap 1024² | 0.000 | 0% | 0 |
| 4 | ShadowMap 4096² (`eco-sun`) | 0.000 | 0% | 0 |

### Line 5 — time in shadow passes

Two passes run every frame. `eco-sun` is hard-coded at 4096² in `plugin-eco/src/eco-site-sky.ts:189`, outside the tier sizes (512–2048). The empty site has **0 casters**, so both passes draw nothing and cost nothing measurable: toggling casting off gives 6.19 vs 6.09/6.11 ms baseline.

**H17.1's shadow discipline is a no-op on this renderer.** `lights.tsx:103` sets `gl.shadowMap.autoUpdate = false`, a WebGL-renderer flag. three's WebGPU `ShadowNode` reads only the per-light `shadow.needsUpdate || shadow.autoUpdate` (`three/src/nodes/lighting/ShadowNode.js:800`), and both lights read `shadow.autoUpdate: true`. `check-h17-1` passes on a string match, so it could never have failed on behaviour.

**Measurement caveat.** The device timestamps also read 0.000 for both shadow passes in an uncommitted run where two meshes cast (6 draws each). The per-pass shadow number is therefore not trustworthy, and shadow cost has to come from the toggle. In that same run, toggling was worth about 0.6 ms.

### Line 6 — time in geometry upload

From the WebGPU hook, installed before a reload. "load" runs until the orbit starts; ms are CPU wall time of the call.

| | Calls | Bytes | ms |
|---|---|---|---|
| load: `createBuffer(mappedAtCreation)` (geometry) | 62 | 370 KB | 0.4 |
| load: `createBuffer` | 64 | 42 KB | 0.2 |
| load: `writeTexture` | 2 | 1.0 MB | 1.2 |
| load: `writeBuffer` | 498 | 2.7 KB | 3.5 |
| load: `createTexture` (render targets) | 51 | 295 MB allocated | 0.5 |
| **orbit: `writeBuffer` (uniforms)** | 3,314 | 9.7 KB | 13.6 over 20 s |
| orbit: anything else | 0 | — | — |

**No geometry uploads per frame.** Motion costs about 3 small uniform writes a frame (166 a second, 0.7 ms/s of CPU). Geometry upload is a load-time cost of well under 1 ms of CPU. The big number is render-target allocation, sized for dpr 1.5 before H19.2a.

### Line 7 — distinct materials and programs

- **9 materials:** 5 `MeshBasicMaterial`, 2 `MeshLambertNodeMaterial`, 1 `MeshBasicNodeMaterial`, 1 `LineBasicMaterial`; 6 are transparent.
- **Programs:** 43 shader modules and 25 render pipelines, all at load; **0** created during motion.

### Line 8 — worst draw calls by cost

Each drawable is hidden in turn and `renderMs` is read against baselines before and after (device timestamps, one sample per resolve):

| Draw | GPU cost (ms) | Baseline drift (ms) |
|---|---|---|
| `eco-sky` (2,208 tris, `MeshBasicMaterial`, not frustum-culled) | **1.11** | 0.26 |
| ground mesh (63 tris) | 0.26 | 0.13 |
| everything else | ≤ 0.13 or below drift | — |

One draw reads **−1.61 ms** (drift 0.20): hiding it made the frame dearer. The likeliest reading is that it occludes the sky, so hiding it lets more sky pixels be shaded. `drawComposition()` reports 0 items, because this is the empty site the H17 path has always used. It cannot rank item, wall or model draws. That needs a loaded-design fixture on the same path, which is a decision for the architect.

### Line 9 — load (production)

One cold, cache-disabled load of `architect-editor-snowy.vercel.app/?perf` from this machine: TTFB 2.26 s, DCL 2.95 s, **FCP 10.2 s**, load 18.7 s, 164 requests, **6.4 MB transferred, 5.9 MB of it script**. One chunk (`159orxkje4b4r.js`) is **2.9 MB** and finishes at 18.4 s. The same build on loopback loads in about 270 ms. That's one sample on one connection, and the chunk's contents are not yet identified.

## H19.2 — optimise in profile order

### H19.2a — clamp the adaptive dpr to the display (line 2) — landed

`adaptive-dpr.tsx`: the cap is now `min(tier cap, devicePixelRatio)` (`250daa06`). All captures use the same harness, path and empty site:

| | dpr | renderMs median | renderMs p99 | fps median · mean |
|---|---|---|---|---|
| H19.0 after (`272ba6b6`) | 1.5 | 6.82 | 9.50 | 50 · 49.97 |
| **H19.2a (`250daa06`)** | **1.0** | **3.74** | **4.98** | **50 · 49.98** |
| control: H17.0 tree, back-to-back | 1.0 | 3.60 | 4.52 | 50 · 49.92 |

Render time fell **45%** (p99 48%), and **the fps column did not move**. That unchanged column is the proof the cap finding is right: the editor now does half the GPU work per frame, and fps cannot show it. The gain is well outside run-to-run drift: the same H17.0 tree read 4.13 at 05:03 and 3.60 at 05:10, about 0.5 ms apart. The clamped tree now matches the pre-H17.1 tree at dpr 1. On a HiDPI display the tier cap still applies (e.g. 1.5 on a 2× screen at `medium`).

`check-h19-2` checks this. It compares the canvas's own ratio (`width / clientWidth`) with `window.devicePixelRatio`, requires the before to have exceeded the display, and requires `renderMs` to fall and fps to hold, all on the same path and scene. Its `--self-test` forges an after still above the display, a different scene and no gain. Artifact `h19-2a-dpr-clamp.json` (`0efe5b37`).

### How H19.2 is measured from here

**The H19 scene.** `packages/viewer/test/fixtures/h19-scene.json` is built by `make-h19-scene.mjs` (`36d4f897`) and recorded in `fixtures/MANIFEST.md`. It is one small house (8 walls, 4 rooms, 1 slab, 3 doors, 3 windows, a gable roof, 1 stair), 20 catalog items and 30 catalog trees (`tree` ×18, `fir-tree` ×12), on a synthetic EcoSite (a 97 × 97 terrain at 2.5 m, flat within 45 m of the house).
- The generator uses core's own node parsers, checks the graph with `validateBuildJson`, formats with Biome, and writes byte-identical output every run (SHA-256 `abdcd20c…`).
- Every asset is Pascal's own item library, served by the editor under test.
- The ez-tree trees were **not** used: their leaf images have no recorded source (see the manifest).
- The harness loads the scene through the eco/1 bridge, the path the world uses: `eco:hello` → `eco:load-scene` → `eco:load-site`.

**The harness (`d9760995`).** Storage is cleared and seeded from `/api/health`, a same-origin page that runs no editor code. Before, the storage was cleared while the app was still running, so it could write its in-memory scene back. The harness then:
- waits for the fixture's readiness test before posting;
- settles until the HUD's scene counts hold for 3 s;
- reads back the fixture's node counts;
- records a scene census, shadow-map passes per frame, the harness file's SHA-256, emulation and a quality preference.

The census counts objects that are visible, whatever their layer. It therefore includes batched source meshes, which sit on `BATCHED_LAYER` and are not drawn: it identifies the scene, not what a frame draws. The profile counts only camera-drawn objects.

**Protocol (from the architect, 28 Sep).** Each H19.2 line gets one before/after set: the empty site once, and the H19 scene as three interleaved pairs, back to back, each from a fresh tab.
- `renderMs` comes from device timestamps that Chrome quantizes to **0.0655 ms** (2¹⁶ ns). Every recorded value is a multiple of it; an earlier report of 0.131 ms was two steps.
- A median difference under **0.26 ms** is reported as no change and not chased.
- The before and after trees are production builds served side by side (`:3017`, `:3019`) in the same Chrome (1280×800, Intel Xe-LPG, WebGPU).

### H19.2 — eco site guides as WebGPU lines (added by the H19-scene profile) — landed

The profile's top line on the H19 scene. With a site loaded, `eco-guides.tsx` drew the survey line and the other guides with drei's `<Line>`, whose `LineMaterial` is WebGL-only.
- The WebGPU node builder rejected it (`Material "LineMaterial" is not compatible`, 277 times in one run).
- The post-processing pipeline failed and rebuilt 137 times in 30 s, and the viewer fell back to a direct render.
- The world always sends guides, so the embedded editor has been running this loop.

The guides are now `Line2` with `Line2NodeMaterial`, the same screen-space line, with the same width and dashes, for WebGPU (`669d9fa4`).

| H19 scene, three interleaved pairs | before `36d4f897` (drei Line) | after `669d9fa4` |
|---|---|---|
| fps mean | 42.77 · 38.54 · 41.79 | 49.96 · 49.63 · 49.75 |
| per-frame p1 | 10.01 · 8.56 · 8.58 | 29.94 · 29.85 · 29.94 |
| render-interval p99 | 99.9 · 116.8 · 116.6 ms | 33.4 · 33.5 · 33.4 ms |
| `render()` CPU p99 | 87.5 · 117.7 · 103.2 ms | 6.1 · 8.4 · 5.5 ms |
| render calls per frame | 4 (fallback) | 6 (full pipeline) |
| empty site (no guides), `renderMs` median | 4.19 | 4.46 — no change |

`renderMs` is not a like-for-like measure here: the broken tree rendered a fallback without post-processing (0.72 ms). The fix is measured by the frame the user gets: the cap held, p1 up threefold, the stalls gone.
- `check-h19-2-guides` asserts both signals on all three pairs: the renderer's calls per frame back to the full pipeline, and the sampler's interval p99 within two vsyncs. `--self-test` forges an after still on the fallback and an after still stalling.
- Five upstream editor tools also use drei `<Line>` (placement dimension guides, opening guides, the terrain brush cursor, dormer placement, the liquid-line tool). They draw only while their tool is active and are upstream's code; recorded, not changed.

### H19.2b — AdaptiveDpr decides from GPU render time (line 2) — landed

`7969d78f`: `lib/dpr-controller.ts` plus `adaptive-dpr.tsx`.
- **Inputs.** The controller takes three's timestamp-query render time per frame and the achieved render cadence: the time between rendered frames, measured where `useFrame` runs, not display ticks.
- **Step down** when render time exceeds 80% of the frame budget (1000 / `maxFps`), or when frames arrive more than 10% slower than the cap while render time is at least 40% of the frame period.
- **Step up** only at the cap, and only when the cost predicted at the next step (∝ dpr²) fits 50%.
- The H19.2a clamp stays the ceiling.
- Where the ceiling equals the floor (a 1× display, or the `low` tier) the loop cannot move and does no work. In production, timestamps are on only on displays with `devicePixelRatio > 1`, outside immersive sessions.

Why the cadence is an input: the first version read render time only. At emulated 2× density, render-pass timestamps saw 14 ms while frames arrived every 25 ms. Presentation and compositing are not in any render pass, so that version held at dpr 2 at 34–40 fps.

Why it does no work at 1×: an intermediate version resolved timestamps on 1× displays, where the dpr cannot move. It cost **+0.3 ms** of `renderMs` on the H19 scene in five of five interleaved comparisons. Those captures are kept in `.cache/h192b-intermediate/`, uncommitted; the sha is gone from the branch.

| | before `669d9fa4` (display-timer loop) | after `7969d78f` |
|---|---|---|
| **1× display — H19 scene, four interleaved pairs, `renderMs` median** | 5.243 · 5.374 · 5.439 · 5.177 | 5.439 · 5.439 · 5.374 · 5.374 |
| differences | | +0.196 · +0.065 · −0.065 · +0.197 — **no change** (under 0.26 ms; signs disagree) |
| 1× display — empty site, `renderMs` median | 4.325 | 4.391 — **no change** |
| **emulated 2×, `high` tier — H19 scene**: dpr · fps mean · `renderMs` median / p99 | 1.5 · 39.39 · 11.27 / 19.20 | **1.25 · 46.53 · 7.86 / 15.99** |
| emulated 2×, `high` tier — empty site | 1.75 · 42.84 · 10.09 / 13.44 | **1.5 · 46.74 · 8.72 / 12.58** |

The old loop's resting dpr at 2× varied from run to run (1.5–2.0), because it stepped only when rAF itself slowed. The new loop lands where the GPU fits, and on both scenes it lifts the frame rate by 4–7 fps at 2×.

`check-h19-2b` drives the real controller:
- forged 30 ms against a 20 ms budget steps 1.5 → 1.25 after one 30-sample window and settles at the floor;
- forged 1 ms never passes the ceiling;
- in closed loop against a GPU costing k·dpr² in its passes plus p·dpr² of presentation the timestamps cannot see, the steady state equals the closed-form dpr in all 14 cases, after load and on recovery.

`--self-test` rejects the H17.1 display-timer loop, a controller with no ceiling, and a render-time-only controller.

### H19.2c — shadow maps redraw on change (line 5) — landed

`b9151c50`, `lights.tsx`. WebGPU draws a light's shadow map when that light's own `shadow.needsUpdate` or `shadow.autoUpdate` is set (`ShadowNode.updateBefore`). H17.1 set the renderer-level WebGL flag, which this renderer never reads, so both shadow lights redrew every frame: the key light, and `eco-sun` at 4096².
- Every shadow-casting light in the scene is now off per-frame updates, the plugin's sun included.
- Each is redrawn on change: the sun, the building bounds, rebuilt geometry, any scene-node edit, or its own pose or frustum.
- A 0.25 s tick catches motion that no store reports (animations).

| H19 scene (136 casters, 2 shadow lights), three interleaved pairs | before `7969d78f` | after `b9151c50` |
|---|---|---|
| shadow-map passes per frame (harness count) | 2.000 | **0.154** |
| `render()` calls per frame (renderer's count) | 6.000 | **4.154** — both counts drop by 1.846 |
| draws / triangles per frame (HUD) | 573 / 114,216 | **254 / 46,746** |
| `render()` CPU median | 2.1 · 2.1 · 2.1 ms | **1.4 · 1.4 · 1.2 ms** |
| `renderMs` median | 5.308 · 5.636 · 5.243 | 5.571 · 5.636 · 5.374 |
| differences | | +0.263 · 0.000 · +0.131, median +0.131 — **no change** |
| empty site (0 casters), `renderMs` median | 3.998 | 4.522 |

**What 2c buys on this GPU is CPU and submission, not GPU time:** 92% fewer shadow passes, 56% fewer draws, and a third less encode time per frame. The shadow passes were already shorter than one 0.0655 ms timestamp step. That is also why their per-pass timestamps read 0.000: below the quantum, not unmeasured.

Two readings are recorded, not chased:
- Pair 1's +0.263 ms sits 0.001 ms over the floor; the set's median is +0.131.
- The single empty-site capture reads +0.52 ms, but the same unchanged tree has measured anywhere from 3.15 to 4.46 ms on the empty site this session.

The harness count and the renderer count agree **exactly**. That is expected, not suspicious: both count `render()` invocations, one filtered by shadow-map target, one unfiltered, and the shadow passes are the only calls that changed.
- `check-h19-2c` asserts all of this per pair, plus render time not worse (median pair difference under the floor). `--self-test` forges per-frame redraws, a scene without casters, a count the renderer does not confirm, and a slower set.
- `check-h17-1` now runs that behavioural check in place of its `autoUpdate = false` text match.

`eco-sun`'s hard-coded 4096² map (line 5) is unchanged: with redraws now on change, its cost is memory (64 MB), not time.

### H19.2d — draw calls and materials on the H19 scene (lines 6–8) — profiled; nothing lands

Profile `h19-2d-profile-scene.json` of `b9151c50`, native. The camera draws **44 objects** per scene pass:
- 12 `item-batch` containers (upstream's `node-batch` `BatchedMesh`) holding all 50 items, trees included;
- the merged wall, roof and stair meshes;
- terrain (16 meshes), sky, guides, grid and envelope;
- a few item meshes the batcher skips (`MeshPhysicalMaterial` parts).

| Group (hidden in turn, device timestamps) | objects | tris | GPU cost | drift |
|---|---|---|---|---|
| site / terrain | 16 | 19,634 | 1.31 ms | 0.79 |
| eco-buildable-envelope (translucent overlay) | 1 | 12 | 0.62 ms | 0.07 |
| merged stair | 1 | 124 | 0.56 ms | 0.46 |
| unbatched bathroom items | 2 | 827 | 0.46 ms | 0.13 |
| eco-sky | 1 | 2,208 | 0.43 ms | 0.07 |
| merged roof | 1 | 87 | 0.20 ms | 0.39 |
| **all batched items (12 containers)** | 12 | 13,151 | **0.20 ms** | 0.13 |
| everything else | — | — | ≤ 0.13 ms | — |

- **Instancing where the same geometry repeats.** On WebGPU three draws a `BatchedMesh` as one `drawIndexed` per instance (`WebGPUBackend.js:2124-2134`), with no multi-draw. The 12 containers hold 172 instances of 101 unique geometries, so instancing repeats would save 71 draws per pass. But **every batched item together costs 0.20 ms of GPU**, under the noise floor. The change would also live in upstream's `node-batch` or in three's WebGPU backend, neither of which is this lane's code. **Not taken**; the profile names no line it could move.
- **Materials and programs.** 38 unique materials (24 `MeshLambertNodeMaterial`, 5 `MeshBasicMaterial`, 3 `MeshPhysicalMaterial`, 3 `MeshBasicNodeMaterial`, 3 line materials). 70 shader modules and 51 render pipelines, all at load; **0 created during motion**.
- **The 24 render-target reallocations (119 MB) mid-orbit, confirmed gone.**
  - At 1×: 60 textures (184 MB) at load and **0** during the orbit. H19.2a already removed the climb; H19.2b cannot move at 1×.
  - At emulated 2× (`high`): 2b steps 2 → 1.25 while the scene settles, so 120 textures (597 MB) at load and settle, and **0** during the orbit (`h19-2d-profile-scene-hidpi.json`).
- **Per-frame uploads during motion on the H19 scene.** About 13 `writeTexture` calls and 17 KB of `writeBuffer` per frame (the batch containers' per-pass updates), about 0.2 ms of CPU per frame. Recorded, not chased.

The biggest remaining GPU line on this scene is the translucent buildable envelope (0.62 ms, the steadiest reading), then terrain and sky. None of them is a draw-call or material line; they are for the next brief to weigh.

### The cap (line 1), where it would be set

The 50 fps cap is upstream's default: `FrameLimiter`, with `maxFps = 50` on `<Viewer>` (`packages/viewer/src/components/viewer/index.tsx:457`). It was made a prop upstream in `f8838200`. It would be set by passing `maxFps` to `<Viewer>` where upstream's `<Editor>` mounts it (`packages/editor/src/components/editor/index.tsx:1168, 1530`), or by changing that default. It stays at 50 in this phase; every number above is measured around it.

### Commits and the merge

H19.2a went up for review as `eco/h19` (preview READY at `37a8250e`) and is merged by the human in the browser with a merge commit. The local merge commit `75703cd0` that `eco/h19-2` was built on is discarded when the branch is rebased onto the real one. After that rebase the H19.2 commit shas change but their trees do not. The pre-rebase history stays on the remote as `eco/h19-2-prebase`, so every sha recorded in the captures above still resolves.

| Line | Commit (pre-rebase) | Captures |
|---|---|---|
| harness | `d9760995` | — |
| H19 scene | `36d4f897` | — |
| guides | `669d9fa4` | `47d1139f` (`h19-2-guides-*`) |
| 2b | `7969d78f` | `fc41ce9c` (`h19-2b-*`) |
| 2c | `b9151c50` | `ccf39232` (`h19-2c-*`); check `285e2f70` |
| 2d | profile only | `cb996f73` (profile), `26693527` (`h19-2d-profile-scene*`) |

## Gate

| Check | Result |
|---|---|
| `bun run checks` · `bun run build` | green (Bun 1.4.2; pin 1.3.14) |
| `check-h17-perf` / `--self-test` | OK / OK (7 cases) |
| `check-h19-2` / `--self-test` | OK / OK (4 cases) |
| `check-h19-2-guides` / `--self-test` | OK / OK (3 cases) |
| `check-h19-2b` / `--self-test` | OK / OK (4 cases) |
| `check-h19-2c` / `--self-test` | OK / OK (5 cases) |
| `check-h17-1` | OK — shadow discipline now by behaviour |

H19.2 closes here. Next in order: A4 (base path `/builder`), then A5 (the site in the editor). H19.3 and H19.4 follow H20.
