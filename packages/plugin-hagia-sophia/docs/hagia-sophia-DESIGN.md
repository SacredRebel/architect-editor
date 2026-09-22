# Hagia Sophia Generator — Design

> Status: **approved design for Phase 1 (ground floor)**. Sources: see `RESEARCH.md`.
> Workflow contract: local commits → validate → user approval → PR.

## 1. Shape of the deliverable

A new **workspace plugin package**, mirroring the four first-party example plugins
(`plugin-trees`, `plugin-bones`, …) which ship as source-direct npm-style packages
(`main: ./src/index.ts`, peer-deps on `@pascal-app/*`). None of them live in-repo,
so ours becomes the first in-repo one — same package shape, resolved via
`workspace:*`.

```
packages/plugin-hagia-sophia/
  package.json            # @pascal-app/plugin-hagia-sophia, peers: core/viewer/three/zod/react
  tsconfig.json
  src/
    index.ts              # Plugin manifest: { id:'pascal:hagia-sophia', apiVersion:1, nodes:[…] }
    schema.ts             # HsColumnNode — BaseNode.extend, type 'hagia-sophia:column'
    definition.ts         # NodeDefinition: geometry-only checkbox + floorplan circle
    geometry.ts           # buildColumnGeometry(): THREE.LOD (L0 detailed → L2 low)
    math/constants.ts     # RESEARCH §3 values (BFT, square 31.2 m, column table…)
    math/layout.ts        # PURE ground-floor layout solver → positions per logical key
    math/layout.test.ts
    generate.ts           # generateGroundFloor(params) → HsNodeSpec[] (deterministic IDs)
    generate.test.ts
    refine.ts             # diffScene(target, current) → {create[],update[],remove[]} (pure)
    refine.test.ts

hagia-sophia/             # project home (docs): README / RESEARCH / HANDOFF / DESIGN
apps/editor/lib/bootstrap.ts   # +1 extendPluginDiscovery(async () => [hagiaSophiaPlugin])
apps/editor/package.json       # +"@pascal-app/plugin-hagia-sophia": "workspace:*"
apps/editor/next.config.ts     # transpilePackages += '@pascal-app/plugin-hagia-sophia'
```

Rationale: docs stay at the root folder (project home per the goal); code lives in
`packages/*` because Turborepo/tsc/turbopack resolve workspace packages cleanly,
whereas importing TS from an un-packaged root folder needs config surgery for no gain.

## 2. Node model

| Decision | Value | Why |
|---|---|---|
| Kind name | `hagia-sophia:column` | Namespaced `plugin:kind` (trees precedent `trees:tree`) |
| Schema | `BaseNode.extend({ id: objectId('hs-column'), type: nodeType('hagia-sophia:column'), position, rotation, variant, shaftHeight, totalHeight, shaftRadius, capitalHeight, flutes })` | Plugin-local zod; persists without joining `AnyNode` union |
| Rendering checkbox | **`geometry` only** (no renderer/system) | Pure parametric mesh; `<GeometrySystem>` rebuilds on dirty; trees chose instancing for forests — we have 40 nodes |
| LOD | Builder returns `THREE.LOD`: L0 lathe shaft w/ entasis + bowl capital (32-seg), L1 (16-seg), L2 (8-seg), distances `[0, 45, 110]` m | `WebGLRenderer.projectObject` auto-updates LOD per frame — zero custom system code |
| Determinism | Logical keys → IDs like `hs-column_nave_verde_03` | `objectId()` is a templateLiteral accepting any suffix ⇒ stable IDs ⇒ refine = idempotent upsert |
| Materials | Plain `MeshStandardMaterial` tints (verde-antico dark green, porphyry crimson) | Paint/surfaceRole integration deferred |

## 3. Layout solver (pure math)

Inputs: constants only. Outputs: array of `{key, variant, x, z}` (y=0; floor slab later).

- Pier square: 31.2 m (= 100 BFT) side; 4 great piers at corners *(piers themselves = Phase 2)*.
- Nave arcades: two E–W rows at `x = ±NAVE_SPAN/2` (±15.24 m), 4 columns each → 5 bays over `NAVE_LENGTH` 76.2 m (spacing 15.24 m).
- Exedra porphyry: 8 columns (4 per flank) on the quarter-circle swing toward the apse end, radius = half aisle width from the arcade line.
- Aisle verde: 16 in the outer side-aisle rows mirroring arcade rhythm.
- Aisle pillars: 8 at aisle outer corners.
- Total: **40 supports** ✓ matches the documentary count.

Every derived number cites RESEARCH §1/§2; unresolved values (verde Ø, aisle heights) default to nave-verde figures and are flagged `TBD` in constants comments.

## 4. Generate / Refine contract

```ts
// generate.ts — pure
type HsNodeSpec = { id: string; kind: 'hagia-sophia:column'; name: string;
                    position: [number,number,number]; /* …schema fields */ }
function generateGroundFloor(params?: Partial<GeneratorParams>): HsNodeSpec[]
// refine.ts — pure diff + thin executor
type SceneOps = { create: HsNodeSpec[]; update: {id:string; patch:Partial<HsNodeSpec>}[]; remove: string[] }
function planRefine(target: HsNodeSpec[], currentNodes: AnyNode[]): SceneOps
function applyRefine(ops: SceneOps): void   // editor-side: useScene createNode/updateNode/deleteNode
```

Refinement axes exposed as `GeneratorParams`: global scale (BFT override), bay count,
column toggles per variant, entasis amount, flute count, LOD distances.

## 5. Validation gates (before any PR)

1. `bun test` in the package — layout symmetry/bay math, 40 unique deterministic IDs, every spec `.parse()`es against the schema, refine idempotence (`apply(plan)` twice ⇒ second plan empty).
2. `tsc --noEmit` clean in package + `apps/editor`.
3. Editor boots with `[pascal:registry] … + discovered plugin(s)` log; columns visible in 3D view at correct scale (10.36 m vs 23.14 m pier springing eyeball check).
4. Local commit(s) on `feat/hagia-sophia-ground-floor`; PR only after user approval.
