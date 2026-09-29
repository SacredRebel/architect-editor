# F1 — the Sulphur Mountain site template in FreeCAD

**Branch:** `eco/freecad-site`, from `main` at `fc06f565`. A local save point, not pushed and with no PR, as the architect's "local only, commits as save points" direction says.
**Brief:** architect → FreeCAD lane, 29 Sep, F1. A macro builds `SulphurMountain-site.FCStd` from the live pack. It draws:

- the terrain surface;
- the property line and setbacks;
- north;
- the chimney origin and the 425.90 m datum;
- existing structures as simple solids.

It works in metres, georeferenced to the pack. Done means Johny opens the file and sees the site with exact dimensions.
**Superseded:** later on 29 Sep, Johny's final direction limits the lane to structure and houses (organic architecture). F2 (plans) and F3 (IFC P1) are not started. `eco/unify-p1` stays parked.

## What was made

- **`freecad/SulphurMountainSite.FCMacro`** builds the site from https://sulphur-mountain-world.vercel.app/ on every run (pack 1.6.0), in about 15–40 s. `freecad/README.md` has the frame, the layers, the environment variables and the licences.
- **The file** is `%USERPROFILE%\Documents\SulphurMountain\SulphurMountain-site.FCStd`, about 2.1 MB. It is not committed: it carries the pack's terrain, which is streamed and never copied into a repository.
- **The screenshot** is `docs/plans/freecad/sulphur-mountain-site-plan.png`, the plan from the file as reopened. It shows the 11 boundary dimensions, the buildable envelope (dashed green), the easement (orange), the existing solids (grey), the chimney origin and north.

## The check: `freecad/check_site.py`, with `--self-test`

On the file as reopened, **25 checks pass** and **9 of 9 forgeries are rejected**, in FreeCAD 1.1.4 through the connector.

| Group | What is compared | Result |
|---|---|---|
| A | the Site against the pack's chimney; the datum; the declination; UTM 11N against `positions.csv` and a projection computed in the check | exact; UTM within 1 mm |
| B | every edge against its survey call | length worst 0.027 m; sideways worst 5.2 mm after one common rotation of 0.366° |
| B | perimeter and area against the survey | 2998.7 ft (2999); 9.467 ac (9.465) |
| C | every corner against the survey ring | 0.0000 m |
| D | 400 terrain vertices against the tiles, decoded by Qt | position 0.000 m; elevation 0.0000 m |
| E | the terrain under 37 placed points against `positions.csv` | RMS 0.076 m, worst 0.245 m |
| F | the front edge (most road frontage) and the buildable area, sampled on a 0.5 m grid | edge 3; 34,413 m² against 34,428 m² |
| G | four existing solids: area, base and height against the pack | all within tolerance |
| H | the 11 dimensions against the calls | 192.06, 115.09, 85.35, 11.58, 85.08, 38.09, 178.60, 97.15, 21.35, 12.25, 77.40 m |
| I | north arrow and units | +Y; MKS (m) |
| J | each dimension's text as drawn, along its edge and readable | worst 0.00°; it read **180°** on the earlier build, which is the fault below |

## Faults found and fixed

- **Upside-down dimension text.**
  - Draft's `make_dimension` guesses `FlipText` from the current working plane and view (`_get_flip_text_lin`). It flipped the four edges that run a fraction of a degree south of east.
  - The macro now sets the dimension plane and `FlipText` itself, then redraws.
  - Check J reads the drawn text transform, so it catches this. It failed at 180° before the fix and reads 0.00° after it.
- **Dimension placement.**
  - Each dimension line now sits 4 m outside its edge, square to it. It used to be offset away from the centroid.
  - Edges shorter than 18 m get smaller text, so the 11.58 m and 12.25 m labels no longer run into the corner ticks.
- **Hatched contours.** A flat patch lying exactly on a whole metre was cut along every facet edge. Contours are now cut 2 mm above each whole metre, below the tiles' 1/256 m step.
- **Retries.** The pack fetch timed out once, so both the macro and the check retry timeouts and dropped connections, three times.

## Notes for the architect

- **The county bases disagree with the 2018 terrain.** Each solid stores `TerrainUnderM` and `TerrainDriftM`. The macro keeps the pack's bases, which is what G checks.

  | Structure | Base source | Terrain vs base | Effect |
  |---|---|---|---|
  | concrete pad | county | 1.19 m above | hidden under the terrain |
  | house | county | 0.77 m above | base buried |
  | shed | county | 0.52 m below | floats |
  | warehouse | 2018 lidar | 0.01 m above | sits on the ground |

- **The chimney.** The macro uses the pack's chimney at −119.155333, 34.433118. The brief's rounded −119.15536, 34.4331 lies about 2.5 m west and 2 m south of it. The pack's DEM at the chimney reads 425.625 m; 425.90 m is the Oak Leaf main floor.
- **The basis of bearings.** The placed ring is turned 0.366° from the record bearings, one common rotation. B allows for it and reports it.
- **The setbacks** are the repository's typical Ventura RE/AE yards, marked "confirm with the AHJ" on the object.

## Used, checked and skipped, licences

- **Used:**
  - the FreeCAD MCP connector: neka-nat/freecad-mcp 0.1.25, MIT, installed in `%APPDATA%\FreeCAD\v1-1\Mod`, with auto-start on;
  - FreeCAD 1.1.4 built-ins: Mesh (terrain, contours), Part (wires, faces, envelope), Draft (dimensions), BIM (the georeferenced Site), PySide/Qt and pivy (in the check). FreeCAD is LGPL-2.1-or-later, runs as its own program, and nothing from it is copied here;
  - Playground-Os `mind/brain/TOOLS.md`, read for the tool order.
- **Checked and skipped:**
  - Claude Code skills: none covers FreeCAD.
  - The Addon Manager's GeoData and similar add-ons: the pack already gives the georeference and the terrain.
  - The 19 catalogued packages in `FreeCAD\packages` (`UNIFY-A.md`): none is needed for a site template.
  - IfcOpenShell 0.8.4 (LGPL-3.0, bundled with FreeCAD): no IFC in F1.
  - `execute_code_headless`: FreeCAD's command-line binary is not registered with the connector, and registering it would change the user-scope MCP configuration.
- **Data:**
  - USGS 3DEP terrain: public domain, streamed.
  - The pack's layers: the pack's own work, streamed.
  - The macro and the check: MIT.
- **Connector lessons:**
  - `execute_code` keeps its globals between calls, so an unclosed `zipfile` handle on the `.FCStd` kept FreeCAD from saving over it. Use `with`.
  - `App.openDocument` returns an already-open copy of the same file under another name.
