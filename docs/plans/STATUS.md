# STATUS — Agent A
updated: 2026-09-20
phase: H12
state: done
commit: pending
checks: H0 DONE; H1 Oak Leaf compat/web; H2 trees; H10.0–3 green (R=5 → 23 visual segs); H12 materials+glass+baseline green (leaf 220984 / demo 242556 / materials 243912 under 500 KB; glass BLEND)
blocked-by: world lighting contract (sun position, sky/IBL, tone-mapping, exposure) — do not finalise editor lighting until it lands; H10 world probeModel still open; H10.4+ vaults deferred
notes: H12 materials/glass/baseline DONE. Sun/sky/IBL/tonemap/exposure = interim stubs only (EcoSiteLighting kept mounted). Next phase H3 (material takeoff CSV / plugin-bones) — brief is one-liner in ECO-DEVPLAN-04; needs a clear H3 brief before starting. Compat stays default; meshopt headroom; Draco out.
