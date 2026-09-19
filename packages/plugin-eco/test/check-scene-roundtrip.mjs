/**
 * F3 — scene export → load → export is byte-identical (stable JSON).
 * Usage: bun packages/plugin-eco/test/check-scene-roundtrip.mjs
 */
import {
  roundTripEcoScenePayload,
  stableStringifyEcoScene,
} from '../src/eco-scene.ts'
import { resetEcoMaterialsState } from '../src/eco-materials.ts'
import { clearEcoShells } from '../src/eco-shell-store.ts'
import { restoreEcoAssetsFromScene } from '../src/eco-assets-store.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** Two rooms + door + window + curved wall + shell + asset + materials. */
function buildFullScene() {
  return {
    nodes: {
      site: {
        id: 'site',
        type: 'site',
        parentId: null,
        children: ['bldg'],
      },
      bldg: {
        id: 'bldg',
        type: 'building',
        parentId: 'site',
        children: ['L0'],
      },
      L0: {
        id: 'L0',
        type: 'level',
        parentId: 'bldg',
        height: 2.7,
        baseElevation: 0,
        children: ['slab-a', 'slab-b', 'wall-n', 'wall-s', 'wall-e', 'wall-w', 'wall-arc'],
      },
      'slab-a': {
        id: 'slab-a',
        type: 'slab',
        parentId: 'L0',
        polygon: [
          [0, 0],
          [5, 0],
          [5, 4],
          [0, 4],
        ],
        elevation: 0.05,
        thickness: 0.1,
        holes: [],
        holeMetadata: [],
        recessed: false,
        autoFromWalls: false,
      },
      'slab-b': {
        id: 'slab-b',
        type: 'slab',
        parentId: 'L0',
        polygon: [
          [5, 0],
          [9, 0],
          [9, 4],
          [5, 4],
        ],
        elevation: 0.05,
        thickness: 0.1,
        holes: [],
        holeMetadata: [],
        recessed: false,
        autoFromWalls: false,
      },
      'wall-n': {
        id: 'wall-n',
        type: 'wall',
        parentId: 'L0',
        start: [0, 4],
        end: [9, 4],
        thickness: 0.2,
        height: 2.7,
        children: ['win-n'],
      },
      'wall-s': {
        id: 'wall-s',
        type: 'wall',
        parentId: 'L0',
        start: [0, 0],
        end: [9, 0],
        thickness: 0.2,
        height: 2.7,
        children: ['door-s'],
      },
      'wall-e': {
        id: 'wall-e',
        type: 'wall',
        parentId: 'L0',
        start: [9, 0],
        end: [9, 4],
        thickness: 0.2,
        height: 2.7,
        children: [],
      },
      'wall-w': {
        id: 'wall-w',
        type: 'wall',
        parentId: 'L0',
        start: [0, 0],
        end: [0, 4],
        thickness: 0.2,
        height: 2.7,
        children: [],
      },
      'wall-arc': {
        id: 'wall-arc',
        type: 'wall',
        parentId: 'L0',
        start: [5, 0],
        end: [5, 4],
        thickness: 0.15,
        height: 2.7,
        curveOffset: 0.6,
        children: [],
      },
      'door-s': {
        id: 'door-s',
        type: 'door',
        parentId: 'wall-s',
        wallId: 'wall-s',
        position: [4.5, 1.05, 0],
        width: 0.9,
        height: 2.1,
        children: [],
      },
      'win-n': {
        id: 'win-n',
        type: 'window',
        parentId: 'wall-n',
        wallId: 'wall-n',
        position: [2, 1.2, 0],
        width: 1.2,
        height: 1.2,
        children: [],
      },
    },
    rootNodeIds: ['site'],
    collections: {},
    materials: {},
    installedPlugins: ['eco:plugin-eco'],
    ecoAssets: {
      assets: [
        {
          id: 'asset-bench',
          name: 'bench',
          hash: 'abc123',
          byteLength: 12,
          bytesBase64: 'aGVsbG8gd29ybGQ=',
          thumbDataUrl: '',
        },
      ],
      placements: [
        {
          id: 'place-1',
          assetId: 'asset-bench',
          position: [1, 0, 1],
          rotation: [0, 0.2, 0],
          scale: [1, 1, 1],
        },
      ],
    },
    ecoShells: [
      {
        id: 'shell-leaf',
        name: 'Leaf',
        outline: [
          [-4, -2],
          [4, -2],
          [4, 2],
          [-4, 2],
        ],
        ridge: [
          [-4, 0],
          [0, 0],
          [4, 0],
        ],
        ridgeHeights: [3, 6, 3],
        eaveHeight: 3,
        thickness: 0.12,
        ribSpacing: 2,
      },
    ],
    ecoMaterials: {
      assignments: {
        'wall:wall-n': 'stucco',
        'wall:wall-arc': 'glass',
        'slab:slab-a': 'concrete',
        'shell:shell-leaf': 'living-roof',
      },
      defaultWall: 'stucco',
      defaultSlab: 'concrete',
      defaultShell: 'living-roof',
    },
  }
}

resetEcoMaterialsState()
clearEcoShells()
restoreEcoAssetsFromScene({ assets: [], placements: [] })

const once = buildFullScene()
const twice = roundTripEcoScenePayload(once)
const thrice = roundTripEcoScenePayload(twice)

const a = stableStringifyEcoScene(once)
const b = stableStringifyEcoScene(twice)
const c = stableStringifyEcoScene(thrice)

assert(a === b, 'first re-export differs from original (stable stringify)')
assert(b === c, 'second re-export differs from first')

// Spot-check primitives survived
assert(twice.nodes['wall-arc'].curveOffset === 0.6, 'curved wall lost')
assert(twice.nodes['door-s'].type === 'door', 'door lost')
assert(twice.nodes['win-n'].type === 'window', 'window lost')
assert(twice.ecoShells?.length === 1, 'shell lost')
assert(twice.ecoAssets?.placements?.length === 1, 'placement lost')
assert(twice.ecoMaterials?.assignments['wall:wall-arc'] === 'glass', 'material lost')

console.log('check-scene-roundtrip OK', {
  bytes: a.length,
  nodes: Object.keys(twice.nodes).length,
  shells: twice.ecoShells.length,
  assets: twice.ecoAssets.assets.length,
})
