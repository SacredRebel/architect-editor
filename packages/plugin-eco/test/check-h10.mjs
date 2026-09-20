/**
 * H10 acceptance — leaf shell + ribs + curved perimeter + doorway on curve;
 * export walk; change rise; everything follows.
 *
 * Tolerance: ECO_CURVE_WALK_TOLERANCE_M = 0.05 m (5 cm chord error).
 */
import { getWallArcData } from '@pascal-app/core'
import {
  chordErrorForStep,
  ECO_CURVE_WALK_TOLERANCE_M,
} from '../src/eco-curve-tolerance.ts'
import { tessellateLoft, makeDefaultLeafLoft } from '../src/eco-loft.ts'
import { sampleCatenary, makeDefaultCatenary } from '../src/eco-catenary.ts'
import { tessellateVault, makeDefaultBarrelVault } from '../src/eco-vault.ts'
import {
  buildEcoWalk,
  wallRunLength,
  wallSampleStepM,
  wallSegmentRing,
} from '../src/export-walk.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import { shellBoundingBox, shellHeightAt } from '../src/eco-shell-geometry.ts'
import {
  makeDefaultLeafShell,
  setEcoShells,
  setShellRise,
  getEcoShellsState,
} from '../src/eco-shell-store.ts'
import {
  addEcoLoft,
  addEcoVault,
  addEcoCatenary,
  clearEcoOrganic,
} from '../src/eco-organic-store.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// --- 1. Leaf shell with ribs, parametric rise ---
const leaf = makeDefaultLeafShell('leaf-h10')
assert(leaf.ribSpacing > 0, 'ribs')
assert(leaf.rise === 1, 'default rise')
setEcoShells([leaf])

const box1 = shellBoundingBox(leaf)
const maxY1 = box1.max[1]
assert(maxY1 >= 9.7 && maxY1 <= 10.1, `ridge ~9.8 at rise=1, got ${maxY1}`)

setShellRise('leaf-h10', 1.5)
const leaf2 = getEcoShellsState().shells[0]
assert(leaf2.rise === 1.5, 'rise updated')
const midH1 = shellHeightAt({ ...leaf, rise: 1 }, 0, 0)
const midH2 = shellHeightAt(leaf2, 0, 0)
assert(midH2 > midH1 + 0.5, `rise must lift midspan ${midH1} → ${midH2}`)
const box2 = shellBoundingBox(leaf2)
assert(box2.max[1] > maxY1 + 1, `bbox follows rise ${maxY1} → ${box2.max[1]}`)

// --- 2. Curved perimeter walls + doorway following curve ---
const WALL_H = 2.7
const chord = 20
const sagitta = 2
const doorWidth = 0.9
const doorAlongArc = 4

const wall = {
  id: 'wCurve',
  type: 'wall',
  parentId: 'L0',
  start: [0, 0],
  end: [chord, 0],
  thickness: 0.2,
  height: WALL_H,
  curveOffset: sagitta,
  children: ['door1'],
}

const run = wallRunLength(wall)
const arc = getWallArcData(wall)
assert(arc, 'arc data')
const step = wallSampleStepM(wall)
const err = chordErrorForStep(arc.radius, step)
assert(err <= ECO_CURVE_WALK_TOLERANCE_M + 1e-9, `chord error ${err} > ${ECO_CURVE_WALK_TOLERANCE_M}`)

const t = doorAlongArc / run
const doorLocalX = t * chord
const nodes = {
  L0: { id: 'L0', type: 'level', parentId: 'bldg', height: WALL_H, baseElevation: 0 },
  bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
  site: { id: 'site', type: 'site', children: ['bldg'] },
  wCurve: wall,
  door1: {
    id: 'door1',
    type: 'door',
    parentId: 'wCurve',
    wallId: 'wCurve',
    position: [doorLocalX, 1.05, 0],
    width: doorWidth,
    height: 2.1,
  },
  // slab so walk has a floor to enter
  slab0: {
    id: 'slab0',
    type: 'slab',
    parentId: 'L0',
    polygon: [
      [-1, -3],
      [chord + 1, -3],
      [chord + 1, 5],
      [-1, 5],
    ],
    elevation: 0.05,
  },
}

const walk = buildEcoWalk(nodes)
const solids = walk.solids.filter((s) => s.name.startsWith('wall:wCurve'))
assert(solids.length === 2, `door splits curve into 2 solids, got ${solids.length}`)
assert(walk.floors.length === 1, 'floor present')

const fullRing = wallSegmentRing({ ...wall, children: [] }, 0, run)
const samples = Math.max(1, Math.ceil(run / step))
const ptsPerFace = samples + 1
assert(fullRing.length >= ptsPerFace * 2, `polyline ring denser than chord, got ${fullRing.length}`)
assert(ptsPerFace >= 40, `face ≥40 pts, got ${ptsPerFace}`)

// --- 3. Export with shell + walls; rise change still in store for next export ---
setEcoShells([getEcoShellsState().shells[0]])
const exported = await exportEcoGlb({
  nodes,
  originLL: [0, 0],
  includePlacedAssets: false,
})
assert(exported.buffer.byteLength > 1000, 'GLB has geometry')
assert(exported.walk.solids.length >= 2, 'walk solids exported')
assert(exported.walk.floors.length >= 1, 'walk floors exported')

// Change rise again and re-export — shell follows, walk walls unchanged
setShellRise('leaf-h10', 0.6)
const boxLow = shellBoundingBox(getEcoShellsState().shells[0])
assert(boxLow.max[1] < maxY1 - 1, `lower rise ${boxLow.max[1]} < ${maxY1}`)

const exported2 = await exportEcoGlb({
  nodes,
  originLL: [0, 0],
  includePlacedAssets: false,
})
assert(exported2.walk.solids.length === exported.walk.solids.length, 'walk solids stable after rise')

// --- 4. Loft / vault / catenary smoke ---
clearEcoOrganic()
const loft = makeDefaultLeafLoft('loft-h10')
addEcoLoft(loft)
const loftMesh = tessellateLoft(loft)
assert(loftMesh.positions.length > 100, 'loft tessellates')
assert(loftMesh.indices.length > 100, 'loft faces')

const vault = makeDefaultBarrelVault('vault-h10')
addEcoVault(vault)
const vm = tessellateVault(vault)
assert(vm.ribPaths.length > 0, 'vault ribs')
assert(vm.positions.length > 100, 'vault mesh')

const cat = makeDefaultCatenary('cat-h10')
addEcoCatenary(cat)
const catPts = sampleCatenary(cat)
assert(catPts.length >= 16, 'catenary samples')
const midY = catPts[Math.floor(catPts.length / 2)][1]
assert(midY < cat.supportHeight - 1, `catenary sags ${midY}`)

clearEcoOrganic()
setEcoShells([])

console.log('check-h10 OK', {
  toleranceM: ECO_CURVE_WALK_TOLERANCE_M,
  chordErrorM: Number(err.toFixed(5)),
  sampleStepM: Number(step.toFixed(3)),
  ptsPerFace,
  solids: solids.length,
  riseBefore: maxY1,
  riseAfter15: box2.max[1],
  riseAfter06: boxLow.max[1],
  glbBytes: exported.buffer.byteLength,
  loftVerts: loftMesh.positions.length / 3,
  vaultRibs: vm.ribPaths.length,
})
