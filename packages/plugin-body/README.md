# `@pascal-app/plugin-body` — half-edge body kernel

Port of qurkuid’s direct-modeling **Body** kernel from
[`qurkuid/editor` branch `deploy/floorplan`](https://github.com/qurkuid/editor/tree/deploy/floorplan)
(MIT). Lives as its own plugin package so Pascal `core` stays free of the half-edge
implementation; kinds are registered through the plugin registry only.

## What it is

A **Body** is a closed (or open) solid described by persistent half-edge topology:

| Feature | Module | Role |
|---|---|---|
| Curves (line + circular arc) | `body-curves.ts` | Sample and attach curves to half-edges |
| Topology / push-pull | `body-topology.ts` | Validate loops/faces; extrude a planar face |
| Sweep | `body-sweep.ts` | Sweep a face along a path |
| CSG | `body-csg.ts` | Union / subtract / intersect with manifold checks |
| Offset | `body-offset.ts` | Offset a face profile in its plane |
| Push-pull (inset-aware) | `body-push-pull.ts` | Extrude including inset faces |
| Solid inspection | `body-solid.ts` | Volume, closed/manifold diagnostics |
| Transform | `body-transform.ts` | Rigid transform of a body |

`body-group` is a transform container for sibling body nodes.

## Design notes (translated)

The upstream notes were partly in Korean. The parts this package relies on:

1. **Half-edge as the source of truth** — vertices, half-edges, loops, faces, and shells
   are first-class ids. Rendering and tools read that graph; they do not keep a parallel mesh.
2. **Curves on edges** — a half-edge may reference a `circular-arc` curve. Tessellation is
   derived at draw/export time (`DEFAULT_BODY_CURVE_SEGMENTS`).
3. **Push-pull** — extruding a face creates side walls and a twin face; topology remap
   records how old face ids map to new ones so selection can survive the edit.
4. **CSG** — boolean results must pass the same topology + solid checks as hand-built
   bodies; empty or non-manifold results throw typed `BodyCsgError`s.
5. **Sweep / offset** — operate in the face’s local frame (`getBodyFaceFrame`) so arcs and
   polygonal profiles stay planar where required.

## Checks

```bash
cd packages/plugin-body
bun test
bun test/check-h16-3.mjs
```

## Deferred from upstream

- Full SketchUp import / body modeling tools UI (apps/editor body-modeling-tools)
- `body-containers` / `body-array` (depended on core component/subtree helpers not
  re-exported here yet)
- Face-imprint executor glue from `modeling/executors`

Those can land as follow-ups without changing the kernel API.
