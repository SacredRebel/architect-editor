# STATUS — Agent A
updated: 2026-09-29
phase: **paused**. Architect, 29 Sep: the map moves to Godot, and houses are designed in Blender and FreeCAD directly. The last phase is **site root** on `eco/site-root`, which the architect merges. IFC P1 is on hold.
paused with:
- **site root** (`site-root-done.md`). The host's ground lands under the building in "Edit building".
  - A scene without a site gets one.
  - The terrain goes back onto whatever scene the editor loads after the site.
  - The house reference (`refGlb`) draws; it never had before.
  - Production acceptance is still to do: world → Oak Leaf → "Edit building ▸" → screenshot. It needs the world's build PIN, which this lane does not enter.
- **Pull request #8** (`eco/bridge-origins-widen`, previews `spatial-*-pauls-projects-af8162cc`) has CI green and its preview READY. It waits on the architect's decision. It also edits this file, so whichever of #8 and site root merges second shows a conflict here. Keep site root's version.
- **IFC P1 is on hold.** Its work in progress is on the local branch `eco/unify-p1` (`788effeb`), which is not pushed.
  - Done there: the exporter (stable GlobalIds, north-up axes, georeference, stacked storeys, openings at their centres and sills, roofs, stairs and items per UNIFY-A's table, with 8 unit tests), and the converter's opt-in north-up reading.
  - Not done: the export-twice/read-back check and the FreeCAD screenshot.
state (before the pause): UNIFY-A covers four things. First, a read-only scan of FreeCAD on Johny's PC: 1.1.4 with IfcOpenShell 0.8.4 at `C:\AI-Work\Ai apps & Codebase\FreeCAD`, no add-ons, no MCP bridge, and 19 downloaded repositories, each with its role and licence. Second, the "Edit building" ↔ FreeCAD IFC round-trip design. Third, Pascal ↔ FreeCAD BIM overlap. Fourth, steps P1–P4. Key finding: today's IFC export is not FreeCAD-ready (random ids, storeys at 0, misplaced openings, mirrored plan), so P1 fixes it first. Cleanup done. `eco/ci` is merged (`bd81105b`, production READY) and CI's quality job is green on `main`. Pull request #2 is closed. The remote holds only `main`: 24 branches are deleted. `eco/a5` (holding `eco/h19-2` and `eco/a4`) was rebased on `main` and merged as pull request #5 (`79dc5f13`). That puts `/builder`, what the world's "Edit building" opens, and the site in the editor into production. The demo's behaviour is unchanged (`A4-A5-landing-done.md`).

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
| **H19.2 · A4 · A5** | 2b · 2c · 2d profile · `/builder` · the site in the editor | **`79dc5f13`** (merge commit, pull request #5) | **READY** `dpl_Gd2hzP9a9Lmrv2y6jr4AmozMZoE9` |
| **UNIFY-0** | scan and plan: FreeCAD, the IFC round-trip, P1–P4 (docs only) | **`81c1dd3f`** (merge commit, pull request #6) | **READY** `dpl_GpsDF2PHSUNz3XHamrDX7RTfnEPJ` |
| **bridge origins** | eco/1 answers the world, its previews, localhost and 127.0.0.1, and replies to the hello's origin only | **`d8ecb779`** (merge commit, pull request #7) | **READY** `dpl_9QZPXMYxq3XCkYGaZShMtuScrSPR` |
| **origins widened** | previews: `spatial-*-pauls-projects-af8162cc` (deployment and branch URLs) | `eco/bridge-origins-widen` (pull request #8, `bridge-origins-done.md`) | preview READY `dpl_CazfeZad6aqD3XEcMUq2k7n9hj6r`; the architect decides |
| **site root** | the host's ground under "Edit building": a site root when there is none, the ground kept through scene loads, the house reference drawn | `eco/site-root` (`site-root-done.md`) | after the architect's merge |

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
- **IFC export on `main` is not FreeCAD-ready** (UNIFY-A (a)): random GlobalIds, no project → site link, storeys at 0, openings shifted with windows on the floor, a north–south mirror, no georeference, and only walls, doors, windows and zones exported. UNIFY P1 fixes it; P1 is on hold, and its work in progress is on the local branch `eco/unify-p1`.
- **No FreeCAD MCP bridge is installed** on Johny's PC. Choosing one, and recording its licence, was part of P3.
- **The bridge's origins:** the allowlist is in production (`d8ecb779`). Pull request #8 widens the previews to `spatial-*-pauls-projects-af8162cc.vercel.app`.
- **The host's reference massing (`eco-ghost`) never drew.** It minted a new object URL on every render, and the loader never settled. Site root fixes it (`site-root-done.md`).
- **A host scene sent before the editor's first load would still be replaced by that load.** Not observed; see `site-root-done.md`.
- **Port 4173 is taken on this machine** by another program. `check-a5-site` passes with `PORT=4192`.
- **The 38 local test failures** (`demo-done.md`) come from this machine, not the code: a checkout path with spaces and `&`, Windows-only file behaviour, and CRLF fixtures. On Linux CI every package's tests pass (`ci-done.md`).
- A4 and A5 open items stand; see `A4-done.md` and `A5-done.md`. Their commit SHAs predate the rebase; `A4-A5-landing-done.md` maps them.

commit: `eco/site-root` (the architect merges) · allowlist merge `d8ecb779` on `main`, production READY · UNIFY-0 merge `81c1dd3f`
queue: none. The lane is paused until the architect's next brief.
