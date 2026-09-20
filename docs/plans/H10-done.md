# H10 — curved and organic geometry (stopped at H10.3)

## Repo drawn on

Parametric surfaces in `packages/plugin-eco` only. Reuses Pascal wall arc helpers
(`getWallArcData` / `getWallCurveFrameAt`) for curved-wall walk rings. Improves
F1/F2 foundations. **No vaults / gridshell / catenary claimed here** — those stay
H10.4+ until the spine through shells is proven in the world.

## Order taken (not the brief's list)

| Step | What | Proof |
|---|---|---|
| **H10.0** | Parameter spine on a **box** — width, depth, height, door, floorTop live | `check-h10-0.mjs` / H10.0 block in `check-h10.mjs` |
| **H10.1** | Lofted surfaces (profile curves along a rail) | `eco-loft.ts` |
| **H10.2** | Curved walls (arc), thickness, openings as **absence** in solid run | `export-walk.ts` |
| **H10.3** | Shell roof: boundary + rise, parametric `setShellRise` | `eco-shell-*` |
| H10.4+ | Vaults, gridshell, catenary — **deferred** (code may exist; not acceptance) | — |

Lesson from H10.0: if a box cannot regenerate walk when height/door/floorTop change,
a shell never will. That check is green before any curve.

## Walk tolerance (written down)

Sagitta of a chord: **R (1 − cos(θ/2))** ≈ L²/(8R).

| Constant | Value | Role |
|---|---|---|
| `ECO_CURVE_WALK_TOLERANCE_M` | **0.05 m** | Max plan gap between visual curve and walk ring |
| `ECO_WALK_SOLID_OUTSET_M` | 0.01 m | Solid ring sits **outside** visual face |
| `ECO_WALK_FLOOR_INSET_M` | 0.01 m | Floor ring sits **inside** visual edge |

At **R = 5 m**: visual step √(8·5·0.05) ≈ 1.41 m → **23 segments** around a full circle
(worst-case sagitta ≈ **0.047 m** ≤ 0.05 m). Walk rings may use a finer step
(`ECO_WALL_SAMPLE_STEP_M` = 0.5 m) — coordinates are cheap; rule is walk ≥ visual.

Rules: walk tessellation ≥ visual; prefer genuine facets (12-bay dome → 364 tris
in the pack) when architecture allows — zero approximation error.

## Real-world reference — shell

**Mannheim Multihalle** (Frei Otto / Carlfried Mutschler, 1975) — timber gridshell
over an irregular plan, span on the order of **~60–80 m** with a low rise
(~**15–20 m** peak). The Oak Leaf demo shell is deliberately smaller
(**26 × 13 m**, eave 3 m, ridge ~9.8 m at rise=1) so a person can walk it; the
parameter is rise, not a baked mesh, so the same spine can scale toward a
Multihalle-class surface later without rewriting export.

**Finding:** the demo leaf shell rise/span ≈ 0.75 is **not** Mannheim-like
(Multihalle is a low rise over ~60–80 m). Reconcile at **H10.4** — not a
blocker for H12 presentation.

## Acceptance numbers (`check-h10.mjs`)

```
H10.0 box: width/height/floorTop follow parameters; door = 2 solids
rise 1.0 → maxY 9.8
rise 1.5 → maxY 13.2
rise 0.6 → maxY 7.08
door on curve → 2 solids (gap, not a flag)
R=5 → 23 visual segs, worst sagitta 0.04657 m (≤ 0.05 m ceiling)
loft tessellates; stoppedAt: H10.3
```

World `probeModel` of the full leaf+curve+door export is the remaining live check
for H10 acceptance (same contract as H0).

## Checks

- `bun packages/plugin-eco/test/check-h10-0.mjs`
- `bun packages/plugin-eco/test/check-h10.mjs`
- `bun packages/plugin-eco/test/check-curved-wall.mjs`
- `bun packages/plugin-eco/test/check-shell.mjs`

## Commit

`eco(H10): …`
