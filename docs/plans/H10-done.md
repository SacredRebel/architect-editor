# H10 done — curved and organic geometry

## Repo drawn on

Parametric surfaces built in `packages/plugin-eco` (no new CSG/NURBS kernel; no `packages/editor/**`). Reuses Pascal wall arc helpers (`getWallArcData` / `getWallCurveFrameAt`) for curved-wall walk rings. Improves F1/F2 shell + curved-wall foundations.

## What shipped

| Piece | Role |
|---|---|
| `eco-curve-tolerance.ts` | **`ECO_CURVE_WALK_TOLERANCE_M = 0.05`** (5 cm); adaptive arc step |
| `eco-loft.ts` | Profile curves lofted along a rail — highest-leverage leaf form |
| `eco-vault.ts` | Barrel / groin / dome + gridshell rib paths |
| `eco-catenary.ts` | Catenary arch + discrete minimal-surface patch |
| `eco-organic-*` | Store, tessellate→Object3D, presentation, scene round-trip |
| `eco-shell-store` | Parametric **`rise`** + `setShellRise` — change later, remesh follows |
| `eco-shell-geometry` | Adaptive tessellation; ribs follow surface (not under-bulge chords) |
| `export-walk` | Curved rings are **polylines**; step ≤ 0.5 m and chord error ≤ 5 cm |
| Eco panel | Rise sliders; add loft / vault / catenary |

## Walk tolerance (written down)

Max plan distance from the true arc to any walk-ring segment: **0.05 m**.  
For radius R, sample step ≈ min(0.5, max(0.05, √(8 R ε))).

## Acceptance (`check-h10.mjs`)

Leaf shell + ribs · curved wall · doorway on arc → export walk → raise/lower rise → bbox and midspan follow; walk solids stable.

```
rise 1.0 → maxY 9.8
rise 1.5 → maxY 13.2
rise 0.6 → maxY 7.08
chord error 0.0012 m ≪ 0.05 m · 43 pts/face · 2 solids at door
loft 561 verts · vault 8 rib paths
```

## Checks

- `bun packages/plugin-eco/test/check-h10.mjs` — OK  
- `bun packages/plugin-eco/test/check-shell.mjs` — OK  
- `bun packages/plugin-eco/test/check-curved-wall.mjs` — OK  
- `bun run check-types --filter=@eco/plugin-eco`

## Commit

`eco(H10): …`
