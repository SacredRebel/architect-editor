# H17 — performance

## H17.0 — baseline (measure first)

Branch `eco/h17-0-perf-baseline` → merge `972886b6` (feature `be461a2b`, stamp `17702d28`).

| Metric | Value | Target |
|---|---|---|
| FPS median | **14.99** | ≥ 60 |
| FPS 1%-ile | **12** | ≥ 45 |
| Frame ms median | **66.7** | ~16.7 |
| Sample | production `?perf`, 4 s rAF (see `H17-baseline.md`) | 20 s path preferred |

HUD: in-repo PerfPanel behind `?perf` (FPS, frame, draws, tris, textures, geometries, heap).

## H17.1 — fixes (each measured)

Branch `eco/h17-1-fixes`.

### Applied

| Fix | Before (H17.0) | After | Notes |
|---|---|---|---|
| Demand frameloop | already `frameloop="never"` + FrameLimiter | unchanged | already demand-driven |
| AdaptiveDpr (cap 2) | fixed 1.5 desktop / 1.25 coarse | tier cap + drop under load | `AdaptiveDpr` + `maxDprForQuality` |
| detect-gpu tiers | none | auto / high / medium / low | toolbar **Quality**; persisted |
| Shadow update discipline | continuous autoUpdate | `autoUpdate=false`, dirty on sun/geometry | tiered map 512–2048 |
| three-mesh-bvh | already on terrain / large meshes | unchanged | prior work |
| InstancedMesh trees | already | unchanged | `eco-trees.tsx` |
| BVH raycast | already on terrain / large meshes | unchanged | prior work |

### Deferred (still open)

| Item | Why deferred |
|---|---|
| drei `Detailed` LOD for models / trees / far terrain | needs asset LOD variants |
| comlink workers for organic / loft / body geo | larger cut; ghost preview UX |
| Zustand selector audit across editor tree | profiler pass |
| Code-split every rail / plugin panel | partial; continue in follow-up |
| WebP ≤2048 texture pipeline | editor asset ingest |
| BatchedMesh for columns / piers / fence | beyond trees |

### After numbers (H19.0 re-measure, corrected 27 Sep)

The first H19.0 table (15 → 60) compared two different experiments, and both of its samplers were wrong. The before was the 4 s idle rAF sample. The after sampler counted its own `requestAnimationFrame` callbacks, which run at display refresh, while `FrameLimiter` advances the renderer on a 50 fps grid. It read 59.88 against a HUD of 50. The pair below replaces it: one harness, one machine, one Chrome, the same 20 s orbit, and frames counted from the renderer's `useFrame` tick.

| Metric | Before (H17.0 + probe) | After (H19.0) | Target |
|---|---|---|---|
| Tree | `a07fde17` = `17702d28` + probe | `1147fa69` (`eco/h19`) | — |
| Rendered fps, median of 1 s bins | **50** | **50** | ≥ 60 |
| Rendered fps, mean (frames ÷ wall s) | **49.99** | **49.98** | — |
| Per-frame fps, 1st percentile | **29.94** | **29.94** | ≥ 45 |
| Frame interval median / p99 / max (ms) | 16.7 / 33.4 / 33.5 | 16.7 / 33.4 / 34.0 | ~16.7 |
| Frames: sampler vs HUD (20 s) | 1000 vs 1000 | 1000 vs 1000 | within 10% |
| `useFrame` tick delta · display ticks (`info.frame`) | 1000 · 1201 | 1001 · 1201 | — |
| `render()` calls per frame | 6 | 6 | — |
| Draws / tris (HUD median) | 15 / 8,350 | 15 / 8,350 | — |
| detect-gpu tier · DPR on a 1× display | none · **1.0** | medium · **1.5** | cap 2 |
| Pointer → highlight · undo (ms) | 33.7 · 33.4 | 32.7 · 31.7 | < 50 |
| Wall-drag frame (ms) | 16.7 | 16.6 | < 16 |
| Captured (UTC) | 2026-09-28 04:28:18 | 2026-09-28 04:27:47 | — |

**What H17.1 bought, plainly.** On this machine, nothing you can see in frame rate. Both trees render at exactly the 50 fps cap that `FrameLimiter` has always imposed. The renderer uses about 7 ms of GPU and 1 ms of CPU out of a 20 ms frame, so neither tree was ever short of time on this scene. What H17.1 changed is how that headroom is spent. detect-gpu now names a tier (`medium`), and AdaptiveDpr climbs to that tier's cap: 1.5× on a 1× display, 2.25× the pixels, for the same 50 fps. The earlier "15 → 60" was an idle sample against a display-Hz counter, not an improvement. The 60 fps median and 45 fps p1 targets cannot be met by any tree while the cap is 50 on a 60 Hz display. Renders land on vsync, so every sixth interval is 33 ms, and the per-frame 1%-ile is 30 by construction. That is H19.1's first line.

**The two quantities.** Sampler = `frameTick` changes seen by the injected rAF loop. HUD = mean `PerfMonitor` window fps × wall seconds. Both read **1000 vs 1000** on both runs. The exact match is explained: the scene sits on the cap, so the 38 HUD windows average 50 on both trees (integer-rounded windows on the H17.0 tree, one decimal on the after tree), and 50 × 20.00 s rounds to 1000. The sampler saw 1000 of 1000–1001 ticks. The check is still able to fail. A display-Hz counter over the same 20 s reads **1201**, which is 17% off, and `--self-test` forges exactly that sampler and is rejected. `renderer.info.render.frame` was not used as the second quantity. In three 0.186's WebGPU renderer, `info.frame` is advanced by the renderer's own rAF `Animation` loop (`three/src/renderers/common/Animation.js:83–85`). It counted 1201, the display ticks, so it would have blessed the broken sampler. `info.calls` counts real work but is 6 per frame, not 1.

**The probe is the only difference.** `git diff --stat 17702d28 a07fde17`:

```
 packages/viewer/src/components/viewer/perf-monitor.tsx | 17 +++++++++++++++++
 1 file changed, 17 insertions(+)
```

The 17 lines add `renderTick` (a ref incremented in the existing `useFrame`), `frameTick()`, and `rendererInfo()` (a read of `gl.info.frame/calls/render.calls`). All of it sits on `window.__pascalPerf`, which only exists with `?perf`. The same lines are in `1147fa69`. The after tree additionally carries the previous session's HUD rounding change (`Math.round` → one decimal) and `data-gpu-*` attributes on `<html>`.

**How it was measured, and what it cannot say.** Both trees were built as production builds and served with `next start` on loopback, `:3017` (before) and `:3019` (after). Each ran in the same Chrome 154 (window 1280×800, isolated profile) with one page open at a time. The adapter was Intel Xe-LPG over WebGPU. No Vercel preview of the probe tree was built. Neither tree's probe is deployed, and serving both locally keeps the pair like-for-like, whereas production vs local would not. Load timing therefore comes out at ~270 ms locally. The production load (FCP ~10 s) is profiled separately in H19.1. The capture commits carry pinned author and committer dates equal to each artifact's `capturedAt`: `64321121` (after) and `7d611008` (before). The two invalid 20 s artifacts are kept, not committed, in `.cache/cc-invalid-*.json`. The historic 4 s file `h17-0-baseline.json` is untouched.

```bash
# before tree: git switch eco/h17-0-probe ; after tree: eco/h19. Build and serve each:
bun run build --filter=editor && (cd apps/editor && bunx next start -p 3017 -H 127.0.0.1)
# Chrome --remote-debugging-port=9222 http://127.0.0.1:3017/?perf (one page open), then from eco/h19:
OUT_PATH=packages/viewer/test/h17-0-baseline-path.json TREE_SHA=<before sha> bun packages/viewer/test/capture-h17-baseline.mjs
H19_PHASE=after TREE_SHA=<after sha> bun packages/viewer/test/capture-h17-baseline.mjs
bun packages/viewer/test/check-h17-perf.mjs && bun packages/viewer/test/check-h17-perf.mjs --self-test
```

## Checks

| Check | Result |
|---|---|
| `bun packages/viewer/test/check-h17-perf.mjs` | OK: same path kind and duration; 1000 vs 1000 frames on each run |
| `bun packages/viewer/test/check-h17-perf.mjs --self-test` | OK: control passes; path kind, duration and display-Hz sampler forges rejected |
| `bun run checks` | green |
| `bun run build` | green |

## Next

H19.1 profile: `H19-done.md`.
