# freecad/

FreeCAD 1.1 macros, a workbench and checks for the Sulphur Mountain site. They run inside
FreeCAD, either as a macro or through the FreeCAD MCP connector. Nothing here runs in the
web app's build.

| Here | What it is |
|---|---|
| `Organic/` | the Organic workbench: three toolbars (Organic, Sacred, Biomimetic) of real solids, Send to the map and Import from the map. See `Organic/README.md` |
| `QUICKSTART.md` | for Johny: the exact clicks from an empty FreeCAD to a building in the map, with pictures |
| `realize.py` | a building drawn in the map (`built/1` records) made real without the window: the design, a `.glb`, an `.ifc`, a `.json` and a result. The map's "Realize in FreeCAD" calls it |
| `check_import.py` | a sample building in the map's records (`samples/built-sample.json`), rebuilt by Import from the map and by `realize.py`, every piece against a closed form; walls that end on each other against the old editor's numbers; wave vaults against lane R's; vaults along a drawn curve; with `--self-test` |
| `spec_to_records.py` | a house spec (walls as points, openings, roofs as formulas: Johny's `exchange\house\concept\oak_canopy_S01.json`) written as `built/1` records. Plain Python, no FreeCAD; nothing is designed in it |
| `check_spec.py` | a house built from those records, held against the spec itself: every wall face and top, every opening's jambs, sill and head, the floors, the chimney, the roofs; with `--self-test` (forged pieces, built and measured) |
| `InstallOrganic.FCMacro` | installs or updates the workbench in `%APPDATA%\FreeCAD\v1-1\Mod\Organic` |
| `check_toolbar.py` | presses every button's own code, at the origin and where a building stands, against closed forms; with `--self-test` |
| `check_organic.py` | checks the workbench's solids and the building it sent to the map (its place, the road, the existing buildings, the IFC), with `--self-test` |
| `build_test_pavilion.py` | builds the test building with the toolbar's own objects and sends it to the map |
| `SulphurMountainSite.FCMacro` | builds the site template from the land pack |
| `check_site.py` | checks the site template against the pack, with `--self-test` |
| `draw_placement.py`, `draw_tools.py` | pictures from the files themselves: a building where it stands; what the Sacred and Biomimetic toolbars make (`docs/plans/freecad/`) |
| `run_headless.py` | runs any of the above without FreeCAD's window, in `freecadcmd` |

Designs (`*.FCStd`) are not kept here; they live in `%USERPROFILE%\Documents\SulphurMountain`.

## Without the window: run_headless.py

```
$env:ORGANIC_HEADLESS = 'install,pavilion,selftest,toolbar'
& "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" "C:\Playground\Architect-editor\freecad\run_headless.py"
```

Steps, in the order given: `install`, `pavilion`, `check`, `selftest` (check_organic with its
forgeries), `toolbar` (check_toolbar with its forgeries; about 8 minutes), `import`
(check_import with its forgeries; about 4 minutes), `site` and `sitecheck` (a trial of the
site template into `SITE_FCSTD`), `picture`, `tools`.
`ORGANIC_HEADLESS_LOG` names a file that gets a copy of what is printed. The process ends
with 0 when every step passed. What needs the window: the site template people open (its
colours, line styles and dimension text), and check_site's J.

## realize.py: a building drawn in the map, made real

```
& "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" "C:\Playground\Architect-editor\freecad\realize.py" --pass <records.json> [<out folder>]
```

It reads a `built/1` file, rebuilds the building with the workbench's own objects, saves the
design and writes `<name>.glb`, `<name>.ifc`, `<name>.json` and `<name>.result.json` into the
folder `realized` beside the records (or the folder given). One line of what it prints
starts with `REALIZE` and carries the result as JSON; the process ends with 0 when the files
were written. In the result, `notes` is what the records say that the files do not (a type
not known, a number left out, a piece that could not be built); `site_notes` is what the
map's own files say of the place the building stands on (a road, the easement, an existing
building, lane C's build envelope). The two are never mixed. Each element of the result says
its solid's own box (`box_m`: two corners, the shape the map reads), a wall how many openings
are cut through it (`openings`, and each one in `opening_list`), a floor or a roof its
`holes`, and its volume by the exact measure. The contract, field by field:
`exchange\godot\FORMAT.md`, "Realize in FreeCAD". The file's own first lines say the same.

Walls that end on each other are joined as the map joins them (the old editor's rule: a
corner of two walls is whole, a wall that ends on another stops at its face, three walls
share a point): `Organic/organic_geom.py`, "walls that end on each other", and
`organic_objects.join_walls`, called by the import. Only walls of one level are joined; a
wall with a shaped top on a smooth curve keeps square ends, and the import's notes say how
many ends that is. `check_import.py` (group J) holds each wall's plan against the old
editor's own numbers, read from the port note where its code printed them.

A wave vault (a `Vault` with `WaveAmplitude` and `Waves`) and a vault along a drawn curve
are built section by section (`Organic/organic_geom.py`, `sectioned_vault`), not lofted:
OCCT's loft left a wave vault 13.7 mm under its wave between two sections with every
section met (`Organic/README.md`, the notes for whoever changes the kernels). A curve that
bends tighter than the vault reaches to either side is refused inside the curve, and the
note says where, on what radius and how far the vault reaches; at an end of the curve, where
the map's own curve turns sharpest, the last sections are turned a little off square
instead, and the note says by how much. `check_import.py` (group V) holds the wave vault
against lane R's own numbers, read from R's note, and against the section's closed form
summed along the wave.

Measured on this PC: a room of one round wall with a door, a floor and a dome takes 2.7 to
3.0 s for the whole process; the 24-piece sample 45 to 65 s.

## spec_to_records.py and check_spec.py: Johny's house from his spec

```
python "C:\Playground\Architect-editor\freecad\spec_to_records.py" <spec.json> <records.json> --floor lower=0.30 --name "Oak Canopy S01"
& "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" "C:\Playground\Architect-editor\freecad\check_spec.py" --pass <spec.json> <design.FCStd | records.json> --without=RS-PAV [--self-test]
```

`spec_to_records.py` reads a spec of the kind `exchange\house\concept\CHATGPT-PROMPTS.md`
section 11 asks for and writes the map's records: one plan curve and one wall for each wall
path (an outer-face path thickened inward, a centreline centred, the top-edge samples as
`TopHeights`), the openings on their walls' lists, a slab for each floor outline with the
courtyards as holes, the chimney as a solid of revolution, and each roof shell as a
`HeightFieldShell`: the spec's own expression worked out on a grid. The rules are at the top
of the file. What the spec says that the records do not hold goes, line by line, into
`<records>.notes.txt`. A number the spec does not state is never made up: the lower floor's
slab is made only because `--floor lower=0.30` says so, and the notes say that.

`check_spec.py` does not read the records. It takes every number from the spec and every
measure from the solids, by walking each solid with points (in it or not): where both faces
of a wall stand at each point of its path and half-way between, where its top is, where an
opening's two jambs, its sill and its head are, each floor's area, level and thickness, the
chimney's radius, each roof's top against the spec's own samples and against its expression,
its thickness, its holes and what it holds; round every point where walls end on each other,
that nothing of the spec's walls is lost and no two walls share space; and every solid's
volume two ways, FreeCAD's own against OCCT's adaptive measure. `--self-test` builds forged
pieces through the same import (a wall thickened outward, an opening 0.40 m along, a roof
0.05 m too high, a floor without its courtyards, walls with butt ends, a joined wall with
each side in one face, ...) and must see each rejected by the check meant for it.

Johny's concept S01, 2 Oct 2026: 75 pieces, built in 30 s; 20 checks pass and 21 of 21 forged
pieces are rejected; the whole check takes six to nine minutes (measured: 362 and 365 s
alone, 473 and 528 s with other runs beside it), its forged pieces five to seven more. The
first run of this check found 11 of the 50 openings not cut at all, in a house whose every
solid was "valid": see `OPENING_PAST_MM` in `Organic/organic_geom.py`. The workbench's older
check found the next fault, on the sent house: a joined wall whose sides were each one face
on one long spline, which FreeCAD's own Volume read 4 % short (see `pieces_of` there).

## SulphurMountainSite.FCMacro: the site template

It builds `SulphurMountain-site.FCStd` from the land pack: lane C's, read from its own
folder on this PC (`C:\Playground\Sulphur - Spatial - Map\sulphur-mountain-world\`, the
dataset of record: `knowledge\DATA-INVENTORY.md`), and from its published address
(https://sulphur-mountain-world.vercel.app/) only where that folder is not there. Nothing
from the pack is stored in this repository.

- **Frame.** The canonical one (`C:\Playground\BRAIN.md` §3). The unit is metres. The
  origin (0, 0, 0) is the anchor, lng −119.15536, lat 34.4331, on the ground there:
  Z = 0 is 425.63 m NAVD88. +X points east and +Y true north. The BIM Site holds the
  anchor's longitude and latitude, elevation 425.63 m and declination 0, plus its UTM 11N
  coordinates and the pack's DEM reading under it.
- **Terrain.** USGS 3DEP 1 m terrarium tiles give one vertex per second pixel, at the
  pixel's own centre and value. Contours are drawn every 1 m, with an index contour every
  5 m.
- **Survey.** The property line has 11 corners draped on the terrain, plus a flat copy at
  Z = 0. Its 11 horizontal distances are dimensioned. Also drawn: the 16 ft access
  easement and the 4 found monuments.
- **Roads.** The county's road centrelines (`county.geojson`), draped, as far as the
  terrain reaches. The county gives no width (the Godot map draws them 6.1 m wide). A
  building belongs clear of them and of the easement.
- **Setbacks.** These are the typical Ventura RE/AE yards from
  `packages/plugin-eco/src/eco-jurisdiction-ventura.ts`: front 6.10 m, side 1.52 m,
  rear 4.57 m, height limit 10.67 m. **They are not the record.** Since the night of 1 Oct the record is
  lane C's `exchange\godot\build-envelope.geojson` (the county's ordinance, the oaks, the
  steep ground, the easement); this outline duplicates it and is declared as such in
  `knowledge\DATA-INVENTORY.md` §10 for the architect to decide. Build by C's file. The front is the edge with
  the most frontage within 8 m of a county road centreline; the edges beside it are
  sides; the rest are rear. `BuildableEnvelope` is the parcel less every edge's buffer.
- **Existing structures.** These are simple solids: the county footprints on their county
  bases with their 2018 lidar roof heights, and the warehouse's lidar roof plane. Each
  solid stores the terrain under it (`TerrainUnderM`) and its drift from its base
  (`TerrainDriftM`).

Run it from FreeCAD ▸ Macro ▸ Macros… ▸ `SulphurMountainSite.FCMacro`. Over the network it
took 15–40 s; read from the pack's folder it has not been timed on its own.

| Environment variable | Default | Meaning |
|---|---|---|
| `SITE_FCSTD` | `%USERPROFILE%\Documents\SulphurMountain\SulphurMountain-site.FCStd` | the output file |
| `SITE_PACK_URL` | the pack's folder on this PC; its published address where that is not there | the pack (a `file:///` or `https://` address ending in `/`) |
| `SITE_FRONT_EDGE` | (the edge with the most road frontage) | 1-based front edge override |

The `.FCStd` is never committed. It holds the pack's terrain, which is read at run time
and never copied into a repository.

## check_site.py: the check, with `--self-test`

It compares the file with the pack (read from the same place as the macro reads it). Every expectation is derived again here,
independently of the macro:

- A: georeference, including a UTM 11N projection computed here.
- B: every edge against its survey call.
- C: every corner against the survey ring.
- D: 400 terrain vertices against the tiles, decoded by Qt rather than the macro's PNG
  decoder.
- E: the terrain against `positions.csv`.
- F: the front edge and the buildable area.
- G: the existing structures.
- H: the dimensions.
- I: north and units.
- J: each dimension's text as drawn, along its edge and readable.
- K: the county's road centrelines, drawn where the terrain reaches.

`--self-test` forges eleven faults (twelve with the window) and must see every one rejected.

```python
# in FreeCAD's Python console, or through the connector
import os; os.environ["SITE_CHECK_SELF_TEST"] = "1"
exec(open(r"C:\Playground\Architect-editor\freecad\check_site.py", encoding="utf-8").read())
```

Close the site document before checking. The check reuses an open document with the same
file name, so it would read what is on screen rather than what was saved. J needs the GUI.
In `freecadcmd` it prints SKIP.

## Licences

- FreeCAD 1.1.4: LGPL-2.1-or-later. It runs as its own program, and nothing from it is
  copied here.
- The FreeCAD MCP add-on (neka-nat/freecad-mcp 0.1.25): MIT. It is installed in
  `%APPDATA%\FreeCAD\v1-1\Mod`, not here.
- USGS 3DEP terrain: public domain. It is read at run time from the pack.
- The pack's layers: the pack's own work (lane C). They are read at run time.
- These macros and checks: MIT, like the rest of this repository's own code.
