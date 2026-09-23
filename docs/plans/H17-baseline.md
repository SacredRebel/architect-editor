# H17.0 — performance baseline (pre-optimisation)

Recorded **before** any H17.1 tuning. Do not change rendering behaviour until
this file and `packages/viewer/test/h17-0-baseline.json` exist and
`bun packages/viewer/test/check-h17-perf.mjs` is green.

## HUD

In-repo **PerfPanel** / **PerfMonitor** (gated by `?perf`), not a second
`stats-gl` / `r3f-perf` dependency. Same surface:

| Metric | Shown |
|---|---|
| FPS | yes |
| Frame time (CPU / encode / GPU) | yes |
| Draw calls | yes |
| Triangles | yes |
| Textures / geometries | yes |
| JS heap | yes |

Probe: `window.__pascalPerf` (batch stats, node list, `stats()` after H17.0).

## Capture method

- **Build:** production (`https://architect-editor-snowy.vercel.app/?perf`)
- **Harness:** `packages/viewer/test/capture-h17-baseline.mjs` via Chrome CDP `:9222`
- **Path:** fixed ~20 s orbital pointermoves on the canvas while sampling rAF deltas
- **Scene note:** default production editor load with `?perf`. A full eco site
  (terrain + trees + models + domed bay + organic building) can be loaded
  manually before capture; numbers below are the **pre-optimisation** floor on
  whatever scene was open. Re-run capture after seeding the eco scene for a
  heavier apples-to-apples H17.1 comparison.

## Numbers (H17.0)

Source artifact: `packages/viewer/test/h17-0-baseline.json`

| Metric | Value | H17.1 target |
|---|---|---|
| FPS median | **14.99** | ≥ 60 |
| FPS 1%-ile | **12** | ≥ 45 |
| Frame ms median | **66.7** | ~16.7 for 60 fps |
| Frame ms p99 | **83.3** | — |
| Sample window | 4 s (initial) / prefer 20 s path re-run | 20 s camera path |
| Pointer → highlight | *(capture field; re-run for live)* | < 50 ms |
| Click → select | *(capture field; re-run for live)* | — |
| Wall-drag frame ms | *(capture field; re-run for live)* | < 16 ms |
| Undo latency | *(capture field; re-run for live)* | — |
| Cold load → FCP / interactive | *(navigation timing on re-run)* | interactive < 4 s warm |

Captured at: `2026-09-23T02:22:04.948Z`  
Source URL: `https://architect-editor-snowy.vercel.app/?perf`  
`optimisationsApplied`: **false**

### Readout

The production editor is **well below** the H17.1 fps targets on this machine /
capture environment (~15 fps median vs 60). That gap is exactly what H17.1 is
for — demand frameloop discipline is partially present (`frameloop="never"` +
FrameLimiter), but AdaptiveDpr, GPU tiering, shadow budget, and remaining cost
cuts are still open.

## Checks

```bash
bun packages/viewer/test/check-h17-perf.mjs
# optional live re-capture (Chrome --remote-debugging-port=9222 on ?perf):
bun packages/viewer/test/capture-h17-baseline.mjs
```

## Next

H17.1 on `eco/h17-1-fixes` — measure before/after each fix in `H17-done.md`.
