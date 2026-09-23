# STATUS — Agent A
updated: 2026-09-22
phase: H16.5 merged — next H17.0 (perf baseline)
state: H16.5 IFC + Ventura envelope on main. Queue continues H17 → H18.

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
| H17.0 | next | — | perf baseline only (measure before fixes) |
| H17.1–H18 | queued after H17.0 | — | `H17-H18-queued.md` |

commit: main `da991314`
checks: `check-h16-5` OK; envelope tests 3 pass; ifc-exporter tests 7 pass; editor build green
deployment:
- H16.5 preview READY https://architect-editor-git-eco-h16-5-ifc-pauls-projects-af8162cc.vercel.app (`aa932538`)
- production READY https://architect-editor-snowy.vercel.app (`da991314` / health ok)
queue: H17.0 → H17.1 → H18
