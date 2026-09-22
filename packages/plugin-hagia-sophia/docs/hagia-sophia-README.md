# Hagia Sophia × Pythagoras — Geometry-First Procedural Generation

> **Resume after restart? Read `HANDOFF.md` first (exact session state + next steps).**
> Full research dossier with sources: [`RESEARCH.md`](./RESEARCH.md).

## Goal

Build the Hagia Sophia **procedurally from its geometry and mathematics** inside this repo's 3D editor
(`apps/editor`, which composes `@pascal-app/core + viewer + editor`). The building is expressed as Pascal
scene nodes generated from measured constants and documented proportion systems — not imported meshes.

Two core functions drive everything:

1. **`generate`** — build the structure from numbers: Byzantine-foot constants, the analemma master plan,
   rational √2 pairs, column schedules, bay spacing. Pure input → scene nodes output.
2. **`refine`** — iteratively adjust the system (parameters, proportions, component detail) and regenerate,
   so the model converges toward historical accuracy without manual mesh editing.

## Phase 1 Scope — Ground Floor Only

- 40 ground-floor supports (of the building's 107 total; 67 are gallery-level, later phase):
  - `nave_verde` ×8 — verde antico monoliths, shaft 8.53 m, total 10.36 m, ~Ø0.9 m (4 per nave arcade side)
  - `porphyry_exedra` ×8 — red porphyry spolia, shaft 7.54 m, total 9.45 m, Ø0.94 m (2 per exedra)
  - `aisle_verde` ×16 — verde antico (heights unpublished → assume nave values, flagged TBD)
  - `aisle_pillar` ×8 — rectangular Proconnesian pillars at aisle ends
- 4 great piers (springing height 23.14 m) defining the central square
- Arcade bays: 4 columns → 5 bays per nave arcade (Justinianic intent, not as-built deformations)

## Mathematical Foundation (summary — full detail in RESEARCH.md)

| System | Value / Rule | Source |
|---|---|---|
| Byzantine foot | BFT = 0.312 m | Hoffmann & Theocharis 2002 |
| Central square | 31.2 m = 100 BFT | laser-verified plan |
| Analemma ratio | 100 : 106 (crossed double-square ≈ 31.2 : 33.07 m) | Hoffmann & Theocharis 2002 |
| Rational √2 | Heron pairs 99 : 140 ("monads") | Svenshon & Stichel 2006 |
| Apsal heptagon | central angle 360/7 ≈ 51.43°, apex at altar | Jabi & Potamianos 2007 |
| Nave span / length | 30.48 m / 76.2 m | Van Nice survey |

**Excluded as undocumented:** 3:4:5 layouts, musical-interval mappings, golden-ratio overlays.

## Architecture Approach

- New node kinds under `packages/nodes/src/<kind>/` following the existing `NodeDefinition` pattern
  (`definition.ts` + pure `geometry.ts` builder; see `turbine-vent` for the primitive-builder precedent,
  `column/definition.ts` for a renderer-based one).
- Register in `packages/nodes/src/index.ts` `builtinPlugin.nodes[]`.
- **LOD does not exist in the repo today** — we implement it ourselves (distance-swap inside our own
  renderer/geometry builder).
- Generator lives outside the packages initially (this folder drives it via MCP template-style builders;
  precedent: `packages/mcp/src/templates/garden-house.ts`).

## Workflow Rules

1. Local work only until validated: implement → `bun test` + render QA → local commit.
2. PRs only after validation succeeds **and** user approves.
3. Model Justinianic intent; flag conflicts between published dimensions rather than silently picking.

## Status

Phase 1 research complete (`RESEARCH.md`). Design + implementation not started.
See `HANDOFF.md` for exact resume point.
