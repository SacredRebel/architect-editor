# ORGANIC-SCAN — every shaping tool on this PC, for organic architecture in FreeCAD

**Brief:** architect → FreeCAD lane, 29 Sep, item 1: scan every shaping tool and give one table: tool, shape it makes, whether it works in FreeCAD 1.1.4, licence.
**Scanned 29 Sep 2026, read-only:**

- this repository's `packages/` (plugin-eco, plugin-hagia-sophia, plugin-geometry, plugin-body, core);
- the FreeCAD 1.1.4 install at `C:\AI-Work\Ai apps & Codebase\FreeCAD`;
- the 19 archives in `FreeCAD\packages`;
- the installed add-ons in `%APPDATA%\FreeCAD\v1-1\Mod`;
- the public Addon Manager catalogue;
- Playground-Os `mind/brain/TOOLS.md` and `docs/plans/SCAN-BIOMIMICRY.md`.

**Result in one line:** nothing on this PC shaped organic architecture inside FreeCAD. The generators were TypeScript drawing display meshes. FreeCAD's own Part kernel has every operation needed. So the generators were ported onto it as the Organic workbench (`freecad/Organic`, see `organic-done.md`).

"Yes" in the table means it ran in FreeCAD 1.1.4 on this PC. † means the row rests on reading the code or the catalogue, not on running the tool.

## The table

| Tool | Shape it makes | Works in FreeCAD 1.1.4 | Licence |
|---|---|---|---|
| **This repository's generators** | | | |
| plugin-eco smooth curved wall (`eco-smooth-wall.ts`) | a wall along a Catmull–Rom curve, openings placed by arc length; drawn as 0.3 m boxes, openings as full-height gaps | no (TypeScript, three.js). **Ported:** Organic ▸ Curved wall, Opening | MIT |
| plugin-eco leaf shell roof (`eco-shell-store.ts`, `eco-shell-geometry.ts`) | a shell from a ridge with heights, an eave and a curl, plus ribs; the underside is a copy, not an offset | no. **Ported:** Organic ▸ Leaf shell roof | MIT |
| plugin-eco organic building, "Grow 5-lobe building" (`eco-organic-spec.ts`, `eco-organic-plan.ts`) | a lobed, oval, leaf, spiral or fitted plan; its wall ring, door and windows by bearing; a shell roof; solar spots; quantities | no. **Ported:** Organic ▸ Grow organic building, Plan curve, Shell roof on a closed wall, Floor slab (solar and quantities not ported) | MIT |
| plugin-eco ribbed vault (`eco-vault.ts`) | barrel, groin and dome height fields with rib tubes | no. **Ported:** Organic ▸ Ribbed vault (barrel; the groin is not ported; the dome is Organic ▸ Dome) | MIT |
| plugin-eco catenary "arch" (`eco-catenary.ts`) | a chain hanging between two supports (it sags; it is not an arch) | no. Replaced by Organic ▸ Catenary arch, which rises | MIT |
| plugin-eco minimal surface, "Make from closed curve" (`eco-catenary.ts`) | a membrane relaxed on a closed boundary; as shipped it stays flat | no. **Ported:** Organic ▸ Minimal surface (lifted by a mast ring), Saddle shell (hypar, catenoid) | MIT |
| plugin-eco lofted leaf surface (`eco-loft.ts`) | profiles blended along a plan rail | no. Not ported: Part ▸ Loft does this natively | MIT |
| plugin-hagia-sophia arch and vault (`math/catenary.ts`, `math/arch-profile.ts`) | round, segmental, pointed and catenary rings; Poleni's middle-third check | no. **Ported:** Organic ▸ Catenary arch, Ribbed vault, with the check as a property | MIT (Pascal Group, ActArtech upstream, Sacred Rebel) |
| plugin-hagia-sophia dome (`kinds/hs-dome`) | a dome of revolution on a circular or catenary meridian, drum, window recesses, oculus | no. **Ported:** Organic ▸ Dome (five meridians, oculus; drum and recesses not ported) | MIT (as above) |
| plugin-hagia-sophia domed bay, pendentives, piers, columns (`temple/proportions.ts`) | a Byzantine bay cut from one sphere; columns with entasis | no. Not ported | MIT (as above) |
| plugin-geometry kit (`forms.ts`, `archimedean.ts`) | 20 plan figures (spirals, polygons, tilings, a hanging chain), 18 solids, "walls from a closed figure" | no. **Ported in part:** Organic ▸ Plan curve (lobed, circle, arc, S-curve, oval, leaf, shell, golden and log spirals, vesica); a Curved wall takes any closed curve | MIT (package.json and NOTICE; no LICENSE file in the package) |
| plugin-body kernel, Pascal core curved wall | planar half-edge solids; a wall on one arc | no. FreeCAD's OCCT kernel replaces both | MIT |
| **FreeCAD 1.1.4 itself** | | | |
| Part | loft, sweep, revolve, extrude, 2D and 3D offset, thickness, booleans, ruled surfaces, B-spline curves and surfaces | **yes** — the Organic kernels are built on it | LGPL-2.1-or-later |
| Draft | B-splines, Béziers, arcs, wires, dimensions | **yes** — base curves for walls; dimensions in F1 | LGPL-2.1-or-later |
| Sketcher | B-splines (also periodic), conic arcs | **yes** — a sketch can be a wall's base | LGPL-2.1-or-later |
| Surface | filling, sections, blend curves | yes † (present; not needed so far) | LGPL-2.1-or-later |
| BIM: Site, Building, IFC export (`importers/exportIFC.py`) | georeferenced site, building, IFC4 with any Part solid in its IFC class | **yes** — used by Send to the map. It writes the site's latitude and longitude in whole seconds, up to 7 m off; the export rewrites them | LGPL-2.1-or-later |
| BIM Arch Wall and Window | walls and hosted windows | **partly** †: a wall follows lines, arcs and circles, but fails on a B-spline base; windows cut straight prisms and do not handle a curved host | LGPL-2.1-or-later |
| Import: glTF export (OCCT) | GLB in metres, Y-up | **partly**: it runs, but drops the object's placement (a box 10 m east came out at the origin). Send to the map writes its own GLB | LGPL-2.1-or-later |
| IfcOpenShell 0.8.4 (bundled) | IFC read and write | **yes** — used to rewrite the georeference and to read the export back | LGPL-3.0-or-later |
| Mesh, MeshPart, PartDesign, ReverseEngineering | meshing; loft, pipe, helix; a B-spline surface fitted to points | yes † (present; not needed so far) | LGPL-2.1-or-later |
| OpenSCAD workbench | hull, minkowski | no †: it needs an OpenSCAD program and none is bundled | LGPL-2.1-or-later |
| **The 19 archives in `FreeCAD\packages`** | | | |
| FreeCAD-main, FreeCAD-snap, homebrew-freecad, FC-Worker-main, OndselSolver-main | FreeCAD's source, packaging, a headless worker, the assembly solver | not shaping tools † | LGPL-2.1 |
| FreeCAD-library-master | a parts library (FCStd, STEP, STL) | files open in FreeCAD †; nothing organic | assets CC-BY-3.0, code LGPL-2.1-or-later |
| AddonManager-dev, Addons-main, FreeCAD-addons-master | the Addon Manager, its catalogue, the legacy index | not shaping tools † | LGPL-2.1-or-later; catalogue data CC0-1.0; the legacy index has no licence file |
| Plot-Latest, FreeCAD-Telemetry-main | a plot workbench; telemetry | not shaping tools † | LGPL-2.1 (icons CC-BY-SA-4.0, CC-BY-4.0) |
| Addon-Template-cookie, Addon-Academy-main | an add-on scaffold and guides | not shaping tools † | CC0-1.0; LGPL-2.1 with CC-BY-SA-4.0 docs |
| pivy-freecad-master | Coin3D bindings, already bundled | not a shaping tool † | ISC-style |
| DevelopersHandbook, FEPs, FPA-main, developer-meetings, Machines | documents and CAM data | not shaping tools † | none stated; CC0-1.0; none stated; none stated; CC-BY-SA-4.0 |
| **Installed add-on** | | | |
| FreeCADMCP 0.1.25 | none: the connector that drives FreeCAD | **yes** — every step here ran through it | MIT |
| **Addon Manager catalogue (not installed)** | | | |
| Curves 0.6.81 | NURBS curves and surfaces: Gordon surfaces, sweeps, blends | by its metadata † (needs numpy and scipy, both bundled). The first candidate to add | LGPL-2.1-or-later |
| CurvedShapes 1.00.15 | curved arrays and segments, surface cuts (ribbed shells) | by its metadata † | LGPL-2.1 |
| Lattice2 1.1 | arrays of placements (ribs, gridshell nodes) | by its metadata † | LGPL-2.0-or-later |
| Silk 0.4.0 | NURBS surfaces with seam continuity | by its metadata † | **GPL-3.0-or-later**: a separate program only |
| Pyramids-and-Polyhedrons 0.2.2 | polyhedra, a geodesic sphere | by its metadata † | **GPL-3.0-or-later**: a separate program only |
| Quetzal, FrameForge, StandardBeams | beams and profiles along edges (gridshell members) | by their metadata † | LGPL |
| MeshRemodel 1.12.0, Beltrami | mesh remodelling; turbine blades | no †: they need numpy ≥ 2.4, FreeCAD bundles 1.26.4 | LGPL-2.1-or-later |
| freecad-nurbs, SlopedPlanesMacro, Nodes | freeform scripts; sloped roofs; node scripting | unknown †: no package metadata, or stale | no licence file; GPL-3; LGPL-2.1-or-later |
| **Playground-Os** | | | |
| `TOOLS.md`: the FreeCAD, Blender and Godot connectors | none: they drive the applications | the FreeCAD one, yes | MIT |
| `SCAN-BIOMIMICRY.md` items | papers, image scans, simulations, agent skills | no †: none is a geometry tool for FreeCAD or Python | mostly MIT; the "Pinnacle" items carry a non-standard licence with paid commercial use, so they never enter |

## What the scan decided

- **Port, don't wrap.** The repository's generators are short maths and MIT. In FreeCAD they become real solids on the Part kernel: every thickness a true offset, every opening a cut.
- **No add-on is needed for the brief's shapes.** Curves (LGPL) is the one to add if Gordon surfaces or blends are wanted. It would be installed through the Addon Manager and used as a separate program, never copied here.
- **GPL add-ons** (Silk, Polyhedrons) stay separate programs. Nothing from them enters this repository.
- **FreeCAD's own gaps**, each met in the workbench:
  - Arch walls cannot follow B-splines, so the workbench has its own wall.
  - The glTF exporter drops placements, so the workbench has its own GLB writer.
  - The IFC exporter rounds the georeference, so the export rewrites it.
