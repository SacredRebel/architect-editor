# STATUS — Agent A
updated: 2026-10-02 23:40 (this PC's clock)
phase: **FreeCAD lane: organic structures.** This follows the architect's 29 Sep note of Johny's final direction ("structure and houses only") and the unified layer of 1 Oct (`C:\Playground\CLAUDE.md`, `RULES.md`, `BRAIN.md`). Work stays local: commits are save points and there are no PRs. The running log is `UPDATES.md` at the repository's root.
- **The Organic workbench works in FreeCAD's real window and without it** (`organic-done.md` for 29 Sep to 1 Oct afternoon, `organic-window-done.md` for the night of 1 Oct), on `eco/organic`.
  - **31 buttons in three toolbars** (Organic 18, Sacred 8, Biomimetic 5), installed in `%APPDATA%\FreeCAD\v1-1\Mod\Organic`. The 27 of 1 Oct were each pressed in the real window through its own button, with real selections and clicks, one picture each (`docs\plans\organic\buttons\`); the four of 2 Oct (Wave vault, Conoid roof, Translation shell, Geodesic frame) are pressed by `check_toolbar.py`.
  - **The map's records, made exact:** the button **Import from the map** and `freecad\realize.py` (no window; for the map's "Realize in FreeCAD") rebuild a building drawn in the map from the workbench's own objects, every kind the map writes today, the forms of its catalogue that lane R's cards define included. The contract is `exchange\godot\FORMAT.md`.
  - **The test pavilion** stands 89 m west and 24 m north of the anchor since 1 Oct 23:45, turned 30°: a place taken from lane C's build envelope. "Send to the map" reads the envelope at every building and says what it holds there.
  - **Checks (2 Oct, 23:30, on the code committed, in the console and again in FreeCAD's window):** `check_organic.py` 66 checks and 36 of 36 forgeries; `check_toolbar.py` 194 checks and 42 of 42; `check_import.py` 60 checks and 90 of 90. `check_site.py` 27 checks and 12 of 12 on the real site template in the window (its code has not changed since).
  - **For Johny:** `freecad\QUICKSTART.md`, one page with pictures, from an empty FreeCAD to a building in the map (a copy in `exchange\house\QUICKSTART-FreeCAD.md`). The real site template is `Documents\SulphurMountain\SulphurMountain-site.FCStd`.
  - **Written:** `ORGANIC-SCAN.md` (two scans), `C:\Playground\knowledge\DESIGN-LANGUAGE.md`, the trace files in `knowledge\tools\`, lessons in `knowledge\LESSONS.md`, the FreeCAD section of `agents\EDITOR-AGENT.md`, lane A's rows in `knowledge\DATA-INVENTORY.md` §10.
  - **Johny's house, concept S01, built from his spec (2 Oct, 03:00):** `freecad\spec_to_records.py` writes `exchange\house\concept\oak_canopy_S01.json` as the map's records (`exchange\house\models\oak-canopy-s01.json`: 75 pieces, nothing designed on the way); Import from the map builds them in 30 s; the design is `Documents\SulphurMountain\Oak-Canopy-S01.FCStd`; sent to the map as `exchange\godot\oak-canopy-s01.glb` / `.ifc` / `.json`. 31 walls with 50 openings, three floors, the chimney, three roof leaves. `freecad\check_spec.py` holds every solid against the spec itself: 20 checks, 21 of 21 forged pieces rejected. **Sent again at 05:15 with its walls joined where they end on each other** (21 ends at 8 points, all partitions). Pictures: `docs\plans\organic\house\`. Not built: ribs, edge beams, columns, stairs, the clerestory ribbon, the pool pavilion, everything outdoors. What the land's files say of its place is with Johny: `NEW.md`.
  - **In the vocabulary for it:** a wall's `TopHeights`, `Holes` in a slab, `Revolved`, `HeightFieldShell` (lane R's proposal, decided in `FORMAT.md`); a rectangular opening follows its wall; volumes held against a tolerance are measured with OCCT's adaptive rule (pythonocc, inside FreeCAD).
  - **Commit guards:** the Playground's two git hooks in `.githooks\` (`core.hooksPath`).
  - **Walls that end on each other are joined, as the map joins them (2 Oct, morning):** realized exactly by the old editor's rule, held against its own numbers read from the port note. `realize.py`'s result and every sent `.json` say each solid's box (`box_m`), a wall's `openings` and `opening_list`, a floor's or roof's `holes`, and the volume by the exact measure.
  - **The wave vault, and vaults along a drawn curve (2 Oct, 07:30):** built section by section (OCCT's loft left a wave vault 13.7 mm under its wave between two sections, unseen by every other check), held against R's own numbers. A curve too tight for its vault is refused with the place and the radius; at the turned end of a map's curve the last sections are turned a little and the note says so. Pictures: `docs\plans\organic\vault\`.
  - **The port note for lane U has entries 1 to 10** (`Spatial Map\spatial-map\ports\FROM-ARCHITECT-EDITOR.md`): 24 reference blocks, 5,095 lines printed by the old editor's own code and held by the checker. Its reference scripts and records are in `ports\refcases\`.
  - **Lane R's shells and lattices (2 Oct, evening):** each a record kind in `FORMAT.md` first ("Lane R's shells and lattices as record kinds"), then a button: the **conoid** and the **translation shell** (made thick square to their formula); the saddle shell's second kind, **groined saddles** (4 to 16 lobes, built from patches with no boolean: the first version, made by a boolean, read 3.2 % short by FreeCAD's own volume); the **wave vault** as a button; the **geodesic frame** (struts and node balls, whole rows from the crown, R's icosahedron, its cutting list); **laths on any shell** (the Gridshell button with a shell selected: laths flat on its back both ways, a diagrid at 45°, two layers, a beam along its edges); the cellular wall as it was. The map's catalogue's own words are read (`GroinedSaddles`, `WaveVault`, `Figure`, `Supports`); a catalogue form not built here is named, not made as something else. Held against R's own numbers in `check_import.py` (F) and against closed forms worked out in the checks.
  - **Open, in the order asked:** a Steps button; buttons for `Revolved` and `HeightFieldShell`; a button that joins walls made one by one; the port note's next entries (the function inventory's §1.2 on); a triangulated lattice on a dome that is not a sphere (the geodesic frame is a sphere's).
- **F1, the site template** (`eco/freecad-site`, `7aea750e`, `freecad-site-done.md`) is re-based on the canonical frame and now draws the county's road centrelines.
  - F2 (plans) and F3 (IFC P1) are dropped under the new direction.
- The web editor stays paused as it was. The full picture for a fresh start is **`HANDOVER.md`**, built 29 Sep on `eco/handover-0929`.
direction (29 Sep 2026):
- The map moves to Godot 4.7.2 as a desktop app (lane E). Houses are designed in Blender 5.2.2 and FreeCAD 1.1.4 directly.
- Godot, Blender and FreeCAD MCP connectors are installed at user scope for every window.
- The browser world stays as the web viewer, the land pack (C) stays the data source, and the Atlas (F) stays the web front door.
paused with:
- **Production** is `main` at `ddc7e541`, READY as `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT`.
  - It includes site root (`5bac96f8`, pull request #9, `dpl_B5ZNCruy8N86UaHfpt8AG5GPhhjr`): the host's ground under "Edit building", and the house reference drawn.
  - It includes the widened previews (`ddc7e541`, pull request #8).
  - Site root's production acceptance (world → Oak Leaf → "Edit building ▸" → screenshot) still needs someone with the world's build PIN.
- **IFC P1 is on hold** on `eco/unify-p1` (`788effeb`, pushed, no PR).
  - Done there: the exporter and the converter's north-up reading, with 12 unit tests.
  - Not done: the export-twice/read-back check and the FreeCAD screenshot.
- **Saved for the handover:** `wip/h14-deploy-harness` (`1daaefbd`, from `stash@{0}`), `wip/h0-probe-scratch` (`972c506f`), and the pre-rebase and probe branches `eco/a4`, `eco/a5-prebase`, `eco/h19-2`, `eco/h17-0-probe` and `eco/h17-0-remeasure`. Every branch not merged into `main` is listed in `HANDOVER.md` §4.
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
| **site root** | the host's ground under "Edit building": a site root when there is none, the ground kept through scene loads, the house reference drawn | **`5bac96f8`** (merge commit, pull request #9, `site-root-done.md`) | **READY** `dpl_B5ZNCruy8N86UaHfpt8AG5GPhhjr` |
| **origins widened** | previews: `spatial-*-pauls-projects-af8162cc` (deployment and branch URLs) | **`ddc7e541`** (merge commit, pull request #8, `bridge-origins-done.md`) | **READY** `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT` |

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
- **IFC export on `main` is not FreeCAD-ready** (UNIFY-A (a)): random GlobalIds, no project → site link, storeys at 0, openings shifted with windows on the floor, a north–south mirror, no georeference, and only walls, doors, windows and zones exported. UNIFY P1 fixes it; P1 is on hold on `eco/unify-p1` (`788effeb`).
- **The GLB and the walk flip z on export; the site context does not** (`A5-done.md`, item 3). A design at the site's north boundary could land at its south boundary in the world. This is unverified against the world's import.
- **The bridge's origins:** the allowlist and the widened previews are in production (`d8ecb779`, `ddc7e541`).
- **The host's reference massing (`eco-ghost`) never drew before site root.** It minted a new object URL on every render. Fixed in `5bac96f8` (`site-root-done.md`).
- **A host scene sent before the editor's first load would still be replaced by that load.** Not observed; see `site-root-done.md`.
- **Port 4173 is taken on this machine** by another program. `check-a5-site` passes with `PORT=4192`.
- **The 38 local test failures** (`demo-done.md`) come from this machine, not the code: a checkout path with spaces and `&`, Windows-only file behaviour, and CRLF fixtures. On Linux CI every package's tests pass (`ci-done.md`).
- A4 and A5 open items stand; see `A4-done.md` and `A5-done.md`. Their commit SHAs predate the rebase; `A4-A5-landing-done.md` maps them.

commit: `eco/handover-0929` (`HANDOVER.md`, docs only, no PR) · `main` at `ddc7e541`, production READY `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT`
queue: none. The lane is paused; the next steps, if it resumes, are in `HANDOVER.md` §9.
