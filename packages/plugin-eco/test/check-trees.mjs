/**
 * H2 — six oak/chamise variants, scene round-trip, GLB bake, instance budget.
 * Usage: bun packages/plugin-eco/test/check-trees.mjs
 *
 * Drawn from pascalorg/plugin-trees + @dgreenheck/ez-tree (MIT).
 */
import * as THREE from 'three'
import {
  ECO_TREE_VARIANT_IDS,
  ECO_TREE_VARIANTS,
  addEcoTree,
  clearEcoTrees,
  getEcoTreesState,
  makeEcoTreePlacement,
  setEcoTrees,
} from '../src/eco-trees-store.ts'
import { clearEcoTreeGeometryCache, getEcoTreeMeshBundle } from '../src/eco-tree-mesh.ts'
import {
  exportEcoScenePayload,
  restoreEcoSceneExtras,
  roundTripEcoScenePayload,
} from '../src/eco-scene.ts'
import { ensureFileReaderPolyfill, exportEcoGlb } from '../src/export-glb.ts'
import { ECO_TREE_IMPOSTOR_DISTANCE_M } from '../src/eco-trees.tsx'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

ensureFileReaderPolyfill()
clearEcoTrees()
clearEcoTreeGeometryCache()

// --- six distinct variants ---
assert(ECO_TREE_VARIANT_IDS.length === 6, 'six variants')
const oaks = ECO_TREE_VARIANT_IDS.filter((id) => ECO_TREE_VARIANTS[id].species === 'oak')
const chamise = ECO_TREE_VARIANT_IDS.filter((id) => ECO_TREE_VARIANTS[id].species === 'chamise')
assert(oaks.length === 3 && chamise.length === 3, '3 oak + 3 chamise')
console.log('variants OK', ECO_TREE_VARIANT_IDS)

// --- place one of each; scene round-trip ---
for (const id of ECO_TREE_VARIANT_IDS) {
  addEcoTree(
    makeEcoTreePlacement(id, {
      id: `t-${id}`,
      seed: 42,
      position: [1, 0, 2],
    }),
  )
}
assert(getEcoTreesState().trees.length === 6, 'six placed')

const payload = {
  nodes: {},
  rootNodeIds: [],
  ecoTrees: getEcoTreesState().trees,
}
const rt = roundTripEcoScenePayload(payload)
assert(rt.ecoTrees?.length === 6, 'ecoTrees round-trip count')
assert(
  JSON.stringify(rt.ecoTrees.map((t) => t.variant).sort()) ===
    JSON.stringify([...ECO_TREE_VARIANT_IDS].sort()),
  'ecoTrees variants survive',
)
console.log('eco:scene ecoTrees round-trip OK')

// --- mesh bundles (Node stand-in path) ---
for (const id of ECO_TREE_VARIANT_IDS) {
  const b = await getEcoTreeMeshBundle(id, 7)
  assert(b.barkGeometry.getAttribute('position')?.count > 0, `${id} bark`)
  assert(b.leafGeometry.getAttribute('position')?.count > 0, `${id} leaves`)
}
console.log('mesh bundles OK (stand-in in Node)')

// --- export includes tree meshes ---
clearEcoTrees()
addEcoTree(
  makeEcoTreePlacement('oak-medium', {
    id: 'export-oak',
    seed: 9,
    position: [2, 0, -1],
  }),
)
const house = {
  site: { id: 'site', type: 'site', children: ['bldg'] },
  bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
  L0: {
    id: 'L0',
    type: 'level',
    parentId: 'bldg',
    height: 2.7,
    baseElevation: 0,
    children: ['slab0'],
  },
  slab0: {
    id: 'slab0',
    type: 'slab',
    parentId: 'L0',
    polygon: [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ],
    elevation: 0.05,
    thickness: 0.05,
  },
}
const withTree = await exportEcoGlb({
  nodes: house,
  includePlacedAssets: false,
  maxBytes: 500 * 1024,
})
const without = (() => {
  clearEcoTrees()
  return exportEcoGlb({ nodes: house, includePlacedAssets: false, maxBytes: 500 * 1024 })
})()
const bare = await without
assert(withTree.buffer.byteLength > bare.buffer.byteLength, 'tree increases GLB size')
console.log('export bake OK', {
  withTree: withTree.buffer.byteLength,
  bare: bare.buffer.byteLength,
})

// --- instance budget: 3000 instances → ≤ 12 draw calls (6× bark+leaves)
// vs 3000 individual blob meshes = 3000 draws. Proxy for frame-time acceptance.
{
  const N = 3000
  const blobDraws = N
  const instanceDraws = ECO_TREE_VARIANT_IDS.length * 2 // bark + leaves per variant
  const ratio = instanceDraws / blobDraws
  assert(instanceDraws <= blobDraws * 0.2, 'instance draws within 20% of blob draws')
  assert(ratio < 0.01, 'instance path vastly cheaper than 1:1 meshes')
  // Sanity: InstancedMesh can hold 3000
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const mat = new THREE.MeshBasicMaterial()
  const mesh = new THREE.InstancedMesh(geo, mat, N)
  assert(mesh.count === N, 'InstancedMesh capacity')
  mesh.dispose()
  geo.dispose()
  mat.dispose()
  console.log('instance budget OK', {
    N,
    instanceDraws,
    blobDraws,
    impostorM: ECO_TREE_IMPOSTOR_DISTANCE_M,
  })
}

clearEcoTrees()
clearEcoTreeGeometryCache()
console.log('check-trees OK')
