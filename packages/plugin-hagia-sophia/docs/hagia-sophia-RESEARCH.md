# Hagia Sophia — Research Dossier

Sources verified via parallel research agents (librarian/web). Confidence levels: **documented** (laser-verified / primary texts / peer-reviewed), **plausible**, **disputed** (excluded from generator).

## 1. Dimensional Data — Ground Floor (Phase 1 scope)

Primary references: **R.L. Van Nice, *Saint Sophia in Istanbul: An Architectural Survey*** (Dumbarton Oaks, 1965/1986) — laser-verified accurate (Hoffmann 2005 Cyrax scan overlapped Van Nice plans); **R.J. Mainstone, *Hagia Sophia* (1988)**.

### Column types (ground floor)

| Type | Location | Count | Shaft height | Total height | Base diameter | Material | Capital |
|---|---|---|---|---|---|---|---|
| `nave_verde` | Nave arcades N/S | 4 + 4 | 28 ft = **8.53 m** | 34 ft = **10.36 m** | ~0.9 m (verify vs Van Nice pl. 9–11; varies up to 7″ between monoliths) | Verde antico (Lapis Atracius, quarried near Larissa, Thessaly — purpose-quarried monoliths, not spolia) | White Proconnesian "bowl" capital, deeply undercut acanthus, Justinian/Theodora monogram medallions |
| `porphyry_exedra` | 4 exedrae (2 per corner under semidomes) | 8 | 24′9″ = **7.54 m** | 31 ft = **9.45 m** (survey range ~9.45–9.69 m) | **0.94 m** (range 0.83–0.96) | Red porphyry (Mons Porphyrites, Egypt; reused spolia; lead-set bases, bronze collars) | White marble cap ~1.22 m + abacus ~1.45–1.52 m |
| `aisle_verde` | Side aisles | 16 | not separately published — assume nave values ±, verify | TBD | TBD | Verde antico | Smaller bowl type |
| `aisle_pillar` | Ends of ground-floor aisles | 8 | TBD | TBD | rectangular section | White Proconnesian | Square-adapted bowl |

**Total ground-floor supports: 40** (building-wide 107: 40 ground + 67 galleries).

### Piers & envelope

| Element | Value | Source |
|---|---|---|
| Central square under dome | **~31.2 m side** (= 100 Byzantine ft, 1 B.ft ≈ 0.312 m) | Mainstone; Hoffmann/Theocharis |
| Great piers, height to arch springing | **23.14 m** (74.17 ft) | Mainstone-derived structural papers |
| Great pier footprint | massive irregular ashlar, ~100 m² each (exact per Van Nice pl. 45–46) | Van Nice |
| Nave (colonnade-to-colonnade) | **30.48 m wide × 76.2 m long** (100 × 250 ft) | Van Nice/Mainstone-derived surveys |
| Full interior (excl. narthex/apse) | ~71.6 × 76.2 m; naos with semidomes ~80 m | pallasweb/travelling-to-byzantium citing surveys |
| Dome (context only, Phase 2+) | 31–33 m dia; crown ~55.6 m above floor | Mainstone/Van Nice |

### Conflict flags

- **"19–20 m columns"**: NOT supported by Van Nice/Mainstone-derived sources. Likely confusion with pier springing (23.14 m). Generator uses survey values above.
- **Nave width**: 30.5 m (colonnade-to-colonnade, 100 ft) vs 32.6 m vs 38.07 m ("nave" wall-to-wall incl. something else). Use **31.2 m central-square / ~30.5 m arcade span** convention; document choice.
- **Bay rhythm**: 4 columns → 5 bays per arcade is standard; construction distortions pushed arcades outward (gallery adjusted to 6 columns/side). Use idealized 5-bay rhythm, note distortion.
- All post-558 repairs/deformations exist in the standing fabric; generator models the **Justinianic design intent** on the measured grid.

## 2. Geometric / Proportion System (the "Pythagoras" layer)

### Documented (use in generator)

| System | Detail | Source |
|---|---|---|
| **Analemma master plan** | Single figure: square + circumscribed + inscribed circles (Ptolemaic analemma projection). In plan/elevation: **crossed double-square, small:large = 1 : 1.06** (~31.2 m : ~33.07 m). Laser scan confirms every plan-related point/line deducible from it. | Hoffmann & Theocharis 2002, *Istanbuler Mitteilungen* 52: 393–428 |
| **Cube–sphere 3D reading** | Central volume read as cube penetrated by sphere (cosmic symbolism). Cosmological reading plausible; geometry documented. | Hoffmann & Theocharis 2002 |
| **Side-and-diagonal (√2 rationalized)** | Neo-Platonic "systems of monads"; Heron-style side:diagonal integer sequences approximate √2 (e.g. **99 : 140**) so nothing irrational needs laying out. Central square 100 ft → diagonal/dome circle ≈ 140 ft class. | Svenshon & Stichel 2006 (Nexus); Svenshon 2009 (Heron) |
| **Root rectangles / ad quadratum** | √2 progressions structure plan + sections; vesica piscis & sacred cut recognized methods. | Cho, Park & Yu 2015, *J. Arch. Inst. Korea* 31(5) |
| **Apse heptagon** | Circle + circumscribed regular heptagon (central angle 360/7 ≈ **51.43°**); one apex at altar; aligns light shaft on altar at Byzantine third hour. | Jabi & Potamianos 2007, *IJAC* 5(2): 304–319 |
| **Solstice orientation** | Building axis aligns with winter-solstice sunrise per ancient computation tables. | Schibille 2009, *Science in Context* |
| **Light as material** | Void-dominant interior; 40 dome-base windows; dome "suspended from heaven" (Procopius). Lighting simulations match ekphraseis. | Schibille 2009; Jabi & Potamianos 2007; Procopius, Paul the Silentiary |
| **Anthemius' conics** | Co-architect wrote *On Burning Mirrors* (ellipse string construction, parabola focus, first practical directrix). Parametric models verify his reflector geometry against dome profile/light effects. Plausible→documented application. | Huxley 1959; Jabi & Potamianos 2007 |

### Disputed (EXCLUDE from generator; may footnote in docs)

- Explicit **3:4:5 triangle layouts** or musical octave/fifth interval mappings in elevations — no credible HS-specific scholarly demonstration found.
- **Golden ratio (φ) overlays** — generic pop-mysticism; no measured support specific to HS.
- Ornament nonagons (Buitrago & Huylebrouck 2015) are real but craftsman approximations — out of Phase 1 scope.

## 3. Derived Math Constants (generator input)

```ts
// Units: meters canonical; Byzantine foot (BFT) = 0.312 m
BFT = 0.312
CENTRAL_SQUARE = 100 * BFT            // 31.2 m — side of dome square
ANALEMMA_RATIO = 100 / 106            // small:large crossed double-square
SQRT2_RATIONAL = { side: 99, diagonal: 140 }   // Heron side-and-diagonal pair
APSE_HEPTAGON_ANGLE = 360 / 7          // 51.4286°
PIER_SPRINGING_H = 23.14
NAVE_SPAN = 30.48   // colonnade-to-colonnade
NAVE_LENGTH = 76.2
```

Proportion chain (ground floor): pier positions from CENTRAL_SQUARE → arcades derive bay rhythm from nave span ÷ 5 bays → column heights from table §1 → impost/arch geometry closes each bay with semicircular arcs (radius = half clear span).

## 4. Reference Assets

| Asset | Format | License | Use |
|---|---|---|---|
| **Van Nice survey plates** (Dumbarton Oaks, finding aid: doaks.org/research/library-archives/icfa/…van-nice…) | Measured drawings (plans pl. 1, 9–11; sections 4–5, 29–31; piers 45–46) | © Harvard/DO; scholarly use welcomed | **Primary dimension anchor** — cite, trace, validate |
| Byzantium 1200 (byzantium1200.com/hagia.html) | KMZ + renders | © Byzantium 1200 — permission required | Visual reference ONLY; no derivatives in repo |
| Sketchfab: albertcamps93 (~16k tri), meigangwen (~8.3k tri), science2see "HS 537 AD" (~3.1M tri) | GLB/FBX downloadable | Per-model — verify tab before import | Optional placeholder/massing cross-check |
| Bern/Topoi "Hagia Sophia 3D" point cloud (doi.org/10.17171/2-6) | Point cloud | Academic repository terms | High-value if accessible; not assumed |
| IMC 2020 "Hagia Sophia Interior" (~888 images) | Images + SfM | Open for research | Own photogrammetry later |
| CyArk/Open Heritage | — | CC BY-NC + **wrong building** (Ohrid St. Sophia) | **Skip** |

**Conclusion**: no license-clean drop-in mesh exists → build procedurally from measured constants (§1, §3); use Van Nice plates as the validation oracle.

## 5. Open Questions (resolve during refine loop)

1. Exact verde shaft diameter + intercolumniation — needs Van Nice pl. 9–11 (request via DO scholarly access or published facsimile).
2. Aisle column (`aisle_verde`) heights — not separately published; assume nave values until sourced otherwise.
3. Pier exact plan polygons — irregular ashlar; start prismatic, refine from pl. 45–46.
