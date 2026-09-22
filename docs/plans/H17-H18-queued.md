# H17 / H18 — queued after H16.5

Do **not** implement until H16.5 is production READY. Order after that:

1. **H15** (if not already done between H16.1 and H16.2)
2. **H16.2 → H16.5**
3. **H17** — performance
4. **H18** — walk-mode feel

## H17 — perf (measure first, then fixes)

### H17.0 — baseline
- HUD for frame time / FPS
- `check-h17-perf` captures a baseline **before** any optimisation work
- No tuning until the number exists

### H17.1 — demand-driven rendering and cost cuts
- Demand `frameloop`, `AdaptiveDpr`, BVH, instancing, LOD, shadows budget, workers, selector hygiene, code-split, WebP, `detect-gpu`
- Targets: **60 fps median**, **45 fps 1%-ile** (and related budgets in the full brief)

## H18 — walk-mode feel

- Walk speeds and locomotion tuning
- Recast navmesh
- CC0 character only (**no Mixamo in repo**)
- IK / camera / controls / settings
- `check-h18-walk`

Briefs may arrive as separate docs; keep this stub so the queue is not lost.
