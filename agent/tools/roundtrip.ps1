# The round trip map -> FreeCAD -> map on a SCRATCH COPY of a map save (edits/2): freecad\roundtrip.py, no window.
#   -Save   the save to copy (Johny's own is C:\Playground\exchange\godot\save\edits.sulphur-mountain.geojson once he
#           has pressed Ctrl+S; a check's save is <work>\x\save\edits.sulphur-mountain.geojson). It is COPIED to
#           -Work\scratch-save\ first; the original is never opened for writing.
#   -Work   a folder of this run's own (default %TEMP%\lane-a\roundtrip)
#   -Edit   optional, a change made in FreeCAD before the records are read back: "<piece id>:<property>=<value>[;…]"
# Prints the counts at each step (save -> records -> FreeCAD -> records -> save) and what changed; roundtrip.json holds
# them, and <Work>\out\edits.sulphur-mountain.geojson is the save that came back (put it in a scratch exchange's save\
# folder to open it in the map).
param([Parameter(Mandatory = $true)][string]$Save, [string]$Work = "$env:TEMP\lane-a\roundtrip", [string]$Edit = "")
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. "$PSScriptRoot\paths.ps1"
$freecad = Get-FreeCADCmd
New-Item -ItemType Directory -Force "$Work\scratch-save", "$Work\out" | Out-Null
$copy = "$Work\scratch-save\$([System.IO.Path]::GetFileName($Save))"
Copy-Item $Save $copy -Force
$env:ROUNDTRIP_SAVE = $copy
$env:ROUNDTRIP_OUT = "$Work\out"
$env:ROUNDTRIP_EDIT = $Edit
$p = Start-Process -FilePath $freecad -ArgumentList "`"$repo\freecad\roundtrip.py`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$Work\roundtrip.out.txt" -RedirectStandardError "$Work\roundtrip.err.txt"
$done = $p.WaitForExit(600000)
"roundtrip exited: $done code $($p.ExitCode)"
Get-Content "$Work\roundtrip.out.txt" | Select-String -Pattern "roundtrip|Traceback|Error|^   " | ForEach-Object { $_.Line }
