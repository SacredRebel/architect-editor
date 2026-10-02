# freecad/

FreeCAD 1.1 macros, a workbench and checks for the Sulphur Mountain site. They run inside
FreeCAD, either as a macro or through the FreeCAD MCP connector. Nothing here runs in the
web app's build.

| Here | What it is |
|---|---|
| `Organic/` | the Organic workbench: three toolbars (Organic, Sacred, Biomimetic) of real solids, Send to the map and Import from the map. See `Organic/README.md` |
| `QUICKSTART.md` | for Johny: the exact clicks from an empty FreeCAD to a building in the map, with pictures |
| `realize.py` | a building drawn in the map (`built/1` records) made real without the window: the design, a `.glb`, an `.ifc`, a `.json` and a result. The map's "Realize in FreeCAD" calls it |
| `check_import.py` | a sample building in the map's records (`samples/built-sample.json`), rebuilt by Import from the map and by `realize.py`, every piece against a closed form; with `--self-test` |
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
(check_import with its forgeries; about 3 minutes), `site` and `sitecheck` (a trial of the
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
building, lane C's build envelope). The two are never mixed. The contract, field by field:
`exchange\godot\FORMAT.md`, "Realize in FreeCAD". The file's own first lines say the same.

Measured on this PC: a room of one round wall with a door, a floor and a dome takes 2.7 to
3.0 s for the whole process; the 24-piece sample 45 to 65 s.

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
