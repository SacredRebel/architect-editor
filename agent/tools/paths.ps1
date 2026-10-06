# Where things are, worked out — dot-source it: `. "$PSScriptRoot\paths.ps1"` (the folder moved on 6 Oct; nothing below is
# a fixed path unless every other way fails).
#   Get-Playground   the Playground folder's real path (the repository sits in it; through a junction, its target)
#   Get-FreeCADCmd   FreeCAD's console program: $env:FREECADCMD, else <Playground>\..\FreeCAD\bin\freecadcmd.exe (the real
#                    path's sibling, as the map's built.gd assumes), else the known places; throws when none is there
#   Get-MapExe       the map's .exe at the Playground's real path
$LaneATools = $PSScriptRoot                                                  # this file's own folder (agent\tools)
function Get-Playground {
    $repo = Split-Path -Parent (Split-Path -Parent $LaneATools)            # agent\tools -> agent -> the repository
    $pg = Split-Path -Parent $repo
    $item = Get-Item -LiteralPath $pg -ErrorAction SilentlyContinue
    while ($item -and $item.LinkType -eq "Junction" -and $item.Target) {   # C:\Playground -> its target
        $pg = @($item.Target)[0]
        $item = Get-Item -LiteralPath $pg -ErrorAction SilentlyContinue
    }
    # a parent of the path may be the junction (C:\Playground\Architect-editor): ask for its target
    $root = Get-Item -LiteralPath ([System.IO.Path]::GetPathRoot($pg) + "Playground") -ErrorAction SilentlyContinue
    if ($pg -like ([System.IO.Path]::GetPathRoot($pg) + "Playground*") -and $root -and $root.LinkType -eq "Junction") {
        $pg = $pg -replace [regex]::Escape([System.IO.Path]::GetPathRoot($pg) + "Playground"), [regex]::Escape(@($root.Target)[0]).Replace("\\", "\")
    }
    return $pg
}
function Get-FreeCADCmd {
    $pg = Get-Playground
    $tries = @($env:FREECADCMD, (Join-Path (Split-Path -Parent $pg) "FreeCAD\bin\freecadcmd.exe"),
        "C:\AI-Work\Sacred-Rebel Ai\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe", "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe",
        "C:\Program Files\FreeCAD 1.1\bin\freecadcmd.exe")
    foreach ($t in $tries) { if ($t -and (Test-Path -LiteralPath $t)) { return $t } }
    throw "FreeCAD's console program was not found (tried: $($tries -join '; '))"
}
function Get-MapExe { return (Join-Path (Get-Playground) "exchange\godot\build\Sulphur Mountain.exe") }
