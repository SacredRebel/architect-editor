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

Eco scenes **are** Pascal `SceneGraph`s (`wall`/`slab`/`level` shapes match what `wall-model` expects). Parametric eco shells / lofts / vaults / trees are **extra** — Bones does not read them; they stay out of member takeoff (massing adapter + warning).

Bones is registered in `apps/editor` (`defaultInstalled: false`). Public package exports still omit engines; Eco **deep-loads** them via `eco-bones-engines.ts` from `.cache/plugin-bones` or the installed package root (`computeLevel` / `computeTakeoff` / `FramingNode`).

## Adapter shape required for Eco H3

```
EcoScenePayload.nodes
        │
        ├─ extractGeometry ──► floor area / exterior LF ──► basis: takeoff
        │
        ├─ IF straight wall(+slab) on a level AND engines load:
        │     FramingNode(parentId=level, jurisdiction=US-CA)
        │           │
        │           ▼
        │     computeLevel → members/fixtures/areas
        │           │
        │           ▼
        │     computeTakeoff → rows ──► basis: takeoff  (member-counted)
        │
        └─ ELSE massing BOM ──► basis: estimate / placeholder
              + Bones status row explaining why engines did not run

   Ventura climate JSON (in-repo) ──► panel + CSV headers (no network)
```

| Basis | When Eco may use it |
|---|---|
| `takeoff` | Geometry metrics (slab area, wall LF) **or** Bones member/fixture counts from real wall/slab extract |
| `estimate` | Massing / spacing rules of thumb (studs ≈ LF ÷ o.c., sheathing ≈ face area ÷ sheet, MEP ≈ area factors) — **never** upgrade LF÷o.c. studs to `takeoff` |
| `placeholder` | Tool cannot honestly produce; Bones unavailable / curved-only / missing level |

**Default to `estimate` for massing BOM.** Raise to `takeoff` only for earned geometry metrics or Bones member counts. Every figure shows basis **beside the number**.

**Shipped:** H3.1 deep-import path in `eco-bones-engines.ts` + merge in `eco-construction.ts`. See `H3-done.md`.

## Jurisdiction note (state vs county)

Bones ships **state-typical** CA values (frost 12 in coastal min, snow ~5 psf, wind ~100 mph, SDC D, seismic hold-downs). Eco H3 pins **Ventura County** explicitly for on-screen / CSV jurisdiction (high seismic, WUI / Hazardous Fire Area regime, negligible frost) — see `packages/plugin-eco/data/jurisdiction/ventura-county.json` and H3.2 UI. Bones engines still get `US-CA` for their internal tables; Eco does not network-fetch climate.
