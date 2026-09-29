# freecad/

FreeCAD 1.1 macros and checks for the Sulphur Mountain site. They run inside FreeCAD,
either as a macro or through the FreeCAD MCP connector. Nothing here runs in the web
app's build.

## SulphurMountainSite.FCMacro: the site template

It builds `SulphurMountain-site.FCStd` from the live land pack at
https://sulphur-mountain-world.vercel.app/. Every run fetches the pack; nothing from it is
stored here.

- **Frame.** The unit is metres. The origin (0, 0, 0) is the Oak Leaf chimney, the pack's
  origin of `oak-leaf-massing` in `models.json`. Z = 0 is the 425.90 m datum, the Oak Leaf
  main floor. +X points east and +Y true north. The BIM Site holds the chimney's
  longitude and latitude, elevation 425.90 m and declination 0, plus its UTM 11N
  coordinates from `positions.csv`.
- **Terrain.** USGS 3DEP 1 m terrarium tiles give one vertex per second pixel, at the
  pixel's own centre and value. Contours are drawn every 1 m, with an index contour every
  5 m.
- **Survey.** The property line has 11 corners draped on the terrain, plus a flat copy at
  Z = 0. Its 11 horizontal distances are dimensioned. Also drawn: the 16 ft access
  easement and the 4 found monuments.
- **Setbacks.** These are the typical Ventura RE/AE yards from
  `packages/plugin-eco/src/eco-jurisdiction-ventura.ts`: front 6.10 m, side 1.52 m,
  rear 4.57 m, height limit 10.67 m. Confirm them with the AHJ. The front is the edge with
  the most frontage within 8 m of a county road centreline; the edges beside it are
  sides; the rest are rear. `BuildableEnvelope` is the parcel less every edge's buffer.
- **Existing structures.** These are simple solids: the county footprints on their county
  bases with their 2018 lidar roof heights, and the warehouse's lidar roof plane. Each
  solid stores the terrain under it (`TerrainUnderM`) and its drift from its base
  (`TerrainDriftM`).

Run it from FreeCAD ▸ Macro ▸ Macros… ▸ `SulphurMountainSite.FCMacro`. It takes about
15–40 s, depending on the network.

| Environment variable | Default | Meaning |
|---|---|---|
| `SITE_FCSTD` | `%USERPROFILE%\Documents\SulphurMountain\SulphurMountain-site.FCStd` | the output file |
| `SITE_PACK_URL` | `https://sulphur-mountain-world.vercel.app/` | the pack |
| `SITE_FRONT_EDGE` | (the edge with the most road frontage) | 1-based front edge override |

The `.FCStd` is never committed. It holds the pack's terrain, which is streamed from its
publisher and never copied into a repository.

## check_site.py: the check, with `--self-test`

It compares the file with the live pack. Every expectation is derived again here,
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

`--self-test` forges nine faults and must see every one rejected.

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
- USGS 3DEP terrain: public domain. It is streamed at run time.
- The pack's layers: the pack's own work. They are streamed at run time.
- These macros and checks: MIT, like the rest of this repository's own code.
