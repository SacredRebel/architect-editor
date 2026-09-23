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
| BVH raycast | already | unchanged | |

### Deferred (still open)

| Item | Why deferred |
|---|---|
| drei `Detailed` LOD for models / trees / far terrain | needs asset LOD variants |
| comlink workers for organic / loft / body geo | larger cut; ghost preview UX |
| Zustand selector audit across editor tree | profiler pass |
| Code-split every rail / plugin panel | partial; continue in follow-up |
| WebP ≤2048 texture pipeline | editor asset ingest |
| BatchedMesh for columns / piers / fence | beyond trees |

### After numbers

Re-run on production after merge:

```bash
# Chrome --remote-debugging-port=9222 on https://…/?perf
bun packages/viewer/test/capture-h17-baseline.mjs
bun packages/viewer/test/check-h17-1.mjs
```

Record the new FPS median / p1 here once the post-fix capture lands. Targets remain **60 / 45** fps on the camera path; pointer highlight **\<50 ms**; wall-drag **\<16 ms**; interactive **\<4 s** warm.

Until the re-capture, treat H17.0 `h17-0-baseline.json` as the only locked numeric baseline.

## Checks

| Check | Result |
|---|---|
| `bun packages/viewer/test/check-h17-perf.mjs` | OK (H17.0) |
| `bun packages/viewer/test/check-h17-1.mjs` | OK |
| `bun install --frozen-lockfile` + `bun run build --filter=editor` | (fill on ship) |

## Next

H18 walk-mode feel — `eco/h18-walk` (see `H17-H18-queued.md`).
