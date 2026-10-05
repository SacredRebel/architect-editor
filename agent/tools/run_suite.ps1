# Lane A's console checks (freecadcmd, no window): the Organic workbench's own suites, through freecad\run_headless.py.
#   -Steps "pavilion,selftest,toolbar,import"   which ones (run_headless.py's names; "organic" = selftest's checks)
#   -Work  a folder of this run's own (default %TEMP%\lane-a\suite): the trial design and the exchange it writes go there;
#          nothing is written into the real exchange folder. The land is read from the real one.
#   -Log   the log's file name inside -Work
# About 17 minutes for the four. Prints the lines that matter at the end; the whole log stays in -Work.
# The freecadcmd started here is this script's own: if it must be stopped, stop it by its PID (never by name: other
# lanes run freecadcmd too).
param([string]$Steps = "pavilion,selftest,toolbar,import", [int]$Wait = 1700, [string]$Log = "suite.log", [string]$Work = "$env:TEMP\lane-a\suite")
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$freecad = "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe"
New-Item -ItemType Directory -Force "$Work\trial" | Out-Null
$env:ORGANIC_HEADLESS = $Steps
$env:ORGANIC_HEADLESS_LOG = "$Work\$Log"
$env:ORGANIC_EXCHANGE_DIR = "$Work\trial"
$env:ORGANIC_LAND_DIR = "C:\Playground\exchange\godot"
$env:ORGANIC_DESIGN = "$Work\trial\Organic-test-pavilion.FCStd"
$t0 = Get-Date
$p = Start-Process -FilePath $freecad -ArgumentList "`"$repo\freecad\run_headless.py`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$Work\suite.out.txt" -RedirectStandardError "$Work\suite.err.txt"
"started freecadcmd pid $($p.Id)"
$done = $p.WaitForExit($Wait * 1000)
"suite exited: $done code $($p.ExitCode) after $([int]((Get-Date) - $t0).TotalSeconds) s"
Get-Content "$Work\$Log" | Select-String -Pattern "^FAIL|FAILED|^=== |OK \(|self-test|SELF-TEST FAIL|Traceback|Error" | ForEach-Object { if ($_.Line.Length -gt 400) { $_.Line.Substring(0, 400) } else { $_.Line } } | Select-Object -Last 60
