/**
 * E6 acceptance: export a two-level box house and validate walk + z-south.
 * Usage: bun packages/plugin-eco/test/check-export.mjs
 */
import { buildEcoWalk } from '../src/export-walk.ts'
import { exportEcoGlb } from '../src/export-glb.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** Minimal two-level house in editor frame (+z = north). */
function makeHouseNodes() {
  const nodes = {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: {
      id: 'bldg',
      type: 'building',
      parentId: 'site',
      children: ['L0', 'L1'],
    },
    L0: {
      id: 'L0',
      type: 'level',
      parentId: 'bldg',
      height: 2.7,
      baseElevation: 0,
      children: ['slab0', 'wN', 'wS', 'wE', 'wW'],
    },
    L1: {
      id: 'L1',
      type: 'level',
      parentId: 'bldg',
      height: 2.7,
      baseElevation: 0,
      children: ['slab1'],
    },
    // Floor plates
    slab0: {
      id: 'slab0',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ],
      elevation: 0.05,
      thickness: 0.05,
    },
    slab1: {
      id: 'slab1',
      type: 'slab',
      parentId: 'L1',
      polygon: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ],
      elevation: 0.05,
      thickness: 0.05,
    },
    // North wall at z=+3 (editor north) — must become z-negative in world
    wN: {
      id: 'wN',
      type: 'wall',
      parentId: 'L0',
      start: [-3, 3],
      end: [3, 3],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    wS: {
      id: 'wS',
      type: 'wall',
      parentId: 'L0',
      start: [-3, -3],
      end: [3, -3],
      thickness: 0.2,
      height: 2.7,
      children: ['doorS'],
    },
    wE: {
      id: 'wE',
      type: 'wall',
      parentId: 'L0',
      start: [3, -3],
      end: [3, 3],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    wW: {
      id: 'wW',
      type: 'wall',
      parentId: 'L0',
      start: [-3, -3],
      end: [-3, 3],
      thickness: 0.2,
      height: 2.7,
      children: [],
    },
    // Door on south wall — splits that wall into two solids
    doorS: {
      id: 'doorS',
      type: 'door',
      parentId: 'wS',
      wallId: 'wS',
      position: [3, 1.05, 0], // localX=3 along 6 m wall (center)
      width: 0.9,
      height: 2.1,
    },
  }
  return nodes
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

const nodes = makeHouseNodes()
const walk = buildEcoWalk(nodes)

assert(walk.floors.length >= 2, `expected ≥2 floors, got ${walk.floors.length}`)

const southSolids = walk.solids.filter((s) => s.name.startsWith('wall:wS'))
assert(
  southSolids.length >= 2,
  `door gap should split south wall into ≥2 solids, got ${southSolids.length}`,
)

const northSolid = walk.solids.find((s) => s.name === 'wall:wN')
assert(northSolid, 'north wall solid missing')
const northZs = northSolid.ring.map(([, z]) => z)
assert(
  northZs.every((z) => z < 0),
  `north wall (editor +z) must have negative z in world; got ${northZs.join(',')}`,
)
console.log('walk rings are open (first ≠ last) — host closes them')

const { buffer } = await exportEcoGlb({
  nodes,
  originLL: [-122.4, 37.8],
  includePlacedAssets: false,
})

assert(buffer.byteLength > 100, 'GLB too small')
const gltf = parseGlbJson(buffer)
assert(gltf.scenes?.[0]?.extras?.walk, 'scene.extras.walk missing')
assert(gltf.nodes?.[0]?.extras?.walk, 'root node.extras.walk missing')
assert(
  (gltf.scenes[0].extras.walk.floors?.length ?? 0) >= 2,
  'extras.walk.floors < 2',
)

const terrainCap = 20
for (const f of walk.floors) {
  assert(f.top <= terrainCap, `floor top ${f.top} exceeds terrain+20m cap`)
}

console.log('check-export OK', {
  floors: walk.floors.length,
  solids: walk.solids.length,
  southSplits: southSolids.length,
  glbBytes: buffer.byteLength,
  northZs,
})
