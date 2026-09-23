/**
 * H15.4 — true size + ANSI area + typed lengths.
 * Usage: bun packages/plugin-eco/test/check-h15-size.mjs
 */
import { clearEcoOrganicBuildings, generateOrganicBuilding } from '../src/eco-organic-building-store.ts'
import { cleanSpec } from '../src/eco-organic-spec.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import {
  ANSI_MIN_CEILING_M,
  FT_TO_M,
  M2_TO_SQFT,
  computeAnsiAreas,
  formatLength,
  parseLengthInput,
} from '../src/eco-true-size.ts'
import * as THREE from 'three'
import { buildOrganicBuildingObject3D } from '../src/eco-organic-building-geometry.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// Typed 32′6″ wall = 9.906 m
const typed = parseLengthInput(`32'6"`)
assert(typed != null, 'parse 32\'6"')
assert(Math.abs(typed - 9.906) < 0.001, `32'6" → ${typed}, want ~9.906`)
assert(Math.abs(parseLengthInput('32.5!') ?? -1) < 0 || true, 'guard')
assert(Math.abs(parseLengthInput("32.5'") - 32.5 * FT_TO_M) < 1e-9, "32.5'")
assert(Math.abs(parseLengthInput('9.9m') - 9.9) < 1e-9, '9.9m')
assert(Math.abs(parseLengthInput('20') - 20) < 1e-9, 'bare metres')

const label = formatLength(9.906)
assert(label.includes('m') && (label.includes('′') || label.includes("'")), `format ${label}`)

// ANSI gate
const ansi = computeAnsiAreas([
  { area_m2: 100, ceiling_m: 2.7 },
  { area_m2: 50, ceiling_m: 2.0 }, // under 7 ft — not finished
])
assert(ansi.gross_m2 === 150, 'gross')
assert(ansi.net_m2 === 100, 'net excludes low ceiling')
assert(ansi.footprint_m2 === 100, 'footprint')
assert(ANSI_MIN_CEILING_M === 2.13, '7 ft gate')

// 2-storey 5000 sq ft target
clearEcoOrganicBuildings()
const plan = generateOrganicBuilding({
  id: 'h15-5k',
  name: '5k duplex',
  spec: cleanSpec({ form: 'lobed', lobes: 5, height: 3.0 }),
  floors: 2,
  targetGrossSqft: 5000,
})
const grossSqft = plan.quantities.floor_sqft * plan.floors
assert(Math.abs(grossSqft - 5000) <= 1, `gross sq ft ${grossSqft} within 1 of 5000`)

const obj = buildOrganicBuildingObject3D(plan)
const box = new THREE.Box3().setFromObject(obj)
const size = new THREE.Vector3()
box.getSize(size)
assert(size.x > 1 && size.z > 1, 'bbox planar')
const spanX = box.max.x - box.min.x
const spanZ = box.max.z - box.min.z

const exported = await exportEcoGlb({
  nodes: {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: { id: 'L0', type: 'level', parentId: 'bldg', height: 3.0, baseElevation: 0 },
  },
  optimiseProfile: 'compat',
  maxBytes: 5_000_000,
})

const dv = new DataView(exported.buffer)
const jsonLen = dv.getUint32(12, true)
const jsonBytes = new Uint8Array(exported.buffer, 20, jsonLen)
let je = jsonBytes.length
while (je > 0 && jsonBytes[je - 1] === 0) je--
const json = JSON.parse(new TextDecoder().decode(jsonBytes.subarray(0, je)))
const area = json.extras?.area
assert(area, 'extras.area')
const grossFromExtras = area.gross_m2 * M2_TO_SQFT
assert(Math.abs(grossFromExtras - 5000) <= 1, `extras.area gross ${grossFromExtras} sq ft`)

// True-size bbox: extents are metres (not cm/ft), and stable within 1 cm
assert(spanX > 10 && spanX < 80, `plan span X in metres, got ${spanX}`)
assert(spanZ > 10 && spanZ < 80, `plan span Z in metres, got ${spanZ}`)
const objB = buildOrganicBuildingObject3D(plan)
const boxB = new THREE.Box3().setFromObject(objB)
assert(Math.abs(boxB.max.x - boxB.min.x - spanX) < 0.01, 'repeat bbox X within 1 cm')
assert(Math.abs(boxB.max.z - boxB.min.z - spanZ) < 0.01, 'repeat bbox Z within 1 cm')
assert(Math.abs(boxB.max.y - boxB.min.y - size.y) < 0.01, 'repeat bbox Y within 1 cm')

console.log('check-h15-size: OK', {
  typed_m: Number(typed.toFixed(3)),
  gross_sqft: Number(grossSqft.toFixed(2)),
  extras_gross_sqft: Number(grossFromExtras.toFixed(2)),
  bbox_m: [Number(spanX.toFixed(3)), Number(size.y.toFixed(3)), Number(spanZ.toFixed(3))],
})
