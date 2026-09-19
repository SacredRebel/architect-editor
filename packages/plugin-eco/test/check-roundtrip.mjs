/**
 * F0.2 — round-trip assertions (data path + harness contract).
 * Full iframe knock is exercised by host-harness.html; this script asserts the
 * same site/design/export invariants headlessly without adding a browser dep.
 *
 * Usage: bun packages/plugin-eco/test/check-roundtrip.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { heightAt } from '@pascal-app/core'
import { CAPS } from '../src/bridge.ts'
import { siteFrameBounds, terrainFieldFromEcoSite } from '../src/apply-site.ts'
import { siteToWorldXz } from '../src/coords.ts'
import { buildEcoWalk } from '../src/export-walk.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import { buildRealisticSite, siteHeightAsl } from './realistic-site.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))

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

// --- caps (what eco:ready must advertise) ---
for (const c of ['site', 'scene', 'assets', 'glb']) {
  assert(CAPS.includes(c), `caps missing ${c}`)
}
console.log('caps OK', [...CAPS])

// --- harness deliverable exists + knock contract in source ---
const harnessPath = path.join(dir, 'host-harness.html')
assert(existsSync(harnessPath), 'host-harness.html missing')
const harnessSrc = readFileSync(harnessPath, 'utf8')
assert(harnessSrc.includes("eco:hello"), 'harness sends hello')
assert(harnessSrc.includes('500'), 'harness 500ms knock')
assert(harnessSrc.includes('20'), 'harness 20-knock budget')
assert(harnessSrc.includes('eco:request-export'), 'harness export button')
assert(harnessSrc.includes('walkSvg') || harnessSrc.includes('walk'), 'harness walk SVG')
assert(harnessSrc.includes('buildRealisticSite'), 'harness uses realistic site')
console.log('host-harness.html contract OK')

// --- realistic site terrain applied (relative heights within 1 cm) ---
const site = buildRealisticSite(null)
assert(site.terrain.w === 97 && site.terrain.h === 97, '97×97 terrain')
assert(site.terrain.stepM === 1.5, '1.5 m step')
assert(site.guides.length === 4, 'four guides')
assert(
  site.guides.map((g) => g.kind).sort().join() ===
    ['boundary', 'easement', 'footprint', 'massing-outline'].sort().join(),
  'guide kinds',
)

const field = terrainFieldFromEcoSite(site)
const samples = [
  [10, 10],
  [48, 48],
  [80, 20],
]
for (const [col, row] of samples) {
  const asl = siteHeightAsl(site, col, row)
  const expectedRel = asl - site.originElevM
  const wx = field.origin[0] + col * field.spacing
  const wz = field.origin[1] + row * field.spacing
  const got = heightAt(field, wx, wz)
  assert(
    Math.abs(got - expectedRel) <= 0.01,
    `terrain sample (${col},${row}): got ${got} expected ${expectedRel} (≤1cm)`,
  )
}
console.log('terrain relative heights OK')

// --- frame bounds prefer massing-outline in world (z-south) ---
{
  const maxX = field.origin[0] + (field.cols - 1) * field.spacing
  const maxZ = field.origin[1] + (field.rows - 1) * field.spacing
  const terrainBounds = {
    min: [field.origin[0], field.origin[1]],
    max: [maxX, maxZ],
    center: [(field.origin[0] + maxX) / 2, (field.origin[1] + maxZ) / 2],
    size: [maxX - field.origin[0], maxZ - field.origin[1]],
  }
  const framed = siteFrameBounds(site, terrainBounds)
  const massing = site.guides.find((g) => g.kind === 'massing-outline')
  assert(massing, 'massing guide')
  const worldPts = massing.pts.map((p) => siteToWorldXz(p))
  const xs = worldPts.map((p) => p[0])
  const zs = worldPts.map((p) => p[1])
  assert(Math.abs(framed.min[0] - Math.min(...xs)) < 1e-6, 'frame minX')
  assert(Math.abs(framed.max[1] - Math.max(...zs)) < 1e-6, 'frame maxZ')
  console.log('siteFrameBounds → massing OK', framed.center)
}
console.log('terrain samples OK (±1 cm)')

// --- boundary guide first point in world metres ---
const boundary = site.guides.find((g) => g.kind === 'boundary')
const [bx, bz] = siteToWorldXz(boundary.pts[0])
assert(Math.abs(bx - boundary.pts[0][0]) < 1e-9, 'boundary x')
assert(Math.abs(bz - -boundary.pts[0][1]) < 1e-9, 'boundary z negated (z-south)')
console.log('boundary guide0 world xz', [bx, bz])

// --- two rooms sharing a wall + door; ≥3 floors ---
const WALL_H = 2.7
const nodes = {
  site: { id: 'site', type: 'site', children: ['bldg'] },
  bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0', 'L1'] },
  L0: {
    id: 'L0',
    type: 'level',
    parentId: 'bldg',
    height: WALL_H,
    baseElevation: 0,
    children: ['slabA', 'slabB', 'wShared', 'wA1', 'wA2', 'wA3', 'wB1', 'wB2', 'wB3'],
  },
  L1: {
    id: 'L1',
    type: 'level',
    parentId: 'bldg',
    height: WALL_H,
    baseElevation: 0,
    children: ['slabUpper'],
  },
  // Room A west of shared wall; Room B east
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
    elevation: 0.05,
    thickness: 0.05,
  },
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
    elevation: 0.05,
    thickness: 0.05,
  },
  slabUpper: {
    id: 'slabUpper',
    type: 'slab',
    parentId: 'L1',
    polygon: [
      [-4, -3],
      [4, -3],
      [4, 3],
      [-4, 3],
    ],
    elevation: 0.05,
    thickness: 0.05,
  },
  // Shared wall at x=0, z from -3..3 — door in the middle
  wShared: {
    id: 'wShared',
    type: 'wall',
    parentId: 'L0',
    start: [0, -3],
    end: [0, 3],
    thickness: 0.2,
    height: WALL_H,
    children: ['doorShared'],
  },
  doorShared: {
    id: 'doorShared',
    type: 'door',
    parentId: 'wShared',
    wallId: 'wShared',
    position: [3, 1.05, 0], // mid of 6 m run
    width: 0.9,
    height: 2.1,
  },
  wA1: {
    id: 'wA1',
    type: 'wall',
    parentId: 'L0',
    start: [-4, -3],
    end: [0, -3],
    thickness: 0.2,
    height: WALL_H,
    children: [],
  },
  wA2: {
    id: 'wA2',
    type: 'wall',
    parentId: 'L0',
    start: [-4, 3],
    end: [0, 3],
    thickness: 0.2,
    height: WALL_H,
    children: [],
  },
  wA3: {
    id: 'wA3',
    type: 'wall',
    parentId: 'L0',
    start: [-4, -3],
    end: [-4, 3],
    thickness: 0.2,
    height: WALL_H,
    children: [],
  },
  wB1: {
    id: 'wB1',
    type: 'wall',
    parentId: 'L0',
    start: [0, -3],
    end: [4, -3],
    thickness: 0.2,
    height: WALL_H,
    children: [],
  },
  wB2: {
    id: 'wB2',
    type: 'wall',
    parentId: 'L0',
    start: [0, 3],
    end: [4, 3],
    thickness: 0.2,
    height: WALL_H,
    children: [],
  },
  wB3: {
    id: 'wB3',
    type: 'wall',
    parentId: 'L0',
    start: [4, -3],
    end: [4, 3],
    thickness: 0.2,
    height: WALL_H,
    children: [],
  },
}

const walk = buildEcoWalk(nodes)
assert(walk.floors.length >= 3, `floors ≥ 3, got ${walk.floors.length}`)

const sharedSolids = walk.solids.filter((s) => s.name.startsWith('wall:wShared'))
assert(sharedSolids.length === 2, `shared wall → 2 solids (door gap), got ${sharedSolids.length}`)

for (const solid of walk.solids) {
  assert(Math.abs(solid.base - 0) < 1e-6, `${solid.name} base is wall foot, got ${solid.base}`)
  assert(
    Math.abs(solid.top - WALL_H) < 1e-6,
    `${solid.name} top is wall head ${WALL_H}, got ${solid.top}`,
  )
}

// Explicit z-south: shared wall editor z∈[-3,3] → world z∈[-3,3] after negate of each pt's z
// North edge of room A (editor z=+3) must appear as z=-3 in world floors
const slabA = walk.floors.find((f) => f.name === 'slab:slabA')
assert(slabA, 'slabA floor')
const northish = slabA.ring.filter(([, z]) => Math.abs(z + 3) < 1e-6)
assert(northish.length >= 1, 'slabA north edge has z=-3 in world (z-south)')

const { buffer } = await exportEcoGlb({
  nodes,
  originLL: site.originLL,
  includePlacedAssets: false,
})
const gltf = parseGlbJson(buffer)
assert(gltf.scenes?.[0]?.extras?.walk, 'scene.extras.walk')
assert(gltf.nodes?.[0]?.extras?.walk, 'root extras.walk')
assert((gltf.scenes[0].extras.walk.floors?.length ?? 0) >= 3, 'extras floors ≥ 3')

console.log('check-roundtrip OK', {
  floors: walk.floors.length,
  solids: walk.solids.length,
  sharedSplits: sharedSolids.length,
  glbBytes: buffer.byteLength,
  boundaryWorld: [bx, bz],
})
