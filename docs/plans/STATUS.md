# STATUS — Agent A
updated: 2026-09-23
phase: H17.0 merged — next H17.1 (perf fixes)
state: H17.0 perf baseline on main. Numbers in H17-baseline.md (~15 fps median). Queue H17.1 → H18.

| Phase | Status | Finishing commit | Known missing |
|---|---|---|---|
| H14 | done | `ba0327c0` (merge `5e9249aa`) | live atlas/PIN owner-side |
| H15 | **done** | merge `97e5ff19` (feature `5d3f6370`) | live atlas still owner-side; freehand smooth-wall canvas later |
| H16.0 | **done** | merge `b611ed8a` | — |
| H16.1 | **done** | merge `46ca57b9` | wire soap-film into geometry kit (optional polish) |
| H16.2 | **done** | merge `aa5a96d2` (stamp `7c21db9e`) | — |
| H16.3 | **done** | merge `17a45121` | body-containers/array + full modeling UI deferred |
| H16.4 | **done** | merge `31ff0a89` (feature `cfdf7662`) | physical headset regression optional |
| H16.5 | **done** | merge `da991314` (feature `aa932538`) | Blender/Bonsai local render path deferred |
| H17.0 | **done** | merge `972886b6` (feature `be461a2b`) | optional: re-run 20s path + eco-seeded scene for richer interaction probes |
| H17.1–H18 | next | — | `H17-H18-queued.md` |

commit: main `972886b6`
checks: `check-h17-perf` OK; editor build green (local bun; npx bun@1.3.14 TLS-blocked on agent)
deployment:
- H17.0 preview READY https://architect-editor-g8fwy12lm-pauls-projects-af8162cc.vercel.app (`be461a2b`)
- production READY https://architect-editor-snowy.vercel.app (`972886b6` / health ok)
queue: H17.1 → H18
