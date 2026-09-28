# STATUS — Agent A
updated: 2026-09-28
phase: **H19.2 recorded on `eco/h19-2`** · next A4 (base path `/builder`), then A5
state: H19.2 closed: the guides fix, 2b and 2c landed; 2d profiled, nothing landed. H19.2a waits on the `eco/h19` PR, which the human merges in the browser; `eco/h19-2` rebases onto that merge.

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY https://architect-editor-snowy.vercel.app |
| **H19.0 · H19.1 · H19.2a** | re-measure · profile · dpr never above the display | `eco/h19` @ `37a8250e`, preview READY | PR in the browser, merge commit |
| **H19.2** | H19 scene · guides · 2b · 2c · 2d profile | `eco/h19-2` · done **`273d912d`** (pre-rebase) | after the H19.2a merge |

## Numbers (H19 scene unless marked; 20 s path; local production builds; same Chrome)

| Line | Before → after |
|---|---|
| guides (drei Line → Line2NodeMaterial) | fps 42.8 → 50.0 · p1 10.0 → 29.9 · interval p99 99.9 → 33.4 ms (three pairs agree) |
| 2b at 1× | `renderMs` no change (four pairs, under 0.26 ms, signs disagree) |
| 2b at emulated 2×, `high` | dpr 1.5 → 1.25 · fps 39.4 → 46.5 · `renderMs` 11.3 → 7.9 ms |
| 2c | shadow passes 2.0 → 0.154/frame · draws 573 → 254 · encode 2.1 → 1.3 ms · GPU no change |
| 2d | batched items cost 0.20 ms in all (under the floor): instancing not taken · no reallocations mid-orbit at 1× or 2× |

fps is upstream's `FrameLimiter` cap (50). Noise floor: 0.26 ms; timestamps step 0.0655 ms.

## Gate

| Check | Result |
|---|---|
| `bun run checks` · `bun run build` | green (Bun 1.4.2 installed; pin 1.3.14) |
| `check-h17-perf` · `check-h19-2` · `check-h19-2-guides` · `check-h19-2b` · `check-h19-2c` | OK, each with `--self-test` OK |
| `check-h17-1` | OK — shadow discipline now by behaviour |

## Open for the architect

- The H19 brief file and the "direction note" have not arrived in `docs/plans/inbox/`.
- PR #2 (`eco/h17-0-remeasure` @ `1b8cc3ea`, an empty commit from the Cursor session) is still open.
- Biggest remaining GPU line on the H19 scene: the translucent buildable envelope (0.62 ms).

commit: done `273d912d` on `eco/h19-2` (pre-rebase) · H19.2a `eco/h19` @ `37a8250e`
queue: A4 → A5, then stop
