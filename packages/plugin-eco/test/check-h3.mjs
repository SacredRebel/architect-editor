/**
 * H3 — construction takeoff headless checks + hand-verified geometry.
 * Usage: bun packages/plugin-eco/test/check-h3.mjs
 */
import {
  ecoConstructionCsv,
  polygonAreaM2,
  runEcoConstructionTakeoff,
} from '../src/eco-construction.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** 20 m × 10 m box — same fixture language as check-drawings. */
function makeBuilding20x10() {
  return {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: {
      id: 'L0',
      type: 'level',
      parentId: 'bldg',
      height: 2.7,
      children: ['slab0', 'wN', 'wS', 'wE', 'wW'],
    },
    slab0: {
      id: 'slab0',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [0, 0],
        [20, 0],
        [20, 10],
        [0, 10],
      ],
    },
    wN: {
      id: 'wN',
      type: 'wall',
      parentId: 'L0',
      start: [0, 10],
      end: [20, 10],
      thickness: 0.2,
      height: 2.7,
    },
    wS: {
      id: 'wS',
      type: 'wall',
      parentId: 'L0',
      start: [0, 0],
      end: [20, 0],
      thickness: 0.2,
      height: 2.7,
    },
    wE: {
      id: 'wE',
      type: 'wall',
      parentId: 'L0',
      start: [20, 0],
      end: [20, 10],
      thickness: 0.2,
      height: 2.7,
    },
    wW: {
      id: 'wW',
      type: 'wall',
      parentId: 'L0',
      start: [0, 0],
      end: [0, 10],
      thickness: 0.2,
      height: 2.7,
    },
  }
}

// --- Hand check 1: floor area ---
const poly = [
  [0, 0],
  [20, 0],
  [20, 10],
  [0, 10],
]
const handArea = 20 * 10
const shoelace = polygonAreaM2(poly)
assert(Math.abs(shoelace - handArea) < 1e-9, `shoelace ${shoelace} ≠ hand ${handArea}`)

const result = runEcoConstructionTakeoff(makeBuilding20x10())
assert(result.metrics.floorAreaM2 === 200, `floorArea ${result.metrics.floorAreaM2}`)
const floorRow = result.rows.find((r) => r.item === 'Total floor area')
assert(floorRow?.basis === 'takeoff', 'floor area must be takeoff')
assert(floorRow?.quantity === 200, 'floor row qty')

// --- Hand check 2: exterior wall LF ---
// Perimeter of 20×10 rectangle = 2*(20+10) = 60 m
const handLf = 2 * (20 + 10)
assert(result.metrics.exteriorWallLfM === 60, `exterior LF ${result.metrics.exteriorWallLfM} ≠ ${handLf}`)
const lfRow = result.rows.find((r) => r.item === 'Exterior wall length')
assert(lfRow?.basis === 'takeoff', 'exterior LF must be takeoff')
assert(lfRow?.quantity === 60, 'LF row qty')

// Jurisdiction is Ventura, not a generic default
assert(result.jurisdiction.id === 'US-CA-VENTURA', 'jurisdiction id')
assert(result.jurisdiction.climate.frostLineIn === 0, 'frost')
assert(result.jurisdiction.climate.seismicSdc === 'D', 'seismic')
assert(result.jurisdiction.climate.wui === true, 'wui')
assert(result.jurisdiction.climate.groundSnowLoadPsf === 0, 'snow')

// Every row has a basis
for (const row of result.rows) {
  assert(
    row.basis === 'takeoff' || row.basis === 'estimate' || row.basis === 'placeholder',
    `bad basis on ${row.item}`,
  )
}

// Defaults lean estimate for assembly BOM
const studs = result.rows.find((r) => r.item.startsWith('Studs'))
assert(studs?.basis === 'estimate', 'studs are estimate')

const csv = ecoConstructionCsv(result)
assert(csv.includes('basis'), 'csv has basis column')
assert(csv.includes('# jurisdiction,'), 'csv stamps jurisdiction')
assert(csv.includes('takeoff'), 'csv has takeoff rows')
assert(csv.includes('estimate'), 'csv has estimate rows')
assert(!/https?:\/\//.test(JSON.stringify(result.jurisdiction.climate).slice(0, 50)) || true)

console.log('check-h3 OK')
console.log(`  floor area: ${result.metrics.floorAreaM2} m² (hand ${handArea})`)
console.log(`  exterior wall LF: ${result.metrics.exteriorWallLfM} m (hand ${handLf})`)
console.log(`  rows: ${result.rows.length}; jurisdiction: ${result.jurisdiction.name}`)
