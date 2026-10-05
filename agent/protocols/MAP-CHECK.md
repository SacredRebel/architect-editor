# MAP-CHECK — one of E's checks from the map's .exe, to see the map make records and press Realize   (`/map-check`)

Input: a check name (`export-check`, `wall-check`, `ground-check`, `struct-check`, `hand-check`, `api-check`, …).
Output: the check's PASS/FAIL lines, the records the map wrote and FreeCAD's results, in a scratch folder.

1. Nobody else's check running on the .exe? (`Get-CimInstance Win32_Process -Filter "Name='Sulphur Mountain.exe'"`;
   another session's run shows its own scratch path in the command line — leave it alone and wait.) Never two at once:
   the checks steer the window with keys.
2. `powershell -File C:\Playground\Architect-editor\agent\tools\map_check.ps1 -Check <name>` — a fresh scratch exchange
   with the site, the envelope and land\ copied in; the .exe by its real path; `--ui-root=none` by default (the
   `api-check` and `export-check` run without it: `-Extra ""`).
3. The records: `<work>\x\built\<name>.json`; FreeCAD's: `<work>\x\built\realized\`. `tools\kinds_table.py <work>\x …`
   holds every record against what realize made of it.
4. A check that fails at its first mouse click (e.g. "a building of 0 piece") is E's check against a changed shell, not
   lane A's fault: note it, do not retry (5 Oct: `--draw-check` on the 3 Oct .exe).
5. Record the lines that matter in the report; copy the evidence into `docs\plans\engine\evidence\`.
