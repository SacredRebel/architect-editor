# organic-done — the Organic workbench, the test building on the map, the Sacred and Biomimetic tabs

Lane A (FreeCAD). Branch `eco/organic`. Written 1 Oct 2026. Local only; no pull request.

## What was asked

- **29 Sep, the architect:** scan every shaping tool on this PC (one table); bring the editor's organic generators into FreeCAD as one "Organic" toolbar of real solids in metres; one button that sends the selected building to `exchange\godot\` at its real position. Done = a test building with curved walls, a leaf-shell roof and a vault, made with the toolbar in minutes, one click, and it stands on the site in the Godot map.
- **1 Oct, six steps:** (1) re-base everything on the canonical frame (`BRAIN.md` §3: anchor −119.15536 / 34.4331, ground 425.63 m), re-run the installer, re-send the pavilion; (2) close the check: leaf tips to the ground, the IFC read-back, the self-test; (3) press every one of the 14 buttons and fix what fails; (4) the connector's auto-start; (5) search first, then a "Sacred" tab and biomimetic tools, a trace file per tool, `knowledge\DESIGN-LANGUAGE.md`; (6) watch `exchange\house\concept\` for Johny's house.
- **1 Oct, two findings from the map:** the pavilion stands on the road: pick a clear spot and add "not on a road, not inside the existing buildings" to the check; carry the building's position explicitly (the `.json` and the `IfcBuilding` placement), field names agreed through `FORMAT.md`.

## What is there

| | |
|---|---|
| The workbench | `freecad/Organic/`: 26 buttons in three toolbars (Organic 14, Sacred 7, Biomimetic 5). Installed copy in `%APPDATA%\FreeCAD\v1-1\Mod\Organic` equals the repository (installer re-run 1 Oct). |
| The test building | `exchange\godot\organic-test-pavilion.glb / .ifc / .json`, seven elements: a curved room wall with five openings and a wave top, an S-curved garden wall with an arched gate, a leaf-shell roof on footings, a ribbed catenary vault, a floor 0.36 m above the building's level, and a round step (0.18 m) at each door: the floor and the steps are there for the map's walker (the architect's line of 18:40). Built by `freecad/build_test_pavilion.py` in about 30 s; design in `Documents\SulphurMountain\Organic-test-pavilion.FCStd`. |
| Where it stands | 112.0 m west, 31.0 m north of the anchor, its level (z = 0) on the map's ground there (419.56 m) and its floor 0.36 m above that, turned 30° clockwise. 49.4 m from the nearest road, 22.7 m from the access easement, 101 m from the nearest existing building (footprint to edge); its centre 20 m inside the surveyed boundary. |
| How its place is carried | geometry in the building's own frame; `placement` in the `.json` and in the GLB root's `extras`; `IfcSite` at the anchor, the `IfcBuilding` placed on it. `FORMAT.md` §3a, in the words of C and E's `edits/2`. E reads it: "both say the same place to 0.000 m … the map's own terrain there is 419.56 m". |
| The site template | `freecad/SulphurMountainSite.FCMacro` on the canonical frame, now with the county's road centrelines. |
| The words | `C:\Playground\knowledge\DESIGN-LANGUAGE.md`. |

Pictures (drawn from the files themselves, not screenshots of a window): `docs/plans/freecad/organic-test-pavilion-site.png`, `organic-test-pavilion-views.png`, `sacred-tab.png`, `biomimetic-tab.png`.

## Checked how

All run in `freecadcmd` (FreeCAD's console program), because FreeCAD's window was closed the whole block. Each check derives its expectations itself and must reject every forged fault by the check meant for it.

| Check | Result |
|---|---|
| `check_organic.py` (the building sent to the map) | **37 checks OK; 17 of 17 forged faults rejected** |
| `check_toolbar.py` (every button's own code, at the origin and at the spot turned 30°) | **140 checks OK; 26 commands; 23 of 23 forged faults rejected** |
| `check_site.py` on a trial build of the re-based site template | **26 checks OK; 11 of 11 forged faults rejected**; J (the dimension text as drawn) says SKIP without the window |

Some of what they hold:

- Kernels against closed forms: arc wall, circle wall, wall less a window, wave-topped wall, semicircular vault, hemispherical dome, all to 0.000 %.
- The sidecar's place = the design building's own place (3 cm, 0.01°); the GLB and the IFC say the same; the building's origin lies inside its footprint; every element's points, turned and moved by the placement, within 3 cm of FreeCAD (worst 1.5 cm).
- Not on a road or the easement, by the map's own meshes and by the pack's centrelines and survey, the two agreeing; not inside an existing building, by the map's file and the county's footprints. Forged: "back on the driveway" (0.0 m from the road), "inside the existing house".
- Every ground-reaching element meets the map's terrain (lowest points 0.84 m below to 0.15 m above). The ground under the room lies 0.17 m below to 0.15 m above the building's level, so the floor (0.36 m) is clear of it everywhere.
- The opening's volume against an integral worked out in the check; the hexagon wall perimeter × t × H; the vesica wall from two lens areas; the icosahedron 5(3 + √5)/12 a³.
- This workbench's sun (NOAA) against the pack's (astronomy-engine): worst 0.028° over 16 azimuths. "Turn to the sun": the building's front at the pack's June-solstice sunrise bearing, its parts carried along.
- The net's nodes in balance to 1e-14 and on the membrane's paraboloid; the branching column's 9 tips level; the cellular wall's open share by volume and by sampled points.

## What was found and fixed on the way

- **A shape's own move was dropped when it was given to its object.** Found when the pavilion's floor and steps all landed at its origin. Since 29 Sep a vault was never centred on its origin, a solid never stood on its face, a wall's base offset did nothing. Fixed at the root (`organic_geom.baked`); eight such moves are now held by their boxes (`check_toolbar.py` M). The pavilion's vault is set 2.5 m further in so that it stands where it has stood since the first send.
- The room wall could not be built with the building turned 30° at its real place: solids are now built in their object's own frame.
- A wave-topped wall's volume read up to 0.18 % off, differently in each direction: its top is cut in smaller pieces; it reads the closed form.
- A wall on a vesica failed (a spline through its corners): outlines with corners keep them.
- The first spot was on the county road: the new one was chosen against the map's road, easement and building meshes; the export warns; the check holds it.
- "New organic building" built in whichever document was active, not the one it was given.
- A fused branching column ended the process: columns, nets and vein ribs are compounds of solids.
- Round laths: 6.6 million triangles for one gridshell; rectangular laths: 15,000.
- The land pack's September equinox day is the UTC day (the 23rd); on the land it is the 22nd (0.49° in the sunrise). Reported to C; not A's file.
- The editor's geometry kit draws three figures wrong (turned squares, Fibonacci squares, the circle lattice). Built right in FreeCAD; the kit is paused and not changed.

## Open

- **Needs FreeCAD's window (Johny opens FreeCAD 1.1):** the site template made for real (colours, line styles, dimension text) and its check J; each of the 26 buttons clicked once in the toolbar with a real selection and a clicked point; screenshots of FreeCAD itself. The connector's auto-start is set (`auto_start_rpc: true`) and unconfirmed until then.
- **Save points are off the branch.** A stale, empty `.git\index.lock` (15:35, 1 Oct) blocks commits; moving it aside was refused for this window. The work is stored as commits under `refs/backup/eco-organic-savepoint`; the branch is still at `30855c3f`.
- **Johny's house:** `exchange\house\concept\` holds only the README and the prompts.
- The veined leaf, the gridshell and the branching column report a volume that counts overlaps at joints twice.
- The pavilion's leaf rests on two footings 1 m long; its eave elsewhere stands 0.4 m above the building's level, as designed on 29 Sep.
- From the ground to the entrance step is about 0.28 m (the ground falls 0.1 m there); from the step to the floor 0.18 m.

## Licences

This repository's own code: MIT. Methods from three.js (MIT) and from published papers, written anew. FreeCAD (LGPL-2.1+), IfcOpenShell (LGPL-3+), numpy, scipy, shapely (BSD) and matplotlib are used as installed; nothing of theirs is copied. GPL and CC BY-SA sources in the pool were read for method only. Trace files: `C:\Playground\knowledge\tools\`.
