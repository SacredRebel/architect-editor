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
| Ribbed vault | a barrel vault on an ellipse, semicircle, segmental, pointed, catenary or parabola, with ribs; a plinth under its springings; along an open curve when one is selected; a wave vault when `WaveAmplitude` and `Waves` are set | plugin-eco vault, plugin-hagia-sophia arch; the wave: lane R's study (Dieste's vaults) |
| Wave vault | the vault with its wave set: a hanging-chain section, 8 m span, rise 2.4 m ± 0.6 m, three waves over 18 m, on walls 2.2 m high (its `Plinth`) | lane R's pattern card P-005 (study S-005) |
| Catenary arch | a free-standing arch; `ThrustInMiddleThird` is the Poleni check; the same plinth | plugin-hagia-sophia arch |
| Dome | ellipse, sphere, catenary, parabola or onion meridian, with an oculus | plugin-hagia-sophia dome |
| Minimal surface | a membrane on a closed curve, lifted by a mast ring | plugin-eco minimal surface |
| Saddle shell | its `Kind`: a hypar; **groined saddles** (saddles about one centre whose lobes rise to their tips and whose groins run down to supports on the ground; `Lobes` 4 to 16, eight by default: Candela's Los Manantiales type); or a catenoid | lane R's pattern card P-006 for the groined saddles |
| Conoid roof | a straight line sliding from an arch to a level line (the north-light roof): 9 m span, 12 m long, the arch rising 3 m, eaves 2.6 m, 0.08 m thick | lane R's pattern card P-003 |
| Translation shell | one arch slid along another over a rectangle: 10 by 14 m, rising 1.6 m across and 2.2 m along, corners 2.6 m up | lane R's pattern card P-004 |
| Floor slab | a slab filling a closed curve; `BaseOffset` lifts or lowers it (a raised floor, a step) | — |
| Send to the map | `<name>.glb`, `<name>.ifc`, `<name>.json` in the exchange folder | — |
| Import from the map | a building drawn in the map (`exchange\godot\built\<name>.json`), rebuilt from these same objects at its place on the site | the map's build mode (`FORMAT.md`, `built/1`) |

### Sacred

| Button | Makes |
|---|---|
| Plan figure | vesica piscis, seed and flower of life, golden and root rectangles, turned squares, polygon, star, module grid: an outline to build on, with its construction lines |
| Regular solid | tetrahedron, cube, octahedron, dodecahedron, icosahedron, by edge, on a face or a vertex |
| Geodesic dome | an icosahedron cut by frequency and pushed out to a sphere, with a real thickness; a hemisphere or more. `Frame` makes it a frame instead |
| Geodesic frame | the same dome as a frame (lane R's pattern card P-001): a round strut on every edge and a ball at every node, whole rows of triangles from the crown, the foot set level; 10 m across at frequency 3, five rows: 165 struts of three lengths. `StrutList` is its cutting list |
| Sun rose | where the sun rises and sets at the year's eight stations, at the building's spot, from the land pack (over the ridge line, or on a level horizon) |
| Turn to the sun | turns the building about its own origin so that its front, back or an end faces north, east, south, west or one of those sunrises or sunsets |
| Snap to proportion | puts the selected objects' governing dimensions on whole modules and sets the dependent ones to the system's nearest ratio |
| Proportions report | a spreadsheet: each object's dimensions in metres and modules, its ratio, the nearest ratio of the system and of any system, and how far off |

The system (Golden, Root 2, Root 3, Musical, Palladio, Fibonacci) and the module are the two
properties of the document's **Proportions** object, made on first use.

### Biomimetic

| Button | Makes | Method |
|---|---|---|
| Gridshell | a net of laths over a closed curve, standing; **or, with a shell selected** (a dome, a vault, a leaf, a conoid, a saddle), laths lying on its back both ways (`Turn` 45: a diagrid; `Layers` 2: a second lath on each), with a beam along each edge of it (a ring at a dome's foot, another round its oculus) | force density: every node in balance; on a shell: lane R's tool spec (study S-003) |
| Hanging net | the same net, hung | the same |
| Cellular wall | a wall opened into cells between ribs | Voronoi cells of scattered seeds, drawn back and rounded |
| Veined leaf shell | a leaf shell whose ribs are grown as veins | space colonisation; widths by Murray's law |
| Branching column | a column that forks like a tree, its tips level | r_parent^e = n r_child^e |

Every length is a FreeCAD length property, so a metre document shows metres. The toolbars
set new documents to metres.

- **Curves a wall can follow:** an Organic plan curve, a plan figure's outline, a sketch, a
  Draft B-spline, an arc. An outline with corners keeps them (its wall's top is then flat).
- **Openings** are five lists on the wall, one entry per opening, in metres: position along
  the base curve, width, height, sill, shape. A rectangular opening follows its wall: its
  width is measured along the base curve and each jamb is square to the wall where it stands
  (a glazed bay that turns 42° over its width is cut true). The arched, pointed and round
  shapes are a flat outline pushed straight through, square to the wall at their middle.
- **A wall's top by heights** (`TopHeights`): one height for each point of a base curve
  through points, and the top is the smooth line through them; any other curve takes them
  spread evenly along its length. For a wall that follows a roof.
- **A wave vault** is a vault with two more numbers: `WaveAmplitude` (how far its rise goes
  up and down along it) and `Waves` (whole waves along its length, the first crest at its
  start). Every section is the vault's own arch for the rise there; a trough keeps 0.2 m of
  rise; a semicircle has one rise for its span and takes no wave; it has no ribs.
- **A vault along a curve** (its `Base`: any open plan curve) stands square to the curve at
  every place. A curve that bends tighter than the vault reaches to either side would fold
  it over itself: the vault is then not built, and its error says where, on what radius, and
  how far it reaches. At the two ends of a curve drawn in the map the curve turns sharply
  over its first decimetres (the map's curve leaves its end point at half speed); there the
  last sections are turned a little off square instead, and the import says by how much.
- **Made from records only, no button yet:** `Revolved` (a solid of revolution from an
  outline of radius and height: a chimney), `HeightFieldShell` (a roof whose top is given as
  heights on a grid over a plan outline: a formula, a scan), and `Holes` on a floor slab and
  on such a roof (closed curves cut straight through). They came with Johny's house spec
  (`..\spec_to_records.py`); the contract is `exchange\godot\FORMAT.md`.
- **One solid or several:** a gridshell (over a curve or on a shell), a hanging net, a
  geodesic frame, a branching column and a veined leaf are compounds of solids (laths, beams,
  struts and balls, branches, ribs). Their volume counts the overlaps at the joints twice.
- **Shells given by a formula** (the conoid, the translation shell, the groined saddles): the
  formula is the underside, and the shell is made thick square to it, upward, as a shell's
  thickness is measured (lane R's note says "straight up"; R's own assets are made thick
  along their normals too). Their frame is R's: x across, y along, the origin in the middle
  of the footprint on the ground; `Eave` lifts them.
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
  and of each element: its volume (the exact solid's, by OCCT's adaptive measure), its
  solid's own box in the building's frame (`box_m`: `[[x min, y min, z min], [x max, y max,
  z max]]`, the shape the map reads), on a wall how many openings are cut through it
  (`openings`) and each of them (`opening_list`), on a floor or a roof its `holes`.
- **The GLB** is glTF Y-up in metres: one named node per element with its IFC class in
  `extras`, the same `placement` in the root node's `extras`, and no transform on the root.
  Its triangles enclose each solid's volume. FreeCAD's own glTF exporter is not used, because
  it drops placements.
- **The IFC** is IFC4 from FreeCAD's BIM exporter, with each element in its IFC class
  (`IfcType` on the object). `IfcSite` is the anchor, with its latitude and longitude to
  millionths of a second (the exporter writes whole seconds). The `IfcBuilding`'s placement
  on the site is the offset and the turn; its elements are placed under it; its property set
  `Organic_Placement` repeats the numbers. The placements and the property set are written
  by IfcOpenShell's own calls (`api.geometry.edit_object_placement`, `api.pset`), and
  `check_organic.py` holds the file against its schema with IfcOpenShell's validation.
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

**Walls that end on each other are joined, as the map joins them** (the old editor's rule;
`organic_geom.junction_corners`, `organic_objects.join_walls`): an end within 0.05 m of
another wall's end, or of its line, meets it. Round the meeting point each wall's left face
ends where it crosses the right face of the next; a wall that passes through takes nothing
and the wall that ends on it stops at its face; a crossing farther off than ten half
thicknesses is none. Only walls of one level are joined. A wall with a shaped top on a
smooth curve keeps square ends (its top line is given along its own length), and an end on
a corner of another wall's outline is not joined by that wall. The notes say how many ends
were joined, and how many meet other walls and stay square. A wall's joints are its
`StartJoint` and `EndJoint` (worked out by the import; empty: a square end).

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
  (`TOP_PIECE_STATIONS`); at 16 its volume read up to 0.18 % off. **Every new way to make a
  face goes through `wire_of`.** The joined end of a wall first made its plan's face
  directly: a partition 12.9 m long on a curve through eight points then read 9.547 m³ by
  FreeCAD's own Volume and 9.943 by every other count (the adaptive measure, its triangles,
  its plan times its height less its door). `check_organic.py` found it on the sent house,
  because it holds the mesh against FreeCAD's own Volume; `check_spec.py` (V) and
  `check_import.py` (J) now hold the two measures against each other.
- **A cut can fail without a word.** OCCT handed a wall back uncut, or cut under some faces
  only, and called it valid, where a shaped top line touched the prism's flat top at its
  crests (24 of 120 trial walls; none since the prism stands 0.5 m above the top line).
  `cut_top` also holds every result against the volume the wall must have, tries other
  stations where it does not agree, and raises rather than draw a wall that is not the one
  asked for. Wherever a tool only touches what it cuts, expect the same.
- **A cut by a solid that shares a plane with what it cuts can take nothing at all.** A
  door's solid that began exactly in the wall's own bottom was not cut out, and FreeCAD said
  the two solids shared 0.000 m³: 11 of a house's 50 openings stood shut, each wall "valid".
  An opening's solid now runs 50 mm past the wall's bottom or flat top where its sill or head
  lies in it (`OPENING_PAST_MM`), every opening's middle must be open after the cut
  (`less_openings`), and a wall whose opening stays shut is refused.
- **`common` can hand a whole solid back, and `cut` agree with it.** Asked what four
  partitions shared with the house's long exterior wall (a sound solid: one closed shell,
  tolerances of 0.004 mm), `common` answered with each partition whole (3.3, 3.1, 8.0 and
  3.8 m³), both ways round, and the partition less the wall came back empty. Counted with
  points (2,500 places in each partition's box, those that lie in both solids) they share
  0.06 to 0.12 m³ each: the partition's end in the wall. Where it matters what two solids
  share, count it with points; two booleans that agree prove nothing.
- **`Shape.Volume` and `Shape.Area` are not exact.** On a 78 m wall with a sampled top the
  volume read 0.16 % too much and its plan's area 0.10 % too much; on a roof 0.36 % too
  little. `organic_geom.volume_of` and `area_of` use OCCT's adaptive measure through
  pythonocc, which FreeCAD 1.1 ships (`OCC.Core.BRepGProp`): the volume agreed with a count
  by strips and with the solid's triangles to 0.001 %. Use it for what is held against a
  tolerance and for what is reported; it costs seconds on a large solid. **`area_of` is for
  flat faces only**: on a wall's curved side the adaptive area read 10 % too much and said
  its error was nought, while `Shape.Area` was right. And keep one check on FreeCAD's own
  Volume (the note on `wire_of` above): the two measures agreeing is a check in itself.
- **OCCT's loft, and its surface through points, sag between sections, and say nothing.**
  A wave vault lofted through 73 sections (`Part.makeLoft`, and `BRepOffsetAPI_ThruSections`
  through pythonocc) lay 13.7 mm under its wave half-way between its first two sections, and
  a plain vault lofted along 30 m of curve 1 mm beside it, while every section itself was
  met and the volume agreed with the sections summed to 0.001 %: no check on volume, validity
  or the sections sees it. `Part.BSplineSurface.interpolate` through the same points lay
  24.8 mm off (the same approximation underneath). Held to a cubic the loft is right on a
  straight wave vault and 64 mm off on a curved one; and where the sections change form (a
  wave so deep that the arch at its trough is nearly flat) it never finishes. A vault along
  a curve and a wave vault are therefore built section by section (`sectioned_vault`): each
  section worked out as points, the inside and the outside each a surface made of plain
  curve interpolations (every section's line through its points, then each pole of those
  lines through the stations: `surface_through`), the feet, toes, plinth and ends flat or
  ruled faces between the same lines, all sewn into one solid. R's wave vault of 18 m: its
  crown within 0.003 mm of the wave between sections, FreeCAD's own Volume and the adaptive
  one within 0.0001 % of the sections summed, built in 0.4 s. **A check on a lofted or
  interpolated surface must look between the sections**, not only at them.
- **A plain interpolation of a curve lies flat at its ends** (no curvature there): through
  stations 0.19 to 0.25 m apart a wave's crest read 0.1 mm low and a vault's axis 0.4 mm
  beside its curve in the first interval. `curve_through` gives each end the direction its own first
  five points show; where the points set out slowly and then stride (the inner edge of a
  vault at the turned end of its curve) that slope comes out backward, and the end leaves
  along its first two points instead.
- **Faces of a surface through many stations are cut into pieces** (`SECTION_FACE_STATIONS`,
  16 along, 8 across), like the edges in `wire_of`, and for the same reason. They are not
  merged again: `refined` (removeSplitter) would put them back into one face.
- **FreeCAD keeps the words an object was refused with**: `obj.getStatusString()` gives the
  text of the error its `execute` raised. The import puts it into its note ("it could not be
  built from these numbers: …"), so a refusal reaches the map with its reason.
- **A boolean can leave faces FreeCAD measures wrong, in a solid that is right.** The groined
  saddles were first each lobe's saddle made thick and cut to its eighth by an upright prism:
  a valid solid, the right volume by the adaptive measure, and FreeCAD's own Volume 3.2 %
  short (19 % at Los Manantiales' size): one face to a lobe, bounded by a long cut curve. They
  are now built from patches with no boolean (`groined_saddles_shape`): each lobe three
  four-sided patches below and three on top, every face's edges short; both measures agree to
  0.0003 % and hold the volume integrated over the plan in `check_organic.py`.
- **The point of a surface over a plan place is found by Newton's steps on the face's own
  surface**, not by a boolean or a distance search (`organic_biomimetic.Tops`). Measured per
  place: a boolean of the solid with an upright line 13 ms on a conoid and 80 ms on a wave
  vault; `distToShape` face by face 4 and 10 ms; `Surface.intersect` 2.6 and 72 ms;
  `Surface.parameter` 0.6 and 6 ms; `isPartOfDomain` 1.3 ms on a top face trimmed by spline
  edges; the surface's own value and derivatives 0.06 ms at most. So: Newton from where the
  last place was found (or from the nearest of a few kept places of the face), the face's
  boundary kept as a polygon in its own parameters, the kernel asked only within a hair of
  that boundary. The same heights as the boolean at 90 places (to 4e-9 m), 0.1 to 0.5 ms a
  place. Two traps: **a surface that closes on itself** (a sphere about its axis) must be
  gone round at its seam, not stopped there (a lath over a dome's crown came in two pieces);
  and **at a pole** one of its directions has no length: step off it and go on. Newton begun
  on the far side of a pole runs on over it and off the face, and every place kept on a pole
  stands at one spot: so when the last place fails, the two nearest kept places that stand
  apart are tried (the two nearest, both on the crown of the Dome button's ellipse dome, left
  the lath across it in two: 19 laths where 18 lines cross it).
- **A side of a shell is not its back.** A shell made thick along its normal has end faces
  that lean, and where its surface leans away one of them is seen from above (a conoid's
  arch end, 2 cm wide; a hypar's edges). `Tops.is_side` asks, once a face, whether the solid
  is still there two of the face's own widths behind it: for an end face it is (the shell
  goes on), for the back it is not.
- **Laths are made section by section, not swept.** OCCT's pipe (`makePipeShell`) could not
  close a lath along a conoid's own straight lines, and keeps a section level where the shell
  tilts it. `lath_through` lays a rectangle at every place, square to the line and to the
  shell's normal there, runs a cubic through each corner (the four sharing their parameters:
  the length along the lath, since the last place lies wherever the shell ends: at even
  parameters a lath's end swung 0.23 m below a dome's foot), each end leaving in the
  direction its own last three places show (left free, a lath read 0.14 % off its exact
  volume), ruled faces between them a few stations long. Every lath on a hemisphere is now
  its exact volume (Pappus) to 0.0004 %. **A lath's edges are where its width reaches**,
  square to its line and to the shell's normal: tested straight across in plan they left a
  steep dome's outline first, and laths on a hemisphere stopped up to 0.70 m above its foot
  (now 0.05 m, inside the ring beam).
- **Stepping to a fixed point can stop short where Newton does not.** The top of groined
  saddles over a plan place is the point of the saddle whose normal passes over it. Plain
  stepping closed in by a factor of 2bt a step (0.72 with sixteen lobes and 0.15 m of shell)
  and gave up; Newton's steps finish in a few.
- **A shell from a height field** is its top face cut to the plan and pushed straight down
  (`field_shell_shape`): under a second for 30 m by 11 m. Cutting the plan's prism by the
  solids above the top and below the underside did not finish in ten minutes.
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
- **A picture from the window:** FreeCAD turns its camera over several frames. An image saved
  straight after `viewTop()` or `setCameraOrientation()` is taken mid-turn (a "plan" seen at
  an angle). Wait until the camera node's position and orientation stand still, then save.
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
`freecad/check_spec.py` holds a house built from Johny's spec against the spec itself, solid
by solid, by walking each with points.
Each forges faults and must reject every one. The first three run in the window (through the
FreeCAD MCP connector) and without it (`freecad/run_headless.py`); `check_spec.py` runs
without it. What they write on the way
goes into the temp folder and is taken away once read; `ORGANIC_CHECK_KEEP=1` keeps it.

## Licence

MIT; see `LICENSE`, which keeps the notices of plugin-eco (Pascal Group Inc.) and of the
Hagia Sophia plugin (ActArtech), whose maths is ported here. The force density and space
colonisation methods are written here from their published descriptions; the branch radius
law and the geodesic subdivision follow three.js (MIT). FreeCAD (LGPL-2.1-or-later),
IfcOpenShell (LGPL-3.0-or-later), numpy, scipy and shapely (BSD) are used as installed;
nothing of theirs is copied.
