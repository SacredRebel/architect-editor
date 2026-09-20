# H0 done — live loop (revised acceptance)

## Repo drawn on

None (ops + export + world probe). Curve clause **removed** from H0 — it belongs to H10.

## Revised acceptance (met)

Two rooms, one door between them; walk verified against what was drawn:

| Check | Result |
|---|---|
| Door is a **gap** in `solids` (2× `wall:wShared:*`), not a flag | OK — `check-h0.mjs` |
| Floor `top` = set height **0.15 m** | OK |
| Frame x east, y up, **z SOUTH** (editor +z → world −z) | OK — north wall ring z ≈ −3.11 |
| Compat export under 500 KB, no meshopt | OK — 19 540 B |
| Cross-origin embed path | OK — world iframe → `architect-editor-snowy.vercel.app/embed` (`1baefa4`) |
| `window.world.probeModel(url)` | **PASS** — `{ meshes: 2, triangles: 108, floors: 2, solids: 8 }`; door gap `wShared:0/1`; floor tops 0.15; north z negative |

## Hosts

| Role | URL |
|---|---|
| World | `https://spatial-map.vercel.app/?role=builder` |
| Studio | `https://architect-editor-snowy.vercel.app/embed` |

404 checks use **`x-matched-path`**, never RSC body text.

## Fixture

`packages/plugin-eco/test/check-h0.mjs` → `h0-two-rooms.glb`

```
floors: 2 · floorTop: 0.15 · solids: 8 · doorGapSolids: 2 · glbBytes: 19540
```

## What was not required

Curved wall in the H0 draw — moved to H10.

## Commit

`eco(H0): …`
