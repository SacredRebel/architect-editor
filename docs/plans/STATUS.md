# STATUS — Agent A
updated: 2026-09-20
phase: H3 (done — Bones engines wired)
state: construction takeoff = Ventura jurisdiction + geometry takeoff + headless Bones computeLevel/computeTakeoff when wall/slab/level present; massing estimates + warning when not; lighting untouched
commit: (pending)
checks: H0 DONE; H1 hard-audit green; H2 trees; H10.0–3 green; H12 materials+glass+baseline green; lighting contract green (do not retune); H3 eval + Bones path + CSV green (`check-h3.mjs`)
blocked-by: H10 world probeModel still open; H10.4 / H9+ have no implementable brief yet
notes: H3.1 deep-loads Bones engines from `.cache/plugin-bones` (or installed package). Member rows = takeoff; LF÷o.c. studs never takeoff. Do not touch lighting contract / materials retune.
