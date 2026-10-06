# Every record kind the map writes, through realize.py (A, the Geometer, 5 Oct 2026; forms 102 and 107 built 6 Oct)

How it was found out: lane E's own checks were run from the `.exe` on this PC (`--export-check`, `--wall-check`,
`--ground-check`, `--struct-check`, `--hand-check`, `--api-check`, each on a fresh scratch exchange). Each one draws its
pieces through the map's own tools, exports them (`built\<name>.json`, format `built/1`) and presses Realize, which runs
`freecadcmd realize.py` on them. All six passed. realize.py was also run by hand on: the records of the wall check
again (after today's fix), one record of each of the 22 catalogue forms of the map's `ui\ports\registry.gd`, and S01's
records. Which kinds exist and which tools make them was read from the map's code (`draw_tools.gd _add`,
`built.gd records()`, `pieces.gd`, `registry.gd`).

## By kind

| Record kind (`type`) | Made by the map's tools | Records seen today | Built by realize.py | Evidence |
|---|---|---:|---|---|
| `PlanCurve` | every wall, floor, roof outline; starters; beams, ring beams, pools, paths | 29 + S01's 38 | **yes**: a line, not a solid (Points smooth and with corners, Circle, Arc, Oval seen; Lobed, Leaf, Golden spiral and Vesica are A's own kinds by the same formulas) | every check below |
| `Wall` | walls by points, arc, freehand; split, join, extend, offset; retaining walls, terrace steps; plan and second floor; beams and ring beams (IFC Member), pergola beams and rafters (Member), pool and spa walls, the fire lounge's seat, fences (IFC Railing, with a gate) | 18 + S01's 31 | **yes**, every one; each matches the map within 0.02 m (wall check: 3 walls within 0.001 m, every opening within 0.000 m) | wall, ground, struct, hand, export checks |
| `Wall` `WallKind` (Rammed earth, Straw bale, Stone, Timber frame, Glass line) | the wall-kind tool | 2 (Straw bale) | **yes since today** (was "left out"): kept on the wall, in the design, in the result's `wall_kind`, and written back | `kinds-after` run: complete, no notes |
| `Wall` `OpeningKinds` (Door, Window, Arch, Round window, Oculus, Sliding) | the six opening tools | 3 walls, kinds Window, Sliding, Round window | **yes since today** (was "left out"): kept, in the result's `opening_list[].kind`, written back | same |
| `Wall` openings by shape (Rect, Arch, Round; Pointed) | the opening tools | Rect, Arch, Round | **yes**: cut, each held by the map within 0.000 m | wall check |
| `Wall` tops (Flat, Slope; Arch, Wave; `TopHeights`) | the height handles, retaining walls | Flat, Slope, TopHeights | **yes** (Arch and Wave tops not seen today; A's wall has them) | ground, hand checks |
| `Slab` | floors (click, outline, freehand, split, merge, plan, second floor), stair landings, pool floors, the oval column (IFC Column) | 10 + S01's 3 | **yes** | ground, struct, hand checks |
| `ShellRoof` | roof; free roof "Shell" | 2 | **yes** | export, hand checks |
| `LeafShell` | leaf; free roof "Leaf" (default) | 1 | **yes** | the round trip of today (the API check's save) |
| `Dome` | dome | 3 (1 realized) | **yes** (0.003 m) | export check |
| `Vault` | vault (two clicks, or along a curve) | 1 | **yes** (0.000 m) | export check |
| `Steps` | steps; both flights of the stair with a landing and of the half-turn stair | 3 | **yes** (0.000 m) | export, struct checks |
| `Revolved` | round column, pier, floor on piers, the fire bowl, pergola posts, the water tank, solar posts | 14 + S01's chimney | **yes** (each 0.000 m) | ground, struct checks |
| `BranchingColumn` | tree column | 1 | **yes** (0.004 m) | struct check |
| `HeightFieldShell` (the map's own: free roof "HeightField", solar panel) | free roof, solar | 2 + S01's 3 | **yes** (0.001 m) | hand, struct checks |
| `SacredFigure`, A's nine kinds (Vesica piscis, Seed of life, Flower of life, Golden rectangle, Root rectangle, Turned squares, Polygon, Star, Module grid) | the figure tools, the flower starter | 2 (Vesica, Seed of life) | **yes**, as lines | hand check |
| `GeodesicDome`, `Conoid`, `TranslationShell`, `WaveVault`, `GroinedSaddles` (catalogue forms 101, 103–106) | the catalogue | 5 (forms test) | **yes** | `forms` run: 5 solids |
| `FoldedRevolution` (form 102, a dome folded from one sheet) | the catalogue | 1 (forms test); 6 Oct: R's cases A, B and the catalogue's default | **yes since 6 Oct** (was "a form of the map's catalogue this workbench does not build"): one slab per face, R's sheet, strip, blades and box within 0.0005 m | `check_forms` D, R, X; realize by hand: 8 s, complete |
| `HeightFieldShell` "Leaf roof on ribs" (form 107, lane R's P-007 with its own params and its `Figure`) | the catalogue | 1 (forms test); 6 Oct: R's cases C, D and the catalogue's default | **yes since 6 Oct**, as a `LeafRoofOnRibs` (its `Base` is the height `BaseHeight`): the skin's underside the formula within 0.00001 m at 40 places, the midrib, ribs and edge beams under it. (The map's own free-roof leaf is a plain HeightFieldShell with heights and no `Figure`, and is built as that: hand check) | `check_forms` L, R, X; check_import N |
| `SacredSolid` (forms 1, 3, 6–15: Merkaba, Sri Yantra extruded, five nested solids, cube and octahedron, the stellated compounds, Star Mother, the thirteen compounds, Klein bottle) and the three ported `SacredFigure` forms (Sri Yantra, Fibonacci spiral, torus knot) | the catalogue | 15 (forms test) | **no** — same note | `forms` run |
| `Pad` (pads, pits, terraces, pool and spa pits) | the ground tools | — | **not sent**: the map keeps pads for itself and writes their earth as numbers in `<name>.earthworks.json` (built.gd) | built.gd `records()` |
| `Surface` (paths, drives) | path, drive | — | **not sent** (the map's own) | same |
| `Dimension`, `Label` | the measure tools | — | not sent: annotations | same |
| `SacredFigure` of the map's own kinds (Sri Yantra, Honeycomb, Fibonacci spiral as figures) | figure tools | — | not sent (the map's own) | same |

**Counts (6 Oct).** The map sends 19 record types to FreeCAD. realize.py builds **18 of them (yes)**, and **1 not (no)**:
`SacredSolid`. Of the catalogue's 22 forms, **7 are built** (all of lane R's, 101–107), **15 not** (lane C's: the
twelve `SacredSolid` forms and the three ported `SacredFigure` forms). On 5 Oct: 17 of 19 types, 5 of 22 forms. Every piece of every house kind seen today (walls of every kind, all six
opening kinds, floors, all roofs, steps and both stairs, columns, piers, tree columns, beams, ring beams, the site
structures, figures) was made and matched the map. Four kinds the map keeps for itself are not sent at all (`Pad`,
`Surface`, `Dimension`, `Label`).

## By the architect's list (5 Oct)

| Asked | Its records | Realized |
|---|---|---|
| walls of every kind | `Wall` + `WallKind` | yes (the kind word since today) |
| openings of every kind | `Wall` opening lists + `OpeningKinds` | yes (the kind word since today) |
| floors | `Slab` | yes |
| roofs incl. HeightFieldShell | `ShellRoof`, `LeafShell`, `Dome`, `Vault`, `HeightFieldShell` | yes (the catalogue's leaf roof on ribs too, since 6 Oct) |
| steps and the landing stair | `Steps` (+ the landing's `Slab`) | yes |
| pads, pits, terraces | `Pad` (+ terrace walls: `Wall`) | the walls yes; `Pad` is not sent by the map |
| retaining walls | `Wall` with `TopHeights` | yes |
| piers, columns | `Revolved`; the oval column a `Slab` | yes |
| tree columns | `BranchingColumn` | yes |
| beams, ring beams | `Wall`, IFC Member | yes |
| site structures | pool, spa, fire lounge, pergola, tank, solar, fence: `Wall`, `Slab`, `Revolved`, `HeightFieldShell`; their pits `Pad`; paths and drives `Surface` | yes, except the pits and paths (not sent) |
| figures as lines | `SacredFigure` (A's nine kinds) | yes, as lines |

## Next (most used first)
1. `Pad` — the ground work under a house (pads, pits, terraces, pools): the most used of what is not sent. It needs
   the map to send it (its curve, level and batter) and A to build it against the land (`exchange\godot\land\`): a
   proposal for E in FORMAT.md.
2. ~~The leaf roof on ribs (form 107) and the folded dome (102)~~ — **built 6 Oct** (below).
3. The 15 sacred solids and figures from lane C's notes: rare; a generic way that covers them all is to take the
   piece's triangles from the map's own `.glb` beside the records (a faceted solid, named so) instead of leaving it out.

## 6 Oct: forms 107 and 102 built

Built from lane R's own numbers (FROM-RESEARCH.md entries 7 and 2, R's generators), as two classes of the workbench:
`LeafRoofOnRibs` (organic_objects.py; organic_geom.leaf_roof_shape) and `FoldedRevolution` (folded_revolution_shape).
The import reads the map's records as written: a `FoldedRevolution` with its `Figure`; a `HeightFieldShell` whose
`Figure` is "HeightFieldShell" is the leaf (one without a `Figure` stays the shell on a grid of heights); the leaf's
`Base` is its `BaseHeight`, its `Bumps` a table kept as JSON (lengths times the map's scale); `Supports` (the map's
posts) is passed over. organic_records writes them back under the map's names.

Evidence: `freecad\check_forms.py` (a suite step, `forms`): 10 checks against R's reference cases A–D and its own
formulas (R's printed numbers within 0.0005 m; the dome's slabs, box and volume; the leaf's underside at 40 places, its
top along the normal, its outline, its members, its skin's volume against the closed form of a normal offset, +0.001 %),
the way back (an edit comes back under the map's names, nothing else) and the same file realized (complete, 4 of 4);
6 of 6 forgeries rejected. check_import's N: the leaf with its Figure is made as a LeafRoofOnRibs, the Merkaba still
named and not made. Realized by hand as Ctrl+R calls it (the catalogue's defaults): 8 s, complete, 2 of 2.

Two things on the map's side stop form 107 before it reaches FreeCAD (for E; FORMAT.md, 6 Oct): `draw_tools.gd
_refusal` reads the leaf's numeric `Base` (2.6) as a curve's id and refuses the export ("names a plan curve that is not
in its building"); `built.gd records()` leaves out the placement of a piece whose params have `Base`, so the leaf would
be built at the building's origin.
