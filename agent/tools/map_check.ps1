# One of lane E's checks, run from the map's .exe itself on a fresh scratch exchange — how lane A sees the map export
# its records and press Realize (wall-check, ground-check, struct-check, hand-check, export-check, api-check …).
#   -Check   the check's name without "--" (e.g. "struct-check")
#   -Work    a folder of this run's own (default %TEMP%\lane-a\map\<check>): out\ gets the check's report and pictures,
#            x\ is the scratch exchange (the site, the envelope and land\ are copied in from the real one, read only)
#   -Exe     the map; by default its REAL path (started through C:\Playground, a junction, it does not find FreeCAD:
#            built.gd looks for <Playground>\..\FreeCAD, which is C:\FreeCAD then)
# A check is a WRITING check: it must never be given the real exchange folder (the map refuses it anyway).
# The .exe's launcher may return before the check ends: the script waits for the check's own "[check] … PASS|FAIL" line.
# Do not run two map checks at once, nor while another lane runs its own: they steer the window with keys.
param([Parameter(Mandatory = $true)][string]$Check, [string]$Work = "", [string]$Exe = "C:\AI-Work\Ai apps & Codebase\Playground\exchange\godot\build\Sulphur Mountain.exe", [int]$Wait = 900, [string]$Extra = "--ui-root=none")
$real = "C:\AI-Work\Ai apps & Codebase\Playground\exchange\godot"
if ($Work -eq "") { $Work = "$env:TEMP\lane-a\map\$Check" }
New-Item -ItemType Directory -Force "$Work\out", "$Work\x" | Out-Null
foreach ($f in @("build-envelope.geojson", "sulphur-mountain-site.glb", "sulphur-mountain-site.lod1.glb", "sulphur-mountain-site.lod2.glb", "sulphur-mountain-buildings-existing.glb")) {
    Copy-Item "$real\$f" "$Work\x\$f" -Force
}
Copy-Item "$real\land" "$Work\x\land" -Recurse -Force
$words = @("--", "--$Check=`"$Work\out`"", "--exchange=`"$Work\x`"")
if ($Extra -ne "") { $words += $Extra.Split(" ") }
$t0 = Get-Date
$p = Start-Process -FilePath $Exe -ArgumentList $words -PassThru -RedirectStandardOutput "$Work\stdout.txt" -RedirectStandardError "$Work\stderr.txt"
$p.WaitForExit($Wait * 1000) | Out-Null
while (((Get-Date) - $t0).TotalSeconds -lt $Wait -and -not (Select-String -Path "$Work\stdout.txt" -Pattern "^\[check\]" -Quiet)) { Start-Sleep -Seconds 3 }
"$Check after $([math]::Round(((Get-Date) - $t0).TotalSeconds, 1)) s"
Select-String -Path "$Work\stdout.txt" -Pattern "^\[$Check\]|^\[check\]|realized in|not realized" | ForEach-Object { $_.Line.Substring(0, [math]::Min(300, $_.Line.Length)) }
"records and FreeCAD's results: $Work\x\built\ and $Work\x\built\realized\"
