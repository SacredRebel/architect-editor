# H11 — image-to-3D model selection (eval)

**Status:** selection locked; inference backend deferred (no multi-GB weights in CI).  
**Date:** 2026-09-20 · branch `cursor/eco-h2`

Legal survey was completed upstream — **do not re-run**. This doc only records the cleared shortlist and Eco product constraints.

## Product scope (harder than licence)

Every cleared model emits a **single unstructured triangle soup**. No storeys, no wall/floor separation, no walk rings.

Image-to-3D **cannot** produce a building people walk through. Walkable geometry comes from the studio (rings known because the studio drew them).

**Budget image-to-3D for:**

- props
- furniture
- vegetation accents
- terrain features
- massing sketches to trace over

**Not for:** walkable buildings, floors, door solids, or anything that must participate in `extras.walk`.

## Cleared shortlist (commercial — weights + runtime deps checked)

| Model | Licence | Role |
|---|---|---|
| **microsoft/TRELLIS.2-4B** | MIT | Newest / strongest. **First pick (quality).** |
| **microsoft/TRELLIS-image-large** | MIT | Proven (~2.7M downloads). Image encoder via torch.hub = DINOv2 Apache-2.0. ~3.3 GB checkpoints. |
| **VAST-AI/TripoSG** | MIT | diffusers-native (`TripoSGPipeline`) — **cheapest to wire**. |
| **stabilityai/TripoSR** | MIT | Small / fast, lowest fidelity — **preview tier**. |
| **wushuang98/Direct3D-S2** | MIT | Higher resolution, heavier. Optional later. |
| **TencentARC/InstantMesh** | Apache-2.0 | Calls Zero123++ / SD stack — **blocked until that stack’s licence is checked**. Do not ship InstantMesh. |

### Explicitly out of scope (do not pull into deps)

| Model | Why |
|---|---|
| apple/Sharp | Research only — no commercial exploitation |
| facebook/VGGT-1B, map-anything, vfusion3d | Non-commercial (CC-BY-NC) |
| nvidia/Lyra-2.0 | No licence declared |
| tencent/Hunyuan3D-*, HunyuanWorld-* | Tencent Community Licence excludes EU / UK / South Korea |
| stabilityai/stable-fast-3d, stable-point-aware-3d | Gated; Stability Community → Enterprise above revenue threshold |

## Wiring tiers (recommended stack order)

| Tier | Id | Model | When |
|---|---|---|---|
| **preview** | `triposr` | stabilityai/TripoSR | Fast local / CI-ish smoke when a GPU host exists; lowest fidelity |
| **wire** | `triposg` | VAST-AI/TripoSG | First runnable integration path (diffusers-native, cheapest to wire) |
| **quality** | `trellis2` | microsoft/TRELLIS.2-4B | Documented **first pick** when GPU / runtime available |

Fallback quality: `trellis-image-large` (TRELLIS-image-large) if TRELLIS.2 runtime is unavailable.  
Later optional: `direct3d-s2` (Direct3D-S2).

**Recommended order to stand up inference:** TripoSR (preview) → TripoSG (wire) → TRELLIS.2-4B (quality).

## InstantMesh — open licence question

InstantMesh itself is Apache-2.0, but it **calls Zero123++ / Stable Diffusion** stack weights and code. That stack’s licence must be checked before InstantMesh can ship.

**Rule:** do not add InstantMesh (or Zero123++/SD) to Eco deps until that check is recorded here as cleared. Until then InstantMesh stays **blocked**.

## Exporter requirements (every image→GLB path)

Models typically emit a **normalised unit cube** with an arbitrary forward axis (most are **z-forward**, Y-up). Eco world frame is **x east, y up, z south**.

Before a prop GLB is placeable / exportable:

1. **Scale** — set from a **known real-world dimension** (e.g. chair seat height, table width). Unit-cube output is never metres-as-authored.
2. **Axis remap** — convert z-forward Y-up → world **z-south** (same family of sign flip as `siteToWorldXz` / `eco-design` `scale.z = -1`).
3. **Compress** — expect **100k–500k triangles**; run **meshopt** (`optimiseGlb(..., 'web')`) on the way out. Parametric buildings stay on `compat`; dense image-to-3D soups use `web` headroom.

Image-to-3D meshes do **not** receive walk floors/solids.

## What this PR ships vs defers

| Shipped | Deferred |
|---|---|
| This eval + shortlist + tiers | Multi-GB checkpoint download / GPU inference in CI |
| `eco-image3d*` types + adapter interface | Live TripoSR / TripoSG / TRELLIS.2 backends |
| Scale + axis-remap + meshopt export helpers | InstantMesh (licence gate) |
| UI scope note (props / furniture / vegetation / massing only — not walk) | End-to-end image upload → place flow |

**Inference backend:** TBD behind `Image3dBackend`. Documented quality first pick remains **TRELLIS.2-4B**; first wire target remains **TripoSG**.

## Scaffold paths

| Path | Role |
|---|---|
| `packages/plugin-eco/src/eco-image3d.ts` | Tiers, model ids, adapter interface, banned-id guard |
| `packages/plugin-eco/src/eco-image3d-export.ts` | Known-dimension scale, z-forward→z-south remap, meshopt hook |
| `packages/plugin-eco/src/eco-image3d.test.ts` | Unit tests (no weights) |
| `packages/plugin-eco/test/check-h11.mjs` | Shortlist / banned-id / export helper smoke |
| My assets panel | Scope legend for image-to-3D |
