/**
 * H15 acceptance — organic authoring + smooth walls + minimal + extras round-trip.
 * Usage: bun packages/plugin-eco/test/check-h15.mjs
 */
import { tessellateMinimalPatch } from '../src/eco-catenary.ts'
import { buildOrganicBuildingObject3D } from '../src/eco-organic-building-geometry.ts'
import {
  addMinimalFromClosedCurve,
  addSmoothWall,
  clearEcoOrganicBuildings,
  generateOrganicBuilding,
  restoreOrganicBuildings,
  serializeOrganicBuildings,
  updateOrganicSpecField,
} from '../src/eco-organic-building-store.ts'
import { clearEcoOrganic, getEcoOrganicState } from '../src/eco-organic-store.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import { makeDemoSmoothWall, smoothWallLength, smoothWallSolidRuns } from '../src/eco-smooth-wall.ts'
import { cleanSpec } from '../src/eco-organic-spec.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

clearEcoOrganic()
clearEcoOrganicBuildings()

// --- 5-lobe building ---
const plan = generateOrganicBuilding({
  id: 'h15-lobed',
  name: 'H15 five-lobe',
  spec: cleanSpec({ form: 'lobed', lobes: 5, roof: 'solar', solar: 0.6, glazing: 0.3 }),
})
assert(plan.spec.lobes === 5, '5 lobes')
assert(plan.wall.closed, 'closed wall')
assert(plan.wallControls.length >= 12, `wall controls densish, got ${plan.wallControls.length}`)
assert(plan.quantities.floor_m2 > 10, 'floor area')
assert(plan.quantities.panels >= 1, 'solar panels')
assert(plan.quantities.kWp > 0, 'kWp')

const windows = plan.openings.filter((o) => o.kind === 'window')
assert(windows.length >= 3, `≥3 windows on curve, got ${windows.length}`)

// Shell + panels mesh
const mesh = buildOrganicBuildingObject3D(plan)
let roof = 0
let panels = 0
mesh.traverse((c) => {
  if (c.name?.startsWith('eco-organic-roof:')) roof++
  if (c.name?.startsWith('eco-solar:')) panels++
})
assert(roof >= 1, 'shell roof mesh')
assert(panels >= 1, 'panel meshes')

// Slider regenerates in place
const beforeId = plan.id
const next = updateOrganicSpecField(plan.id, 'rise', Math.min(8, plan.spec.rise + 0.5))
assert(next && next.id === beforeId, 'regenerate in place')
assert(Math.abs(next.spec.rise - (plan.spec.rise + 0.5)) < 1e-6 || next.spec.rise === cleanSpec({ rise: plan.spec.rise + 0.5 }).rise, 'rise updated')

// --- Smooth wall with 3 windows ---
const sw = addSmoothWall(makeDemoSmoothWall('h15-sw'))
assert(sw.openings.filter((o) => o.kind === 'window').length === 3, '3 windows on smooth wall')
const runs = smoothWallSolidRuns(sw)
assert(runs.length >= 4, `windows cut solids into ≥4 runs, got ${runs.length}`)
assert(smoothWallLength(sw) > 15, 'multi-arc length')

// --- Minimal from closed curve ---
const patch = addMinimalFromClosedCurve({
  id: 'h15-min',
  ring: next.wallControls,
  iterations: 30,
  thickness: 0.1,
})
const { positions, indices } = tessellateMinimalPatch(patch)
assert(positions.length > 30, 'minimal tessellates')
assert(indices.length > 30, 'minimal indices')
assert(getEcoOrganicState().minimal.some((m) => m.id === 'h15-min'), 'minimal in store')

// --- GLB extras round-trip ---
const exported = await exportEcoGlb({
  nodes: {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: { id: 'L0', type: 'level', parentId: 'bldg', height: 3.2, baseElevation: 0 },
  },
  optimiseProfile: 'compat',
  maxBytes: 5_000_000,
})
assert(exported.buffer.byteLength > 1000, 'glb bytes')

const dv = new DataView(exported.buffer)
const jsonLen = dv.getUint32(12, true)
const jsonBytes = new Uint8Array(exported.buffer, 20, jsonLen)
let je = jsonBytes.length
while (je > 0 && jsonBytes[je - 1] === 0) je--
const json = JSON.parse(new TextDecoder().decode(jsonBytes.subarray(0, je)))
assert(json.extras?.area, 'extras.area present')
assert(json.extras?.organicBuildings?.buildings?.length >= 1, 'organic buildings in extras')
const recipe = json.extras.organicBuildings.buildings[0]
assert(recipe.spec?.form === 'lobed', 'organic recipe form')
assert(Array.isArray(recipe.perimeter) && recipe.perimeter.length >= 3, 'perimeter on recipe')
assert(recipe.wall?.assembly?.infill, 'wall assembly')

// Restore editable
clearEcoOrganicBuildings()
restoreOrganicBuildings(json.extras.organicBuildings)
const ser = serializeOrganicBuildings()
assert(ser.buildings.length >= 1, 'restored buildings')
assert(ser.buildings[0].spec.lobes === 5, 'restored lobes')

console.log('check-h15: OK', {
  lobes: recipe.spec.lobes,
  windows: windows.length,
  panels,
  floor_m2: Number(next.quantities.floor_m2.toFixed(2)),
  glbKB: Number((exported.buffer.byteLength / 1024).toFixed(1)),
  minimalTris: indices.length / 3,
})
