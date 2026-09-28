# STATUS — Agent A
updated: 2026-09-28
phase: **demo recorded on `eco/demo`** · waiting on the human's merge to `main`, then production READY
state: H19.2a is merged and READY in production. `eco/demo` carries the demo: light graphics by default, a site and house when the world sends nothing, and the tools that fail hidden in light mode. Its preview is READY. `gh` is not signed in, so the merge is the human's: the compare link is in `demo-done.md`.

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY |
| **H19.0 · H19.1 · H19.2a** | re-measure · profile · dpr never above the display | **`c00d885f`** (merge commit) | **READY** `dpl_GZ9asee41gW5m25zNL4yNFQY33JE` |
| **demo** | light graphics · demo site · hidden tools | `eco/demo` · done **`ab9c1806`**, preview READY | after the human's merge |
| H19.2 · A4 · A5 | guides · 2b · 2c · 2d profile · `/builder` · site in the editor | `eco/h19-2` `273d912d` · `eco/a4` `39c602cc` · `eco/a5` `26042fd6` (pre-rebase) | resume after the demo |

## Demo (preview `dpl_5sTZbhRoymUj9g2YNA2xDPLoF9CD`, light graphics)

| Line | Result |
|---|---|
| Model | demo site and house built 11.1 s after load in a fresh profile; one wall drawn with the wall tool, walls 8 → 9 |
| Shown and working | catenary arch · lofted leaf surface · barrel vault · temple forms (domed bay, catenary vault); every other tab opens with no errors |
| Hidden in light mode | Organic and Minimal surface (draw nothing) · WebXR and Enter VR (do nothing without a headset) · Export IFC (wasm 404) |
| Body | no UI entry point; nothing to hide |
| Carried into the demo | the H19.2 guides fix (a site broke every frame on `main`) · A5's sun frame fix (the sun lit the site from the north) |
| Not fixed | full graphics with a site shows only the sky; light draws the scene |

## Gate (on `4561bf0e`)

| Check | Result |
|---|---|
| typecheck · `bun run build` | green (Bun 1.4.2 installed; pin 1.3.14) |
| tests | 13 of 20 packages green; the 7 others' 38 failing tests also fail on `main` (`c00d885f`) — none new |

## Open for the architect

- **Full graphics with a site loaded shows only the sky.** This is production today until the demo merges; light is the default after it.
- **IFC export:** the fix is `91c2ddfe` on `eco/a4`; it needs A4's decoder-path setting.
- **The 38 pre-existing test failures on `main`** are listed by package in `demo-done.md`.
- A4 and A5 open items stand; see `A4-done.md` and `A5-done.md` on their branches.

commit: demo done `ab9c1806` on `eco/demo` · H19.2a merge `c00d885f` on `main`
queue: the human merges `eco/demo` (merge commit) → production READY → record; A4/A5 resume after the demo
