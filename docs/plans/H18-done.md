# H18 — walk-mode feel

Branch `eco/h18-walk`.

## Shipped

| Item | Detail |
|---|---|
| Speeds | walk **1.4** / run (Shift) **4** / sprint (double-tap Shift) **7** m/s · smooth BVHEcctrl accel |
| Fly | **F** toggles drone; scroll **10–40** m/s |
| Teleport | **T + click** ground |
| Click-to-walk | click ground → BVH ground-follow waypoints (recast-ready path helper) |
| Character | procedural **CC0** low-poly (`h18-cc0-character.ts`); licence in `H18-character-licence.md`; **no Mixamo** |
| Export | character tagged `excludeFromExport` — not in GLB walk export |
| Camera | **V** first / third-person follow with collision pull-in |
| Controls | WASD/arrows, gamepad, touch joystick (coarse), **H** help card |
| Settings | `useWalkSettings` — speed mult, mouse sens, invert Y, FOV, HUD, shadows flag, camera mode |

## Deferred / next polish

| Item | Notes |
|---|---|
| `recast-navigation-js` full navmesh bake | path helper is BVH ground-follow until package lands |
| Quaternius/KayKit rigged pack + blend tree | procedural CC0 placeholder ships now |
| Foot IK / head look polish | turn-in-place already on BVHEcctrl model group |
| Edit-mode `camera-controls` swap | orbit already; walk uses pointer-lock |
| Scripted slope e2e in check | static check covers wiring |

## Checks

```bash
bun packages/viewer/test/check-h18-walk.mjs
bun run build --filter=editor
```

## Controls

- WASD / arrows — move · Shift run · double-tap Shift sprint
- F — fly · wheel — fly speed · V — first/third · T+click — teleport · click — walk-to
- H — help · P — free cursor · Esc — exit · gamepad / touch stick
