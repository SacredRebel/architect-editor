/**
 * H12 — materials + glass + site sun + presentation store.
 * Usage: bun packages/plugin-eco/test/check-h12.mjs
 */
import {
  ECO_MATERIALS,
  createEcoThreeMaterial,
  elementKeyForShell,
  elementKeyForSlab,
  elementKeyForWall,
  resetEcoMaterialsState,
  setEcoMaterialAssignment,
} from '../src/eco-materials.ts'
import {
  getEcoPresentationState,
  setEcoPresentation,
  setEcoTimeOfDayHours,
  toggleEcoPresentation,
} from '../src/eco-presentation-store.ts'
import { sunDirectionAt } from '../src/eco-site-sun.ts'
import { addEcoShell, clearEcoShells, makeDefaultLeafShell } from '../src/eco-shell-store.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import * as THREE from 'three'

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

// --- palette ---
assert(ECO_MATERIALS.length >= 10, `expected ≥10 materials, got ${ECO_MATERIALS.length}`)
const ids = ECO_MATERIALS.map((m) => m.id)
for (const need of [
  'stone',
  'river-stone',
  'timber',
  'board-batten',
  'glass',
  'stucco',
  'concrete',
  'living-roof',
  'standing-seam',
  'canvas',
]) {
  assert(ids.includes(need), `missing material ${need}`)
}

const glassMat = createEcoThreeMaterial('glass')
assert(glassMat.isMeshPhysicalMaterial, 'glass should be MeshPhysicalMaterial')
assert(glassMat.transmission > 0.5, 'glass transmission')
assert(glassMat.transparent, 'glass transparent')

const roofMat = createEcoThreeMaterial('living-roof', { doubleSide: true })
assert(roofMat.normalMap, 'living-roof should carry a normalMap')
assert(roofMat.roughness > 0.5, 'living-roof roughness')

// --- site sun ---
const when = new Date(Date.UTC(2026, 5, 21, 22, 0, 0))
const dir = sunDirectionAt(34.448, -119.243, when, 0)
assert(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1) < 1e-6, 'sun unit length')
assert(dir.y > 0.1, `afternoon sun should be above horizon, y=${dir.y}`)

// --- presentation store ---
setEcoPresentation(false)
assert(!getEcoPresentationState().presentation, 'presentation off')
toggleEcoPresentation()
assert(getEcoPresentationState().presentation, 'presentation on')
setEcoTimeOfDayHours(15)
assert(getEcoPresentationState().timeOfDayHours === 15, 'time of day')
setEcoPresentation(false)

// --- leaf shell export: one mesh per material, under 500 KB compat ---
resetEcoMaterialsState()
clearEcoShells()
const shell = makeDefaultLeafShell('h12-leaf')
addEcoShell(shell)
setEcoMaterialAssignment(elementKeyForShell(shell.id), 'living-roof')

const nodes = {
  site: { id: 'site', type: 'site', children: ['bldg'] },
  bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
  L0: {
    id: 'L0',
    type: 'level',
    parentId: 'bldg',
    height: 2.7,
    baseElevation: 0,
    children: ['slab0', 'wN', 'wS', 'wE', 'wW', 'wGlass'],
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

setEcoMaterialAssignment(elementKeyForWall('wN'), 'stucco')
setEcoMaterialAssignment(elementKeyForWall('wS'), 'board-batten')
setEcoMaterialAssignment(elementKeyForWall('wE'), 'stone')
setEcoMaterialAssignment(elementKeyForWall('wW'), 'timber')
setEcoMaterialAssignment(elementKeyForWall('wGlass'), 'glass')
setEcoMaterialAssignment(elementKeyForSlab('slab0'), 'concrete')

const { buffer, optimise } = await exportEcoGlb({
  nodes,
  includePlacedAssets: false,
  optimiseProfile: 'compat',
})

const gltf = parseGlbJson(buffer)
const mats = gltf.materials ?? []
const meshes = gltf.meshes ?? []
const matNames = mats.map((m) => m.name)

assert(meshes.length === mats.length, `one mesh per material; meshes=${meshes.length} mats=${mats.length}`)
assert(buffer.byteLength < 500 * 1024, `compat under 500 KB, got ${buffer.byteLength}`)

const glass = mats.find((m) => m.name === 'glass')
assert(glass, `glass missing; have ${matNames.join(',')}`)
assert(glass.alphaMode === 'BLEND', `glass alphaMode BLEND, got ${glass.alphaMode}`)

// Living-roof shell alone for size comparison vs pre-H12 grey plastic (~162 KB shell check)
clearEcoShells()
resetEcoMaterialsState()
const leafOnly = makeDefaultLeafShell('h12-leaf-only')
addEcoShell(leafOnly)
setEcoMaterialAssignment(elementKeyForShell(leafOnly.id), 'living-roof')
const leafExport = await exportEcoGlb({
  nodes: {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: {
      id: 'L0',
      type: 'level',
      parentId: 'bldg',
      height: 2.7,
      baseElevation: 0,
      children: [],
    },
  },
  includePlacedAssets: false,
  optimiseProfile: 'compat',
})

console.log('check-h12 OK', {
  palette: ECO_MATERIALS.length,
  demoMaterials: matNames,
  demoMeshes: meshes.length,
  glassAlpha: glass.alphaMode,
  glassPhysical: glassMat.type,
  sunY: Number(dir.y.toFixed(3)),
  demoCompatBytes: buffer.byteLength,
  demoBeforeOpt: optimise?.beforeBytes,
  leafShellCompatBytes: leafExport.buffer.byteLength,
  leafShellBeforeOpt: leafExport.optimise?.beforeBytes,
  threeRevision: THREE.REVISION,
})
