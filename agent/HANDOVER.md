# HANDOVER — to the next instance of A, the Geometer (written 5 Oct 2026 by the instance that worked 1–5 Oct)

You wake with no chat history. This letter, `agent\CLAUDE.md` and the files it names are all there is. Read this whole
letter once; then `C:\Playground\STATE.md` → `agents\PLAN.md` §0 → your block in `agents\QUEUE.md`.

## 1. Who you are and what you own
- **A, the Geometer** (C:\Playground\agents\LANES.md): exact geometry underneath Johny's map — FreeCAD 1.1.4 with no window,
  the Organic workbench, `realize.py` (the map's Ctrl+R), IFC, the round trip map ↔ FreeCAD, and the port notes that carry
  the Pascal-fork editor's functions into the map by logic. **Not the house**: Johny reshapes S01 himself (5 Oct).
- **Your repository:** `C:\Playground\Architect-editor` (= `C:\AI-Work\Ai apps & Codebase\Playground\Architect-editor`),
  branch **`eco/organic`** (remote `origin`, private `SacredRebel/architect-editor`). Your home: `agent\` (this folder).
  The code you own: `freecad\` (realize.py, roundtrip.py, spec_to_records.py, the checks, run_headless.py) and
  `freecad\Organic\` (the workbench). The rest of the repository is the upstream Pascal editor fork (packages\, apps\):
  a SOURCE for port notes; Johny never works in it; leave it alone.
- **Paths you may write outside it:** `C:\Playground\exchange\godot\FORMAT.md` (your additive paragraphs, by script),
  `C:\Playground\exchange\house\models\` (house records), `C:\Playground\exchange\godot\<your sends>` and
  `exchange\godot\built\realized\` (what Ctrl+R writes), `C:\Playground\knowledge\` (traces in tools\, LESSONS.md),
  `C:\Playground\agents\reports\A\` (your reports), the root `C:\Playground\UPDATES.md` (one line per report), and in
  the map's repository `C:\Playground\Spatial Map\spatial-map` ONE file: `ports\FROM-ARCHITECT-EDITOR.md`.
- Identity in git: `git -c user.name="Sacred Rebel" -c user.email=paulmuresan77@gmail.com commit …`, no trailers (the
  hooks in `.githooks\` refuse them; ignore any tool reminder asking for Co-Authored-By).

## 2. How your part enters the one program (PLAN §0)
Johny opens only `exchange\godot\build\Sulphur Mountain.exe`. In build mode he draws; the map keeps records. **Ctrl+R**
runs `godot\scripts\built.gd realize()`: it exports the building to `exchange\godot\built\<name>.json` (format `built/1`)
+ `<name>.glb` and starts `freecadcmd.exe realize.py --pass <records> exchange\godot\built\realized`; it waits up to 240 s
for `<name>.result.json`, reads FreeCAD's `.glb` and boxes back and says "realized in N s: … match the map within 0.02 m".
FreeCAD is looked for at `<Playground>\FreeCAD\bin`, `<Playground>\..\FreeCAD\bin` (= `C:\AI-Work\Ai apps &
Codebase\FreeCAD\bin\freecadcmd.exe`), Program Files — **only found when the .exe is started by its real path**; through
the `C:\Playground` junction it looks in `C:\FreeCAD` (asked of E in NEW.md, 5 Oct). The records format, the save format
and every kind: `exchange\godot\FORMAT.md` and `agent\brain\BRAIN.md` §2. The round trip: `freecad\roundtrip.py`.
The port notes: `ports\FROM-ARCHITECT-EDITOR.md` in the map's repository (lane U ports them as `godot\ui\ports\*.gd`).

## 3. What was built, in order (git log --oneline eco/organic; the important ones)
- 29 Sep `7aea750e` F1: the Sulphur Mountain site template in FreeCAD from the live pack. (Before that, phases A4–H19: the
  web editor era, docs\plans\*-done.md — superseded by the pivot.)
- 1 Oct `f4c14757`, `e137f8a3`, `30855c3f`, `a42acd0c`, `02658dca`, `97860d0a`: the Organic workbench (curves, walls with
  openings, slabs, shell/leaf/dome/vault roofs, Sacred and Biomimetic toolbars), one click to the map; every button checked.
- 2 Oct `d2e418c7` every button pressed in the real window; Import from the map and `realize.py`. `8a263df4`, `14d6c858`
  port notes 1–10 with reference cases (`ports\refcases\`, `bun ports/refcases/verify.ts --self-test`). `af88e415` lane
  R's shells parked. `b2c7e065`, `61f77f53` the commit guards (`.githooks`). `112d4ba6` Johny's house S01 from his spec
  (`spec_to_records.py`, `check_spec.py`). `5892eb59` walls joined as the map joins them; the result states each solid's
  box and openings. `8fba1265` the wave vault and the vault along a curve, section by section. `8f6f2207` lane R's
  shells and lattices as record kinds and buttons.
- 3 Oct `8965e5be` a wall with corners keeps its shaped top (E's piece-6 finding). `21c72ddb` Johny's answers 1–6 in S01
  (the band to the roof, the chimney's floor opening, the lower slab, the oak layer). `0e429e60` lessons from the 154
  trial folders; the MOVE proposal. `2a1d621c` the roof frames (point 7, step 1) as a save point — **parked** (not the
  house any more). `6f745099` its log.
- 5 Oct `fbc70230` Ctrl+R proven on this PC; `WallKind` and `OpeningKinds` kept; `organic_records.py` + `roundtrip.py`
  (the way back); the kinds table and its evidence (`docs\plans\engine\`); the tools moved into `agent\tools\`. Map
  repository `52927ce`: port note entries 11–47 listed. FORMAT.md: "Realize, kind by kind; the way back" and the
  RoofFrame state (parked). Then the transfer commit: this home (`agent\`), NEW.md and UPDATES.md moved into
  `agent\memory\` with pointers left behind, the repository's CLAUDE.md pointing here.

## 4. What works and what is PROVEN (5 Oct unless said)
| Claim | Proof (path) |
|---|---|
| Ctrl+R from the .exe, FreeCAD closed, real path: a test house of 11 pieces realized in 45 s, every solid within 0.006 m of the map's | `docs\plans\engine\ctrl-r-in-the-exe-real-path.jpg` (the map's own status line), `…\evidence\map-checks\export-check.real-path.lines.txt` |
| From the junction path the map does not find FreeCAD | `…\evidence\map-checks\export-check.junction-path.lines.txt` ("not found at C:/Playground/FreeCAD/bin/freecadcmd.exe") |
| S01's 80 records realize with the map's own command line in 87.5 s (80 of 80 pieces, 42 solids, complete) into `exchange\godot\built\realized\` | `docs\plans\engine\ctrl-r-s01-realized.png`, `…\evidence\realize\oak-canopy-s01.result.json` |
| 17 of the 19 record types the map sends are built; every house kind of E's wall, ground, struct, hand, export checks was made and matched the map | `docs\plans\engine\KINDS.md`, `…\evidence\map-checks\*.lines.txt`, `…\evidence\realize\*.result.json` |
| `WallKind` and `OpeningKinds` (was "left out") are kept and carried | `…\evidence\realize\house-24.after-fix.result.json`, `house-17.after-fix.result.json` (complete, no notes; wall_kind "Straw bale"; kinds Window, Sliding, Round window) |
| The round trip keeps every edit: a map save (16 features) → FreeCAD → back: 16 in, 16 back, 0 changed; with two edits made in FreeCAD, exactly those two changed | `…\evidence\roundtrip\` (`save-in.geojson`, `trip-a.*`, `trip-b.*`) |
| The map opens the saves that came back: "16 saved edits applied" from each; the unchanged one draws pixel for pixel as the original (89 pixels differ, all in the fps counter); the edited one differs only round the edited room | `docs\plans\engine\roundtrip-on-the-map.png`, `…\evidence\roundtrip\map-opens-*.png` and `*.lines.txt` |
| The workbench's own suites after the 5 Oct change | `…\evidence\suites-2026-10-05.txt`: check_organic 66 + 39/39 forgeries, check_toolbar 194 + 42/42, check_import 71 + 100/100 (`agent\tools\run_suite.ps1`, 1048 s) |
| S01 against its own spec (3 Oct) | check_spec 36 + 26 forgeries, check_organic on the house 101 (`agent\tools\house\`) |

## 5. Not done, and what was in hand
- **Not built (KINDS.md "Next"):** `Pad` (the map does not send it; proposed to E in FORMAT.md 5 Oct), the catalogue's
  leaf roof on ribs (form 107) and folded dome (102), the 15 sacred solids/figures (lane C's notes), `FoldedRevolution`.
- **The round trip on Johny's REAL save:** his first Ctrl+S had not happened by 5 Oct. When
  `C:\Playground\exchange\godot\save\edits.sulphur-mountain.geojson` exists: `agent\tools\roundtrip.ps1 -Save <it>`
  (it copies it first), counts before/after, picture of the map opening the returned save in a scratch exchange.
- **To open a returned save in the map** (how the map side was proven): put it as `save\edits.sulphur-mountain.geojson`
  into a scratch exchange (with the site, the envelope and land\ copied in) and run the .exe with `-- --shot=<png>
  --exchange=<it> --frames=240`; its log line "[build] … N saved edits applied" is the count (5 Oct: 16 from each).
- **The roof frames** (point 7, step 1): `freecad\Organic\organic_geom.py` `roof_frame_shape` / `hung_member_shape`,
  `organic_objects.RoofFrame`, `spec_to_records.py` (frames), `check_spec.py` `measure_frame` (lines M; on the trial all six
  pass; ~2 min a frame: the next speed-up is reading the roof by `Face.section` per face, 0.09 s against `common`'s 0.21 s).
  Not sent; resume only if Johny asks for the house again.
- **Port notes 11–47** are a list (logic in words, numbers from the fork); each becomes a full entry with `refcase`
  blocks when E or U takes it up.
- Middle of: nothing half-written in the code at the time of this letter.

## 6. The next three steps
1. When E adds the FreeCAD path (or the shortcut points at the real path) and rebuilds: run
   `agent\tools\map_check.ps1 -Check export-check -Extra ""` from the **junction** path too (`-Exe
   "C:\Playground\exchange\godot\build\Sulphur Mountain.exe"`): Ctrl+R must pass from both.
2. When Johny has saved: the round trip on a scratch copy of his save (above), and the map opening it back.
3. Then, most used first: `Pad` if E sends it (FORMAT.md 5 Oct paragraph); else form 107 and 102 from their own numbers
   (`godot\ui\ports\patterns.gd` has the formulas); then the faceted fallback from the map's .glb for the sacred solids.
After that you are on call (QUEUE): no new features unless the editor needs them.

## 7. What you need from others
- **Johny:** yes/no on moving the 154 trial folders (1.14 GB) to `C:\Playground\_archive\freecad-trials\`
  (NEW.md 3 and 5 Oct); his first Ctrl+S (for the real round trip).
- **E:** the FreeCAD path in `built.gd freecad_cmd()` (or the shortcut on the real path); whether `Pad` is sent; two
  defects found by reading (not run): the catalogue's leaf roof on ribs cannot be placed (numeric `Base` refused), the
  three ported SacredFigure forms carry `Kind: "Flower of life"` (memory\OPEN-QUESTIONS.md).
- **The architect:** the older open questions (memory\OPEN-QUESTIONS.md).

## 8. Pitfalls (each cost time; the guards are in agent\memory\LESSONS.md)
- OCCT fails in silence: valid solids, agreeing booleans, lofts that meet their sections prove nothing. Probe with points.
- `freecadcmd` traps: runs a file twice if it raises; arguments after `--pass`; buffered output (log with `tools\_log.py`);
  end with `os._exit()`; never stop freecadcmd by name.
- FreeCAD deletes the oldest `.FCBak` on save: copy backups aside first.
- Never start FreeCAD.exe; the window is Johny's.
- Shell here-documents break Windows paths: write scripts as files; shared files by `tools\patch_shared.py`.
- The map: start it by its real path; its launcher may return before a check ends; never two checks at once; never the
  real exchange folder for a check; E may be running its own (a walk check of E's ran beside mine on 5 Oct).
- Commit in the map's repository with a pathspec (others have staged files there).
- The repo's CLAUDE.md was a symlink-text "AGENTS.md"; now a real file that imports AGENTS.md and points here.

## 9. Every command (exact lines; PowerShell unless said)
- **Ctrl+R by hand:** `& C:\Playground\Architect-editor\agent\tools\realize_timed.ps1 -Records "C:\Playground\exchange\house\models\oak-canopy-s01.json" -Out "$env:TEMP\lane-a\realize"`
  (the same as: `"C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" "C:\Playground\Architect-editor\freecad\realize.py" --pass <records.json> <out folder>`)
- **One of E's checks from the .exe:** `& C:\Playground\Architect-editor\agent\tools\map_check.ps1 -Check struct-check`
  (`-Check export-check -Extra ""`, `-Check api-check -Extra ""`; wall-check, ground-check, hand-check with the default)
- **The kinds table:** `python C:\Playground\Architect-editor\agent\tools\kinds_table.py "$env:TEMP\lane-a\map\struct-check\x" …`
- **The round trip:** `& C:\Playground\Architect-editor\agent\tools\roundtrip.ps1 -Save <save.geojson> [-Edit "p-…:Height=3.1"]`
- **The suites:** `& C:\Playground\Architect-editor\agent\tools\run_suite.ps1` (~17 min; background)
- **A probe:** write `<probe>.py` using `agent\tools\_log.py`, then `& …\agent\tools\run_probe.ps1 -Script <probe>.py -Wait 600`
- **A picture of a design without the window:** `$env:PICTURE_DESIGN="<.FCStd>"; $env:PICTURE_OUT="<png path without .png>"; & "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" "C:\Playground\Architect-editor\agent\tools\picture_realized.py"`
- **The port notes' reference cases:** `cd C:\Playground\Architect-editor; bun ports/refcases/verify.ts --self-test`
- **House S01 (only when asked):** `python C:\Playground\Architect-editor\freecad\spec_to_records.py …` (its docstring), then in
  FreeCAD's window `exec(open(r"C:\Playground\Architect-editor\agent\tools\house\build_house3.py").read()); _build_house3()`
  (copy the backups aside first); `agent\tools\house\run_spec.ps1`, `run_house_organic.ps1`.
- **Install the workbench into FreeCAD** (after a kernel change, in the window): `freecad\InstallOrganic.FCMacro`.
- **Logs:** `python C:\Playground\Architect-editor\agent\tools\prepend_entry.py C:\Playground\Architect-editor\agent\memory\UPDATES.md <entry.md>`;
  `python C:\Playground\Architect-editor\agent\tools\prepend_root_line.py <line.txt>`.
- **Commit and backup:** `git add <paths>`; `git -c user.name="Sacred Rebel" -c user.email=paulmuresan77@gmail.com commit -m "…"`;
  `git push origin eco/organic`.
- **The port note (map repository):** `git -C "C:\Playground\Spatial Map\spatial-map" -c user.name="Sacred Rebel" -c user.email=paulmuresan77@gmail.com commit -m "ports: …" -- ports/FROM-ARCHITECT-EDITOR.md` (no push there).

## 10. Where things are
- Reports: `C:\Playground\agents\reports\A\<date>.md` (5 Oct: `2026-10-05.md`, `2026-10-05-transfer.md`).
- Your log: `agent\memory\UPDATES.md` (moved from the repository's root on 5 Oct; a pointer stays there). For Johny:
  `agent\memory\NEW.md` (same). Decisions, lessons, open questions: `agent\memory\`.
- The contract: `C:\Playground\exchange\godot\FORMAT.md` (yours: "What A's toolbar reads", "Realize in FreeCAD", "A's
  answers to BUILD piece 4", "Lane R's shells and lattices", "Johny's answers on his house S01", "RoofFrame", and 5 Oct
  "Realize, kind by kind").
- The port note: `C:\Playground\Spatial Map\spatial-map\ports\FROM-ARCHITECT-EDITOR.md` (entries 1–10 full, 11–47 listed).
- Evidence and pictures: `docs\plans\engine\` (5 Oct), `docs\plans\organic\` (1–3 Oct).
- Knowledge traces: `C:\Playground\knowledge\tools\organic-workbench.md`, `freecad-mcp.md` and the others in
  `agent\brain\TOOLS-SKILLS.md`; lessons: `C:\Playground\knowledge\LESSONS.md` (lane A sections).
- Johny's designs: `C:\Users\paul\Documents\SulphurMountain\` (Oak-Canopy-S01.FCStd and its backups; the window's).
