# SESSION — start and end of every session (A, the Geometer)

## Start (5 minutes, every time)
1. `agent\HANDOVER.md` — where things stand, what was in hand, the next three steps.
2. `C:\Playground\STATE.md` → `C:\Playground\agents\PLAN.md` §0 → my block in `C:\Playground\agents\QUEUE.md` →
   `C:\Playground\agents\reports\README.md`.
3. `agent\brain\PRIORITIES.md`; `agent\memory\UPDATES.md` top entry; `agent\memory\NEW.md` (what Johny answered or
   cleared); `agent\memory\OPEN-QUESTIONS.md`.
4. The top lines of `C:\Playground\UPDATES.md` — what the lanes did since (a new build of the .exe? a new kind in
   FORMAT.md? Johny's first Ctrl+S in `exchange\godot\save\`?).
5. `git status` and `git log --oneline -5` in `C:\Playground\Architect-editor` (branch `eco/organic`); untracked
   `packages\plugin-eco\test\h0-*` files are not mine and stay untouched.
6. Say in one line what this session will do; then do it.

## During
- **Stall rule:** the same error three times, or a session with no Done item met → stop, write it in memory\NEW.md,
  report. **Two strikes:** an attempt that fails twice is reported, not tried a third time.
- **A brief mid-turn** redirects: make a save point (commit), then follow it.
- **Only my tools:** FreeCAD's console program, the map's .exe for E's checks on scratch folders, plain Python; another
  lane's tool is asked for in NEW.md, not loaded here.
- Search first (brain\TOOLS-SKILLS.md); one job at a time; pictures for anything Johny should see; a number for every
  claim. A new tool → a trace in knowledge\tools\. A pitfall → memory\LESSONS.md and knowledge\LESSONS.md.
- Scratch work in `%TEMP%\lane-a\`; before the session ends, everything worth keeping is in the repository.

## End (never skip)
1. **The report file first:** `C:\Playground\agents\reports\A\<YYYY-MM-DD>[-n].md` in the shape of
   agents\reports\README.md: commit(s), done with numbers, not done, the prompt's Done items answered yes/no with the
   evidence, contradictions found, checks/guards added, blockers, files written outside the repo, next.
2. `agent\memory\UPDATES.md`: the full entry on top (date/time · phase · what · commit · files in exchange\ · open · needs).
3. One line on top of `C:\Playground\UPDATES.md`: `YYYY-MM-DD HH:MM · A (the Geometer) · <phase> · <one sentence> · <sha>`
   (`tools\prepend_root_line.py`).
4. `agent\memory\NEW.md`: anything for Johny, newest on top, plain words, each with the file it lives in.
5. DECISIONS / OPEN-QUESTIONS / LESSONS if touched; HANDOVER.md if the state changed much.
6. Commit as Sacred Rebel (named paths), `git push origin eco/organic` at the end of a work block; then paste the report.
