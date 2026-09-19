/**
 * F5 acceptance: six materials → exactly six glTF materials, ≤12 meshes,
 * glass has alphaMode: BLEND.
 * Usage: bun packages/plugin-eco/test/check-materials.mjs
 */
import {
  elementKeyForShell,
  elementKeyForSlab,
  elementKeyForWall,
  resetEcoMaterialsState,
  setEcoMaterialAssignment,
} from '../src/eco-materials.ts'
import { addEcoShell, clearEcoShells, makeDefaultLeafShell } from '../src/eco-shell-store.ts'
import { exportEcoGlb } from '../src/export-glb.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function parseGlbJson(buffer) {
  const view = new DataView(buffer)
  assert(view.getUint32(0, true) === 0x46546c67, 'magic glTF')
  const jsonLen = view.getUint32(12, true)
  const jsonType = view.getUint32(16, true)
  assert(jsonType === 0x4e4f534a, 'JSON chunk')
  const bytes = new Uint8Array(buffer, 20, jsonLen)
  let end = bytes.length
  while (end > 0 && bytes[end - 1] === 0) end--
  return JSON.parse(new TextDecoder().decode(bytes.subarray(0, end)))
}

/** Many elements, six distinct materials. */
function makeSceneNodes() {
  return {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: {
      id: 'L0',
      type: 'level',
      parentId: 'bldg',
      height: 2.7,
      baseElevation: 0,
      children: ['slab0', 'slab1', 'wN', 'wS', 'wE', 'wW', 'wGlass'],
    },
    slab0: {
      id: 'slab0',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [-4, -4],
        [4, -4],
        [4, 4],
        [-4, 4],
      ],
      elevation: 0.05,
      thickness: 0.1,
    },
    slab1: {
      id: 'slab1',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [5, -2],
        [8, -2],
        [8, 2],
        [5, 2],
      ],
      elevation: 0.05,
      thickness: 0.1,
    },
    wN: {
      id: 'wN',
      type: 'wall',
      parentId: 'L0',
      start: [-4, 4],
      end: [4, 4],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    wS: {
      id: 'wS',
      type: 'wall',
      parentId: 'L0',
      start: [-4, -4],
      end: [4, -4],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    wE: {
      id: 'wE',
      type: 'wall',
      parentId: 'L0',
      start: [4, -4],
      end: [4, 4],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    wW: {
      id: 'wW',
      type: 'wall',
      parentId: 'L0',
      start: [-4, -4],
      end: [-4, 4],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    wGlass: {
      id: 'wGlass',
      type: 'wall',
      parentId: 'L0',
      start: [5, -2],
      end: [8, -2],
      thickness: 0.05,
      height: 2.4,
      children: [],
    },
  }
}

resetEcoMaterialsState()
clearEcoShells()

const shell = makeDefaultLeafShell()
shell.id = 'leaf-mat'
addEcoShell(shell)

// Exactly six materials: stucco, stone, timber, glass, concrete, living-roof
setEcoMaterialAssignment(elementKeyForWall('wN'), 'stucco')
setEcoMaterialAssignment(elementKeyForWall('wS'), 'stucco')
setEcoMaterialAssignment(elementKeyForWall('wE'), 'stone')
setEcoMaterialAssignment(elementKeyForWall('wW'), 'timber')
setEcoMaterialAssignment(elementKeyForWall('wGlass'), 'glass')
setEcoMaterialAssignment(elementKeyForSlab('slab0'), 'concrete')
setEcoMaterialAssignment(elementKeyForSlab('slab1'), 'concrete')
setEcoMaterialAssignment(elementKeyForShell(shell.id), 'living-roof')

const nodes = makeSceneNodes()
const { buffer } = await exportEcoGlb({
  nodes,
  includePlacedAssets: false,
})

const gltf = parseGlbJson(buffer)
const mats = gltf.materials ?? []
const meshes = gltf.meshes ?? []
const matNames = mats.map((m) => m.name)

assert(
  mats.length === 6,
  `expected exactly 6 materials, got ${mats.length}: ${matNames.join(',')}`,
)
assert(meshes.length <= 12, `expected ≤12 meshes, got ${meshes.length}`)
assert(
  meshes.length === 6,
  `merge should yield one mesh per material; got ${meshes.length}`,
)

const glass = mats.find((m) => m.name === 'glass')
assert(glass, `glass material missing; have ${matNames.join(',')}`)
assert(
  glass.alphaMode === 'BLEND',
  `glass alphaMode should be BLEND, got ${glass.alphaMode}`,
)

const expected = ['stucco', 'stone', 'timber', 'glass', 'concrete', 'living-roof']
for (const id of expected) {
  assert(
    matNames.includes(id),
    `missing material ${id} in [${matNames.join(',')}]`,
  )
}

console.log('check-materials OK', {
  materials: matNames,
  meshes: meshes.length,
  glassAlpha: glass.alphaMode,
  glbBytes: buffer.byteLength,
})
