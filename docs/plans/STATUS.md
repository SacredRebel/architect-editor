# STATUS — Agent A
updated: 2026-09-23
phase: H17.0 shipping — next H17.1 (perf fixes)
state: H17.0 perf baseline recorded (measure before fixes). Queue continues H17.1 → H18.

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
| H17.0 | shipping | — | re-run 20s path + interaction probes when CDP stable; eco-seeded scene optional |
| H17.1–H18 | queued after H17.0 | — | `H17-H18-queued.md` |

commit: branch `eco/h17-0-perf-baseline`
checks: `check-h17-perf` OK; editor build green (local bun; npx bun@1.3.14 TLS-blocked on agent)
deployment:
- production (pre-H17.0) READY https://architect-editor-snowy.vercel.app (`e529ab70` / H16.5 stamp)
queue: H17.0 merge → H17.1 → H18
