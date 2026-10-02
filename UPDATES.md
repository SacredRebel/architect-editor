# UPDATES — lane A (FreeCAD) — running log, newest on top

Rules: `C:\Playground\RULES.md` (Rule 3). After every report: the full entry here, then one line in `C:\Playground\UPDATES.md`.
Entry shape: date/time · phase · what was done · commit sha · files written to `exchange\` · open items · needs.

## 2026-10-01 16:25 · A · organic: frame re-base coded, waiting for FreeCAD
- **Read:** `C:\Playground\CLAUDE.md`, `RULES.md`, `BRAIN.md` (§3 the frame, §5 decisions), `PLAYGROUND.md`, `knowledge\`, the three lanes' `UPDATES.md`, `exchange\godot\FORMAT.md`.
- **Coded, not run (FreeCAD is closed):**
  - Step 1, the canonical frame:
    - `freecad/SulphurMountainSite.FCMacro` and `freecad/check_site.py`, `freecad/Organic/organic_export.py` and `freecad/check_organic.py` take their origin from the anchor (lng −119.15536, lat 34.4331) with Z = 0 on the ground there, 425.63 m.
    - The `models.json` point and 425.90 m are gone from the code.
    - Both checks read the frame from `BRAIN.md` §3 itself.
  - Step 2, the check:
    - The leaf shell has footings under its tips (`Plinth`, `Foot`).
    - The IFC read-back takes the Brep points as data.
    - Check D holds only elements that reach the ground, and measures heights from the ground at the anchor.
- **Measured (read-only):** lane C's `sulphur-mountain-site.glb` has the ground at the anchor at y = −0.281.
  - So the file's zero is 425.91 m (FORMAT.md's 425.90), not 425.63.
  - The first pavilion export was already on the anchor horizontally, and on the land file's own zero.
  - After the re-base it will read 0.28 m above the land in a viewer that stacks both files as they are, until C re-exports the land on 425.63.
- **Step 4:** auto-start has been on since 29 Sep (`%APPDATA%\FreeCAD\v1-1\freecad_mcp_settings.json`, `auto_start_rpc: true`). FreeCAD itself is not running: no FreeCAD process, and nothing listening on port 9875.
- **Step 5:** two read-only searches are running (the Tools & Skills pool index; the sacred-geometry, sun-model and add-on sources). Nothing is built yet.
- **Step 6:** `exchange\house\concept\` holds only the README and the prompts. No images or spec yet.
- **Commit:** none. The work is uncommitted on `eco/organic` @ `30855c3f`. A stale `.git/index.lock` (0 bytes, 15:35, no git process running) blocks commits.
- **`exchange\`:** nothing written this block.
- **Open:** run both checks and the self-tests, re-run the installer, re-send the pavilion, press all 14 buttons, the Sacred tab and the biomimetic tools.
- **Needs:** Johny opens FreeCAD 1.1; a yes to remove the stale git lock.

## 2026-10-01 · architect · seeded this log
- Branch at seeding: `eco/organic @ 30855c3f`.
- State: F1 site template done (25/25). Organic workbench (14 buttons) installed; test pavilion sent (organic-test-pavilion.glb/.ifc/.json in exchange\godot\). Check 18/20: leaf tips 0.02–0.39 m above ground; IFC read-back rewritten, not re-run. 8 buttons untested. Frame: re-base on the anchor + 425.63 (BRAIN.md §3).
- Read `C:\Playground\CLAUDE.md`, `RULES.md`, `BRAIN.md` (§3 the canonical frame) before the next phase.
