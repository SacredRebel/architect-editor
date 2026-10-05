# One probe script in FreeCAD's console program (its own process, started and awaited here; no window).
#   -Script <path to a .py>   the probe; use agent\tools\_log.py in it so what it prints lands in <script>.log at once
#   -Wait   seconds to wait (the probe's own _log limit should be shorter)
# Prints the probe's log and the last lines of its error stream. Stop a stuck probe by its PID only (never by name).
param([Parameter(Mandatory = $true)][string]$Script, [int]$Wait = 900)
$freecad = "C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe"
$name = [System.IO.Path]::GetFileNameWithoutExtension($Script)
$dir = Split-Path -Parent $Script
$t0 = Get-Date
$p = Start-Process -FilePath $freecad -ArgumentList "`"$Script`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$dir\$name.out.txt" -RedirectStandardError "$dir\$name.err.txt"
$done = $p.WaitForExit($Wait * 1000)
"$name exited: $done code $($p.ExitCode) after $([int]((Get-Date) - $t0).TotalSeconds) s (pid $($p.Id))"
if (-not $done) { "still running: pid $($p.Id)" }
if (Test-Path "$dir\$name.log") { Get-Content "$dir\$name.log" | ForEach-Object { if ($_.Length -gt 1600) { $_.Substring(0, 1600) } else { $_ } } }
Get-Content "$dir\$name.err.txt" -ErrorAction SilentlyContinue | Select-Object -Last 15
