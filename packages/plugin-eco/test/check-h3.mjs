/**
 * H3 — construction takeoff headless checks + hand-verified geometry + Bones path.
 * Usage: bun packages/plugin-eco/test/check-h3.mjs
 */
import {
  ecoConstructionCsv,
  polygonAreaM2,
  runEcoConstructionTakeoff,
} from '../src/eco-construction.ts'
import { loadBonesEngines } from '../src/eco-bones-engines.ts'

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

/** Eco shell–style scene: level present but only a curved wall — Bones must not fake. */
function makeCurvedOnly() {
  return {
    L0: { id: 'L0', type: 'level', parentId: 'bldg', height: 2.7, children: ['wCurve'] },
    bldg: { id: 'bldg', type: 'building', children: ['L0'] },
    wCurve: {
      id: 'wCurve',
      type: 'wall',
      parentId: 'L0',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.2,
      height: 2.7,
      curveOffset: 2.5,
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

const csv = ecoConstructionCsv(result)
assert(csv.includes('basis'), 'csv has basis column')
assert(csv.includes('# jurisdiction,'), 'csv stamps jurisdiction')
assert(csv.includes('takeoff'), 'csv has takeoff rows')

// --- Bones path (when engines load) ---
const bonesEngines = loadBonesEngines()
if (bonesEngines) {
  assert(result.bones.ok === true, `bones should run on wall+slab fixture: ${JSON.stringify(result.bones)}`)
  if (result.bones.ok) {
    assert(result.bones.memberCount > 0, 'bones members > 0')
    assert(result.bones.takeoffRowCount > 0, 'bones takeoff rows > 0')
    assert(result.bones.levelId === 'L0', 'bones level L0')
  }

  const bonesLumber = result.rows.filter(
    (r) => r.section.startsWith('Bones ·') && r.basis === 'takeoff' && r.unit === 'pcs',
  )
  assert(bonesLumber.length > 0, 'expected Bones member-counted pcs rows')

  // Massing LF÷o.c. stud estimate must NOT appear when Bones ran
  const massingStuds = result.rows.find((r) => r.item.startsWith('Studs (2x4'))
  assert(!massingStuds, 'massing stud estimate must be omitted when Bones takeoff ran')

  // LF÷o.c. language must never be labeled takeoff
  for (const row of result.rows) {
    if (/LF ÷|o\.c\.|rule of thumb/i.test(row.detail) && /stud/i.test(row.item)) {
      assert(row.basis !== 'takeoff', `stud rule-of-thumb labeled takeoff: ${row.item}`)
    }
  }

  console.log('  bones path: OK')
  console.log(`    members: ${result.bones.ok ? result.bones.memberCount : 0}`)
  console.log(`    sample takeoff:`)
  for (const row of bonesLumber.slice(0, 4)) {
    console.log(`      [${row.basis}] ${row.section} / ${row.item}: ${row.quantity} ${row.unit}`)
  }
} else {
  console.log('  bones engines unavailable — skipping member-takeoff proof (clone .cache/plugin-bones)')
  // Massing fallback still honest
  const studs = result.rows.find((r) => r.item.startsWith('Studs'))
  assert(studs?.basis === 'estimate', 'studs are estimate when bones unavailable')
  assert(result.bones.ok === false, 'bones status should be not-ok')
}

// --- Curved-only: Bones must not fake; massing warning + estimate path ---
const curved = runEcoConstructionTakeoff(makeCurvedOnly())
assert(curved.bones.ok === false, 'curved-only must not claim bones takeoff')
assert(/curved/i.test(curved.bones.ok === false ? curved.bones.reason : ''), 'curved reason')
const curvedBonesRow = curved.rows.find((r) => r.section === 'Bones' && r.item === 'Member takeoff')
assert(curvedBonesRow?.basis === 'placeholder', 'bones skip is placeholder')
const curvedStuds = curved.rows.find((r) => r.item.startsWith('Studs'))
if (curvedStuds) {
  assert(curvedStuds.basis === 'estimate', 'curved massing studs stay estimate')
}

assert(csv.includes('estimate') || result.bones.ok, 'csv has estimate rows or bones-only takeoff')

console.log('check-h3 OK')
console.log(`  floor area: ${result.metrics.floorAreaM2} m² (hand ${handArea})`)
console.log(`  exterior wall LF: ${result.metrics.exteriorWallLfM} m (hand ${handLf})`)
console.log(`  rows: ${result.rows.length}; jurisdiction: ${result.jurisdiction.name}`)
console.log(`  bones: ${result.bones.ok ? 'wired' : result.bones.reason}`)
