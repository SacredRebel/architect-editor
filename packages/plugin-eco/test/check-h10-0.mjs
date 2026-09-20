/**
 * H10.0 — parameter spine on a BOX. Change width/depth/height/door → walk follows.
 */
import {
  makeDefaultParamBox,
  paramBoxToNodes,
  paramBoxWalk,
  paramBoxWorldFloorExtents,
  updateEcoParamBox,
  getEcoParamBoxesState,
  setEcoParamBoxes,
  clearEcoParamBoxes,
} from '../src/eco-param-box.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

clearEcoParamBoxes()
const box = makeDefaultParamBox('spine-box')
setEcoParamBoxes([box])

const walk0 = paramBoxWalk(box)
assert(walk0.floors.length === 1, 'one floor')
assert(Math.abs(walk0.floors[0].top - 0.15) < 1e-9, 'floor top from param')
const south0 = walk0.solids.filter((s) => s.name.startsWith('wall:wS'))
assert(south0.length === 2, `door gap → 2 solids, got ${south0.length}`)

const ext0 = paramBoxWorldFloorExtents(box)
assert(Math.abs(ext0.maxX - ext0.minX - 6) < 0.05, `width ~6, got ${ext0.maxX - ext0.minX}`)
// editor depth along +z → world −z flip; extent magnitude still depth
assert(Math.abs(ext0.maxZ - ext0.minZ - 4) < 0.05, `depth ~4, got ${ext0.maxZ - ext0.minZ}`)

// Change width — floor + walls regenerate
updateEcoParamBox('spine-box', { width: 10 })
const boxW = getEcoParamBoxesState().boxes[0]
const extW = paramBoxWorldFloorExtents(boxW)
assert(Math.abs(extW.maxX - extW.minX - 10) < 0.05, `width follows → ${extW.maxX - extW.minX}`)

// Change height — solid tops follow
updateEcoParamBox('spine-box', { height: 4.2 })
const walkH = paramBoxWalk(getEcoParamBoxesState().boxes[0])
assert(
  walkH.solids.every((s) => Math.abs(s.top - 4.2) < 1e-9),
  `wall tops follow height, got ${walkH.solids[0]?.top}`,
)

// Change door center — gap still two solids, nodes rebuild
updateEcoParamBox('spine-box', { doorCenter: 2 })
const nodes = paramBoxToNodes(getEcoParamBoxesState().boxes[0])
assert(nodes.doorS.position[0] !== box.doorCenter, 'door localX rebuilt')
const walkD = paramBoxWalk(getEcoParamBoxesState().boxes[0])
assert(walkD.solids.filter((s) => s.name.startsWith('wall:wS')).length === 2, 'door still a gap')

// Change floorTop
updateEcoParamBox('spine-box', { floorTop: 0.4 })
const walkF = paramBoxWalk(getEcoParamBoxesState().boxes[0])
assert(Math.abs(walkF.floors[0].top - 0.4) < 1e-9, 'floor top follows')

clearEcoParamBoxes()
console.log('check-h10-0 OK', {
  widthAfter: extW.maxX - extW.minX,
  heightAfter: 4.2,
  floorTopAfter: 0.4,
  doorSolids: 2,
})
