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

The first H19.0 table (15 → 60) compared two different experiments, and both of its samplers were wrong. The before was the 4 s idle rAF sample. The after sampler counted its own `requestAnimationFrame` callbacks, which run at display refresh, while `FrameLimiter` advances the renderer on a 50 fps grid. It read 59.88 against a HUD of 50. The pair below replaces it: one harness (`272ba6b6`), one machine, one Chrome, the same 20 s orbit on the same empty site, with frames counted from the renderer's `useFrame` tick and **render time measured beside the interval**.

| Metric | Before (H17.0 + probe) | After (H17.1 applied) | Target |
|---|---|---|---|
| Tree | `a0ca4ca4` = `17702d28` + probe | `272ba6b6` (`eco/h19`) | — |
| **renderMs, GPU per frame (median / p99)** | **4.13 / 4.92** | **6.82 / 9.50** | — |
| renderCpuMs, outer `render()` (median / p99) | 0.6 / 1.5 | 0.6 / 1.9 | — |
| Rendered fps, median of 1 s bins · mean | 50 · 50.00 | 50 · 49.97 | ≥ 60 |
| Per-frame fps, 1st percentile | 29.94 | 29.94 | ≥ 45 |
| Frame interval median / p99 / max (ms) | 16.7 / 33.4 / 33.6 | 16.7 / 33.4 / 33.6 | ~16.7 |
| Frames: sampler vs HUD (20 s) | 1000 vs 1000 | 1000 vs 1001 | within 10% |
| renderMs vs the HUD's own gpuMs (median) | 4.13 vs 4.12 | 6.82 vs 7.00 | within 15% |
| Scene: draws / tris | 15 / 8,350 | 15 / 8,350 | equal |
| detect-gpu tier · DPR on a 1× display | none · **1.0** | medium · **1.5** | — |
| Pointer → highlight · undo (ms) | 33.8 · 32.7 | 33.2 · 34.0 | < 50 |
| Captured (UTC) | 2026-09-28 05:03:27 | 2026-09-28 05:02:48 | — |

Pair commit `43bc8119`, with author and committer dates pinned to the later `capturedAt`.

**What H17.1 bought, plainly.** On this machine, it bought a 50 fps cap it did not raise, and a 2.25× pixel load it did not need. Both trees render at exactly the 50 fps that upstream Pascal's `FrameLimiter` has always imposed, so every fps number in H17 and H19.0 is the cap, not the cost. Under that unchanged cap, AdaptiveDpr took the `medium` tier's 1.5 on a 1× display, and GPU time per frame went from **4.13 to 6.82 ms** (p99 4.92 → 9.50). That is 65% more render work that no one can see. The earlier "15 → 60" was an idle sample against a display-Hz counter, not an improvement.

**renderMs.** It is the device time of one frame's render passes, from three's WebGPU timestamp queries. Both trees resolve those queries under `?perf`, and `post-processing.tsx` and `perf-tracks.ts` are unchanged since `17702d28`. three resolves them asynchronously and returns the last resolved frame, so the harness takes one sample per new resolve (929–997 samples in 20 s). Its median agrees with the HUD's own 0.5 s window averages of the same device queries within 3%.

**The two frame counts.** Sampler = `frameTick` changes seen by the injected rAF loop. HUD = mean `PerfMonitor` window fps × wall seconds. They read 1000 vs 1000 (before) and 1000 vs 1001 (after). They sit on each other because the scene sits on the cap, so every HUD window averages 50 and 50 × 20.0 s = 1000. The check can still fail: a display-Hz counter over the same 20 s reads **1201**, 17% off, and `--self-test` forges exactly that sampler and is rejected. `renderer.info.render.frame` was not used. In three 0.186's WebGPU renderer, `info.frame` is advanced by the renderer's own rAF `Animation` loop (`three/src/renderers/common/Animation.js:83–85`), so it counts display ticks (1201) and would have blessed the broken sampler.

**The probe is the only difference.** `git diff --stat 17702d28 a0ca4ca4`:

```
 .../viewer/src/components/viewer/perf-monitor.tsx     | 19 +++++++++++++++++++
 1 file changed, 19 insertions(+)
```

Those lines add `renderTick` (a ref incremented in the existing `useFrame`), `frameTick()`, `rendererInfo()` and `three()` to `window.__pascalPerf`, which exists only with `?perf`. The same lines are in the after tree. The after tree also carries the earlier HUD rounding change (`Math.round` → one decimal) and `data-gpu-*` attributes on `<html>`.

**How it was measured.** Both trees were built as production builds and served with `next start` on loopback: `:3017` before, `:3019` after. They ran in the same Chrome 154 (window 1280×800, isolated profile, one page open at a time) on an Intel Xe-LPG over WebGPU. Before each capture the harness clears the origin's storage and reloads, then waits 4 s. No Vercel preview was involved: neither probe tree is deployed, and two local trees are the like-for-like pair.

**Withdrawn pairs, kept in history.**
- `64321121` / `7d611008` had no render time.
- `181503a6` compared different scenes. The after page had kept an edited scene in its origin's storage (33 draws vs 15), left by the harness's own wall-drag probe in an earlier run. `check-h17-perf` now requires equal draws and tris, and rejects that commit's pair.

```bash
# before tree: eco/h17-0-probe; after tree: eco/h19. Build and serve each:
bun run build --filter=editor && (cd apps/editor && bunx next start -p 3017 -H 127.0.0.1)
# Chrome --remote-debugging-port=9222 on one ?perf page, then from eco/h19:
OUT_PATH=packages/viewer/test/h17-0-baseline-path.json TREE_SHA=<before sha> bun packages/viewer/test/capture-h17-baseline.mjs
H19_PHASE=after TREE_SHA=<after sha> bun packages/viewer/test/capture-h17-baseline.mjs
bun packages/viewer/test/check-h17-perf.mjs && bun packages/viewer/test/check-h17-perf.mjs --self-test
```

## Checks

| Check | Result |
|---|---|
| `check-h17-perf.mjs` | OK: same path, same scene; frames 1000/1000 and 1000/1001; renderMs within 15% of the HUD on each run |
| `check-h17-perf.mjs --self-test` | OK: control passes; path kind, duration, display-Hz sampler, missing renderMs, CPU-timed renderMs and different-scene forges rejected |
| `bun run checks` · `bun run build` | green (Bun 1.4.2 installed; repository pin 1.3.14) |

## Next

H19.1 profile and H19.2: `H19-done.md`.
