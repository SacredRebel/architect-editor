# REALIZE — Ctrl+R, the engine under the map   (`/realize`)

Input: a records file (format `built/1`: the map's `exchange\godot\built\<name>.json`, or a house's
`exchange\house\models\<name>.json`). Output: `<name>.FCStd`, `.glb`, `.ifc`, `.json`, `.result.json` in the out folder.

1. **FreeCAD's window closed or open does not matter** — realize runs in `freecadcmd.exe` alone. Check that no other
   lane's freecadcmd is mine to stop (never stop by name).
2. **Run it** (the map's own command line, by hand):
   `powershell -File C:\Playground\Architect-editor\agent\tools\realize_timed.ps1 -Records <records.json> -Out <folder>`
   — the map uses `exchange\godot\built\realized`; for a test use `%TEMP%\lane-a\realize`. The out folder must not be
   the records' own folder.
3. **Read the result** — ok, complete, made of pieces, solids, notes. `complete: false` with a note "… not made" or
   "left out" is a kind or field realize does not build: KINDS.md, then FORMAT.md first, then build it.
4. **Time it** — the map waits 240 s (`built.gd WAIT_S`); S01 (80 pieces) took 87.5 s on 5 Oct, a test house 45 s.
5. **From the .exe** — `tools\map_check.ps1 -Check export-check` (E's check draws a house, exports it and presses
   Realize; its line "[export-check] realize PASS — FreeCAD ended done in N s …" and the map's own status line
   "realized in N s" are the proof). Start the .exe by its REAL path (through C:\Playground it does not find FreeCAD).
6. **A picture** — `picture_realized.py` (PICTURE_DESIGN=<.FCStd>, PICTURE_OUT=<path>) draws the design without the window.
7. **Record** — the numbers and paths in the report; anything new for E in NEW.md.
