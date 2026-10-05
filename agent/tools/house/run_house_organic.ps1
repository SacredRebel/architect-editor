# check_organic and its forgeries on Johny's house as saved and sent (it only reads): the design in Documents, the export
# in the map's folder. The log goes to -Work\house-organic.log. (The house is Johny's from 5 Oct: run when asked.)
param([int]$Wait = 1800, [string]$Work = "$env:TEMP\lane-a\house")
New-Item -ItemType Directory -Force $Work | Out-Null
$env:ORGANIC_HEADLESS = "selftest"
$env:ORGANIC_HEADLESS_LOG = "$Work\house-organic.log"
$env:ORGANIC_DESIGN = "C:\Users\paul\Documents\SulphurMountain\Oak-Canopy-S01.FCStd"
$env:ORGANIC_EXPORT = "C:\Playground\exchange\godot\oak-canopy-s01.glb"
$env:ORGANIC_EXCHANGE_DIR = "C:\Playground\exchange\godot"
$env:ORGANIC_LAND_DIR = "C:\Playground\exchange\godot"
$t0 = Get-Date
$p = Start-Process -FilePath "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe" -ArgumentList "`"C:\Playground\Architect-editor\freecad\run_headless.py`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$Work\house-organic.out.txt" -RedirectStandardError "$Work\house-organic.err.txt"
$done = $p.WaitForExit($Wait * 1000)
"check_organic on the house exited: $done code $($p.ExitCode) after $([int]((Get-Date) - $t0).TotalSeconds) s (pid $($p.Id))"
Get-Content "$Work\house-organic.log" | Select-String -Pattern "^FAIL|FAILED|OK \(|self-test|SELF-TEST FAIL|Traceback|Error|^OK   D" | ForEach-Object { if ($_.Line.Length -gt 450) { $_.Line.Substring(0, 450) } else { $_.Line } } | Select-Object -Last 60
