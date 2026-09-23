# STATUS — Agent A
updated: 2026-09-23
phase: **H18 production READY — STOP** (queue H17→H18 complete)
state: Perf baseline + first cuts + walk-mode feel are on production. Residual polish listed below.

## Production SHAs (this session)

| Phase | Feature | Merge | Stamp | Production |
|---|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | `17702d28` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | `f0f3fe5f` | READY |
| H18 | walk feel | `795317fb` (feature `1b5508ac`) | this stamp | READY https://architect-editor-snowy.vercel.app |

Checks: `check-h17-perf` OK · `check-h17-1` OK · `check-h18-walk` OK · editor builds green.

## What shipped (H18)

Walk **1.4** / run **4** / sprint **7** m/s; **F** fly 10–40 (scroll); **T+click** teleport; click-to-walk (BVH ground path); procedural **CC0** character (`excludeFromExport`, no Mixamo); **V** third-person; **H** help; gamepad + touch stick; `useWalkSettings` (speed, sens, invert Y, FOV, HUD).

## What's left / what to do next

1. **H17.1 residuals** — drei `Detailed` LOD; comlink workers for organic/body geo; code-split rail panels; WebP ≤2048 ingest; **re-capture FPS** into `H17-done.md` (baseline was ~15 median / 12 p1 vs 60/45 targets).
2. **H18 residuals** — install `recast-navigation-js` and bake real navmeshes; swap procedural mesh for Quaternius/KayKit rig + blend tree (keep licence files); foot IK / head-look polish; scripted slope e2e in `check-h18-walk`.
3. **Owner-side backlog** — live atlas/PIN (H14/H15); physical XR headset pass (H16.4); Blender/Bonsai IFC path (H16.5).

**Next recommended slice:** H17.1 post-fix FPS capture + LOD/instancing wins that move the median toward 60, then recast navmesh for click-to-walk fidelity.

commit: main `795317fb`
deployment: production READY (`795317fb` / health ok)
queue: **empty for Agent A H17–H18 brief** — stop here
