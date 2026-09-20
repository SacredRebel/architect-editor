# H3 done — construction data (Ventura County)

## Repo drawn on

- [pascalorg/plugin-bones](https://github.com/pascalorg/plugin-bones) (MIT) — engines + jurisdiction research read in `H3-eval.md`
- Local Ventura profile: `packages/plugin-eco/data/jurisdiction/ventura-county.json` + `src/eco-jurisdiction-ventura.ts` (no network)

## What shipped

| Piece | Role |
|---|---|
| `H3-eval.md` | Inputs/outputs, headless vs UI, adapter shape |
| `eco-construction.ts` | Headless extract + basis-labeled rows + CSV |
| `eco-construction-panel.tsx` | Panel: jurisdiction values on screen, basis beside every qty, Download CSV |
| `eco-jurisdiction-ventura.ts` | Ventura County code edition + climate |
| `ecoConstructionHostPanel` | Rail panel (bootstrap registers it) |

Bones public package does **not** export `computeLevel` / `takeoff`. Eco therefore ships an **honest massing adapter**: geometry metrics are `takeoff`; assembly BOM is `estimate`; engineering unknowns are `placeholder`. No silent fake member takeoffs.

## Jurisdiction shown (Ventura County, CA)

| Field | Value used |
|---|---|
| Code | 2025 CRC (2024 IRC base) via 2025 VCBC Ordinance 4655 |
| Effective | 2026-01-01 – 2026-12-31 |
| Frost line | **0 in** (negligible coastal) |
| Min footing embed | **12 in** (R403 floor, not frost) |
| Ground snow | **0 psf** |
| Wind Vult | **100 mph** (CA typical; verify Santa Ana corridors) |
| Seismic SDC | **D** + hold-downs; anchor bolts **4 ft** o.c. |
| WUI | **yes** — HFA / Chapter 7A / CWUIC class |

## Hand checks (20 m × 10 m box)

Fixture: one slab `[0,0]→[20,0]→[20,10]→[0,10]`, four walls on the perimeter (same shape as F6 drawings fixture).

### 1. Total floor area

- Hand: \(20 \times 10 = 200\,\mathrm{m}^2\)
- Tool: shoelace on slab polygon → **200 m²**, basis **`takeoff`**
- Proportional estimates (receptacles, HVAC tons) scale from this figure

### 2. Exterior wall linear feet

- Hand: perimeter \(2\times(20+10) = 60\,\mathrm{m}\)
- Tool: slab-probe exterior fallback marks all four walls → **60 m**, basis **`takeoff`**
- A human with a tape on the plan drawing gets the same four edges

## Checks

```bash
bun packages/plugin-eco/test/check-h3.mjs
```

Expect: floor 200 m², exterior LF 60 m, Ventura id, every row has a basis.

## Paths

- Eval: `docs/plans/H3-eval.md`
- Adapter: `packages/plugin-eco/src/eco-construction.ts`
- Panel: `packages/plugin-eco/src/eco-construction-panel.tsx`
- CSV: `ecoConstructionCsv()` → Download in panel (`eco-construction-takeoff.csv`)
- Jurisdiction data: `packages/plugin-eco/data/jurisdiction/ventura-county.json`
