# STATUS — Agent A
updated: 2026-09-23
phase: H17.1 shipping — next H18 (walk-mode feel)
state: H17.0 baseline on production. H17.1 AdaptiveDpr + detect-gpu + shadow discipline on eco/h17-1-fixes.

| Phase | Status | Finishing commit | Known missing |
|---|---|---|---|
| H14 | done | `ba0327c0` (merge `5e9249aa`) | live atlas/PIN owner-side |
| H15 | **done** | merge `97e5ff19` (feature `5d3f6370`) | live atlas still owner-side; freehand smooth-wall canvas later |
| H16.0–H16.5 | **done** | see prior rows / H16-done.md | — |
| H17.0 | **done** | merge `972886b6` (feature `be461a2b`) | optional richer 20s eco-scene capture |
| H17.1 | shipping | — | LOD Detailed, comlink geo workers, panel code-split, WebP≤2048, after-capture numbers |
| H18 | next | — | walk-mode feel (`H17-H18-queued.md`) |

commit: branch `eco/h17-1-fixes`
checks: `check-h17-1` OK; `check-h17-perf` OK; viewer build green
deployment:
- H17.0 production READY https://architect-editor-snowy.vercel.app (`972886b6` / stamp `17702d28`)
queue: H17.1 merge → H18
