# ECO-DEVPLAN-02 — the studio becomes the place the house is designed

Working copy for this fork. Follows ECO-DEVPLAN-01 (E0–E6 complete). Execute F0 → F4 → F1 → F2 → F5 → F3 → F6; write `F<n>-done.md` at each checkpoint; commit `eco(F<n>): …`.

See the full handoff in chat for acceptance criteria, contracts, and “what NOT to build.”

| Phase | Goal |
|---|---|
| F0 | Prove the loop — host harness + round-trip assertions |
| F4 | Snap to ghost (cheap, high value) |
| F1 | Curved walls (polyline + bulge) |
| F2 | Shell roofs |
| F5 | Materials palette |
| F3 | Scene arrives editable + `docs/eco-scene.md` |
| F6 | Orthographic drawing exports |

Non-negotiable: new code in `packages/plugin-eco/` only (+ minimal apps/editor wiring if already established); never weaken WebGL fallback; no server for embed core; only `ecctrl`, `@react-three/rapier`, `three-stdlib` as new deps without asking.
