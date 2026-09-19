# ECO-DEVPLAN-04 — everything in the drawer comes out

Working copy for this fork. Replaces ECO-DEVPLAN-03 entirely. Follows ECO-DEVPLAN-02 (F0–F6 complete).

**Track A order:** H0 → H1 → H2 → H3 → H9 → H4 → H7 → H5 → H6 → H8.

Short path if time runs out: **H0, H1, H2, H3**.

| Phase | Goal | Tool repo |
|---|---|---|
| H0 | Live loop (Protection cleared) | — |
| H1 | GLB optimise + audit | pascalorg/skills `glb-web-export` |
| H2 | Real trees (ez-tree) | pascalorg/plugin-trees |
| H3 | Material takeoff CSV | pascalorg/plugin-bones |
| H9 | Grow paths (space colonization) | ggooonn/Diffusion-Masterplanning |
| H4 | @react-facet live readouts | Mojang/ore-ui |
| H7 | Phone touch + movement numbers | pascalorg/plugin-boots |
| H5 | NL design assistant (flagged) | TangSY/aedifex |
| H6 | Articulated doors → glTF clips | pascalorg/plugin-articraft + urdf-loader |
| H8 | Visual regression + bot playtest | majidmanzarpour/threejs-game-skills |

Constraints: `packages/plugin-eco/` only; no `packages/editor/**`; allowed new deps listed in the plan; `docs/plans/H<n>-done.md` names the repo drawn on; commits `eco(H<n>): …`.
