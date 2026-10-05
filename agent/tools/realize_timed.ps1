# Ctrl+R's own command line, by hand: FreeCAD's console program runs realize.py on a records file (format built/1) with
# no window, exactly as the map's godot\scripts\built.gd starts it:
#     freecadcmd.exe <repo>\freecad\realize.py --pass <records.json> <out folder>
#   -Records  the records file (the map's exchange\godot\built\<name>.json, or a house's exchange\house\models\<name>.json)
#   -Out      the folder the design, .glb, .ifc, .json and .result.json go to (the map uses exchange\godot\built\realized;
#             for a test use a scratch folder). It must not be the records file's own folder.
# Prints the time, the files and the result's counts and notes. FreeCAD's window is not needed and not opened.
param([Parameter(Mandatory = $true)][string]$Records, [Parameter(Mandatory = $true)][string]$Out, [int]$Wait = 600)
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$freecad = "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe"
New-Item -ItemType Directory -Force $Out | Out-Null
"FreeCAD's window running: $([bool](Get-Process FreeCAD -ErrorAction SilentlyContinue))"
$name = [System.IO.Path]::GetFileNameWithoutExtension($Records)
$t0 = Get-Date
$p = Start-Process -FilePath $freecad -ArgumentList "`"$repo\freecad\realize.py`"", "--pass", "`"$Records`"", "`"$Out`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$Out\$name.realize.out.txt" -RedirectStandardError "$Out\$name.realize.err.txt"
$done = $p.WaitForExit($Wait * 1000)
"realize exited: $done after $([math]::Round(((Get-Date) - $t0).TotalSeconds, 1)) s (pid $($p.Id); the map waits 240 s)"
Get-ChildItem $Out -Filter "$name.*" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
$result = "$Out\$name.result.json"
if (Test-Path $result) {
    $r = Get-Content $result -Raw | ConvertFrom-Json
    "ok $($r.ok) · complete $($r.complete) · $($r.made) of $($r.pieces) pieces made · $($r.solids) solids · $($r.seconds) s inside"
    foreach ($n in $r.notes) { "  note: $n" }
}
