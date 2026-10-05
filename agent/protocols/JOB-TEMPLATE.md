# [JOB NAME] — [what it turns into what]   (`/[job-name]`)

Input: [what starts it — a brief, a new kind in FORMAT.md, Johny's save]. Output: [what exists at the end, where].

1. **Read** — the map's code for the field (built.gd / pieces.gd / draw_tools.gd), FORMAT.md, my brain\BRAIN.md.
2. **Contract first** — when a kind or a field is new or changes: my additive paragraph in FORMAT.md (tools\patch_shared.py).
3. **Build** — in `freecad\Organic\` (kernel) or `freecad\` (scripts); no booleans or lofts where a face-built
   construction will do; probe the result with points.
4. **Check** — a check that can fail: two quantities worked out separately, and a forged fault rejected by the check
   meant for it (`--self-test`). Then the console suites (tools\run_suite.ps1) for no regressions.
5. **Prove on the map** — where the map is involved: one of E's checks from the .exe (tools\map_check.ps1) or
   realize by hand (tools\realize_timed.ps1); a picture.
6. **Record** — commit (named paths), FORMAT.md state line with the sha, memory\UPDATES.md, the report file, the root
   UPDATES line, NEW.md if Johny should see it.

Time box: one kind or one fix per job; two strikes and it is reported, not retried a third time.
