/**
 * H0 acceptance — two rooms, one door between them; walk contract + z-south.
 * Curve clause moved to H10 (editor cannot draw curves until H10).
 *
 * Usage: bun packages/plugin-eco/test/check-h0.mjs
 * Writes test/h0-two-rooms.glb for world probeModel.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEcoWalk } from '../src/export-walk.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import { auditGlb } from '../src/glb-audit.ts'

const dir = path.dirname(fileURLToPath(import.meta.url))

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** Two rooms sharing a north–south wall at x=0; door in the shared wall. Floor top = 0.15 m. */
function makeTwoRooms() {
  const FLOOR_TOP = 0.15
  const WALL_H = 2.7
  const nodes = {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: {
      id: 'L0',
      type: 'level',
      parentId: 'bldg',
      height: WALL_H,
      baseElevation: 0,
      children: ['slabA', 'slabB', 'wN_A', 'wS_A', 'wW', 'wShared', 'wN_B', 'wS_B', 'wE'],
    },
    // Room A west: x∈[-4,0], z∈[-3,3] (editor +z = north)
    slabA: {
      id: 'slabA',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [-4, -3],
        [0, -3],
        [0, 3],
        [-4, 3],
      ],
      elevation: FLOOR_TOP,
      thickness: 0.05,
    },
    // Room B east: x∈[0,4], z∈[-3,3]
    slabB: {
      id: 'slabB',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [0, -3],
        [4, -3],
        [4, 3],
        [0, 3],
      ],
      elevation: FLOOR_TOP,
      thickness: 0.05,
    },
    wN_A: {
      id: 'wN_A',
      type: 'wall',
      parentId: 'L0',
      start: [-4, 3],
      end: [0, 3],
      thickness: 0.2,
      height: WALL_H,
      children: [],
    },
    wS_A: {
      id: 'wS_A',
      type: 'wall',
      parentId: 'L0',
      start: [0, -3],
      end: [-4, -3],
      thickness: 0.2,
      height: WALL_H,
      children: [],
    },
    wW: {
      id: 'wW',
      type: 'wall',
      parentId: 'L0',
      start: [-4, -3],
      end: [-4, 3],
      thickness: 0.2,
      height: WALL_H,
      children: [],
    },
    // Shared wall between rooms — door gap (not a flag)
    wShared: {
      id: 'wShared',
      type: 'wall',
      parentId: 'L0',
      start: [0, -3],
      end: [0, 3],
      thickness: 0.2,
      height: WALL_H,
      children: ['doorMid'],
    },
    doorMid: {
      id: 'doorMid',
      type: 'door',
      parentId: 'wShared',
      wallId: 'wShared',
      position: [3, 1.05, 0], // localX mid of 6 m wall
      width: 0.9,
      height: 2.1,
    },
    wN_B: {
      id: 'wN_B',
      type: 'wall',
      parentId: 'L0',
      start: [0, 3],
      end: [4, 3],
      thickness: 0.2,
      height: WALL_H,
      children: [],
    },
    wS_B: {
      id: 'wS_B',
      type: 'wall',
      parentId: 'L0',
      start: [4, -3],
      end: [0, -3],
      thickness: 0.2,
      height: WALL_H,
      children: [],
    },
    wE: {
      id: 'wE',
      type: 'wall',
      parentId: 'L0',
      start: [4, 3],
      end: [4, -3],
      thickness: 0.2,
      height: WALL_H,
      children: [],
    },
  }
  return { nodes, FLOOR_TOP, WALL_H }
}

const { nodes, FLOOR_TOP, WALL_H } = makeTwoRooms()
const walk = buildEcoWalk(nodes)

assert(walk.floors.length === 2, `two floors, got ${walk.floors.length}`)
for (const f of walk.floors) {
  assert(
    Math.abs(f.top - FLOOR_TOP) < 1e-9,
    `floor ${f.name} top ${f.top} ≠ set ${FLOOR_TOP}`,
  )
}

const shared = walk.solids.filter((s) => s.name.startsWith('wall:wShared'))
assert(shared.length === 2, `door must be a GAP → 2 solids, got ${shared.length}`)
assert(
  !walk.solids.some((s) => 'door' in s || s.door || s.hasDoor),
  'no door flag on solids — absence only',
)

// Editor north wall at z=+3 → world z SOUTH (negative)
const northA = walk.solids.find((s) => s.name === 'wall:wN_A')
assert(northA, 'north wall A')
const northZs = northA.ring.map(([, z]) => z)
assert(
  northZs.every((z) => z < 0),
  `z-south: editor +z north must be world −z; got ${northZs.join(',')}`,
)

const { buffer, walk: stamped } = await exportEcoGlb({
  nodes,
  originLL: [-119.25, 34.45],
  includePlacedAssets: false,
  optimiseProfile: 'compat',
})
assert(buffer.byteLength < 500 * 1024, 'under 500 KB compat')
const report = await auditGlb(buffer)
assert(
  !report.extensionsRequired.includes('EXT_meshopt_compression'),
  'H0 export must not need meshopt',
)
assert(stamped.floors.length === 2, 'stamped floors')
assert(stamped.solids.filter((s) => s.name.startsWith('wall:wShared')).length === 2, 'stamped door gap')

const outPath = path.join(dir, 'h0-two-rooms.glb')
writeFileSync(outPath, Buffer.from(buffer))

console.log('check-h0 OK', {
  floors: walk.floors.length,
  floorTop: FLOOR_TOP,
  wallH: WALL_H,
  solids: walk.solids.length,
  doorGapSolids: shared.length,
  northZs: northZs.slice(0, 2),
  glbBytes: buffer.byteLength,
  extensionsRequired: report.extensionsRequired,
  wrote: outPath,
})
