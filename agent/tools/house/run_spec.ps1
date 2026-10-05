# check_spec on a house's records (default: S01's, exchange\house\models\oak-canopy-s01.json) against its spec, with
# Johny's answers, the pool pavilion left out, and its forgeries. freecadcmd's own parser takes the arguments, so the
# inputs go by environment (SPEC_CHECK_*). Its output goes to -Work\<Out>.out.txt. About 25–40 minutes with forgeries.
# (The house is Johny's from 5 Oct: run this only when he or the architect asks for the house again.)
param([string]$Records = "C:\Playground\exchange\house\models\oak-canopy-s01.json", [int]$Wait = 3000, [string]$Out = "spec", [string]$SelfTest = "1", [string]$Work = "$env:TEMP\lane-a\spec")
New-Item -ItemType Directory -Force $Work | Out-Null
$env:SPEC_CHECK_SPEC = "C:\Playground\exchange\house\concept\oak_canopy_S01.json"
$env:SPEC_CHECK_DESIGN = $Records
$env:SPEC_CHECK_WITHOUT = "RS-PAV"
$env:SPEC_CHECK_ANSWERS = "C:\Playground\exchange\house\models\oak-canopy-s01.answers.json"
$env:SPEC_CHECK_SELF_TEST = $SelfTest
$t0 = Get-Date
$p = Start-Process -FilePath "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" -ArgumentList "`"C:\Playground\Architect-editor\freecad\check_spec.py`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$Work\$Out.out.txt" -RedirectStandardError "$Work\$Out.err.txt"
$done = $p.WaitForExit($Wait * 1000)
"check_spec exited: $done code $($p.ExitCode) after $([int]((Get-Date) - $t0).TotalSeconds) s (pid $($p.Id))"
Get-Content "$Work\$Out.out.txt" | Select-String -Pattern "^FAIL|FAILED|OK \(|self-test|SELF-TEST FAIL|Traceback|Error" | ForEach-Object { if ($_.Line.Length -gt 500) { $_.Line.Substring(0, 500) } else { $_.Line } } | Select-Object -Last 60
