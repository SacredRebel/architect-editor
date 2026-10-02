# Organic workbench — the window pass, the map's records, the land's envelope (night of 1 Oct 2026)

Lane A, branch `eco/organic`. What `organic-done.md` left open was everything that needs
FreeCAD's real window. Johny opened FreeCAD with its RPC server on the evening of 1 Oct; this
is what was done in it, and what the architect's four notes of that evening added.

## What was asked

1. Press every button in the real window as Johny would, one picture each; fix whatever
   differs from the console run; build the real site template; confirm the connector starts
   by itself.
2. `freecad\QUICKSTART.md` for Johny, with a copy in `exchange\house\`.
3. The FreeCAD section of `agents\EDITOR-AGENT.md`, every button with its parameters.
4. A button **Import from the map** for buildings drawn in the map's build mode; field
   names agreed with lane E in `exchange\godot\FORMAT.md`.
5. From lane E: a `Points` curve read as the map's smooth curve; `source_path` in the
   `.json`; then five kinds the map writes that the workbench did not have; `realize.py`.
6. Rule 7 (no double work): read the data inventory, use the files named there.

## What works, and how it was checked

**Every button, pressed in the window.** 27 buttons, each through its own `QAction`, with a
real selection made by clicking in the 3D view where the button needs one. One picture each
in `organic\buttons\` (30 files: the 27, a wall on a plan figure, the two question windows of
Turn to the sun). The solids' volumes are the console's to the last printed digit:

| Button | In the window |
|---|---|
| Curved wall on an arc | 10.1788 m³ |
| Opening, clicked on the wall | 0.4221 m³ removed, at the clicked point |
| Floor slab | 40.2123 m³ |
| Shell roof on a closed wall | 52.3592 m³ |
| Minimal surface | 10.3078 m³ |
| Leaf shell roof | 37.3997 m³ |
| Ribbed vault | 31.0369 m³ |
| Catenary arch | 8.8944 m³ |
| Dome | 47.4283 m³ |
| Saddle shell | 10.0357 m³ |
| Plan figure (seed of life, size 4), a wall on it | its outline 50.2655 m long round 183.669 m²; the wall 40.7168 m³ |
| Regular solid (icosahedron) | 58.9058 m³ |
| Geodesic dome | 31.1338 m³ |
| Gridshell and hanging net (laths) | 1.8406 m³ each |
| Cellular wall | 4.7282 m³ |
| Veined leaf shell | 33.1856 m³ |
| Branching column | 0.5781 m³ |
| Grow organic building | wall 61.0066, roof 29.8575, floor 16.2657 m³, in 25 to 29 s |
| Sun rose | June sunrise 64.57°, sunset 297.75°, from the land pack's observer 51 m away |
| Turn to the sun | the front to 64.57°; nothing rebuilt |

**What differed from the console, and was fixed at the root:**

- *A wall's shaped top was sometimes not cut at all, and the wall called valid.* OCCT's cut
  fails without a word where the cutting surface only touches the prism's flat top (at the
  crests of a wave or an arch): 24 of 120 trial walls. The prism now stands 0.5 m above the
  top line, and every cut is held against the volume the wall must have; a wall whose cut
  does not hold is refused, not drawn.
- *The same building had different triangles in the window and in the console*, and after
  being moved. The mesh was sized by a box read from the window's display triangles. It is
  now sized by the solid's own geometry in its own frame: the pavilion is 30,944 triangles
  from the window, from the console, and wherever it stands.
- *A check that passed in the console failed in the window*: `optimalBoundingBox()` reads
  display triangles there (66 mm off). The checks ask for the exact box.
- *The connector stopped for 20 minutes* on Turn to the sun's question window. The pass now
  answers such a window from a timer, as a person would.

**The site template** is built in the window: `Documents\SulphurMountain\SulphurMountain-site.FCStd`
(pictures `organic\site-template-plan.png`, `organic\site-template-3d.png`). `check_site.py`
on it in the window: 27 checks, 12 of 12 forgeries rejected. **The connector starts with
FreeCAD**: `%APPDATA%\FreeCAD\v1-1\freecad_mcp_settings.json` holds `"auto_start_rpc": true`,
and the server answered on port 9875 in the FreeCAD Johny opened, without anything pressed.

**From the map to FreeCAD.** *Import from the map* (button 15) and `freecad\realize.py`
(without the window) rebuild a `built/1` file from the workbench's own objects: plan curves
(the map's smooth curve through points, span for span), walls with their openings where the
map measured them, slabs, shell roofs, leaf roofs, domes, vaults, steps. For lane E's second
piece the workbench got: a leaf's `Asymmetry`, a dome's `StretchX` / `StretchY` (an oval
plan), a vault's `Base` (it follows a drawn curve), a `Steps` object (IfcStair), a piece's
`turn`. What the map read of the land at a piece (`land`) is carried through as written.
`realize.py` prints one line starting with `REALIZE` and ends with 0 or 1; in its result
`notes` is what the records say that the files do not, `site_notes` what the map's files say
of the place. Measured: a room of a round wall with a door, a floor and a dome 2.7 to 3.0 s;
the 24-piece sample 45 to 65 s.

**Rule 7.** The tools read the land pack from lane C's folder on this PC, not from its
published copy (which was a day older). "Send to the map" reads lane C's
`build-envelope.geojson` at every vertex of the building in plan and writes what it holds
there (`envelope` in the `.json`, lines in the report view). Read on the test pavilion it
said: two thirds under protected oaks. **The pavilion was moved on 1 Oct at 23:45 to 89 m
west, 24 m north of the anchor**: a disc of its reach clear of every no-building polygon, on
one of the flattest such grounds. Same building, same triangles. The road is 38.6 m away,
the easement 45.7 m, the nearest existing building 79.2 m (picture `organic\buttons\14-send-to-the-map.png`).

**Checks** (each derives what it expects by itself and forges faults that it must reject;
all four run in the window and in the console):

| Check | Checks | Forged faults rejected |
|---|---|---|
| `check_organic.py` (kernels; the building sent to the map) | 44 | 24 of 24 |
| `check_toolbar.py` (every button's code, in two places) | 155 | 34 of 34 |
| `check_import.py` (a sample in the map's records, rebuilt and realized) | 30 | 39 of 39 |
| `check_site.py` (the site template; in the console its J cannot run: 26 and 11) | 27 | 12 of 12 |

## For Johny

`freecad\QUICKSTART.md`: one page, the clicks from an empty FreeCAD to a building in the
map, with pictures of each step (`organic\quickstart\`). A copy with its pictures is in
`C:\Playground\exchange\house\`.

## What is open

- The port notes for lane U, the six generators from lane R's studies, a Steps button
  (steps are made by the import and by code today).
- A vault that follows a curve has no ribs; a wall on a curve with corners has a flat top.
- A realized design file is large: 61 MB for the 24-piece sample, half of it FreeCAD's own
  copy of the whole building beside its pieces.
- The site template still draws its own "typical" setbacks beside lane C's envelope: named
  as a duplicate in `knowledge\DATA-INVENTORY.md` §10 for the architect to decide.
- Johny's house: nothing of its concept has landed in `exchange\house\concept\` yet.
