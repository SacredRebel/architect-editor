# STATUS — Agent A
updated: 2026-09-28
phase: **A4 · A5 · H19.2 landing** · `eco/a5` rebased on `main`, pull request #5 green, preview READY · merge next
state: Cleanup done: `eco/ci` merged (`bd81105b`, production READY) and CI's quality job is green on `main`; pull request #2 is closed; 21 remote branches are deleted. `eco/a5` (holding `eco/h19-2` and `eco/a4`) is rebased on `main` as pull request #5, which brings `/builder` (what the world's "Edit building" opens) and the site in the editor to production. The demo is in production (`0d38a884`), and this merge keeps its behaviour (`A4-A5-landing-done.md`).

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
| **ci** | CI quality job: `plugin-geometry`'s test runs its geometry check | **`bd81105b`** (merge commit, pull request #4) | **READY** `dpl_Hqoy9Nx2WU5twRPjZdERqgbGYud7` |
| **H19.2 · A4 · A5** | 2b · 2c · 2d profile · `/builder` · the site in the editor | `eco/a5` **`43ac80d5`** (rebased) · pull request #5, CI green · preview READY `dpl_BEUtXvhS3aWRctxaNEo4PCeLhLps` | after the merge |

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
- **IFC export works with A4** (the `/builder` check downloads an `.ifc`), but light graphics still hides it, as the demo recorded. Showing it in light mode is a decision for after the demo.
- **The bridge answers one origin** (`NEXT_PUBLIC_ECO_HOST_ORIGIN`, default `https://spatial-map.vercel.app`, A4); after this merge, production does too.
- **The host's reference massing (`eco-ghost`) did not appear** in the `/builder/embed/` harness, though its site and guides did. Not new; see `A4-A5-landing-done.md`.
- **The 38 local test failures** (`demo-done.md`) come from this machine, not the code: a checkout path with spaces and `&`, Windows-only file behaviour, and CRLF fixtures. On Linux CI every package's tests pass (`ci-done.md`).
- A4 and A5 open items stand; see `A4-done.md` and `A5-done.md`. Their commit SHAs predate the rebase; `A4-A5-landing-done.md` maps them.

commit: `eco/a5` `43ac80d5` (pull request #5) · ci merge `bd81105b` on `main`, production READY · demo merge `0d38a884`
queue: merge `eco/a5` (merge commit) → production READY → delete `eco/h19-2`, `eco/a4`, `eco/a5` → record; then the next brief
