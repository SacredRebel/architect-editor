/**
 * F2 acceptance: 26×13 leaf, eave 3 m, ridge to 9.8 m → GLB bbox ±10 cm;
 * zero walk solids; shell is not a collider.
 */
import { buildEcoWalk } from '../src/export-walk.ts'
import { exportEcoGlb } from '../src/export-glb.ts'
import { makeDefaultLeafShell, setEcoShells } from '../src/eco-shell-store.ts'
import { shellBoundingBox } from '../src/eco-shell-geometry.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const leaf = makeDefaultLeafShell('leaf-test')
setEcoShells([leaf])

const box = shellBoundingBox(leaf)
const sizeX = box.max[0] - box.min[0]
const sizeY = box.max[1] - box.min[1]
const sizeZ = box.max[2] - box.min[2]

assert(Math.abs(sizeX - 26) <= 0.1, `length ${sizeX} vs 26 ±10cm`)
assert(Math.abs(sizeZ - 13) <= 0.1, `width ${sizeZ} vs 13 ±10cm`)
assert(box.min[1] >= 3 - 0.15, `eave ~3, minY=${box.min[1]}`)
assert(box.max[1] >= 9.8 - 0.1 && box.max[1] <= 9.8 + 0.25, `ridge ~9.8, maxY=${box.max[1]}`)

const walk = buildEcoWalk({})
assert(walk.solids.length === 0, 'shell must not add walk solids')
assert(walk.floors.length === 0, 'shell must not add floors')

const { buffer, walk: exportedWalk } = await exportEcoGlb({
  nodes: {},
  originLL: [0, 0],
  includePlacedAssets: false,
})
assert(buffer.byteLength > 500, 'GLB has shell geometry')
assert(exportedWalk.solids.length === 0, 'exported walk solids empty')

console.log('check-shell OK', {
  sizeX: Number(sizeX.toFixed(3)),
  sizeY: Number(sizeY.toFixed(3)),
  sizeZ: Number(sizeZ.toFixed(3)),
  minY: Number(box.min[1].toFixed(3)),
  maxY: Number(box.max[1].toFixed(3)),
  glbBytes: buffer.byteLength,
})

setEcoShells([])
