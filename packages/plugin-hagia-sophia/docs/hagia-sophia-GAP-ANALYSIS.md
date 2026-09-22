# Hagia Sophia → Procedural Building System: Capability Gap Analysis

**Date**: 2026-08-24 · **Status**: living document · **Branch**: `feat/hagia-sophia-ground-floor` (local only)

## 0. Thesis Under Test

Hagia Sophia is a **stress test**, not the product. The product is a generic,
layered procedural system that can build *any* building through MCP:

```
Layer 3  Orchestration   generate/assemble whole structures (drivers, future tools)
Layer 2  Assembly        scene operations: create parents, patch nodes, validate
Layer 1  Primitives      parametric node kinds with LOD geometry (column, arch, dome…)
Layer 0  Platform        registry-driven plugins, schema persistence, MCP transport
```

Every phase must land capabilities at Layer ≤ the layer it serves — never a
building-specific shortcut that bypasses a generic one.

## 1. Validated This Session (evidence in BUILD-LOG / commits)

| Capability | Evidence |
|---|---|
| Plugin package pattern (`@pascal-app/plugin-hagia-sophia`) registers via `extendPluginDiscovery` | `[pascal:registry] + 5 discovered plugin(s)`; direct loadPlugin smoke |
| 4 parametric kinds w/ THREE.LOD geometry + pure tests | column/arch/dome/pendentive; bun test 27 pass; tsc clean |
| Deterministic generate/refine pipeline (pure math) | `generateGroundFloor()` → 40 keyed specs; `planRefine` idempotent upsert |
| MCP ↔ store validation parity for plugin kinds | `parseSceneNode` fallback in scene-bridge (`3047eca7`) — apply_patch accepts registry kinds |
| MCP loads plugin packs at boot | `--plugin` flag / `PASCAL_MCP_PLUGINS` (`fb732f39`); server logged `loaded 1 plugin(s)` |
| End-to-end injection: math → JSON-RPC → SQLite → editor | project `56431de6dc5c`, 40/40 columns patched, zero errors, live SSE at `/editor/56431de6dc5c` |

**Conclusion**: Layers 0–2 are proven. The ground floor is visible in the local
editor. The remaining distance to "full building" is concentrated in **Layer 1
primitives** and **Layer 3 assembly scope**.

## 2. Gap Map: Ground Floor vs Full Building

### 2.1 Geometry primitives (Layer 1)
| Need | Status | Work |
|---|---|---|
| Ground-floor colonnade (40 supports) | ✅ done | — |
| Arches (round/segmental/pointed) | ✅ kind + layout | nave arcade 10 + 4 great arches via generateVaults() |
| Main dome ≈31m + drum + 40 windows | ✅ placed | generateDomeAxis() |
| Pendentives (spherical quadrants) | ✅ placed | generateDomeAxis() |
| Great piers (~100 m² ashlar, springing 23.14 m) | ✅ kind + layout | footprint extrusion; Van Nice polygons still TBD |
| Semi-domes (exedra + apse halves of main dome) | ⚠️ partial | 2 great E/W half-domes via generic sectorAngle; 4 exedra quarter-domes not placed |
| Gallery floor (67 upper supports, sloped slabs) | ⚠️ partial | 36 justified supports at y=10.36; remainder 31 open (RESEARCH §5) |
| Buttressing / exterior massing | ❌ | out of Phase-2 scope; note for later |

### 2.2 Assembly & orchestration (Layers 2–3)
| Need | Status | Work |
|---|---|---|
| Parent chain site→building→level | ✅ (reused default scene parents) | driver assumes default scene has them — generalize |
| Batched node injection | ✅ apply_patch batches of 20 | raise batch size / streaming for 500+ nodes |
| Dome-axis assembly (piers→pendentives→drum→dome) | ✅ | generateDomeAxis() |
| Galleries level generation | ⚠️ partial | generateGalleries() 36/67; same level parent |
| Arcade + great-arch + semi-dome vaults | ✅ | generateVaults(); --phase vaults |
| Idempotent regeneration (refine over MCP) | ⚠️ library-only | planRefine/applyRefine exist; wire into driver loop |
| Perf: 100+ large curved meshes | ❌ unmeasured | instancing pass candidate; measure before optimizing |

### 2.3 Platform debt / upstream candidates
- `parseSceneOperationPatchNode` lives module-private in core; bridge duplicates it.
  Long-term: export from core (single source of truth).
- No generic "create node by registered kind" MCP tool beyond raw patches — fine
  while apply_patch works; sugar tools can come later.
- LOD strategy is per-kind inside builders; no cross-node instancing yet.

## 3. Roadmap (smart PRs, no push until system complete)

- **P2a — Dome axis assembly**: done (`generateDomeAxis`).
- **P2b — Piers kind**: done (`hagia-sophia:pier`).
- **P2c — Galleries**: done for the justified 36; 31 remainder blocked on Van Nice.
- **P2-vaults — Arcade + great arches + E/W semi-domes**: done (`generateVaults`).
- **P2d — Scale/perf pass (next after visual QA)**: measure draw calls/frame time
  at full building; introduce instancing only if measured need.
- **P2-exedra**: four quarter-domes on the exedra porphyry groups; gallery arches.
- **P2e — Docs**: this file + HANDOFF refresh each phase.

Push/PR gate: after P2d review, present branch summary for approval (standing rule).

## 4. Open Questions (unchanged from RESEARCH §5)
Verde shaft diameters (Van Nice pl. 9–11), aisle verde heights, exact pier
polygons, semi-dome silhouette fidelity tolerance.
