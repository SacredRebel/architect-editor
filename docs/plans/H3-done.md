# H3 done — construction data (Ventura County)

## Repo drawn on

- [pascalorg/plugin-bones](https://github.com/pascalorg/plugin-bones) (MIT) — engines deep-loaded from `.cache/plugin-bones` (or installed `@pascal-app/plugin-bones`)
- Local Ventura profile: `packages/plugin-eco/data/jurisdiction/ventura-county.json` + `src/eco-jurisdiction-ventura.ts` (no network)

## What shipped

| Piece | Role |
|---|---|
| `H3-eval.md` | Inputs/outputs, headless vs UI, adapter shape, Bones wiring note |
| `eco-bones-engines.ts` | Deep-load `computeLevel` / `computeTakeoff` / `FramingNode` |
| `eco-construction.ts` | Geometry takeoff + Bones member rows (or massing estimates) + CSV |
| `eco-construction-panel.tsx` | Panel: jurisdiction, Bones status, basis beside every qty, Download CSV |
| `eco-jurisdiction-ventura.ts` | Ventura County code edition + climate |
| `ecoConstructionHostPanel` | Rail panel (bootstrap registers it) |

When the scene has Pascal `wall`/`slab`/`level` nodes Bones can extract, Eco runs **`computeLevel` + `computeTakeoff` headless** and merges member-counted rows as basis **`takeoff`**. If Bones cannot run (no engines, no level, curved-only walls, 0 members), the massing adapter remains and a **Bones · Member takeoff** placeholder row states why — no fake member counts. Stud counts from LF÷o.c. stay **`estimate`** and are omitted when Bones takeoff ran.

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

Bones engines receive jurisdiction code `US-CA` (state-typical CA tables inside the package). Eco **UI / CSV headers** still stamp the in-repo Ventura profile — climate is never fetched at runtime.

## Hand checks (20 m × 10 m box)

Fixture: one slab `[0,0]→[20,0]→[20,10]→[0,10]`, four walls on the perimeter (same shape as F6 drawings fixture).

### 1. Total floor area

- Hand: \(20 \times 10 = 200\,\mathrm{m}^2\)
- Tool: shoelace on slab polygon → **200 m²**, basis **`takeoff`**

### 2. Exterior wall linear feet

- Hand: perimeter \(2\times(20+10) = 60\,\mathrm{m}\)
- Tool: slab-probe exterior fallback → **60 m**, basis **`takeoff`**

### 3. Bones member takeoff (when `.cache/plugin-bones` or package present)

- `computeLevel` on `L0` → hundreds of members; `computeTakeoff` rows under `Bones · …` with basis **`takeoff`**
- Sample: Wall framing 2x6 stock pcs, Foundation anchor bolts — member-counted, not LF÷o.c.

## Checks

```bash
bun packages/plugin-eco/test/check-h3.mjs
```

Expect: floor 200 m², exterior LF 60 m, Ventura id, every row has a basis; Bones path OK when engines load; curved-only fixture keeps placeholder + estimates.

## Paths

- Eval: `docs/plans/H3-eval.md`
- Bones bridge: `packages/plugin-eco/src/eco-bones-engines.ts`
- Adapter: `packages/plugin-eco/src/eco-construction.ts`
- Panel: `packages/plugin-eco/src/eco-construction-panel.tsx`
- CSV: `ecoConstructionCsv()` → Download in panel (`eco-construction-takeoff.csv`)
- Jurisdiction data: `packages/plugin-eco/data/jurisdiction/ventura-county.json`
