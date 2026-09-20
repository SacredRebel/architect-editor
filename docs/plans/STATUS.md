# STATUS — Agent A
updated: 2026-09-20
phase: H3 (done — Bones engines ESM-vendored for panel)
state: construction takeoff = Ventura jurisdiction + geometry takeoff + Bones computeLevel/computeTakeoff via bones-vendor ESM (client panel safe); massing estimates + warning when geometry unfit; lighting untouched
commit: 76022475
checks: H0 DONE; H1 hard-audit green; H2 trees; H10.0–3 green; H12 materials+glass+baseline green; lighting contract green (do not retune); H3 eval + Bones ESM vendor + CSV green (`check-h3.mjs`)
blocked-by: H10 world probeModel still open; H10.4 / H9+ have no implementable brief yet
notes: H3.1 vendors pure Bones engines into `src/bones-vendor/` (pin 5679260…). No createRequire. Member rows = takeoff; LF÷o.c. studs never takeoff. Do not touch lighting contract / materials retune.
