# STATUS — Agent A
updated: 2026-09-23
phase: H18 shipping
state: H17.0 + H17.1 on production. H18 walk-mode feel on `eco/h18-walk` (build green, check-h18-walk OK).

| Phase | Status | Finishing commit | Known missing |
|---|---|---|---|
| H17.0 | **done** | merge `972886b6` | optional richer 20s eco capture |
| H17.1 | **done** | merge `cf50c731` / stamp `f0f3fe5f` | LOD Detailed, comlink workers, panel code-split, WebP≤2048, post-fix FPS re-capture |
| H18 | shipping | — | full recast navmesh bake; Quaternius/KayKit pack; foot IK polish |

commit: branch `eco/h18-walk`
checks: `check-h18-walk` OK; editor build green
queue: merge H18 → production READY → one-page residual summary
