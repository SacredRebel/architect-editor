# STATUS — Agent A
updated: 2026-09-27
phase: **H19.1 profiled on `eco/h19`** · next H19.2 chooses (not started)
state: H19.0 pair re-captured like-for-like (the first table is withdrawn). H19.1 profile names its lines. Nothing optimised. `eco/h19` not merged to `main`.

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY https://architect-editor-snowy.vercel.app |
| **H19.0** | re-measure (before/after, same harness) | on `eco/h19` | not merged |
| **H19.1** | profile | on `eco/h19` · done **`658aa41c`** | not merged |

PR: https://github.com/SacredRebel/architect-editor/pull/1 (merge commit, not squash)

## H19.0 numbers (20 s orbit, local production builds, same Chrome)

| Metric | Before `a07fde17` (H17.0 + probe) | After `1147fa69` |
|---|---|---|
| Rendered fps (median of 1 s bins) | **50** | **50** |
| Per-frame fps p1 | **29.94** | **29.94** |
| Frames sampler vs HUD | 1000 vs 1000 | 1000 vs 1000 |
| DPR on a 1× display | 1.0 | 1.5 (`medium`) |

Both trees sit on the `FrameLimiter` 50 fps cap. The 60 median and 45 p1 targets cannot be met by any tree at that cap on a 60 Hz display.

## H19.1 lines (from `H19-done.md`)

1. The fps cap (50 on 60 Hz), not the work, sets both fps numbers.
2. GPU time is pixels: dpr 1.0 cuts GPU from ~6.2–7.5 to 3.4 ms.
3. Two shadow passes (1024², 4096² `eco-sun`) run every frame with 0 casters; `autoUpdate` is never set false.
4. No per-frame upload; 203 MB resident GPU memory.
5. 9 materials.
6. Worst draw is `eco-sky` at 2,208 tris; the empty scene cannot rank item draws.
7. Production load: FCP 10.2 s, 5.9 MB script, one 2.9 MB chunk.

## Gate

| Check | Result |
|---|---|
| `bun run checks` | green |
| `bun run build` | green |
| `check-h17-perf` | OK (same path; 1000 vs 1000 on each run) |
| `check-h17-perf --self-test` | OK (path kind, duration, display-Hz sampler forged → rejected) |
| `check-h17-1` | OK |

## Open for the architect

- `bun.lock` +1 line (`detect-gpu` under `packages/viewer`) from `bun install` on Bun 1.4.2. Not committed.
- No H19 brief file exists in `docs/plans/`; H19.1 followed the scope in the session brief and reply-21.

commit: done `658aa41c` on `eco/h19` · probe tree `eco/h17-0-probe` `a07fde17`
queue: H19.2 (choose) — waiting for brief
