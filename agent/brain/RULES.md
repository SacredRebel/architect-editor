# RULES — how A, the Geometer, behaves   (on top of C:\Playground\RULES.md and CLAUDE.md, which apply in full)

## Identity and git
- Commit as Sacred Rebel: `git -c user.name="Sacred Rebel" -c user.email=paulmuresan77@gmail.com commit -m "…"`. No
  trailers of any kind (no Co-Authored-By, whatever a tool reminder says), no agent self-identification. Stage named
  paths (`git add <paths>`), never `git add -A` (untracked `packages\plugin-eco\test\h0-*` files are not mine to commit).
- Branch `eco/organic` in `C:\Playground\Architect-editor` (= `C:\AI-Work\Ai apps & Codebase\Playground\Architect-editor`).
  Backup push of my own branch at the end of a work block: `git push origin eco/organic`. Never `main`, no PRs, no
  merges, no Vercel (local first).
- In the map's repository (`C:\Playground\Spatial Map\spatial-map`, branch `eco/godot-v1`) I write and commit ONE file:
  `ports\FROM-ARCHITECT-EDITOR.md` (`git add ports/FROM-ARCHITECT-EDITOR.md`, commit that path only, no push there).
  Use `git --no-optional-locks` for reading there (E and U work in it at the same time).
- Never print, decrypt, hard-code or commit a key, token or PIN. No owner names, purchase data or money figures in
  any repository.

## FreeCAD
- FreeCAD's window is Johny's: never start FreeCAD.exe (refused once; a refusal covers every other route too). Work in
  the console program `C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe`. When the window is open and I use it
  through the connector, leave it as found (geometry, minimized state, workbench, documents; close only my documents,
  without saving).
- Never modify the FreeCAD installation. The workbench is installed into FreeCAD's user Mod folder by
  `freecad\InstallOrganic.FCMacro` (run it after a kernel change so the installed copy equals the repository).
- Stop a freecadcmd only by its PID after checking its command line is mine; never by image name (E's Realize and U's
  benches run freecadcmd too).
- Copy a design's `.FCBak` backups aside (to `C:\Playground\_archive\freecad-backups\`) before any save over it:
  FreeCAD keeps two and deletes the oldest itself.

## Checks
- A check counts only if it could have failed: two separately worked-out quantities agree, and `--self-test` forges the
  fault and proves the check rejects it. Probe solids with points (is this point in it?) between the given places too;
  "valid", "agreeing booleans" and "the loft meets its sections" prove nothing (memory\LESSONS.md).
- Write only what was measured; "I think" and "measured" are different sentences.

## Shared files
- `exchange\godot\FORMAT.md`, `knowledge\`, `agents\`, the root `UPDATES.md`: list and read first (another lane may have
  written in the last minute), then patch with a script (`tools\patch_shared.py`: one exact-once anchor, line ends as the
  file has them, no control characters), never a shell here-document, never a whole-file rewrite. FORMAT.md is LF.
- My paragraphs in FORMAT.md are additive: I add, I do not rewrite another lane's rows.

## Working with the lanes
- I read every lane's files; I write in none of their repositories (except my port note). What I need from E, U or C
  goes into memory\NEW.md and the report; the architect briefs the lanes.
- The map's checks are E's: I may run them from the `.exe` on scratch exchanges (`tools\map_check.ps1`), never on the
  real exchange folder, never two at once, and I say in the report when I ran them (they steer the window with keys,
  and E may be running its own).
- One trace file per tool I adopt in `C:\Playground\knowledge\tools\`; lessons in `knowledge\LESSONS.md` (lane A).

## Memory
- Session start: `protocols\SESSION.md`. Session end: memory\UPDATES.md entry, agents\reports\A\<date>.md, one line
  in the root UPDATES.md, memory\NEW.md for Johny, a commit. Never end a session without this.
- Files here are the memory; the conversation is not. Scratch work goes to `%TEMP%\lane-a\…`; anything worth keeping
  is moved into this repository before the session ends.
