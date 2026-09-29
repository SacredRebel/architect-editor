# UNIFY-A — the Architect editor in one Builder, one Mind

**Lane:** A (architect-editor).
**Phase:** 0, scan and plan. Docs only; no feature code.
**Brief:** architect → all lanes, 28 Sep 2026.

**Scan method:** every look at Johny's PC was read-only, and nothing in the FreeCAD install was changed.
- Files were listed, and licence, README and manifest files were read.
- The downloaded archives were read in place with `unzip -l` / `unzip -p` and never extracted.
- FreeCAD itself was not run.

Paths are written with `%APPDATA%` in place of the user folder.

## (a) What I found

### FreeCAD on Johny's PC

- **Install folder:** `C:\AI-Work\Ai apps & Codebase\FreeCAD\`, next to `Playground\`, not under Program Files. The Start Menu shortcut `FreeCAD 1.1` points there.
- **Version:** **FreeCAD 1.1.4**, the version string in its uninstaller.
- **Runtimes:** Python 3.11 (`bin\python311.dll`) and a headless `bin\freecadcmd.exe`.
- **IFC library:** **IfcOpenShell 0.8.4** in `bin\Lib\site-packages\ifcopenshell` (63 MB, LGPL-3.0-or-later).
- **Size on disk:** about 2.2 GB for FreeCAD (`bin` 1.7 GB, `lib` 273 MB, `Mod` 200 MB, `data` 15 MB), plus 2.1 GB of downloaded `packages`.
- **Built-in workbenches (30), LGPL-2.1-or-later with FreeCAD:** AddonManager, Assembly, BIM, CAM, Draft, Fem, Help, Idf, Import, Inspection, Material, Measure, Mesh, MeshPart, OpenSCAD, Part, PartDesign, Plot, Points, ReverseEngineering, Robot, Show, Sketcher, Spreadsheet, Start, Surface, TechDraw, Test, Tux, Web.
  - The Builder needs **BIM** (80 commands, with `nativeifc`), **TechDraw**, **Fem**, **Assembly**, **Material**, **Measure**, **Spreadsheet**, **Mesh/MeshPart** and **Import** (STEP/IGES).
- **User add-ons: none.** `%APPDATA%\FreeCAD\v1-1\` holds only `Macro\`, `SavedPreferencePacks\`, `user.cfg` and `system.cfg`; there is no `Mod\` folder. **No freecad-mcp bridge is installed yet.**
- **FreeCAD's two IFC paths** (read in `Mod\BIM`):
  - **Legacy** (`importers\importIFC.py` / `exportIFC.py`) converts IFC to FreeCAD objects and back.
    - Import converts IfcOpenShell's metres to FreeCAD's internal millimetres.
    - Each element's GlobalId is kept in `IfcData["IfcUID"]` (or `GlobalId`).
    - Export reuses that id (`getUID`, `exportIFC.py:2602`) and writes the units chosen in the `ifcUnit` preference. Its template header is SI metre.
  - **Native IFC** (`nativeifc\`, IfcOpenShell underneath) keeps the IFC file as the document. Edits are written back into the same file (`ifc_tools.save_ifc`), so GlobalIds survive by construction. It also has modules for diffing, psets, materials, classification and layers.

### Johny's downloaded repositories — `FreeCAD\packages\` (19 zip archives, not extracted, not installed)

How each joins the Builder:
- **in-browser:** runs in our web apps. **None do:** everything here is LGPL, CC or unlicensed, and runs as FreeCAD itself.
- **desktop via MCP:** FreeCAD on Johny's PC, driven by the Mind through an MCP bridge.
- **headless:** `freecadcmd` jobs.
- **file exchange:** only files cross.
- **reference:** read, not run.
- **skip:** not used.

| Item | What it does | Language | Licence | Size (zip → unpacked) | Joins the Builder |
|---|---|---|---|---|---|
| FreeCAD 1.1.4 (the install) | CAD/BIM application: BIM with native IFC, TechDraw plan sets, FEM, Assembly | C++, Python 3.11 | LGPL-2.1-or-later | 2.2 GB installed | **desktop via MCP** (the Precision agent) and **headless** (`freecadcmd` jobs); always a separate program |
| IfcOpenShell 0.8.4 (bundled) | reads, writes and meshes IFC in FreeCAD's Python | C++, Python | LGPL-3.0-or-later | 63 MB | **headless**, inside FreeCAD jobs only. The browser keeps web-ifc (MPL-2.0, npm) |
| FreeCAD-library-master | community Parts Library: 3,202 FCStd, 2,812 STEP, 2,551 STL, organised by family | FCStd/STEP/STL, Python | assets CC-BY-3.0, code LGPL-2.1-or-later | 1.4 GB → 2.8 GB (11,004 files) | **file exchange**: chosen parts become GLB for the world catalog and IFC for BIM, with the attribution recorded per part |
| FC-Worker-main (Ondsel, 2024) | dockerised headless FreeCAD worker: JSON commands (health check, sandboxed code runner, exporter, model configurer), Lambda-style | Python | LGPL-2.1-or-later | 58 KB → 0.1 MB | **headless**: a pattern for our FreeCAD job runner, run as its own container, never copied in |
| OndselSolver-main | multibody assembly solver used by FreeCAD's Assembly workbench | C++ | LGPL-2.1 | 4.8 MB → 14.6 MB | **skip**: already inside FreeCAD 1.1 |
| pivy-freecad-master | Python bindings for Coin3D, FreeCAD's 3D view | Python, SWIG, C++ | permissive (Systems in Motion, ISC-style) | 6.4 MB → 8.7 MB | **skip**: bundled with FreeCAD |
| AddonManager-dev | installs workbenches, macros and themes (dev 2026.9.26) | Python | LGPL-2.1-or-later | 0.8 MB → 3.1 MB | **desktop**: how the MCP bridge gets installed; not a Builder part |
| Addons-main | the current add-on index | YAML, TOML | code LGPL-2.1, data CC0-1.0 | 48 KB → 0.1 MB | **reference**: choose the MCP bridge and BIM add-ons from it |
| FreeCAD-addons-master | legacy (pre-1.0) add-on index | YAML, Markdown | no licence file at top | 65 KB → 0.1 MB | **skip** |
| Addon-Academy-main | guides to writing and publishing add-ons | Markdown, Python | code LGPL-2.1, docs CC-BY-SA-4.0 | 3.7 MB → 3.9 MB | **reference**, if we write our own bridge add-on |
| Addon-Template-cookie | cookiecutter template for a new add-on | Python | CC0-1.0 | 72 KB → 0.1 MB | **reference**: the starting point for a Playground bridge add-on (CC0: free to use) |
| DevelopersHandbook-main | FreeCAD developer handbook site | Markdown (Jekyll) | no licence file at top | 18 MB → 18.4 MB | **reference** |
| FreeCAD-Enhancement-Proposals-master | FreeCAD design proposals (FEPs) | Markdown | CC0-1.0 | 0.4 MB → 0.5 MB | **reference** |
| FreeCAD-main | FreeCAD source code | C++, Python | LGPL-2.1-or-later | 87 MB → 396 MB (14,031 files) | **reference**: the install is what runs |
| FPA-main | FreeCAD Project Association website (524 PDFs) | Markdown, PDF | no licence file at top | 621 MB → 599 MB | **skip** |
| FreeCAD-developer-meetings-main | developer meeting minutes | Markdown | no licence file at top | 0.2 MB → 0.5 MB | **skip** |
| FreeCAD-Telemetry-main | opt-in usage metrics add-on | Python | LGPL-2.1, icon CC-BY-4.0 | 0.2 MB → 0.6 MB | **skip**: sends data out |
| Plot-Latest | plot editing workbench | Python | LGPL-2.1, icon CC | 0.2 MB → 0.5 MB | **skip**: already built in (`Mod\Plot`) |
| Machines-Latest | CAM machine definitions (`.fcm`) | JSON, Markdown | CC-BY-SA-4.0 | 37 KB → 0.1 MB | **skip**: CAM, not building |
| FreeCAD-snap-master | Linux snap packaging | YAML | LGPL-2.1 | 41 KB → 0.1 MB | **skip** |
| homebrew-freecad-master | macOS Homebrew formulas | Ruby | LGPL-2.1 | 0.3 MB → 0.7 MB | **skip** |

### This repository's IFC path today (read in the code)

**Export** — `packages/ifc-exporter/src/index.ts`: IFC4X3 through web-ifc 0.0.77 (MPL-2.0, an npm dependency). It is used by `packages/editor/src/lib/ifc-export.ts` and hidden in light graphics. It is **not FreeCAD-ready**:
- **GlobalIds are random on every export** (`newGuid`, lines 72–86). The code's own comment says they are not stable. The first character is drawn from all 64 characters, although a compressed GUID must start with 0–3.
- **The Pascal node id is written nowhere**: no Tag, no property set.
- **Only walls, doors, windows and zones are exported.**
  - Walls go out as the deprecated `IfcWallStandardCase`.
  - Zones become `IfcSpace` with no geometry.
  - Doors and windows are exported only when hosted by a wall.
  - Slabs, ceilings, roofs, stairs, columns, fences and items are skipped with a warning.
  - The eco forms are skipped without a warning, because they are not scene nodes. That means catenary arches, vaults, leaf shells, organic buildings and minimal surfaces.
  - Temple forms and bodies are also skipped.
- **The project is not linked to the site** (`void project`, line 849). Only site → buildings and building → storeys are aggregated.
- **Every storey sits at elevation 0**, with a "follow-up" comment around line 457. Multi-storey buildings collapse onto the ground.
- **Openings are misplaced.**
  - Door and window `position` is the opening's centre (`core/src/schema/nodes/door.ts:155`, `window.ts:110`).
  - The exporter treats `position[0]` as the start, which shifts every opening half its width.
  - It reads `position[2]` (the offset from the wall's mid-plane) as the sill height, so windows sit on the floor.
- **The building is mirrored north–south.**
  - Plan coordinates go straight into IFC: wall start `[x, z]` → (X, Y), line 533.
  - This fork's Pascal +z is south (`plugin-eco/src/apply-site.ts:116`), while IFC's +Y is north.
- **No georeference.** RefLatitude, RefLongitude and TrueNorth are null, and there is no `IfcMapConversion`, although the site's `originLL`, `originElevM` and `northDeg` are on hand.
- **Units:** SI metres. There are no materials, psets or quantities beyond surface colours.

**Import** — `packages/ifc-converter/src/index.ts`, `convertIfcToPascal`:
- **Mapping:**
  - site / building / storey → site / building / level;
  - walls → walls;
  - doors and windows → children of their host wall;
  - slabs → slabs;
  - roofs → a roof node without segments, so nothing renders;
  - columns → columns; beams → blocks; spaces → zones;
  - everything else (furnishing, proxies, stair flights, …) → `imported-mesh`.
- **Units:** length units are read (METRE, MILLI, FOOT, INCH).
- **Ids:** Pascal ids are **freshly generated** on every import. The IFC GlobalId is kept in `metadata.globalId`, the class in `metadata.ifcType`.
- **Axes:** the same axis mapping as the exporter. Pascal → IFC → Pascal is therefore self-consistent, but other IFC tools see the mirror.
- **Walls may come back shifted.** The converter never reads the rectangle profile's own offset, where the exporter puts the half-length. A round-trip check will measure the shift.

## The IFC round-trip: "Edit building" ↔ FreeCAD

**Principles**
1. **The pack holds one IFC per building** as the BIM record, next to the GLB the world shows and the scene JSON. The scene JSON carries what IFC can't: eco forms, tool parameters.
2. **Ids are the spine.**
   - Every element's GlobalId is derived from `<structureId>/<nodeId>`: a name-based UUID, compressed to IFC's 22 characters with a first character of 0–3.
   - The Pascal node id is also written to `Tag` and to `Pset_Playground.PascalId`.
   - FreeCAD keeps GlobalIds either way: legacy import stores the id and export reuses it; native IFC edits the file in place.
   - On the way back, the converter matches by GlobalId and then Tag. It updates existing nodes instead of minting fresh ids.
   - Elements FreeCAD adds get new nodes whose ids are derived from their GlobalId.
   - Elements FreeCAD deletes become a *remove* proposal. Nothing is hard-deleted.
3. **Units:** SI metre both ways, plus radians. FreeCAD's legacy path exports with `ifcUnit` = metre; native IFC keeps the file's units; Pascal is metres.
4. **Axes and place:**
   - IFC X = east (Pascal x), IFC Y = north (−Pascal z), IFC Z = up (Pascal y). The exporter and converter change together.
   - The site gets RefLatitude, RefLongitude and RefElevation from the pack's `originLL` / `originElevM`, and TrueNorth from `northDeg`.
5. **Structure:**
   - IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey, with the levels' real stacked elevations.
   - Elements are contained in their storey.
   - Spaces are aggregated, not contained.
   - `IfcOwnerHistory` carries no personal names.
6. **Two routes to FreeCAD, one contract** — in: `model.ifc` (revision N) plus an instruction; out: `model.ifc` (revision N+1), a report, and optionally a PDF.
   - **Desktop:** FreeCAD on Johny's PC, driven through an MCP bridge add-on, for precision edits he watches.
   - **Headless:** a `freecadcmd` job that opens the IFC natively, runs a script (TechDraw plan set, quantities, preflight, FEM) and saves.
   - The result comes back to `/builder` through the IFC import. It shows as a **ghost diff** of changed, added and removed elements, and the executor commits it on approval.

**What survives the trip** (target, after P1 and P2):

| Pascal | IFC | FreeCAD BIM | Back in Pascal |
|---|---|---|---|
| wall | IfcWall, with Axis + Body, Pset_WallCommon | Arch Wall | wall, same id, parametric |
| door / window | IfcDoor / IfcWindow + IfcOpeningElement (voids and fills) | Arch Window / Door | door / window on its wall, same id |
| slab / ceiling | IfcSlab FLOOR / IfcCovering CEILING | Arch Slab / Structure | slab / ceiling, same id |
| roof | IfcRoof aggregating IfcSlab ROOF, with roof type and pitch in `Pset_Playground` | Arch Roof, or slabs | roof, rebuilt from the pset; if FreeCAD reshapes it, it comes back as slabs |
| stair | IfcStair + IfcStairFlight | Arch Stairs | stair, from the pset; geometry only if reshaped |
| zone / room | IfcSpace with a footprint body | Arch Space | zone, same id |
| column / beam | IfcColumn / IfcBeam | Arch Structure | column / block |
| item (furniture) | IfcFurnishingElement, tessellated | Arch Equipment | item by Tag; geometry as-is |
| eco forms, temple forms, bodies | IfcBuildingElementProxy, tessellated, with kind + parameters in `Pset_Playground` | mesh / shape | the form, rebuilt from its parameters. If FreeCAD edits the mesh it returns as `imported-mesh`, and the proposal says so |
| terrain, trees, survey | not written: the world owns them | — | — |

## Pascal tools ↔ FreeCAD BIM tools

| Work | Pascal (in the browser) | FreeCAD 1.1.4 BIM (desktop or headless) | Who does it in the Builder |
|---|---|---|---|
| walls, slabs, ceilings, doors, windows | yes | Wall, Slab, Window, Door | **Pascal**, fast and in the world; FreeCAD for precision edits |
| roofs (hip, gable, shed, flat, gambrel, dutch, mansard, conical, with features) | yes | Roof | **Pascal** |
| stairs | yes | Stairs | **Pascal**; FreeCAD for code detail |
| rooms / zones | yes | Space | **Pascal** |
| columns, beams, structural grid | column, structural grid | Structure (Column, Beam), Axis/Grid, Truss, Frame, Rebar | **FreeCAD** for structure |
| curtain walls, panels, pipes, equipment | — | Curtainwall, Panel, Pipe, Equipment | **FreeCAD** |
| organic forms: catenary, vaults, leaf shells, temple forms, geometry kit, bodies | yes (eco, hagia-sophia, body) | — (proxies only) | **Pascal** |
| measuring | Measure: distance, angle, area, perimeter, volume | Measure, Dimensions | **Pascal** in the world; FreeCAD on drawings |
| 2D plans | floor-plan view, eco Drawings panel | **TechDraw** sheets, sections, PDF | **FreeCAD** for plan sets |
| schedules and quantities | — | Schedule, IfcQuantities | **FreeCAD** |
| IFC properties, classification, materials, preflight | colours only | IfcProperties, Classification, Material, Preflight | **FreeCAD** |
| structural analysis | — | **FEM** | **FreeCAD** |
| parts library | item catalog | Library (Parts Library, CC-BY-3.0) | **file exchange** into the world catalog |
| terrain / site | reference only (A5) | Site | **the world** (E, C) |
| looks and renders | — | — | **Blender** |
| walkable GLB for the world | yes (`extras.walk`) | — | **Pascal** |

## (b) What this repository gives the Builder and the Mind

**The Builder (BUILD mode, "Edit building")**
- **`/builder`**: the Pascal editor served under the world's origin (A4, in production since `79dc5f13`). It is what "Edit building" opens, and it speaks eco/1: `hello · ready · load-site · load-scene · scene · request-export · glb · dirty · error · close`.
- **The site in the editor (A5):**
  - the world's terrain, standing trees, contours and survey guides;
  - the sun at the world's instant;
  - walls drawn on the ground stand on the slope.
- **Building tools:** walls, slabs, ceilings, roofs, doors, windows, stairs, rooms and zones, items.
- **eco tools:**
  - catenary arches, barrel vaults, leaf shells;
  - temple forms (domes, arches, pendentives, piers, columns);
  - the geometry kit (20 forms), streetscape, pools, nature.
- **Outputs:**
  - **GLB:** metres, Y-up, `extras.walk`; what the world shows.
  - **IFC 4.3:** export, working under `/builder` since A4. It covers only walls, doors, windows and zones, with the faults listed in (a).
  - **IFC import:** `ifc-converter`. Today it is a standalone app (`apps/ifc-converter`): IFC in, Pascal JSON out, loaded into the editor through Settings → Load Build. It is not wired into the editor.
  - **Scene JSON.**
- **Graphics:** light by default, full behind a setting.

**The Mind**
- **`@pascal-app/mcp` (MIT)** is the Architect agent's hands. It is a headless MCP server (Node or Bun: no browser, no WebGPU) that exposes the same scene edits the editor UI makes, as 49 registered tools. Among them:
  - `create_wall`, `create_room`, `cut_opening`, `add_door` / `add_window`, `create_roof`, `create_level`, `create_stair_between_levels`, `place_item`;
  - `furnish_room`, `create_house_from_brief`, `generate_variants`;
  - `analyze_floorplan_image`, `photo_to_scene`, `measure`, `check_collisions`, `validate_scene`, `verify_scene`;
  - `apply_patch`, `undo` / `redo`, `export_glb`, `export_json`.
- **Proposals**, not writes: a sub-agent's edit is a scene patch, previewed in the world, which the executor commits after approval.
- **`@pascal-app/cli`** runs the editor with an authenticated MCP service; useful for local runs of the Architect agent.
- **The IFC exporter and converter (MIT)** are the door to FreeCAD, the Precision agent.

## (c) Contracts I need from other lanes

- **E (spatial-map, the world)**
  - "Edit building" opens `/builder/embed/` with the building's **structure id**, carried in an **eco/1 revision** (a contract change, so the version is bumped). Proposal:
    - `eco:load-scene` gains `structureId` and an optional `ifc` (base64 or pack URL);
    - `eco:request-export` gains `'ifc'`;
    - a new `eco:ifc` message goes editor → host.
  - The world's **executor** accepts the editor's result as a **proposal**: GLB for display, IFC and scene JSON for the record. It shows the proposal as a ghost and appends one ledger event on approval.
- **C (sulphur-mountain-world, the pack and the blueprint)**
  - A building's files live in the pack, for example `structures/<id>/model.ifc`, `model.glb` and `scene.json`.
  - The pack keeps the id link: structure id ↔ IfcBuilding GlobalId, with the site's GlobalId per community.
  - Metres everywhere.
  - The pack's `originLL`, `originElevM` and `northDeg` become the IFC's georeference (`IfcMapConversion`).
  - Owner and decision memory stays in the pack, never in the IFC's `IfcOwnerHistory`.
- **D (Playground-Os, the Mind)**
  - The gateway and the orchestrator ↔ sub-agent protocol: the Architect agent calls `@pascal-app/mcp`; the Precision agent calls FreeCAD.
  - A **FreeCAD job contract**: in, an IFC and an instruction; out, an IFC, a report, and optionally a TechDraw PDF and FEM results.
  - FreeCAD runs on Johny's PC, through the desktop MCP bridge or headless `freecadcmd`, never in a web request path.
  - Keys stay in the gateway.
- **F (EcoVillage-map):** nothing is needed for A's steps. The briefing can list a structure's latest IFC and GLB versions from the ledger.

## (d) Steps

The live link is the production editor, https://architect-editor-snowy.vercel.app, and the world's `/builder`. Each step lands through a preview, a merge and a production check, like every phase.

**P1 — a FreeCAD-ready IFC leaves `/builder`.**
- **Fix the exporter:**
  - GlobalIds derived from node ids, plus `Tag`;
  - the project → site link, storey elevations, opening centres and sills;
  - the north–south axes and the georeference from the site;
  - `IfcWall` with an Axis;
  - slabs, roofs, stairs, columns and zones with geometry;
  - eco, temple and body forms as proxies with their parameters;
  - neutral owner history.
- **Add a check** that exports a fixture twice, reads it back through the converter, and makes two derived quantities agree: the element count and GlobalId set against the scene's nodes, and positions within tolerance. Its `--self-test` forges an unstable id and a shifted opening.
- **First visible result:** on the live editor, *Export IFC 4.3* downloads a model that FreeCAD 1.1.4 opens with north up, windows at their sills and storeys stacked. The export summary shows the same GlobalIds on a second export.

**P2 — IFC comes back in.**
- **The import:** `ifc-converter` moves into `/builder` behind an *Open IFC* command. It matches by GlobalId and then Tag, and produces a **proposal**: a scene patch with a diff of changed, added and removed elements, not a replacement.
- **The contract:** the eco/1 revision (`structureId`, `ifc`, `eco:ifc`) is agreed with E and shipped behind a version bump.
- **First visible result:** on the live `/builder`, *Open IFC* loads an IFC saved by FreeCAD and shows the changes as a ghost over the building (a moved window highlighted, its id kept); *Apply* makes it the building.

**P3 — FreeCAD as the Precision agent.**
- **The bridge:**
  - a desktop add-on, chosen from the Addons index after its licence is recorded;
  - a headless `freecadcmd` runner that follows FC-Worker's command pattern (health check, run job, export) and runs as its own program;
  - both behind D's gateway.
- **The jobs:** *plan set* (TechDraw PDF), *quantities* (Qto) and *check* (Preflight, FEM). Their results are attached to the structure in the pack through the executor.
- **First visible result:** in the world, a building's panel offers *Plan set (PDF)*, made by FreeCAD from that building's IFC. When Johny's PC is off, the panel says *FreeCAD offline*, and nothing else changes.

**P4 — the Mind designs with the Builder.**
- **The Architect agent** drives `@pascal-app/mcp`, headless and with the same tools as the UI, against the building's scene and the site the world sent.
- **Proposals** are ghosts in the world. The executor commits the IFC, GLB and scene on "yes".
- **The Precision agent** can be chained after it, for example "draw the plan set", "check the span".
- **First visible result:** Johny marks the pad and says "a two-room studio here". A ghost studio appears on the live world; "yes" saves it, and *Edit building* opens it in `/builder`.

## (e) Risks

- **Today's IFC is not FreeCAD-ready** (see (a)): unstable and partly invalid GlobalIds, a missing project link, storeys at 0, misplaced openings, a mirrored plan, no georeference, most element kinds skipped. P1 comes before any FreeCAD work, and IFC stays hidden in light graphics until it is right.
- **Parametric intent is lost in both directions.** Pascal's roofs, stairs and organic forms are not FreeCAD's Arch objects. A proxy edited in FreeCAD comes back as a mesh. Mitigation: parameters in `Pset_Playground`, id matching, and proposals that say what was lost.
- **Two IFC engines.** web-ifc in the browser and IfcOpenShell in FreeCAD may place geometry differently. The P1 and P2 checks use a committed fixture that FreeCAD saved, so they run without Johny's PC.
- **Johny's PC is a dependency** for FreeCAD, but the world must open for a stranger with the box switched off. FreeCAD features are therefore optional and queued jobs, never in a request path, and they show *offline* when the box is off.
- **The bridge runs code.** An MCP bridge that executes Python inside FreeCAD is powerful:
  - sandbox the runner, as FC-Worker does;
  - never expose it to the web;
  - review the add-on's licence and code before installing it.
- **Licences.** Only MIT, BSD or Apache code enters this repository. FreeCAD (LGPL-2.1), IfcOpenShell (LGPL-3.0) and any GPL add-on run only as separate programs. Beyond those rules:
  - the Parts Library's CC-BY-3.0 needs attribution per part in the catalog manifest;
  - CC-BY-SA material (Machines, Addon-Academy docs) stays out;
  - web-ifc (MPL-2.0) stays an unmodified npm dependency.
- **Personal data.** IFC can carry `IfcPerson` and `IfcOrganization`. The exporter writes neutral values, never owner names, and community memory stays in the pack.
- **Size.** The Parts Library is 2.8 GB unpacked. It never enters a repository; only chosen parts do, as GLB or IFC through the export gate.
- **Contract change.** The eco/1 revision needs E's agreement and a version bump. Until then, `/builder` keeps today's messages.
- **The axis fix changes output.** IFC files exported before P1 are mirrored. Few exist, since IFC export errored or was hidden in production until A4.
