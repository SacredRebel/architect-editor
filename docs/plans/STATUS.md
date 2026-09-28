# STATUS — Agent A
updated: 2026-09-28
phase: **ci on `eco/ci`** · the quality job is green on pull request #4 · merge next; the demo is in production (`0d38a884` READY)
state: The demo is merged (pull request #3 from `eco/demo`, merge commit `0d38a884`) and READY in production: light graphics by default, a site and house when the world sends nothing, and the tools that fail hidden in light mode. H19.2a went in before it (`c00d885f`). GitHub CI's quality job had failed on every push to `main` since `121d1ebc` because `plugin-geometry` had no tests; `eco/ci` fixes it (`ci-done.md`).

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY |
| **H19.0 · H19.1 · H19.2a** | re-measure · profile · dpr never above the display | **`c00d885f`** (merge commit) | **READY** `dpl_GZ9asee41gW5m25zNL4yNFQY33JE` |
| **demo** | light graphics · demo site · hidden tools | **`0d38a884`** (merge commit, pull request #3) | **READY** `dpl_BUYwmDfTxVJCL2KD2Xf7cQChN5GC` |
| **ci** | CI quality job: `plugin-geometry`'s test runs its geometry check | `eco/ci` `8571285c` · pull request #4, CI run #9 green · preview READY | after the merge |
| H19.2 · A4 · A5 | guides · 2b · 2c · 2d profile · `/builder` · site in the editor | `eco/h19-2` `273d912d` · `eco/a4` `39c602cc` · `eco/a5` `26042fd6` (pre-rebase) | resume after the demo |

## Demo (preview `dpl_5sTZbhRoymUj9g2YNA2xDPLoF9CD`, light graphics)

| Line | Result |
|---|---|
| Model | demo site and house built 11.1 s after load in a fresh profile; one wall drawn with the wall tool, walls 8 → 9 |
| Shown and working | catenary arch · lofted leaf surface · barrel vault · temple forms (domed bay, catenary vault); every other tab opens with no errors |
| Hidden in light mode | Organic and Minimal surface (draw nothing) · WebXR and Enter VR (do nothing without a headset) · Export IFC (wasm 404) |
| Body | no UI entry point; nothing to hide |
| Carried into the demo | the H19.2 guides fix (a site broke every frame on `main`) · A5's sun frame fix (the sun lit the site from the north) |
| Production | `0d38a884` opened once with the same tour: house built 50.8 s after load on the first visit, walls 8 → 9, 18 tabs with no error, the same tool results, 0 page errors, 0 failed requests |
| Not fixed | full graphics with a site shows only the sky; light draws the scene · the first visit waits on the item models |

## Gate (on `4561bf0e`)

| Check | Result |
|---|---|
| typecheck · `bun run build` | green (Bun 1.4.2 installed; pin 1.3.14) |
| tests | 13 of 20 packages green; the 7 others' 38 failing tests also fail on `main` (`c00d885f`) — none new |

## Open for the architect

- **Full graphics with a site loaded shows only the sky.** Production now opens in light graphics, which draws the scene; switching to full with a site loaded still shows only the sky.
- **IFC export:** the fix is `91c2ddfe` on `eco/a4`; it needs A4's decoder-path setting.
- **The 38 local test failures** (`demo-done.md`) come from this machine, not the code: a checkout path with spaces and `&`, Windows-only file behaviour, and CRLF fixtures. On Linux CI every package's tests pass (`ci-done.md`).
- A4 and A5 open items stand; see `A4-done.md` and `A5-done.md` on their branches.

commit: ci fix `8571285c` on `eco/ci` · demo merge `0d38a884` on `main`, production READY · H19.2a merge `c00d885f`
queue: merge `eco/ci` (merge commit) → production READY → record; then the next brief. A4 and A5 resume after the demo
