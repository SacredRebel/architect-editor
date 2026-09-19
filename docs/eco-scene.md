# Eco scene format (`eco:scene` / `eco:load-scene`)

This is the canonical scene document the editor emits on `eco:request-export { what: "scene" }` and accepts on `eco:load-scene`. The world generates Oak Leaf massing against this document — it does not invent a parallel format.

Coordinate frame (editor / scene graph): **metres**, **x east, y up, z north**. (Walk / GLB export flips z for the world: z south.)

---

## Top-level shape

```ts
type EcoScene = {
  nodes: Record<string, Node>
  rootNodeIds: string[]          // usually ["site"]
  collections?: Record<string, unknown>
  materials?: Record<string, unknown>   // Pascal scene materials (optional)
  installedPlugins?: string[]

  // Eco plugin extras — always written by current editor; older payloads may omit them
  ecoAssets?: {
    assets: EcoAsset[]
    placements: EcoPlacement[]
  }
  ecoShells?: EcoShell[]
  ecoMaterials?: {
    assignments: Record<string, EcoMaterialId>  // "wall:<id>" | "slab:<id>" | "shell:<id>"
    defaultWall: EcoMaterialId
    defaultSlab: EcoMaterialId
    defaultShell: EcoMaterialId
  }
}
```

`EcoMaterialId` is one of: `stone` | `river-stone` | `timber` | `glass` | `stucco` | `concrete` | `living-roof` | `metal`.

---

## Hierarchy

```
site
 └── building
      └── level          // one or more floors
           ├── slab      // floor plates
           └── wall      // plan segments
                ├── door
                └── window
```

Every node has at least:

| Field | Meaning |
|---|---|
| `id` | Stable string id (referenced by parents' `children` and by openings' `wallId`) |
| `type` | Discriminator (`site`, `building`, `level`, `wall`, `slab`, `door`, `window`, …) |
| `parentId` | Parent node id, or `null` for the site |
| `children` | Ordered list of child ids (may be empty) |

---

## Level

| Field | Units | Notes |
|---|---|---|
| `height` | m | Storey height |
| `baseElevation` | m | Level plane relative to building (often `0` for L0) |

---

## Wall

Plan centerline in the **level** frame: `[x, z]` with **z north**.

| Field | Units | Notes |
|---|---|---|
| `start`, `end` | m | Centerline endpoints `[x, z]` |
| `thickness` | m | Optional; default ~0.1 |
| `height` | m | Optional; default ~2.7 |
| `curveOffset` | m | Optional. Midpoint sagitta; non-zero ⇒ curved (bulge) wall. Sign follows the editor's arc convention. Sampled at 0.5 m for walk/GLB. |

Openings are **children** of the wall (and usually set `wallId` to the parent). A door is a **gap** in the walk solid run, not a separate solid.

---

## Slab

| Field | Units | Notes |
|---|---|---|
| `polygon` | m | Closed ring of `[x, z]` (first ≠ last is OK) |
| `elevation` | m | Walking surface above the level plane |
| `thickness` | m | Grows downward from the surface |
| `holes` | | Optional cutout polygons |

---

## Door / window

Hosted on a wall. `position` is wall-local: `[along, up, out]` in metres (see Pascal door/window schemas). Important fields for a generator:

| Field | Notes |
|---|---|
| `wallId` | Host wall id |
| `width`, `height` | m |
| `position` | `[localX, localY, localZ]` |

---

## `ecoShells` (leaf roofs)

Plugin-owned geometry (not Pascal roof nodes). Exported in the GLB; **never** become walk solids.

| Field | Units | Notes |
|---|---|---|
| `id`, `name` | | |
| `outline` | m | Plan ring `[x, z]` (editor frame) |
| `ridge` | m | Ridge polyline `[x, z]` |
| `ridgeHeights` | m | Height at each ridge point (same length as `ridge`) |
| `eaveHeight` | m | Constant eave height |
| `thickness` | m | Shell thickness |
| `ribSpacing` | m | `0` = no ribs |

---

## `ecoAssets`

| Field | Notes |
|---|---|
| `assets[].bytesBase64` | GLB/GLTF bytes; keep total under 20 MB or the editor strips bytes on export |
| `placements[]` | `position` / `rotation` / `scale` in editor world metres |

---

## Worked example — two rooms with a door

Room A is `[0,0]–[5,4]`, room B is `[5,0]–[9,4]`, shared partition on `x=5`, exterior door on the south wall.

```json
{
  "nodes": {
    "site": { "id": "site", "type": "site", "parentId": null, "children": ["bldg"] },
    "bldg": { "id": "bldg", "type": "building", "parentId": "site", "children": ["L0"] },
    "L0": {
      "id": "L0",
      "type": "level",
      "parentId": "bldg",
      "height": 2.7,
      "baseElevation": 0,
      "children": ["slab-a", "slab-b", "wall-n", "wall-s", "wall-e", "wall-w", "wall-mid"]
    },
    "slab-a": {
      "id": "slab-a",
      "type": "slab",
      "parentId": "L0",
      "polygon": [[0, 0], [5, 0], [5, 4], [0, 4]],
      "elevation": 0.05,
      "thickness": 0.1,
      "holes": [],
      "holeMetadata": [],
      "recessed": false,
      "autoFromWalls": false
    },
    "slab-b": {
      "id": "slab-b",
      "type": "slab",
      "parentId": "L0",
      "polygon": [[5, 0], [9, 0], [9, 4], [5, 4]],
      "elevation": 0.05,
      "thickness": 0.1,
      "holes": [],
      "holeMetadata": [],
      "recessed": false,
      "autoFromWalls": false
    },
    "wall-n": {
      "id": "wall-n",
      "type": "wall",
      "parentId": "L0",
      "start": [0, 4],
      "end": [9, 4],
      "thickness": 0.2,
      "height": 2.7,
      "children": []
    },
    "wall-s": {
      "id": "wall-s",
      "type": "wall",
      "parentId": "L0",
      "start": [0, 0],
      "end": [9, 0],
      "thickness": 0.2,
      "height": 2.7,
      "children": ["door-s"]
    },
    "wall-e": {
      "id": "wall-e",
      "type": "wall",
      "parentId": "L0",
      "start": [9, 0],
      "end": [9, 4],
      "thickness": 0.2,
      "height": 2.7,
      "children": []
    },
    "wall-w": {
      "id": "wall-w",
      "type": "wall",
      "parentId": "L0",
      "start": [0, 0],
      "end": [0, 4],
      "thickness": 0.2,
      "height": 2.7,
      "children": []
    },
    "wall-mid": {
      "id": "wall-mid",
      "type": "wall",
      "parentId": "L0",
      "start": [5, 0],
      "end": [5, 4],
      "thickness": 0.15,
      "height": 2.7,
      "children": []
    },
    "door-s": {
      "id": "door-s",
      "type": "door",
      "parentId": "wall-s",
      "wallId": "wall-s",
      "position": [4.5, 1.05, 0],
      "width": 0.9,
      "height": 2.1,
      "children": []
    }
  },
  "rootNodeIds": ["site"],
  "collections": {},
  "materials": {},
  "installedPlugins": ["eco:plugin-eco"],
  "ecoAssets": { "assets": [], "placements": [] },
  "ecoShells": [],
  "ecoMaterials": {
    "assignments": {},
    "defaultWall": "stucco",
    "defaultSlab": "concrete",
    "defaultShell": "living-roof"
  }
}
```

Send this object as `eco:load-scene { scene }`. After edit, `eco:request-export { what: "scene" }` returns the same shape; a second export after load must match (byte-identical when key-sorted).

---

## Bridge notes

- Caps include `scene`.
- `eco:load-scene` applies the Pascal graph via `applySceneGraphToEditor`, then restores `ecoShells`, `ecoMaterials`, and `ecoAssets`.
- Curved walls and shells round-trip through this JSON; they are first-class editable geometry after load (not ghost-only).
