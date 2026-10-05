# SUITES — the console checks before every commit of the kernel   (`/suites`)

Input: a change in `freecad\Organic\` or `freecad\*.py`. Output: the suites' counts, all OK, or the failure read.

1. `powershell -File C:\Playground\Architect-editor\agent\tools\run_suite.ps1` (steps `pavilion,selftest,toolbar,import`,
   ~17 min; run it in the background). Work folder `%TEMP%\lane-a\suite`; the real exchange folder is never written.
2. Read the counts it prints: `check_organic OK (n checks)` + its self-test, `check_toolbar OK`, `check_import OK` and
   each `--self-test … (k/k forged pieces rejected)`. Last known (3 Oct, before the 5 Oct change): organic 66 + 36,
   toolbar 194 + 42, import 71 + 100.
3. A failure: read its line, find the cause by measuring (memory\LESSONS.md), fix, run again. Two strikes → report.
4. After a kernel change that the window will use: run `freecad\InstallOrganic.FCMacro` in the window (when Johny has
   it open) so the installed copy equals the repository.
5. For S01 (only when the house is asked for again): `tools\house\run_spec.ps1` (check_spec with forgeries, ~30 min),
   `tools\house\run_house_organic.ps1`.
