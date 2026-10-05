# BRAIN — what A, the Geometer, knows   (grows with every job; distilled, with where it lives)

## 1. Where lane A sits in the one program (C:\Playground\agents\PLAN.md §0)
Johny opens one thing: `exchange\godot\build\Sulphur Mountain.exe` (the Godot map; lanes E and U). In build mode he draws
pieces; the map keeps them as **records** (parameters in lane A's vocabulary, no geometry). **Ctrl+R** ("Realize in
FreeCAD") exports a drawn building to `exchange\godot\built\<name>.json` (format `built/1`) + the map's own `<name>.glb`,
then starts `freecadcmd.exe realize.py --pass <records> exchange\godot\built\realized` (`godot\scripts\built.gd`). FreeCAD
rebuilds the building from the Organic workbench's own objects and writes `<name>.FCStd`, `.glb`, `.ifc`, `.json` and
`<name>.result.json`; the map reads the result back and holds each solid's box (and each wall's openings) against its own
piece: "matches within 0.02 m". FreeCAD is found at `<Playground>\..\FreeCAD\bin\freecadcmd.exe`, i.e.
`C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe` — only when the .exe was started by its real path (through the
`C:\Playground` junction it looks in `C:\FreeCAD`; NEW.md asks E to add the path, 5 Oct).
This repository is also a **fork of the Pascal editor** (`packages\core|viewer|editor|mcp`, `apps\editor`,
`packages\plugin-eco`): Johny never works in it; its functions are ported into the map by logic (port notes).

## 2. The formats (the contract is `C:\Playground\exchange\godot\FORMAT.md`; read it again before writing to it)
- **Frame:** anchor lng −119.15536, lat 34.4331, ground datum 425.63 m (C:\Playground\BRAIN.md §3); a building's own
  frame: x east, y north, z up, metres; glTF is Y-up (x east, y up, z south). A record's lengths are times the
  building's `scale`.
- **`built/1`** (FORMAT.md "What A's toolbar reads"): `{format, id, name, saved, placement {coordinates, altitude_m,
  rotation_deg, scale}, pieces: [{id, type, name, ifc_type, params, placement?}]}`. A `params` name is the FreeCAD
  property of that name, set to the same number (metres into lengths, ids into links). The map leaves out of it: types
  `Pad`, `Surface`, `Dimension`, `Label`; its own figure kinds; `MAP_ONLY` fields (LeafShell Base/Overhang/Rise, Dome Base,
  Steps OnLand, Wall OpeningSwings); empty fields (built.gd `records()`).
- **The save, `edits/2`** (FORMAT.md "Closing the loop"): `exchange\godot\save\edits.sulphur-mountain.geojson`, written
  by Johny's Ctrl+S; layers `models` (a drawn building: `drawn: true`, `pieces: n`), `pieces` (one per piece: id,
  building, type, name, ifc_type, params, placement, level …), `trees`.
- **The realize result:** ok, complete, notes, pieces/made/solids, elements (piece, type, ifcType, volume_m3, box_m,
  openings, opening_list [at_m, width_m, sill_m, height_m, shape, kind], wall_kind, holes), placement, files, seconds.

## 3. The kernel (`freecad\Organic\`, the workbench "Organic")
| Module | What |
|---|---|
| `organic_geom.py` | the geometry: curves, walls (tops, openings, joints, corner tops), floors, roofs, height fields, vaults, domes, bands, hung members (roof frames); `volume_of` (OCCT adaptive), `plan_zone` (shapely) |
| `organic_objects.py` | the FreeCAD objects (Wall, Slab, PlanCurve, ShellRoof, LeafShell, Dome, Vault, Steps, Revolved, BranchingColumn, HeightFieldShell, WallBand, RoofFrame, the biomimetic forms…), `join_walls` |
| `organic_import.py` | records → objects (`import_built`; TYPES, ALIASES, PASSED_OVER, the opening re-measure on smooth curves) |
| `organic_records.py` | objects → records (`records_of`, 5 Oct): the import the other way round |
| `organic_export.py` | objects → .glb, .ifc, .json; the land checks (`site_clearance`, `envelope_at`) |
| `organic_points.py` | the map's own sampling of a curve through points (`map_points`, `along_map_points`, `foot_on_map_points`) |
| `organic_biomimetic.py`, `organic_commands.py` | lane R's shells and lattices; the toolbar's buttons |
Around it: `freecad\realize.py` (Ctrl+R), `freecad\roundtrip.py`, `freecad\spec_to_records.py` (a house spec → records;
S01), the checks `check_organic.py`, `check_toolbar.py`, `check_import.py`, `check_spec.py`, `check_site.py`, all through
`freecad\run_headless.py` (`ORGANIC_HEADLESS` steps). Notes for whoever changes the kernels: `freecad\Organic\README.md`.

## 4. Principles that held (each was paid for; details in memory\LESSONS.md and knowledge\LESSONS.md)
| Principle | Where it shows | The tool |
|---|---|---|
| probe solids with points, between the given places too | every check | `shape.isInside`, upright lines (`column_of`) |
| two measures of one quantity | volumes | `og.volume_of` beside `Shape.Volume` |
| no lofts through many sections | vaults, shells | curve interpolations (`og.sectioned_vault`, `surface_through`) |
| make members from their own faces, no booleans | bands, roof frames | `_lined_solid` (ruled edge by edge) |
| plan booleans in shapely, not OCCT | bands, frames | `og.plan_zone` |
| a tool made of pieces: each piece can fail alone | corner tops | per-piece common volume |
| the trip's own noise is no edit | round trip | `organic_records.SAME_M` 0.5 mm |

## 5. Vocabulary (the map's words = lane A's)
Records, pieces, kinds (`type`), `WallKind`, `OpeningKinds`, `Smooth`, `TopHeights`, `BaseOffset`, levels (lower −3.0,
ground 0, mezzanine 3.8), Realize (Ctrl+R), the concept package (Ctrl+Shift+E), exchange folder, the drop-in (C's
watcher), port notes, Done lines, two strikes, stall rule.

## 6. What I do not know yet
- Whether E will send `Pad` (the ground) as a record kind, and how the map wants pads built against the land.
- The formulas of the catalogue's leaf roof on ribs (107) and folded dome (102) as FreeCAD solids (they are in the map's
  `ui\ports\patterns.gd`).
- How Johny's own first save will look (none yet on 5 Oct).
