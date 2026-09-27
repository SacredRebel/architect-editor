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

### After numbers (H19.0 re-measure)

Same H17 harness / 20 s orbital camera path on production `?perf`. Before numbers are the locked H17.0 baseline (~15 fps median / 12 p1). After is post-H17.1 on main (AdaptiveDpr + detect-gpu + shadow discipline). No product code changed in the H19.0 commit — measurement only.

| Metric | Before (H17.0) | After (H19.0) | Target |
|---|---|---|---|
| FPS median | **14.99** | **59.88** | ≥ 60 |
| FPS 1%-ile | **12** | **30.12** | ≥ 45 |
| Frame ms median | **66.7** | **16.7** | ~16.7 |
| Draws (HUD median) | — | **12** | — |
| Tris (HUD median) | — | **8254** | — |
| AdaptiveDpr / DPR | fixed 1.5 / 1.25 | active, **dpr 1** (pref `auto`) | cap 2 |
| Sample | 4 s rAF | **20 s** orbital path | 20 s |
| Pointer → highlight | — | **34.4 ms** | < 50 ms |
| Wall-drag frame ms | — | **16.7 ms** | < 16 ms |

Artifacts: `packages/viewer/test/h17-0-baseline.json` (before) · `packages/viewer/test/h19-0-after.json` (after, captured `2026-09-27T06:53:32.405Z`).

Median hit the 60 fps band; p1 (30) is still short of 45 — residual for H19.1 profiling.

```bash
# Chrome --remote-debugging-port=9222 on https://…/?perf
H19_PHASE=after bun packages/viewer/test/capture-h17-baseline.mjs
bun packages/viewer/test/check-h17-perf.mjs
bun packages/viewer/test/check-h17-1.mjs
```

## Checks

| Check | Result |
|---|---|
| `bun packages/viewer/test/check-h17-perf.mjs` | OK (before + after) |
| `bun packages/viewer/test/check-h17-1.mjs` | OK |
| `bun run checks` | (lane READY gate) |
| `bun run build` | (lane READY gate) |

## Next

H19.1 profiles before H19.2 chooses — continue on `eco/h19`.
