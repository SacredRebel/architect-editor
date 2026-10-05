# TOOLS & SKILLS — what A can use, and the order to look

## Order of search (Rule 1)
1. `C:\Playground\knowledge\` (tools\, LESSONS.md, POOL-INDEX.md) — my traces: `organic-workbench.md`, `freecad-mcp.md`,
   `freecad-bundled-python-libraries.md`, `pythonocc-in-freecad.md`, `ifcopenshell.md`,
   `occt-loft-and-surface-through-points.md`, `occt-point-over-a-plan-place.md`, `freecad-curves-workbench.md`,
   `freecad-curvedshapes.md`, `freecad-lattice2.md`, `git-hooks.md`.
2. `C:\AI-Work\Sacred-Rebel Ai\Tools & Skills\` (the pool).
3. FreeCAD's own workbenches (Part, BIM/Arch, Draft) and the Addon Manager list (nothing installed without Johny's yes).
4. The web, read-only; then build.

## Programs and connectors
| Tool | What | Needs running | Used for |
|---|---|---|---|
| `C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe` | FreeCAD 1.1.4's console program (bundled Python 3.11 with numpy, scipy, shapely, matplotlib Agg, IfcOpenShell, pythonocc) | nothing | every build, check and realize |
| FreeCAD's window + the FreeCAD MCP connector (`mcp__freecad__*`, neka-nat/freecad-mcp) | the window, for pictures from the GUI and Johny's own designs | Johny opens FreeCAD (its RPC server starts itself) | rarely now; never start it myself |
| `exchange\godot\build\Sulphur Mountain.exe` | the map, for E's checks from the .exe | nothing (start by its REAL path) | proving Ctrl+R, getting the map's own records |
| `C:\Users\paul\AppData\Local\Programs\Python\Python312\python.exe` (`python`) | plain Python for tables and patches | — | kinds_table.py, patch_shared.py, the log helpers |
| git (+ `gh` is NOT signed in; the browser pane is) | commits, backup push | — | save points |

## My scripts (`agent\tools\`; each says its use at its top)
`run_suite.ps1` (the console suites) · `run_probe.ps1` + `_log.py` (a probe in freecadcmd, logged at once) ·
`realize_timed.ps1` (Ctrl+R's command line by hand) · `map_check.ps1` (one of E's checks from the .exe on a scratch
exchange) · `kinds_table.py` (records against results) · `roundtrip.ps1` (map save → FreeCAD → save) ·
`picture_realized.py` (an FCStd drawn without the window) · `patch_shared.py` (a shared file, one anchor) ·
`prepend_entry.py` / `prepend_root_line.py` (the logs) · `house\` (S01's window build, spec check, house check — parked).

## My skills (`.claude\skills\`, the same as the protocols)
`/realize` · `/roundtrip` · `/map-check` · `/suites` · `/port-note` · `/shared-file` · `/session-end`

## Traces
Every tool I adopt gets `C:\Playground\knowledge\tools\<name>.md`; every pitfall goes to `knowledge\LESSONS.md` with my
lane letter and its guard (what now prevents it, or "none yet").
