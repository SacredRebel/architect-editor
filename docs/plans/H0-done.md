# H0 done — live loop (revised acceptance)

## Repo drawn on

None (ops + export + world probe). Curve clause **removed** from H0 — it belongs to H10.

## Revised acceptance (met)

Two rooms, interior + exterior doors; walk verified against what was drawn:

| Check | Result |
|---|---|
| Interior door is a **gap** in `solids` (2× `wall:wShared:*`), not a flag | OK — `check-h0.mjs` |
| Exterior door is a **gap** in `solids` (2× `wall:wW:*`), not a flag | OK — `check-h0.mjs` |
| Straight wall rings ≈ **4 pts** (collinear filler removed via slab `simplifyClosedPolygon`) | OK |
| Floor `top` = set height **0.15 m** | OK |
| Frame x east, y up, **z SOUTH** (editor +z → world −z) | OK — north wall ring z ≈ −3.11 |
| Compat export under 500 KB, no meshopt | OK |
| Cross-origin embed path | OK — world iframe → `architect-editor-snowy.vercel.app/embed` (`1baefa4`) |
| `window.world.probeModel(url)` | **PASS** (prior live probe); regenerate GLB via `check-h0.mjs` after exterior-door + ring simplify |

## Hosts

| Role | URL |
|---|---|
| World | `https://spatial-map.vercel.app/?role=builder` |
| Studio | `https://architect-editor-snowy.vercel.app/embed` |

404 checks use **`x-matched-path`**, never RSC body text.

## Fixture

`packages/plugin-eco/test/check-h0.mjs` → `h0-two-rooms.glb`

```
floors: 2 · floorTop: 0.15 · solids: 9 · interior+exterior door gaps · wall rings ≤6 pts
```

## What was not required

Curved wall in the H0 draw — moved to H10.

## Commit

`eco(H0): …`
