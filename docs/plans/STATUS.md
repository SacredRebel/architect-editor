# STATUS — Agent A
updated: 2026-09-27
phase: **H19.2a landed on `eco/h19`** · H19.2 paused for a scene decision
state: The H19.0 pair carries render time. H19.1 profiled. H19.2a (dpr clamp) measured and checked. `eco/h19` is not merged to `main`.

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY https://architect-editor-snowy.vercel.app |
| **H19.0** | re-measure (same harness, same scene, renderMs) | on `eco/h19` · pair `43bc8119` | not merged |
| **H19.1** | profile | on `eco/h19` · `cf088a8a` | not merged |
| **H19.2a** | dpr never above the display | on `eco/h19` · `250daa06` · done **`fb6df305`** | not merged |

PR: https://github.com/SacredRebel/architect-editor/pull/1 (merge commit, not squash)

## Numbers (20 s orbit, empty site, local production builds, same Chrome)

| | H17.0 `a0ca4ca4` | H17.1 `272ba6b6` | H19.2a `250daa06` |
|---|---|---|---|
| renderMs median / p99 | 4.13 / 4.92 | 6.82 / 9.50 | **3.74 / 4.98** |
| fps (median of 1 s bins) | 50 | 50 | 50 |
| DPR on a 1× display | 1.0 | 1.5 | 1.0 |

fps is upstream's `FrameLimiter` cap (50) on all three; only render time moves.

## Gate

| Check | Result |
|---|---|
| `bun run checks` · `bun run build` | green (Bun 1.4.2 installed; pin 1.3.14) |
| `check-h17-perf` / `--self-test` | OK / OK (7 cases) |
| `check-h19-2` / `--self-test` | OK / OK (4 cases) |
| `check-h17-1` | OK (string match; cannot fail on behaviour — H19-done line 5) |

## Open for the architect

- H19.2 lines 5 (shadows) and 8 (draws) need a scene with casters and items on the same path; the empty site cannot show their gain.
- `docs/plans/inbox/2026-09-26-brief-H19.md` has not arrived.
- `maxFps` 50 is upstream's and stays; raising it is a product call.

commit: done `fb6df305` on `eco/h19` · probe tree `eco/h17-0-probe` `a0ca4ca4`
queue: waiting for brief
