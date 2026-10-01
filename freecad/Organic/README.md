# Organic — a FreeCAD workbench for organic architecture

Curved walls, shells, vaults, leaf roofs and domes as real, closed, parametric solids in
metres, and one button that stands the building on the site in the Godot map.

It is ported from this repository's plugin-eco and plugin-hagia-sophia. Those draw display
meshes whose underside is a copy of the top. Here every thickness is a true offset, every
opening is a cut, and every result is a solid that takes booleans, reports its volume and
exports to IFC.

## Install

Run `freecad/InstallOrganic.FCMacro` in FreeCAD 1.1 (Macro ▸ Macros…). It copies this folder
to `%APPDATA%\FreeCAD\v1-1\Mod\Organic` and loads it. After that the **Organic** workbench
and toolbar are there on every start. Run the macro again after pulling changes.

## The toolbar

| Button | Makes | From |
|---|---|---|
| New organic building | a BIM building on a georeferenced site; new objects go into it, at its placement | — |
| Grow organic building | a lobed plan, its wall with a door and windows, a shell roof and a slab | plugin-eco "Grow 5-lobe building" |
| Plan curve | lobed, circle, arc, S-curve, oval, leaf, shell, golden and log spirals, vesica | plugin-eco plans, plugin-geometry |
| Curved wall | a wall of real thickness on any open or closed curve, with a flat, arched, waved or sloped top | plugin-eco smooth wall |
| Opening | a rectangular, arched, pointed or round opening where you clicked the wall | plugin-eco openings |
| Leaf shell roof | a shell from a ridge with four heights, an eave and a curl, with ribs | plugin-eco leaf shell |
| Shell roof on a closed wall | eaves + rise (1 − ρ^2.2) from the pole to the wall, drooping to the overhang | plugin-eco organic roof |
| Ribbed vault | a barrel vault on an ellipse, semicircle, segmental, pointed, catenary or parabola, with ribs | plugin-eco vault, plugin-hagia-sophia arch |
| Catenary arch | a free-standing arch; `ThrustInMiddleThird` is the Poleni check | plugin-hagia-sophia arch |
| Dome | ellipse, sphere, catenary, parabola or onion meridian, with an oculus | plugin-hagia-sophia dome |
| Minimal surface | a membrane on a closed curve, lifted by a mast ring | plugin-eco minimal surface |
| Saddle shell | a hypar, or a catenoid | — |
| Floor slab | a slab filling a closed curve | — |
| Send to the map | `<name>.glb`, `<name>.ifc`, `<name>.json` in the exchange folder | — |

Every length is a FreeCAD length property, so a metre document shows metres. The toolbar
sets new documents to metres.

- **Curves a wall can follow:** an Organic plan curve, a sketch, a Draft B-spline, an arc.
- **Openings** are five lists on the wall, one entry per opening, in metres: position along
  the centreline, width, height, sill, shape.

## A building in minutes

1. **New organic building**, then set its Placement to where it stands on the site. The
   frame is the site macro's: origin at the land pack's chimney, Z = 0 at 425.90 m, +Y true
   north.
2. **Plan curve**, then **Curved wall** with the curve selected. Click the wall and press
   **Opening** for each window and door.
3. **Leaf shell roof**, **Ribbed vault** or **Dome**; move each by its Placement.
4. Select the building and press **Send to the map**.

## Send to the map

The export writes into `C:\Playground\exchange\godot` by default. To change the folder, set
the `ORGANIC_EXCHANGE_DIR` environment variable or the `ExchangeDir` string under
`BaseApp/Preferences/Mod/Organic`.

- **The frame is that folder's own (`FORMAT.md`).**
  - Units are metres and the GLB is glTF Y-up: +X east, +Y up, +Z south.
  - The origin is the chimney anchor at lng −119.15536, lat 34.4331, 425.90 m.
  - The design document's origin is its BIM Site's (the land pack's chimney, lng −119.155333,
    lat 34.433118). The export moves the building by the difference, 2.48 m east and 2.00 m
    north, so it lands in its real place.
  - Nothing is re-centred.
- **The GLB** has one named node per element, with its IFC class in `extras`. Its
  triangles enclose each solid's volume. FreeCAD's own glTF exporter is not used, because
  it drops placements.
- **The IFC** is IFC4 from FreeCAD's BIM exporter, with each element in its IFC class
  (`IfcType` on the object). The exporter writes the site's latitude and longitude in whole
  seconds, so the export rewrites them with their millionths.
- **The JSON** records the frame, the offset, the source file and each element's volume.

## Notes for whoever changes the kernels (`organic_geom.py`)

- `Part.OffsetCurve` edges and offset surfaces make faces that OCCT's booleans treat as
  self-intersecting: a cut silently does nothing. Offsets here are exact lines and circles,
  or splines through offset points; offset surfaces are converted to NURBS.
- OCCT measures area and volume per edge with a fixed number of points. A face bounded by
  one spline of hundreds of spans reports its area several percent off, and a solid on it
  its volume (a wall read 43.4 m³ against 63.0 m³). `wire_of` splits long splines before
  every face.
- `Shape.BoundBox` takes B-spline faces untrimmed. Use `optimalBoundingBox()`.

## Licence

MIT; see `LICENSE`, which keeps the notices of plugin-eco (Pascal Group Inc.) and of the
Hagia Sophia plugin (ActArtech), whose maths is ported here. FreeCAD (LGPL-2.1-or-later)
and IfcOpenShell (LGPL-3.0-or-later) are used as programs; nothing of theirs is copied.
