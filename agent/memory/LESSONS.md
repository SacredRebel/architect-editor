# LESSONS — A's own (the shared ones are also in C:\Playground\knowledge\LESSONS.md with the lane letter)

Each with what now guards against it.

## OCCT and FreeCAD fail in silence: probe with points
- A cutting solid that shares a plane with the wall takes nothing, and says it shared 0.000 m³ (2 Oct: 11 of 50 doors
  never cut in a build of 75 valid solids). Cutters run on 50 mm past any face; after a cut, probe that it is open.
  *Guard: check_spec's O lines, check_import.*
- Two booleans that agree are one algorithm: count what two solids share with points.
- `Shape.Volume` reads splined solids 0.16–0.36 % off, a joined wall with each side one long face 4 % short: use
  `og.volume_of` (OCCT adaptive) and keep `Shape.Volume` as the second measure (a gap between them shows a bad face).
  *Guard: check_spec V, check_import.*
- Lofts through many sections leave the surface off between the sections (a wave vault 13.7 mm) with every section met,
  the volume right and the solid valid: build from curve interpolations (`og.sectioned_vault`, `surface_through`), check
  between the given places. *Guard: check_organic's between-section probes.*
- An upright probe line along a seam finds nothing or too much (an edge 1 m above the solid's box): probe 2 mm beside,
  refuse a read above the box (`check_import.top_on`).
- A tool made of ruled pieces: each piece can fail alone (an empty common, valid, with points inside both): measure what
  each piece takes off (`prism.common(piece).Volume`, a 0 among them). Fixed by laying a turn out in 5 lines.
- OCCT's flat booleans with roof plans gave wrong areas in silence: plan booleans in shapely (`og.plan_zone`).
- A ruled face between two multi-edge wires came out invalid when flat: rule edge by edge (`_lined_solid`).
- Three measures of one solid agreeing say nothing about it being the right solid: hold it to a closed form worked out
  in the check; a forged fault must change every number the real fault would change.
- A straight member's top runs straight across: under a crest its middle stands below the curved underside (28 mm at
  OC1's ring by RS-NW's apex, 3 Oct). Read the roof at the member's two sides, not at its middle.
- Point-in-solid tests are cheap only where something is: give each solid its plan from its own triangles (shapely,
  prepared, grown 3 mm) and ask OCCT only inside it (200 places: 13.6 s → 0.7 s). Reading a roof by
  `Face.section(line)` per face: 0.09 s against `common` 0.21 s, same answers.

## FreeCAD's programs
- `freecadcmd file.py` imports the file under its own name (not `__main__`), runs it again if it raises, takes script
  arguments after `--pass`, prints its banner after the script's output; `import FreeCADGui` succeeds but is hollow
  (test `App.GuiUp`); the console is cp1252; output is block-buffered (log to a file at once: `tools\_log.py`); after
  the IFC exporter runs, `print` is lost unless the original `sys.stdout` was kept; end with `os._exit()`.
- To find a hang: `faulthandler.dump_traceback_later(limit, file=log, exit=True)` (`tools\_log.py`).
- The connector (neka-nat/freecad-mcp) keeps one globals namespace: an unclosed `zipfile.ZipFile` on an .FCStd blocks
  `saveAs` ("read-only"); stale document references raise; `App.openDocument` hands back an open copy under another
  name — close documents by `FileName`.
- Saving over a design makes FreeCAD write a backup and delete the oldest of the two it keeps, past the Recycle Bin
  (3 Oct: Johny's first-build backup lost, my mistake). *Guard: copy `.FCBak` files aside before any save (RULES).*
- Starting FreeCAD.exe from an agent shell was refused (1 Oct): Johny opens FreeCAD; the window is his.
- Other lanes run freecadcmd and the map's .exe: stop processes only by PID after reading their command line. Three
  stuck probe processes of 3 Oct could not be ended at all (Windows: "no running instance"); a restart cleared them.

## The map and its checks
- Started through `C:\Playground` (a junction), the map's `built.gd` looks for FreeCAD in `C:\FreeCAD` and Ctrl+R says
  "not found"; from the real path it finds `C:\AI-Work\Ai apps & Codebase\FreeCAD` (5 Oct). *Guard: none yet (NEW.md for E).*
- The .exe's launcher can return before the app ends (5 Oct: four checks "exited" after ~10 s and ran on): wait for the
  check's own "[check]" line (`tools\map_check.ps1`).
- E's `--draw-check` clicks the shell's buttons with the mouse and failed at its first click on the 3 Oct .exe ("a
  building of 0 piece"): a check of E's against a changed shell; the API checks (`--api-check`) work.
- Opening dicts are passed to the opening cutter as keyword arguments: a new key in `Wall.openings()` breaks every cut
  ("unexpected keyword argument 'kind'", 5 Oct): put new per-opening data beside, not inside, that dict.

## Shared files and git
- Several lanes write `knowledge\`, `exchange\`, `agents\` in the same minute: list and read first; a Write that says
  "updated" replaced a file (2 Oct: lane E's hook files replaced unread).
- Shell here-documents turn `\f`, `\r`, `\x`, `\p` in Windows paths into escapes or errors (3 Oct, 5 Oct): write scripts as
  files, then run them. *Guard: `tools\patch_shared.py`.*
- In the map's repository other lanes have staged files: commit my port note with a pathspec
  (`git commit -m … -- ports/FROM-ARCHITECT-EDITOR.md`), never from the whole index.
- `packages\plugin-eco\test\check-h0.mjs` rewrites the tracked fixture `h0-two-rooms.glb`: restore it
  (`git restore --source=HEAD -- packages/plugin-eco/test/h0-two-rooms.glb`) and check `git status` before a commit.
- The repo's `CLAUDE.md` is a git symlink to the upstream `AGENTS.md`; with symlinks off on this PC it is the plain word
  "AGENTS.md" (made a real file pointing at `agent\` on 5 Oct).
- `gh` is not signed in; the browser pane is (read PR checks there; opening or merging a PR is Johny's call).

## Reports
- "Measured" and "I think" are different sentences; a cause written for another lane's number was wrong once (2 Oct).
- Read another lane's rule in its code before writing "as the map does".
- A picture from FreeCAD's window: clear the selection, wait for the camera to stand still, save, look at it.
