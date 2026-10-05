# ROUNDTRIP — a map save through FreeCAD and back, every edit kept   (`/roundtrip`)

Input: a map save (`edits/2`). Johny's own: `C:\Playground\exchange\godot\save\edits.sulphur-mountain.geojson` (it exists
only after his first Ctrl+S). Output: the save that came back, the counts, the records sent and read back, the design.

1. **Never the real save** — work on a scratch COPY (the script copies it): `tools\roundtrip.ps1 -Save <save> [-Work
   <folder>] [-Edit "<piece id>:<property>=<value>;…"]`.
2. **What happens** (`freecad\roundtrip.py`): each drawn building of the save → its `built/1` records exactly as the map's
   export makes them → FreeCAD's objects (`organic_import.import_built`) → records read back from those objects
   (`organic_records.records_of`) → the save again with each piece's numbers as FreeCAD holds them; every field FreeCAD
   was not given stays the save's own. A number back within 0.5 mm (a length) or 1e-9 (anything else) of the one given
   is the one given (the trip's own noise is no edit; the furthest such difference is printed).
3. **Read the counts** — features in = features back; per building: pieces in the save → records sent → made in FreeCAD
   (solids) → records back; "changed in the save: 0" without -Edit; with -Edit, exactly the edits asked.
4. **On the map** — put the returned save as `save\edits.sulphur-mountain.geojson` into a scratch exchange (the site,
   the envelope and land\ copied in) and run `"<real path>\Sulphur Mountain.exe" -- --shot=<png> --exchange=<it>
   --frames=240`: its line "[build] … N saved edits applied" must give the save's count, and the picture the same
   building (compare it with the original save opened the same way: pixels that differ only where an edit was made).
5. **Record** — counts before/after in the report; the files in `docs\plans\engine\evidence\roundtrip\`.

Proven on 5 Oct on a save written by the map's own API check (16 features: 1 drawn building of 5 pieces, 10 tree
records): 16 in, 16 back; 5 → 5 → 5 (4 solids) → 5; changed 0; with two edits made in FreeCAD (a wall's height 3.3 → 3.1,
a floor's thickness 0.2 → 0.25) both arrived in the save and nothing else changed. The map opened all three saves (16
saved edits applied each): the unchanged one drew pixel for pixel as the original except the fps counter; the edited one
differed only round the edited room (`docs\plans\engine\roundtrip-on-the-map.png`).
