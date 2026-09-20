# ECO-DEVPLAN-04 — everything in the drawer comes out

Working copy for this fork. Replaces ECO-DEVPLAN-03 entirely. Follows ECO-DEVPLAN-02 (F0–F6 complete).

**Track A order (rewritten 2026-09-19):** H0 → H1 → H2 → **H10** → **H12** → **H3** → H9 → H4 → H7 → H5 → H6 → H8.

H3 is still the construction-data phase — not demoted; it comes after the tool can express the building (H10) and present it (H12).

| Phase | Goal | Tool repo |
|---|---|---|
| H0 | Live loop (Protection cleared) | — |
| H1 | GLB optimise + audit | pascalorg/skills `glb-web-export` |
| H2 | Real trees (ez-tree) | pascalorg/plugin-trees |
| **H10** | **Curved / organic geometry** | parametric loft/shell/vault in plugin-eco |
| **H12** | Materials, real glass, sun at site latitude, presentation | **DONE** — see `H12-done.md` |
| H3 | Material takeoff CSV | pascalorg/plugin-bones |
| H9 | Grow paths (space colonization) | ggooonn/Diffusion-Masterplanning |
| H4 | @react-facet live readouts | Mojang/ore-ui |
| H7 | Phone touch + movement numbers | pascalorg/plugin-boots |
| H5 | NL design assistant (flagged) | TangSY/aedifex |
| H6 | Articulated doors → glTF clips | pascalorg/plugin-articraft + urdf-loader |
| H8 | Visual regression + bot playtest | majidmanzarpour/threejs-game-skills |

### H10 acceptance

A leaf-shaped shell roof with ribs, curved perimeter walls, a doorway following the curve. Export it, walk into it, then change its rise afterwards and have everything follow. Surfaces stay parametric (no bake-at-creation). Walk rings from tessellated surface; curved-wall rings are polylines with documented chord-error tolerance.

Constraints: `packages/plugin-eco/` only; no `packages/editor/**`; `docs/plans/H<n>-done.md` names the repo drawn on; commits `eco(H<n>): …`.

## Notion source of truth

**Map & Editor — Assets & Tools** (Playground OS → 04 Assets). Filter Status=Planned + Usefulness=High → `docs/plans/notion-assets-planned-high.md`.
