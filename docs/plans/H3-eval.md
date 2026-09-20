# H3.0 — plugin-bones evaluation (read before adapting)

Source: [pascalorg/plugin-bones](https://github.com/pascalorg/plugin-bones) (MIT), cloned to `.cache/plugin-bones` for this review. Package pin in this fork: `apps/editor` → `@pascal-app/plugin-bones` GitHub SHA. Public npm surface exports the **plugin manifest + panel only** — not the engines.

## One-sentence design (from their ARCHITECTURE.md)

Pascal models architecture (walls, openings, slabs, roofs, zones, levels). Bones **derives construction** with pure `(slices, spec) → Member[]/Fixture[]` engines, then instances an X-ray. Only a tiny `bones:framing` config node is persisted per level.

```
scene graph ──extract──▶ slices ──engines──▶ Members/Fixtures ──instance──▶ 3D X-ray
 (Pascal)    wall-model    pure     pure          derived           renderer
```

## What engines take as input

| Layer | Input | Notes |
|---|---|---|
| **Extraction** (`src/core/wall-model.ts`) | Full Pascal `nodes` record + level id | Reads `wall` (`start`/`end`, thickness, height, `curveOffset`, children openings, face sides), `door`/`window`, `slab` polygon, `roof`/`roof-segment`, `level`, zones/rooms by name regex. Curved walls skipped/warned. |
| **Spec** (`src/core/spec.ts` + `src/jurisdiction/*`) | Jurisdiction code + LOD + spacing toggles | `FramingSpec` = defaults ← jurisdiction profile ← user config. Profiles merge `data/jurisdictions-adoption.json` + `data/jurisdictions-climate.json` (51 US entries). **Zero network** for AUTO guess (timezone/locale only). |
| **Assembly** (`src/framing/compute.ts` → `computeLevel`) | `nodes` + one `FramingNode` config | Orchestrates which walls are framed/CMU/LGS/skip; gates foundation to ground level; runs system toggles. |
| **Takeoff** (`src/engines/takeoff.ts` → `computeTakeoff`) | `Member[]`, `Fixture[]`, optional gross `TakeoffAreas` | Counts from **generated members**, never re-estimates from area. CSV/Markdown serializers. |

Engine modules (all pure, bun-tested): wall-framing, CMU, LGS wall, wall-layers, wall-bracing, floor-framing, roof-framing, foundation, electrical (+ wiring route), plumbing, HVAC (+ Manual-J-lite), characteristics, takeoff.

## What they emit

| Output | Shape | Use |
|---|---|---|
| `Member` | role, size, length, dims, transform, system, material, sourceId, optional flag | Instanced X-ray + takeoff rows |
| `Fixture` | kind (receptacle, panel, register…), position, system, meta | Device counts + circuit schedule |
| `TakeoffRow` | `{ section, item, detail, quantity, unit }` | Panel table + `takeoffCsv` |
| `BuildingCharacteristics` | floor area, volume, envelope UA, notes | HVAC sizing aid — **not** a BOM |
| Warnings / flags | strings on members + level warnings | Honesty when tables run out |

Takeoff sections: Wall framing · Floor · Roof · Foundation · Sheathing · Electrical · Plumbing · HVAC · Fasteners · Flags. Waste factors are **stated in detail**, not silently baked into quantity.

## Which can run headless (no UI)

**Yes — pure / headless-capable** (no React, no Three, no store):

- All `src/engines/*.ts` (given slices + `FramingSpec`)
- `extractWalls` / `extractSlabs` / `extractRooms` / `extractRoofs` (given a Pascal nodes dict)
- `computeLevel(nodes, framingConfig)` → members/fixtures/areas/characteristics
- `computeTakeoff` / `takeoffCsv` / `cutList`

**No — require host UI / viewer / React:**

- `src/panel.tsx`, inspector cards, placement tools
- `src/framing/renderer.tsx` (InstancedMesh X-ray)
- Live store / activation that creates `bones:framing` nodes via host `updateNode`
- Playwright “live editor” flows

**Partial:** room-name heuristics (kitchen/bath regex) and exterior-face inference work headless but are **heuristic**, not survey-grade.

## Fit against Eco / Pascal scenes

Eco scenes **are** Pascal `SceneGraph`s (`wall`/`slab`/`level` shapes match what `wall-model` expects). Parametric eco shells / lofts / vaults / trees are **extra** — Bones does not read them; they would need a separate adapter path or stay out of member takeoff.

Bones is already registered in `apps/editor` (`defaultInstalled: false`). Its **public package exports do not include** `computeLevel` / `computeTakeoff`, so Eco cannot call engines via the published entry without deep imports or a vendored copy.

## Adapter shape required for Eco H3

Do **not** pretend massing CSV rows are Bones member takeoffs.

```
EcoScenePayload.nodes
        │
        ▼
┌───────────────────┐
│ extractGeometry   │  walls (LF, exterior?), slabs (polygon area), openings
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ jurisdiction      │  Ventura County profile — data IN REPO (no fetch)
│ (code + climate)  │  shown on-screen next to numbers
└─────────┬─────────┘
          │
          ├─ geometry metrics ──► basis: takeoff   (only where geometry earns it)
          ├─ rule-of-thumb BOM ─► basis: estimate  (DEFAULT for assembly counts)
          └─ unknown / N/A ─────► basis: placeholder
          │
          ▼
   BasisLabeledRow[]  →  panel + CSV
   { section, item, quantity, unit, basis, detail, citation? }
```

| Basis | When Eco may use it |
|---|---|
| `takeoff` | Quantity derived from detailed enough geometry (e.g. slab polygon area, exterior wall centerline LF) |
| `estimate` | Massing / spacing rules of thumb (studs ≈ LF ÷ o.c., sheathing ≈ face area ÷ sheet, MEP ≈ area factors) |
| `placeholder` | Tool cannot honestly produce (engineered beams, site-specific soils, unplaced fixtures) |

**Default to `estimate`.** Raise to `takeoff` only for earned geometry metrics. Every figure shows basis **beside the number**.

Optional later: deep-import or package-export Bones `computeLevel` when walls are straight and a `bones:framing` config exists — then lumber/fixture rows can upgrade toward Bones’ member-counted takeoff. Until that path ships and is tested, Eco must not label stud counts as `takeoff`.

## Jurisdiction note (state vs county)

Bones ships **state-typical** CA values (frost 12 in coastal min, snow ~5 psf, wind ~100 mph, SDC D, seismic hold-downs). Eco H3 must pin **Ventura County** explicitly (high seismic, WUI / Hazardous Fire Area regime, negligible frost) and show the edition + climate values used — see `packages/plugin-eco/data/jurisdiction/ventura-county.json` and H3.2 UI.
