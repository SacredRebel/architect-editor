# Organic — a FreeCAD workbench for organic architecture

Curved walls, shells, vaults, leaf roofs and domes; figures of proportion, regular solids and
the sun's directions; nets, cellular walls, veined shells and branching columns. All as real,
parametric solids in metres, and one button that stands the building on the site in the Godot
map.

The words in plain language, with what each form is for: `C:\Playground\knowledge\DESIGN-LANGUAGE.md`.

The organic forms are ported from this repository's plugin-eco and plugin-hagia-sophia. Those
draw display meshes whose underside is a copy of the top. Here every thickness is a true
offset, every opening is a cut, and every result takes booleans, reports its volume and
exports to IFC.

## Install

Run `freecad/InstallOrganic.FCMacro` in FreeCAD 1.1 (Macro ▸ Macros…). It copies this folder
to `%APPDATA%\FreeCAD\v1-1\Mod\Organic` and loads it. After that the **Organic** workbench,
with its three toolbars, is there on every start. Run the macro again after pulling changes
(or, with FreeCAD closed, `ORGANIC_HEADLESS=install` and `freecad/run_headless.py`): a
running FreeCAD is updated where it stands, its open designs and its buttons included, with
no restart.

For Johny, click by click, from an empty FreeCAD to a building in the map:
`freecad/QUICKSTART.md`. Every button with every property and its default, for an agent:
`C:\Playground\agents\EDITOR-AGENT.md`, FreeCAD section.

## The three toolbars

### Organic

| Button | Makes | From |
|---|---|---|
| New organic building | a BIM building on a georeferenced site; new objects go into it, at its placement. Click the land first and it stands where you clicked, on the ground there | — |
| Grow organic building | a lobed plan, its wall with a door and windows, a shell roof and a slab | plugin-eco "Grow 5-lobe building" |
| Plan curve | lobed, circle, arc, S-curve, oval, leaf, shell, golden and log spirals, vesica; or **Points**: a smooth curve through listed points (as the map draws a wall), or straight runs that keep them as corners | plugin-eco plans, plugin-geometry |
| Curved wall | a wall of real thickness on any open or closed curve, with a flat, arched, waved or sloped top | plugin-eco smooth wall |
| Opening | an opening where you clicked the wall: a door (1.0 × 2.2 m) when you click near its foot, a window (1.2 × 1.3 m, sill 0.9 m) higher up; rectangular, arched, pointed or round | plugin-eco openings |
| Leaf shell roof | a shell from a ridge with four heights, an eave and a curl, with ribs; footings under its tips | plugin-eco leaf shell |
| Shell roof on a closed wall | eaves + rise (1 − ρ^2.2) from the pole to the wall, drooping to the overhang | plugin-eco organic roof |
| Ribbed vault | a barrel vault on an ellipse, semicircle, segmental, pointed, catenary or parabola, with ribs; a plinth under its springings | plugin-eco vault, plugin-hagia-sophia arch |
| Catenary arch | a free-standing arch; `ThrustInMiddleThird` is the Poleni check; the same plinth | plugin-hagia-sophia arch |
| Dome | ellipse, sphere, catenary, parabola or onion meridian, with an oculus | plugin-hagia-sophia dome |
| Minimal surface | a membrane on a closed curve, lifted by a mast ring | plugin-eco minimal surface |
| Saddle shell | a hypar, or a catenoid | — |
| Floor slab | a slab filling a closed curve; `BaseOffset` lifts or lowers it (a raised floor, a step) | — |
| Send to the map | `<name>.glb`, `<name>.ifc`, `<name>.json` in the exchange folder | — |
| Import from the map | a building drawn in the map (`exchange\godot\built\<name>.json`), rebuilt from these same objects at its place on the site | the map's build mode (`FORMAT.md`, `built/1`) |

### Sacred

| Button | Makes |
|---|---|
| Plan figure | vesica piscis, seed and flower of life, golden and root rectangles, turned squares, polygon, star, module grid: an outline to build on, with its construction lines |
| Regular solid | tetrahedron, cube, octahedron, dodecahedron, icosahedron, by edge, on a face or a vertex |
| Geodesic dome | an icosahedron cut by frequency and pushed out to a sphere, with a real thickness; a hemisphere or more |
| Sun rose | where the sun rises and sets at the year's eight stations, at the building's spot, from the land pack (over the ridge line, or on a level horizon) |
| Turn to the sun | turns the building about its own origin so that its front, back or an end faces north, east, south, west or one of those sunrises or sunsets |
| Snap to proportion | puts the selected objects' governing dimensions on whole modules and sets the dependent ones to the system's nearest ratio |
| Proportions report | a spreadsheet: each object's dimensions in metres and modules, its ratio, the nearest ratio of the system and of any system, and how far off |

The system (Golden, Root 2, Root 3, Musical, Palladio, Fibonacci) and the module are the two
properties of the document's **Proportions** object, made on first use.

### Biomimetic

| Button | Makes | Method |
|---|---|---|
| Gridshell | a net of laths over a closed curve, standing | force density: every node in balance |
| Hanging net | the same net, hung | the same |
| Cellular wall | a wall opened into cells between ribs | Voronoi cells of scattered seeds, drawn back and rounded |
| Veined leaf shell | a leaf shell whose ribs are grown as veins | space colonisation; widths by Murray's law |
| Branching column | a column that forks like a tree, its tips level | r_parent^e = n r_child^e |

Every length is a FreeCAD length property, so a metre document shows metres. The toolbars
set new documents to metres.

- **Curves a wall can follow:** an Organic plan curve, a plan figure's outline, a sketch, a
  Draft B-spline, an arc. An outline with corners keeps them (its wall's top is then flat).
- **Openings** are five lists on the wall, one entry per opening, in metres: position along
  the centreline, width, height, sill, shape.
- **One solid or several:** a gridshell, a hanging net, a branching column and a veined leaf
  are compounds of solids (laths, branches, ribs). Their volume counts the overlaps at the
  joints twice.
- **Reaching the ground where it falls away:** a wall has `Foundation`, a leaf shell and a
  vault have `Plinth` (how far their feet are carried below the base), a slab its
  `Thickness`. A dome, a net and a column stand on their base and need a wall or a slab
  under them on a slope. `check_organic.py` holds every base against the map's terrain.

## A building in minutes

1. Click the land where it should stand, then **New organic building** (or set its Placement
   by hand). The frame is the canonical one (`C:\Playground\BRAIN.md` §3), the same as the
   site template's: the origin at the anchor, lng −119.15536, lat 34.4331; Z = 0 on the
   ground there, 425.63 m; +X east, +Y true north. Move the building, not its parts: a
   moved or turned building keeps its solids and is there in a second.
2. **Plan curve** or **Plan figure**, then **Curved wall** with it selected. Click the wall
   and press **Opening** for each door (click low) and window (click higher).
3. **Leaf shell roof**, **Ribbed vault**, **Dome** or **Gridshell**; move each by its
   Placement.
4. **Sun rose**, **Turn to the sun**; **Snap to proportion**, **Proportions report**.
5. Select the building and press **Send to the map**.

## Send to the map

The export writes into `C:\Playground\exchange\godot` by default. To change the folder, set
the `ORGANIC_EXCHANGE_DIR` environment variable or the `ExchangeDir` string under
`BaseApp/Preferences/Mod/Organic`. The contract is `exchange\godot\FORMAT.md` §3a.

- **The building keeps its own origin** (its BIM building's placement). Its geometry is
  written in its own frame; where it stands is stated beside it.
- **The JSON** has `placement`: `coordinates` [lng, lat] of the building's origin,
  `altitude_m` above the 425.63 m datum, `rotation_deg` (`y` is the turn seen from above,
  anticlockwise positive), `elevation_m` (NAVD88), `offset_m` (east, north, up from the
  anchor). Also `clearance_m` to the nearest road, easement and existing building,
  `level_above_ground_m` (the building's z = 0 above the map's ground at its origin), notes,
  and each element's volume.
- **The GLB** is glTF Y-up in metres: one named node per element with its IFC class in
  `extras`, the same `placement` in the root node's `extras`, and no transform on the root.
  Its triangles enclose each solid's volume. FreeCAD's own glTF exporter is not used, because
  it drops placements.
- **The IFC** is IFC4 from FreeCAD's BIM exporter, with each element in its IFC class
  (`IfcType` on the object). `IfcSite` is the anchor, with its latitude and longitude to
  millionths of a second (the exporter writes whole seconds). The `IfcBuilding`'s placement
  on the site is the offset and the turn; its elements are placed under it; its property set
  `Organic_Placement` repeats the numbers.
- **It says so** when the footprint touches a road, the access easement or an existing
  building (read from the land files in the exchange folder), or when the building's level
  (its z = 0) is more than a metre off the map's ground.
- **It reads the map's build envelope** (lane C's `build-envelope.geojson` in the exchange
  folder: the county's setbacks, the protected oaks, the steep ground, the easement, the
  roads, the existing buildings) at every vertex of the building in plan. What the file holds
  there goes into the JSON as `envelope`: the share of the points inside the buildable area,
  and the share inside each kind that says no building, with the file's own reason. Each such
  kind is a line in the report view and in `notes`. Nothing about the land is worked out
  here: the file is read as it is, and a building is not stopped by it.
- A document whose BIM Site states another origin than the anchor is moved by the
  difference, so the building still lands in its real place.
- Also in the JSON: `source` (the design's file name) and `source_path` (its full path, once
  the design has been saved: the map's **O** key opens it), and `built_from` on a building
  that came from the map.
- **Parts hidden in the window are not sent.** Show what should go.

## Import from the map

**Import from the map** asks for a file in `exchange\godot\built\` (format `built/1`,
`FORMAT.md`) and rebuilds the building drawn there: each piece is the Organic object of the
same name, each `params` entry the property of the same name, in metres. The building
stands at the file's longitude and latitude, turned as in the map; the map's `scale`
multiplies every length. A curve of kind `Points` is the map's own smooth curve through
those points, span for span; an opening stands where the map measured it. What the file
names and this workbench does not know is said in the report view and left out, never
dropped in silence. Sent back, the building's JSON carries `built_from`.

## Notes for whoever changes the kernels

- **Build near the origin.** `organic_objects.base_edge` takes a base curve into the object's
  own frame before anything is built on it. OCCT lost a wave-topped wall 116 m out and turned
  30°, and measured its volume differently in every placement.
- `Part.OffsetCurve` edges and offset surfaces make faces that OCCT's booleans treat as
  self-intersecting: a cut silently does nothing. Offsets here are exact lines and circles,
  or splines through offset points; offset surfaces are converted to NURBS. Outlines with
  corners are offset as wires (`makeOffset2D`, intersection joins).
- OCCT measures area and volume per edge and per face with a fixed number of points. A face
  bounded by one spline of hundreds of spans reports its area several percent off, and a
  solid on it its volume (a wall read 43.4 m³ against 63.0 m³): `wire_of` splits long
  splines before every face. A shaped wall top is cut by ruled faces of at most 8 stations
  (`TOP_PIECE_STATIONS`); at 16 its volume read up to 0.18 % off.
- **A cut can fail without a word.** OCCT handed a wall back uncut, or cut under some faces
  only, and called it valid, where a shaped top line touched the prism's flat top at its
  crests (24 of 120 trial walls; none since the prism stands 0.5 m above the top line).
  `cut_top` also holds every result against the volume the wall must have, tries other
  stations where it does not agree, and raises rather than draw a wall that is not the one
  asked for. Wherever a tool only touches what it cuts, expect the same.
- **Offset curves** are splines through true offset points every 0.3 m (`OFFSET_STEP_MM`):
  within 1.3 mm of the true offset on a 0.5 m bend, with half the triangles of 0.1 m.
- **Meshing for the map** (`organic_export.tessellate`) meshes a copy of the whole solid
  (`MeshPart.meshFromShape`), then reads each face's triangles. Face by face OCCT gave a
  small house 191,000 triangles; and in the window a shape carries the triangles it was
  drawn with, which a face-by-face call hands back instead of making its own.
- **Updating a running FreeCAD.** `Gui.addCommand` keeps the first object registered under a
  name, and a document object keeps the methods its proxy had when it was set: after
  reloading the modules the installer gives each registered command the new class and sets
  every open object's `Proxy` again. Without both, the window runs the old code.
- **A click on a mesh** (the terrain) leaves no picked point in the selection; a selection
  observer hears it (`organic_commands.PickWatch`).
- **A design made without the window** has no view providers: it opens grey and flat.
  `organic_objects.dress` gives them back on opening.
- `Shape.BoundBox` takes B-spline faces untrimmed. Use `optimalBoundingBox(False, False)`:
  with its defaults it reads the triangles a shape was drawn with in the window (66 mm off on
  the test pavilion), so the same check passed in the console and failed in the window.
- `removeSplitter` can raise on a sound solid: `refined` keeps the solid then.
- Do not fuse solids that meet in a point (a branching column's forks): the result was
  wrong, and one such union ended the process. Leave them a compound.
- Sweep rectangles, not rounds, along splines: a round lath meshes into about 200,000
  triangles.
- Arch's `makeSite` and `makeBuilding` build in the active document.

## Checks

`freecad/check_toolbar.py` presses every button's own code twice (at the origin, and 116 m
out turned 30°) and holds the results against closed forms; `freecad/check_import.py` rebuilds
a sample building drawn in the map's words (`freecad/samples/built-sample.json`) and holds
every piece against a closed form worked out from the file's own numbers;
`freecad/check_organic.py` holds the kernels against closed forms and a building sent to the
map against its design, the map's land files, the map's build envelope and the land pack.
Each forges faults and must reject every one. All three run in the window (through the
FreeCAD MCP connector) and without it (`freecad/run_headless.py`). What they write on the way
goes into the temp folder and is taken away once read; `ORGANIC_CHECK_KEEP=1` keeps it.

## Licence

MIT; see `LICENSE`, which keeps the notices of plugin-eco (Pascal Group Inc.) and of the
Hagia Sophia plugin (ActArtech), whose maths is ported here. The force density and space
colonisation methods are written here from their published descriptions; the branch radius
law and the geodesic subdivision follow three.js (MIT). FreeCAD (LGPL-2.1-or-later),
IfcOpenShell (LGPL-3.0-or-later), numpy, scipy and shapely (BSD) are used as installed;
nothing of theirs is copied.
