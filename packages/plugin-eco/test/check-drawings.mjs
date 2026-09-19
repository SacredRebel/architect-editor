/**
 * F6 acceptance: plan at 1:100 of a 20 m building measures 20 cm on paper
 * at the stated DPI, ± 1 mm.
 * Usage: bun packages/plugin-eco/test/check-drawings.mjs
 */
import {
  boundsFromNodes,
  layoutOrthoDrawing,
  paperCmToPx,
  planStrokesFromNodes,
  pxToleranceForMm,
  worldMToPaperCm,
} from '../src/eco-drawings.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** 20 m × 10 m box in plan. */
function makeBuilding20m() {
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

const nodes = makeBuilding20m()
const bounds = boundsFromNodes(nodes)
assert(Math.abs(bounds.maxX - bounds.minX - 20) < 1e-9, 'building not 20 m wide')
assert(Math.abs(bounds.maxZ - bounds.minZ - 10) < 1e-9, 'building not 10 m deep')

const scale = 100
const dpi = 150
const paperCm = worldMToPaperCm(20, scale)
assert(Math.abs(paperCm - 20) < 1e-9, `1:100 of 20 m should be 20 cm paper, got ${paperCm}`)

const layout = layoutOrthoDrawing({ kind: 'plan', bounds, scale, dpi, marginCm: 0 })
assert(
  Math.abs(layout.longSidePaperCm - 20) <= 0.1,
  `long side paper ${layout.longSidePaperCm} cm not within ±1 mm of 20 cm`,
)

const expectedPx = paperCmToPx(20, dpi)
const tol = pxToleranceForMm(dpi, 1)
assert(
  Math.abs(layout.widthPx - expectedPx) <= tol + 0.5,
  `widthPx ${layout.widthPx} vs expected ${expectedPx} (tol ${tol})`,
)

const strokes = planStrokesFromNodes(nodes)
assert(strokes.length >= 4, 'expected wall/slab strokes')

// Elevations also lay out without throw
for (const kind of ['elevation-n', 'elevation-s', 'elevation-e', 'elevation-w', 'section']) {
  const L = layoutOrthoDrawing({ kind, bounds, scale, dpi })
  assert(L.widthPx > 0 && L.heightPx > 0, `${kind} empty`)
}

console.log('check-drawings OK', {
  longSidePaperCm: layout.longSidePaperCm,
  widthPx: layout.widthPx,
  expectedPx,
  tolMmPx: tol,
  dpi,
  scale: `1:${scale}`,
})
