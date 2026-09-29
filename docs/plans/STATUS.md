# STATUS — Agent A
updated: 2026-09-29
phase: **UNIFY phase 0 merged** (scan and plan, docs only) · `81c1dd3f` READY · waiting for the next brief (UNIFY P1 when the architect says). A4 · A5 · H19.2 are in production (`79dc5f13`).
state: UNIFY-A covers four things. First, a read-only scan of FreeCAD on Johny's PC: 1.1.4 with IfcOpenShell 0.8.4 at `C:\AI-Work\Ai apps & Codebase\FreeCAD`, no add-ons, no MCP bridge, and 19 downloaded repositories, each with its role and licence. Second, the "Edit building" ↔ FreeCAD IFC round-trip design. Third, Pascal ↔ FreeCAD BIM overlap. Fourth, steps P1–P4. Key finding: today's IFC export is not FreeCAD-ready (random ids, storeys at 0, misplaced openings, mirrored plan), so P1 fixes it first. Cleanup done. `eco/ci` is merged (`bd81105b`, production READY) and CI's quality job is green on `main`. Pull request #2 is closed. The remote holds only `main`: 24 branches are deleted. `eco/a5` (holding `eco/h19-2` and `eco/a4`) was rebased on `main` and merged as pull request #5 (`79dc5f13`). That puts `/builder`, what the world's "Edit building" opens, and the site in the editor into production. The demo's behaviour is unchanged (`A4-A5-landing-done.md`).

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
- **IFC export is not FreeCAD-ready** (UNIFY-A (a)): random GlobalIds, no project → site link, storeys at 0, openings shifted with windows on the floor, a north–south mirror, no georeference, and only walls, doors, windows and zones exported. UNIFY P1 fixes it.
- **No FreeCAD MCP bridge is installed** on Johny's PC. Choosing one, and recording its licence, is part of P3.
- **The bridge answers one origin** (`NEXT_PUBLIC_ECO_HOST_ORIGIN`, default `https://spatial-map.vercel.app`, A4); after this merge, production does too.
- **The host's reference massing (`eco-ghost`) did not appear** in the `/builder/embed/` harness, though its site and guides did. Not new; see `A4-A5-landing-done.md`.
- **The 38 local test failures** (`demo-done.md`) come from this machine, not the code: a checkout path with spaces and `&`, Windows-only file behaviour, and CRLF fixtures. On Linux CI every package's tests pass (`ci-done.md`).
- A4 and A5 open items stand; see `A4-done.md` and `A5-done.md`. Their commit SHAs predate the rebase; `A4-A5-landing-done.md` maps them.

commit: UNIFY-0 merge `81c1dd3f` on `main`, production READY · A4 · A5 · H19.2 merge `79dc5f13` · ci merge `bd81105b` · demo merge `0d38a884`
queue: waiting for the next brief; UNIFY P1 (a FreeCAD-ready IFC) when the architect says
