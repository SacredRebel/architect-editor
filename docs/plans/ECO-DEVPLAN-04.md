# ECO-DEVPLAN-04 — everything in the drawer comes out

Working copy for this fork. Replaces ECO-DEVPLAN-03 entirely. Follows ECO-DEVPLAN-02 (F0–F6 complete).

**Track A order (rewritten 2026-09-19):** H0 → H1 → H2 → **H10** → **H12** → **H3** → H9 → H4 → H7 → H5 → H6 → H8.

**Side track (assets):** **H11** image-to-3D model selection — props/furniture/vegetation/massing only (not walk). See `H11-eval.md`.

H3 is still the construction-data phase — not demoted; it comes after the tool can express the building (H10) and present it (H12).

| Phase | Goal | Tool repo |
|---|---|---|
| H0 | Live loop (Protection cleared) | — |
| H1 | GLB optimise + **hard** audit (fail export) + on-screen size | **DONE** — see `H1-done.md` (ceilings: 500 KB, 0.5–500 m, tex ≤512 PoT, 1 mesh/material, z-south walk) |
| H2 | Real trees (ez-tree) | pascalorg/plugin-trees |
| **H10** | **Curved / organic geometry** | parametric loft/shell/vault in plugin-eco |
| **H12** | Materials, real glass, presentation; sun/sky/tonemap **interim** | **DONE** (materials/glass/baseline) — lighting **blocked on world lighting contract**; see `H12-done.md` |
| H3 | Material takeoff CSV | **DONE** — see `H3-done.md` / `H3-eval.md` (Ventura County; basis labels; Bones read, honest adapter) |
| **H11** | Image-to-3D model selection (props only) | **DONE (eval + scaffold)** — `H11-eval.md`; first pick TRELLIS.2-4B; wire TripoSG; preview TripoSR; InstantMesh blocked; inference backend TBD |
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
