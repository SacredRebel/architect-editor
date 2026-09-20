# STATUS — Agent A
updated: 2026-09-20
phase: H11 (done — image-to-3D selection + export scaffold)
state: H11 eval locked (TRELLIS.2-4B first pick; TripoSG wire; TripoSR preview); InstantMesh blocked pending Zero123++/SD licence; adapter + scale/axis/meshopt helpers shipped; inference backend deferred (no weights in CI). Lighting untouched. H3 construction takeoff still green.
commit: pending
checks: H0 DONE; H1 hard-audit green; H2 trees; H10.0–3 green; H12 materials+glass+baseline green; lighting contract green (do not retune); H3 eval + Bones ESM vendor + CSV green; H11 eval + check-h11 green
blocked-by: H10 world probeModel still open; H10.4 / H9+ have no implementable brief yet; H11 inference GPU host TBD; InstantMesh licence gate
notes: Do not pull banned image-to-3D models. Image-to-3D = props/furniture/vegetation/massing only — not walk. Do not touch lighting contract / materials retune / H3 rework.
