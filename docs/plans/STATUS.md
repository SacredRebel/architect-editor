# STATUS — Agent A
updated: 2026-09-23
phase: H17.1 merged — next H18 (walk-mode feel)
state: H17.1 AdaptiveDpr + detect-gpu + shadow discipline on main. Queue H18.

| Phase | Status | Finishing commit | Known missing |
|---|---|---|---|
| H16.4 | **done** | merge `31ff0a89` | physical headset optional |
| H16.5 | **done** | merge `da991314` | Blender/Bonsai deferred |
| H17.0 | **done** | merge `972886b6` (feature `be461a2b`) | optional richer 20s eco capture |
| H17.1 | **done** | merge `cf50c731` (feature `dadd9a83`) | LOD Detailed, comlink workers, panel code-split, WebP≤2048, post-fix FPS re-capture |
| H18 | next | — | walk-mode feel |

commit: main `cf50c731`
checks: `check-h17-1` OK; editor build green
deployment:
- H17.1 preview READY https://architect-editor-fwj2u3xz0-pauls-projects-af8162cc.vercel.app (`dadd9a83`)
- production READY https://architect-editor-snowy.vercel.app (`cf50c731` / health ok)
queue: H18
