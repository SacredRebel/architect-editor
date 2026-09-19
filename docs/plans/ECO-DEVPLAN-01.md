# ECO-DEVPLAN-01 — The unified builder inside the world

Working copy of the phase plan for this fork. Execute E0 → E6 in order; write `E<n>-done.md` at each checkpoint; commit with `eco(E<n>): …`.

See the original chat handoff for the full contract (bridge types, EcoSite/EcoWalk, acceptance criteria). Phase summaries:

| Phase | Goal |
|---|---|
| E0 | Orient + scaffold `@eco/plugin-eco` behind `NEXT_PUBLIC_ECO=1` |
| E1 | Static export (`ECO_STATIC=1`) + `/embed` + local persistence |
| E2 | `eco/1` postMessage bridge + types + z-sign conversion |
| E3 | Site terrain / guides / ghost in the editor |
| E4 | User GLB assets panel |
| E5 | Walk mode (`ecctrl` + rapier) |
| E6 | GLB + walk export to the world |

Non-negotiable: new code in `packages/plugin-eco/` (+ minimal `apps/editor` wiring); never weaken WebGL fallback; no server dependence for embed core flows.
