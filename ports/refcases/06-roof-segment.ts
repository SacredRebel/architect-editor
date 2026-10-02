// Reference cases for the roof segment (port note entry 6): its surface.
// cd packages/viewer && bun ../../ports/refcases/06-roof-segment.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone, calling nothing of the old editor: a line
// `K.by_equation` must give the number of the line `K` (verify.ts holds the two together).
import { roofOverlapEntryOwns } from '../../packages/core/src/lib/roof-overlap'
import { RoofNode } from '../../packages/core/src/schema/nodes/roof'
import {
  getActiveRoofHeight,
  getConicalRoofCoverage,
  getPitchFromActiveRoofHeight,
  getRoofSegmentSurfaceY,
  getRoofSegmentVisibleTopBounds,
  getSegmentSlopeFrame,
  MIN_ROOF_SEGMENT_TRIM_SPAN,
  normalizeRoofSegmentTrim,
  RoofSegmentNode,
} from '../../packages/core/src/schema/nodes/roof-segment'
import {
  getRoofModuleFaces,
  getRoofShapeRatios,
  type RoofShapeFaceVertex,
} from '../../packages/core/src/schema/nodes/roof-segment-shape'
import {
  clampRectToRoofWallFace,
  getMaxRoofRectHeightFromAnchor,
  getMaxRoofRectWidthFromAnchor,
  getRoofSegmentWallFace,
  roofFacePointToSegment,
  segmentPointToRoofWallFace,
} from '../../packages/core/src/schema/nodes/roof-segment-walls'
import { getConicalRoofPlanFootprint, getRoofSegmentPlanLinework } from '../../packages/nodes/src/roof-segment/floorplan'
import { roofSegmentMeasurementFeatures } from '../../packages/nodes/src/roof-segment/measurement'
import { getAnalyticalNormal, getDownSlopeYaw, getRoofTopSurfaceY } from '../../packages/nodes/src/shared/roof-surface'
import { num, row, title } from './_print'
import {
  conicalSides,
  coverageOf,
  downSlopeTurn,
  type Face,
  fitRect,
  helperY,
  highestFrom,
  lineworkOf,
  moduleFaces,
  nominalModule,
  normalAt,
  onWall,
  owns,
  pitchFor,
  placed,
  plain,
  planOutline,
  ridgeOf,
  type Seg,
  slopeOf,
  surfaceArea,
  surfaceY,
  topArea,
  topBounds,
  topOfFaces,
  trimOf,
  volumeFaces,
  volumesOf,
  wallPoint,
  wallProfile,
  type WallSide,
  widestFrom,
} from './_roof-segment-equations'

type V3 = RoofShapeFaceVertex
type Fields = Record<string, unknown>

const p3 = (p: { x: number; y: number; z: number }) => `(${num(p.x)}, ${num(p.y)}, ${num(p.z)})`
const faceText = (face: readonly V3[]) => face.map(p3).join(' ')
const pair = (p: readonly number[]) => `(${p.map((entry) => num(entry)).join(', ')})`

// ------------------------------------------------------------------ plain geometry on a face list
// (used on the old editor's faces; the equations' half has its own in _roof-segment-equations.ts)
function unitNormal(face: readonly V3[]): V3 {
  const [a, b, c] = [face[0]!, face[1]!, face[2]!]
  const n = {
    x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
    y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
    z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
  }
  const length = Math.hypot(n.x, n.y, n.z) || 1
  return { x: n.x / length, y: n.y / length, z: n.z / length }
}

function areaOf(face: readonly V3[]): number {
  let x = 0
  let y = 0
  let z = 0
  const a = face[0]!
  for (let i = 1; i + 1 < face.length; i += 1) {
    const b = face[i]!
    const c = face[i + 1]!
    x += (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
    y += (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
    z += (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  }
  return Math.hypot(x, y, z) / 2
}

// the area of the faces that look up (a unit normal's y above 0.02, the old editor's own test)
const roofArea = (faces: readonly V3[][]) => faces.filter((face) => unitNormal(face).y > 0.02).reduce((sum, face) => sum + areaOf(face), 0)

// edges that are not shared by exactly two faces: 0 when the list closes a volume
function openEdges(faces: readonly (readonly V3[])[]): number {
  const key = (p: V3) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`
  const uses = new Map<string, number>()
  for (const face of faces) {
    for (let i = 0; i < face.length; i += 1) {
      const a = key(face[i]!)
      const b = key(face[(i + 1) % face.length]!)
      if (a === b) continue
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`
      uses.set(edge, (uses.get(edge) ?? 0) + 1)
    }
  }
  return [...uses.values()].filter((count) => count !== 2).length
}

// the height of the highest face over a plan point that looks up, or null when none is over it
function heightOver(faces: readonly (readonly V3[])[], x: number, z: number): number | null {
  let best: number | null = null
  for (const face of faces) {
    const n = unitNormal(face)
    if (!(n.y > 0.02)) continue
    let inside = false
    let onEdge = false
    for (let i = 0, j = face.length - 1; i < face.length; j = i, i += 1) {
      const a = face[i]!
      const b = face[j]!
      const lengthSq = (b.x - a.x) ** 2 + (b.z - a.z) ** 2
      if (lengthSq <= 1e-12) continue // two corners in one place: no edge
      const cross = (z - a.z) * (b.x - a.x) - (x - a.x) * (b.z - a.z)
      const dot = (x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)
      if (Math.abs(cross) <= 1e-9 && dot >= -1e-9 && dot <= lengthSq + 1e-9) onEdge = true
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
    }
    if (!inside && !onEdge) continue
    const a = face[0]!
    const y = a.y - (n.x * (x - a.x) + n.z * (z - a.z)) / n.y
    if (best === null || y > best) best = y
  }
  return best
}

// the corners that stand at a height: at the peak's, the ridge's two ends or the one peak
function cornersAt(faces: readonly (readonly V3[])[], top: number): V3[] {
  const found: V3[] = []
  for (const p of faces.flat()) {
    if (Math.abs(p.y - top) > 1e-9) continue
    if (!found.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-9)) found.push(p)
  }
  return found.sort((a, b) => a.x - b.x || b.z - a.z)
}

const ridgeText = (points: readonly V3[]) =>
  points.length === 0
    ? 'none'
    : points.length === 1
      ? `peak ${p3(points[0]!)}`
      : `${p3(points[0]!)} to ${p3(points[1]!)} length ${num(Math.hypot(points[1]!.x - points[0]!.x, points[1]!.z - points[0]!.z))}`

const heightText = (value: number | null) => (value === null ? 'none' : num(value))

// ------------------------------------------------------------------ the old editor's surface of a segment
// its face function, called for the segment's own size (nothing added for walls, deck or covering)
function forkFaces(node: RoofSegmentNode): V3[][] {
  const frame = getSegmentSlopeFrame(node)
  const cover = getConicalRoofCoverage(node)
  return getRoofModuleFaces({
    type: node.roofType,
    w: node.width,
    d: node.depth,
    wh: node.wallHeight,
    rh: frame.activeRh,
    baseY: 0,
    insets: { dutchI: Math.min(node.width, node.depth) * node.dutchHipWidthRatio },
    baseW: node.width,
    baseD: node.depth,
    tanTheta: frame.tanTheta,
    shapeRatios: getRoofShapeRatios(node),
    dutchTopRakeThickness: node.dutchTopRakeThickness,
    conicalStartAngle: cover.startAngle,
    conicalSweepAngle: cover.sweepAngle,
  })
}

const sortRidge = (points: Face) => [...points].sort((a, b) => a.x - b.x || b.z - a.z)
const topY = (s: Seg, x: number, z: number) => topOfFaces(volumeFaces(volumesOf(s).shingleTop), x, z)

type Point = [number, number] // a plan point (x, z) of the segment

// `faces`: from which face on the list is printed (5: the faces above the eaves); null: none
function surface(key: string, fields: Fields, points: Point[], faces: number | null = 5) {
  const node = RoofSegmentNode.parse(fields)
  const mine = plain(node as unknown as Partial<Seg>)
  const theirs = forkFaces(node)
  const own = moduleFaces(nominalModule(mine))
  const rise = getActiveRoofHeight(node)
  row(`${key}.rise`, rise)
  row(`${key}.rise.by_equation`, slopeOf(mine).peak)
  // the corners that stand at the peak's height
  row(`${key}.ridge`, ridgeText(rise === 0 ? [] : cornersAt(theirs, node.wallHeight + Math.max(0.001, rise))))
  row(`${key}.ridge.by_equation`, ridgeText(sortRidge(ridgeOf(mine))))
  if (faces !== null) {
    row(`${key}.faces`, `${theirs.length}, open edges ${openEdges(theirs)}`)
    row(`${key}.faces.by_equation`, `${own.length}, open edges ${openEdges(own)}`)
    for (let i = faces; i < theirs.length; i += 1) {
      row(`${key}.face[${i}]`, faceText(theirs[i]!))
      row(`${key}.face[${i}].by_equation`, own[i] ? faceText(own[i]!) : 'none')
    }
  }
  row(`${key}.area`, roofArea(theirs))
  row(`${key}.area.by_equation`, surfaceArea(mine) ?? topArea(own))
  const line = (value: (x: number, z: number) => number | null) => points.map(([x, z]) => `(${x}, ${z}): ${heightText(value(x, z))}`).join('  ')
  row(`${key}.surface`, line((x, z) => heightOver(theirs, x, z)))
  row(`${key}.surface.by_equation`, line((x, z) => surfaceY(mine, x, z)))
  row(`${key}.helper`, line((x, z) => getRoofSegmentSurfaceY(node, x, z)))
  row(`${key}.helper.by_equation`, line((x, z) => helperY(mine, x, z)))
  row(`${key}.top`, line((x, z) => getRoofTopSurfaceY(x, z, node)))
  row(`${key}.top.by_equation`, line((x, z) => topY(mine, x, z)))
}

const TYPES = ['flat', 'gable', 'hip', 'shed', 'gambrel', 'mansard', 'dutch', 'conical'] as const
// three places in plan on the default 8 x 6: the middle, 0.5 m in from the front eave, 1 m in from the right end
const P86: Point[] = [
  [0, 0],
  [0, 2.5],
  [3, 1],
]
// and on 5 x 9: the middle, 0.5 m in from the front eave, 0.5 m in from the right side
const P59: Point[] = [
  [0, 0],
  [0, 4],
  [2, 1],
]
const OTHER = { width: 5, depth: 9, pitch: 30, wallHeight: 2.6 }

// ------------------------------------------------------------------ the cases
title('S0 what a new segment holds')
{
  const node = RoofSegmentNode.parse({})
  row('S0.type', node.roofType)
  row('S0.size', `width ${num(node.width)} depth ${num(node.depth)} wall_height ${num(node.wallHeight)} pitch_deg ${num(node.pitch)}`)
  row('S0.layers', `wall ${num(node.wallThickness)} deck ${num(node.deckThickness)} overhang ${num(node.overhang)} shingle ${num(node.shingleThickness)}`)
  row('S0.gambrel', `lower_width ${num(node.gambrelLowerWidthRatio)} lower_height ${num(node.gambrelLowerHeightRatio)}`)
  row('S0.mansard', `steep_width ${num(node.mansardSteepWidthRatio)} steep_height ${num(node.mansardSteepHeightRatio)}`)
  row('S0.dutch', `hip_width ${num(node.dutchHipWidthRatio)} hip_height ${num(node.dutchHipHeightRatio)} waist_length ${num(node.dutchWaistLengthRatio)} rake ${num(node.dutchGabletRake)} rake_thickness ${num(node.dutchTopRakeThickness)}`)
  row('S0.trim_must_leave', MIN_ROOF_SEGMENT_TRIM_SPAN)
}

title('S1 the slope table: every type at 8 x 6, 40 degrees; at 5 x 9, 30 degrees; flat pitches; a pitch from a height')
for (const [name, fields] of [
  ['8x6@40', {}],
  ['5x9@30', OTHER],
] as Array<[string, Fields]>) {
  for (const roofType of TYPES) {
    const node = RoofSegmentNode.parse({ roofType, ...fields })
    const frame = getSegmentSlopeFrame(node)
    const own = slopeOf(plain(node as unknown as Partial<Seg>))
    row(`S1.${name}.${roofType}`, `run ${num(frame.run)} rise ${num(frame.rise)} peak ${num(frame.activeRh)}`)
    row(`S1.${name}.${roofType}.by_equation`, `run ${num(own.run)} rise ${num(own.rise)} peak ${num(own.peak)}`)
  }
}
{
  const node = RoofSegmentNode.parse({ roofType: 'gable', pitch: 0 })
  const frame = getSegmentSlopeFrame(node)
  const own = slopeOf(plain(node as unknown as Partial<Seg>))
  row('S1.pitch_0.gable', `run ${num(frame.run)} rise ${num(frame.rise)} peak ${num(frame.activeRh)} tan ${num(frame.tanTheta)} cos ${num(frame.cosTheta)}`)
  row('S1.pitch_0.gable.by_equation', `run ${num(own.run)} rise ${num(own.rise)} peak ${num(own.peak)} tan ${num(own.tan)} cos ${num(own.cos)}`)
  for (const [roofType, roofHeight] of [
    ['gable', 3],
    ['shed', 3],
    ['gambrel', 3],
    ['mansard', 1.5],
    ['dutch', 3],
    ['conical', 4],
    ['flat', 3],
  ] as Array<[RoofSegmentNode['roofType'], number]>) {
    row(`S1.pitch_for_peak(${roofType}, ${roofHeight})`, getPitchFromActiveRoofHeight({ roofType, width: 8, depth: 6, roofHeight }))
    row(`S1.pitch_for_peak(${roofType}, ${roofHeight}).by_equation`, pitchFor(plain({ roofType }), roofHeight))
  }
}

title('S2 gable, 8 x 6, wall 0.5, 40 degrees: every face (0 to 4 are the box under the eaves), ridge, area, heights')
surface('S2', { roofType: 'gable' }, P86, 0)

title('S3 flat and shed, 8 x 6, wall 0.5 (the shed at 40 degrees: high at the back, z = -3)')
surface('S3.flat', { roofType: 'flat' }, P86)
surface('S3.shed', { roofType: 'shed' }, P86)
surface('S3.shed_5x9@30', { roofType: 'shed', ...OTHER }, P59, null)
surface('S3.gable_5x9@30', { roofType: 'gable', ...OTHER }, P59, null)

title('S4 hip: 8 x 6 (ridge along x), 6 x 6 (one peak), 5 x 9 at 30 degrees, wall 2.6 (ridge along z)')
surface('S4.8x6', { roofType: 'hip' }, P86)
surface('S4.6x6', { roofType: 'hip', width: 6, depth: 6 }, [
  [0, 0],
  [0, 2.5],
  [2, 1],
])
surface('S4.5x9@30', { roofType: 'hip', ...OTHER }, P59)

title('S5 gambrel, 8 x 6, 40 degrees: the kink at width ratio 0.5 (as new) and at 0.3')
surface('S5.ratio_0.5', { roofType: 'gambrel' }, P86)
surface('S5.ratio_0.3', { roofType: 'gambrel', gambrelLowerWidthRatio: 0.3 }, P86)
surface('S5.5x9@30', { roofType: 'gambrel', ...OTHER }, P59, null)
for (const ratio of [0.5, 0.3]) {
  // what the table of (2) says of the lower slope, and what the faces of (3) hold
  const node = RoofSegmentNode.parse({ roofType: 'gambrel', gambrelLowerWidthRatio: ratio })
  const mine = plain(node as unknown as Partial<Seg>)
  const frame = getSegmentSlopeFrame(node)
  const faces = forkFaces(node)
  const kink = faces[7]![2]! // the front lower slope's upper right corner
  row(`S5.kink(${ratio})`, `table run ${num(frame.run)} rise ${num(frame.rise)} faces run ${num(node.depth / 2 - kink.z)} rise ${num(kink.y - node.wallHeight)} ridge_above_kink ${num(node.wallHeight + frame.activeRh - kink.y)}`)
  const own = slopeOf(mine)
  const kz = (mine.depth / 2) * mine.gambrelLowerWidthRatio
  row(`S5.kink(${ratio}).by_equation`, `table run ${num(own.run)} rise ${num(own.rise)} faces run ${num(mine.depth / 2 - kz)} rise ${num((mine.depth / 2 - kz) * own.tan)} ridge_above_kink ${num(own.peak - (mine.depth / 2 - kz) * own.tan)}`)
}

title('S6 mansard: 8 x 6 at 40 degrees; 5 x 9 at 30 degrees (the top ridge along z); 6 x 6 (the top one peak)')
surface('S6.8x6', { roofType: 'mansard' }, P86)
surface('S6.5x9@30', { roofType: 'mansard', ...OTHER }, P59)
surface('S6.6x6', { roofType: 'mansard', width: 6, depth: 6 }, [
  [0, 0],
  [0, 2.5],
  [2, 1],
], 9)

title('S7 dutch: 8 x 6 at 40 degrees (gablet along x); 5 x 9 at 30 degrees (along z); a fourth point in the gap beside the gablet; pitch 0.02 degrees (no top is made)')
surface('S7.8x6', { roofType: 'dutch' }, [...P86, [2.6, 1.2]])
surface('S7.5x9@30', { roofType: 'dutch', ...OTHER }, [...P59, [1, 3.2]])
{
  const node = RoofSegmentNode.parse({ roofType: 'dutch', pitch: 0.02 })
  const mine = plain(node as unknown as Partial<Seg>)
  row('S7.pitch_0.02', `rise ${num(getActiveRoofHeight(node))} faces ${forkFaces(node).length}`)
  row('S7.pitch_0.02.by_equation', `rise ${num(slopeOf(mine).peak)} faces ${moduleFaces(nominalModule(mine)).length}`)
}

title('S8 conical: the whole cone on a diameter of 8; one on 5 at 30 degrees (its fourth point lies outside it); part of one (start 30 degrees, sweep +90 and -90); what is stored and what is covered')
surface('S8.whole', { roofType: 'conical' }, P86, 97)
// the true cone's surface, where the old editor has 48 flat sides
row('S8.whole.area.exact', Math.PI * 4 * Math.hypot(4, slopeOf(plain({ roofType: 'conical' })).peak))
{
  const node = RoofSegmentNode.parse({ roofType: 'conical' })
  const theirs = forkFaces(node)
  const own = moduleFaces(nominalModule(plain(node as unknown as Partial<Seg>)))
  for (const i of [0, 1, 49, 96]) {
    const text = (face: readonly V3[]) => (face.length > 4 ? `${face.length} corners, the first three ${faceText(face.slice(0, 3))}` : faceText(face))
    row(`S8.whole.face[${i}]`, text(theirs[i]!))
    row(`S8.whole.face[${i}].by_equation`, text(own[i]!))
  }
}
surface('S8.diameter_5@30', { roofType: 'conical', ...OTHER }, [
  [0, 0],
  [0, 2],
  [2, 1],
  [0, 4],
], null)
{
  // the depth is not read: a "conical" 8 wide and 3 deep is the cone on a diameter of 8
  const node = RoofSegmentNode.parse({ roofType: 'conical', width: 8, depth: 3 })
  const mine = plain(node as unknown as Partial<Seg>)
  row('S8.8_wide_3_deep', `rise ${num(getActiveRoofHeight(node))} area ${num(roofArea(forkFaces(node)))}`)
  row('S8.8_wide_3_deep.by_equation', `rise ${num(slopeOf(mine).peak)} area ${num(surfaceArea(mine) ?? Number.NaN)}`)
}
for (const sweepDeg of [90, -90]) {
  const fields = { roofType: 'conical', conicalStartAngle: Math.PI / 6, conicalSweepAngle: (sweepDeg * Math.PI) / 180 }
  const key = `S8.part(${sweepDeg})`
  surface(key, fields, [[1.5, sweepDeg > 0 ? 2 : -0.5]], 27)
  const node = RoofSegmentNode.parse(fields)
  const theirs = forkFaces(node)
  const own = moduleFaces(nominalModule(plain(node as unknown as Partial<Seg>)))
  for (const i of [1, 13, 25, 26]) {
    row(`${key}.face[${i}]`, faceText(theirs[i]!))
    row(`${key}.face[${i}].by_equation`, faceText(own[i]!))
  }
  const plan = getConicalRoofPlanFootprint(node)
  const ownPlan = planOutline(plain(node as unknown as Partial<Seg>))
  row(`${key}.plan_outline`, `${plan.length} points, the first three ${plan.slice(0, 3).map(pair).join(' ')}`)
  row(`${key}.plan_outline.by_equation`, `${ownPlan.length} points, the first three ${ownPlan.slice(0, 3).map(pair).join(' ')}`)
}
for (const [name, fields] of [
  ['nothing stored', {}],
  ['sweep 2 pi', { conicalSweepAngle: Math.PI * 2 }],
  ['sweep -1.5', { conicalStartAngle: 0.5, conicalSweepAngle: -1.5 }],
  ['whole circle asked, sweep 1 kept', { conicalFullCircle: true, conicalStartAngle: 0.5, conicalSweepAngle: 1 }],
  ['part asked, nothing stored', { conicalFullCircle: false }],
  ['sweep 0.00001', { conicalSweepAngle: 0.00001 }],
] as Array<[string, Fields]>) {
  const node = RoofSegmentNode.parse({ roofType: 'conical', ...fields })
  const cover = getConicalRoofCoverage(node)
  const own = coverageOf(plain(node as unknown as Partial<Seg>))
  const sides = (faces: readonly (readonly V3[])[]) => faces.filter((face) => unitNormal(face).y > 0.02).length
  row(`S8.covered(${name})`, `whole ${cover.fullCircle} start ${num(cover.startAngle)} sweep ${num(cover.sweepAngle)} sides ${sides(forkFaces(node))}`)
  row(`S8.covered(${name}).by_equation`, `whole ${own.full} start ${num(own.start)} sweep ${num(own.sweep)} sides ${conicalSides(own.sweep).sides}`)
}

title('S9 the way the surface faces at a plan point (for what is seated on the roof), and the turn that points down the slope')
for (const [roofType, x, z] of [
  ['gable', 0, 2.5],
  ['gable', 0, -2.5],
  ['shed', 0, 0],
  ['hip', 3, 1],
  ['gambrel', 0, 2.5],
  ['gambrel', 0, 1],
  ['mansard', 0, 2.5],
  ['mansard', 3, 1],
  ['dutch', 0, 1],
  ['dutch', 3, 1],
  ['dutch', 3.5, 2.5],
  ['conical', 3, 1],
  ['flat', 1, 1],
] as Array<[RoofSegmentNode['roofType'], number, number]>) {
  const node = RoofSegmentNode.parse({ roofType })
  const mine = plain(node as unknown as Partial<Seg>)
  const n = getAnalyticalNormal(x, z, node)
  row(`S9.${roofType}(${x}, ${z})`, `normal ${p3(n)} turn ${num(getDownSlopeYaw(x, z, node))}`)
  row(`S9.${roofType}(${x}, ${z}).by_equation`, `normal ${p3(normalAt(mine, x, z))} turn ${num(downSlopeTurn(mine, x, z))}`)
}

title('S10 the walls under the roof: each face as an outline (u along it, v up), 8 x 6, wall 2.6, 40 degrees')
for (const [roofType, sides] of [
  ['gable', ['front', 'right']],
  ['gambrel', ['right']],
  ['shed', ['front', 'back', 'right', 'left']],
  ['dutch', ['front', 'right']],
  ['hip', ['right']],
] as Array<[RoofSegmentNode['roofType'], WallSide[]]>) {
  const node = RoofSegmentNode.parse({ roofType, wallHeight: 2.6 })
  const mine = plain(node as unknown as Partial<Seg>)
  for (const side of sides) {
    const face = getRoofSegmentWallFace(node, side)
    row(`S10.${roofType}.${side}`, `length ${num(face.length)} outline ${face.profile.map(pair).join(' ')}`)
    const own = wallProfile(mine, side)
    row(`S10.${roofType}.${side}.by_equation`, `length ${num(Math.max(...own.map((p) => p[0])))} outline ${own.map(pair).join(' ')}`)
  }
}
{
  const node = RoofSegmentNode.parse({ roofType: 'gable', wallHeight: 0 })
  const mine = plain(node as unknown as Partial<Seg>)
  row('S10.gable_wall_0.right', `outline ${getRoofSegmentWallFace(node, 'right').profile.map(pair).join(' ')}`)
  row('S10.gable_wall_0.right.by_equation', `outline ${wallProfile(mine, 'right').map(pair).join(' ')}`)
}
{
  const node = RoofSegmentNode.parse({ roofType: 'gable', wallHeight: 2.6 })
  const mine = plain(node as unknown as Partial<Seg>)
  for (const side of ['front', 'back', 'right', 'left'] as WallSide[]) {
    // a place on the face: 2 m along, 1 m up, on the wall's outer plane (0.05 out from its middle)
    const there = roofFacePointToSegment(node, side, [2, 1, 0.05])
    const back = segmentPointToRoofWallFace(node, side, there)
    row(`S10.place.${side}`, `in the segment ${pair(there)} read back u ${num(back.u)} v ${num(back.v)} out ${num(back.dist)}`)
    const own = wallPoint(mine, side, 2, 1, 0.05)
    const ownBack = onWall(mine, side, own)
    row(`S10.place.${side}.by_equation`, `in the segment ${p3(own)} read back u ${num(ownBack.u)} v ${num(ownBack.v)} out ${num(ownBack.out)}`)
  }
  // a window 1.2 x 1.0 and a door 0.9 x 2.1 kept inside the gable end
  const face = getRoofSegmentWallFace(node, 'right')
  const outline = wallProfile(mine, 'right')
  const said = (at: { u: number; v: number } | null) => (at ? `u ${num(at.u)} v ${num(at.v)}` : 'does not fit')
  for (const [name, u, v, w, h, lock] of [
    ['window in the gable', 3.05, 4, 1.2, 1, false],
    ['window too high', 3.05, 5, 1.2, 1, false],
    ['window in a corner', 0.2, 2.5, 1.2, 1, false],
    ['door at the eave', 0.2, 1.05, 0.9, 2.1, true],
    ['door too high for there', 0.2, 2, 0.9, 2.1, true],
    ['window 7 m wide', 3.05, 1, 7, 1, false],
  ] as Array<[string, number, number, number, number, boolean]>) {
    row(`S10.fit(${name})`, said(clampRectToRoofWallFace(face, u, v, w, h, { lockV: lock })))
    row(`S10.fit(${name}).by_equation`, said(fitRect(outline, u, v, w, h, lock)))
  }
  row('S10.widest_from(u 1, towards the middle, v 3, height 1)', getMaxRoofRectWidthFromAnchor(face, 1, 1, 3, 1))
  row('S10.widest_from(u 1, towards the middle, v 3, height 1).by_equation', widestFrom(outline, 1, 1, 3, 1))
  row('S10.highest_from(u 2, width 1.2, sill 1, upwards)', getMaxRoofRectHeightFromAnchor(face, 2, 1.2, 1, 1))
  row('S10.highest_from(u 2, width 1.2, sill 1, upwards).by_equation', highestFrom(outline, 2, 1.2, 1, 1))
}

title('S11 trims: the sixteen distances made to fit, and the plan box of what is seen from above')
for (const [name, size, trim] of [
  ['none', [8, 6], {}],
  ['sides too large on 4 x 3', [4, 3], { left: 3, right: 3, front: 2, back: 2 }],
  ['left 1, right 2', [8, 6], { left: 1, right: 2 }],
  ['corners front-left 4, back-right 4', [8, 6], { frontLeft: 4, backRight: 4 }],
  ['corner front-left 5 by 2, back-right 2 by 5', [8, 6], { frontLeftX: 5, frontLeftZ: 2, backRightX: 2, backRightZ: 5 }],
  ['two corners on one eave: 5 and 6 along x', [8, 6], { frontLeftX: 5, frontLeftZ: 1, frontRightX: 6, frontRightZ: 1 }],
] as Array<[string, [number, number], Record<string, number>]>) {
  const said = (t: Record<string, number>) =>
    `left ${num(t.left!)} right ${num(t.right!)} front ${num(t.front!)} back ${num(t.back!)} front_left ${num(t.frontLeftX!)} by ${num(t.frontLeftZ!)} front_right ${num(t.frontRightX!)} by ${num(t.frontRightZ!)} back_left ${num(t.backLeftX!)} by ${num(t.backLeftZ!)} back_right ${num(t.backRightX!)} by ${num(t.backRightZ!)}`
  row(`S11.fitted(${name})`, said(normalizeRoofSegmentTrim({ width: size[0], depth: size[1], trim })))
  row(`S11.fitted(${name}).by_equation`, said(trimOf(size[0], size[1], trim)))
}
for (const [name, fields, trim] of [
  ['gable, no trim', { roofType: 'gable' }, {}],
  ['hip, no trim', { roofType: 'hip' }, {}],
  ['shed, no trim', { roofType: 'shed' }, {}],
  ['flat, no trim', { roofType: 'flat' }, {}],
  ['gable, left 1, right 2', { roofType: 'gable' }, { left: 1, right: 2 }],
  ['gable, corners front-left 4, back-right 4', { roofType: 'gable', overhang: 0, wallThickness: 0, shingleThickness: 0 }, { frontLeft: 4, backRight: 4 }],
] as Array<[string, Fields, Record<string, number>]>) {
  const node = RoofSegmentNode.parse({ ...fields, trim })
  const said = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => `x ${num(b.minX)}..${num(b.maxX)} z ${num(b.minZ)}..${num(b.maxZ)}`
  row(`S11.seen_from_above(${name})`, said(getRoofSegmentVisibleTopBounds(node)))
  row(`S11.seen_from_above(${name}).by_equation`, said(topBounds(plain(node as unknown as Partial<Seg>), trim)))
}

title('S12 a segment in its roof: a hip 8 x 6 at (2, 0, -1) turned 30 degrees, in a roof at (10, 3, 5) turned 90 degrees; and which of two segments owns an overlap')
{
  const roof = RoofNode.parse({ id: 'roof_a', position: [10, 3, 5], rotation: Math.PI / 2, children: ['rseg_a'] })
  const node = RoofSegmentNode.parse({ id: 'rseg_a', parentId: roof.id, roofType: 'hip', position: [2, 0, -1], rotation: Math.PI / 6 })
  const mine = plain(node as unknown as Partial<Seg>)
  const plan = getRoofSegmentPlanLinework(node)
  const own = lineworkOf(mine)
  row('S12.lines', `ridges ${plan.ridges.length} hips ${plan.hips.length} breaks ${plan.breaks.length}`)
  row('S12.lines.by_equation', `ridges ${own.ridges.length} hips ${own.hips.length} breaks ${own.breaks.length}`)
  const lifted = ([x, z]: readonly number[]) => placed(placed({ x: x!, y: helperY(mine, x!, z!), z: z! }, mine.position, mine.rotation), roof.position, roof.rotation)
  const features = roofSegmentMeasurementFeatures(node, roof)
  const ownLines = [...own.ridges, ...own.hips, ...own.breaks]
  features.slice(0, 3).forEach((feature, i) => {
    if (feature.geometry.kind !== 'segment') return
    row(`S12.${feature.id}`, `${pair(feature.geometry.start)} to ${pair(feature.geometry.end)}`)
    row(`S12.${feature.id}.by_equation`, `${p3(lifted(ownLines[i]![0]))} to ${p3(lifted(ownLines[i]![1]))}`)
  })
  // the ridge as the faces hold it, set in the level's frame by (1) twice
  const built = cornersAt(forkFaces(node), node.wallHeight + getActiveRoofHeight(node)).map((p) => placed(placed(p, node.position, node.rotation), roof.position, roof.rotation))
  const ownBuilt = sortRidge(ridgeOf(mine)).map((p) => placed(placed(p, mine.position, mine.rotation), roof.position, roof.rotation))
  row('S12.ridge_as_built', `${p3(built[0]!)} to ${p3(built[1]!)}`)
  row('S12.ridge_as_built.by_equation', `${p3(ownBuilt[0]!)} to ${p3(ownBuilt[1]!)}`)
  for (const roofType of ['gable', 'gambrel', 'mansard', 'dutch', 'shed', 'conical'] as const) {
    const other = RoofSegmentNode.parse({ roofType })
    const theirs = getRoofSegmentPlanLinework(other)
    const ours = lineworkOf(plain(other as unknown as Partial<Seg>))
    const said = (lines: { ridges: readonly (readonly (readonly number[])[])[]; hips: readonly unknown[]; breaks: readonly (readonly (readonly number[])[])[] }) =>
      `ridges ${lines.ridges.map((l) => `${pair(l[0]!)}-${pair(l[1]!)}`).join(' ') || 'none'} hips ${lines.hips.length} breaks ${lines.breaks.length}${lines.breaks[0] ? `, the first ${pair(lines.breaks[0][0]!)}-${pair(lines.breaks[0][1]!)}` : ''}`
    row(`S12.lines(${roofType})`, said(theirs))
    row(`S12.lines(${roofType}).by_equation`, said(ours))
  }
}
{
  const big = { roofId: 'roof_b', segmentId: 'rseg_big', width: 10, depth: 8 }
  const small = { roofId: 'roof_a', segmentId: 'rseg_small', width: 8, depth: 5 }
  const twin = { roofId: 'roof_a', segmentId: 'rseg_twin', width: 5, depth: 8 }
  const onBig = { roofId: 'roof_c', segmentId: 'rseg_on', width: 20, depth: 20, supportRoofId: 'roof_b', supportRoofSegmentId: 'rseg_big' }
  const eq = (e: typeof big & { supportRoofId?: string; supportRoofSegmentId?: string }) => ({ roofId: e.roofId, segmentId: e.segmentId, width: e.width, depth: e.depth, onRoofId: e.supportRoofId, onSegmentId: e.supportRoofSegmentId })
  for (const [name, other, current] of [
    ['the larger owns', big, small],
    ['the smaller does not', small, big],
    ['equal areas: the earlier name owns', small, twin],
    ['equal areas: the later name does not', twin, small],
    ['a roof standing on this one never owns', onBig, big],
    ['the roof it stands on always owns', big, onBig],
  ] as Array<[string, typeof onBig, typeof onBig]>) {
    row(`S12.owns(${name})`, roofOverlapEntryOwns(other, current))
    row(`S12.owns(${name}).by_equation`, owns(eq(other), eq(current)))
  }
}
