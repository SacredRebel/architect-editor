// Reference cases for the wall (port note entry 1).
// cd packages/viewer && bun ../../ports/refcases/01-wall.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone, calling nothing of the old editor: a line
// `K.by_equation` must give the number of the line `K` (verify.ts holds the two together).
import type { WallNode } from '../../packages/core/src/schema'
import { getWallFaceBandConfig } from '../../packages/core/src/schema/nodes/wall'
import {
  getClampedWallCurveOffset,
  getMaxWallCurveOffset,
  getWallArcData,
  getWallChordFrame,
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallStraightSnapOffset,
  getWallSurfacePolygon,
  isCurvedWall,
  normalizeWallCurveOffset,
} from '../../packages/core/src/systems/wall/wall-curve'
import {
  calculateLevelMiters,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  getWallPlanFootprint,
} from '../../packages/core/src/systems/wall/wall-footprint'
import { getWallMiterBoundaryPoints } from '../../packages/core/src/systems/wall/wall-mitering'
import {
  MIN_WALL_HEIGHT,
  resolveWallEffectiveHeight,
  resolveWallTop,
} from '../../packages/core/src/systems/wall/wall-top'
import { polygonArea } from './_mesh'
import { num, pt, pts, row, title } from './_print'
import {
  arcOf,
  bandsOf,
  chordOf,
  footprintOf,
  lengthOf,
  mitresOf,
  type P,
  placeOn,
  plain,
  sagittaOf,
  topOf,
} from './_wall-equations'

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  more: Partial<WallNode> = {},
): WallNode {
  return { id, type: 'wall', parentId: 'level_a', children: [], start, end, ...more } as WallNode
}

const shown = (p: P | undefined) => (p ? pt(p) : 'none')

// ------------------------------------------------------------------ the cases
title('W0 constants')
row('W0.default_thickness', DEFAULT_WALL_THICKNESS)
row('W0.default_height', DEFAULT_WALL_HEIGHT)
row('W0.min_height', MIN_WALL_HEIGHT)

title('W1 a straight wall alone: (0, 0) to (4, 0), thickness 0.2')
{
  const a = wall('wall_a', [0, 0], [4, 0], { thickness: 0.2 })
  const mine = plain(a)
  const chord = getWallChordFrame(a)
  row('W1.chord_length', chord.length)
  row('W1.chord_length.by_equation', chordOf(mine).c)
  row('W1.tangent', pt(chord.tangent))
  row('W1.normal', pt(chord.normal))
  row('W1.normal.by_equation', pt(chordOf(mine).n))
  row('W1.curved', isCurvedWall(a))
  row('W1.length', getWallCurveLength(a))
  row('W1.length.by_equation', lengthOf(mine))
  const polygon = getWallPlanFootprint(a, calculateLevelMiters([a]))
  row('W1.footprint', pts(polygon))
  row('W1.footprint.by_equation', pts(footprintOf(mine, mitresOf([mine]))))
  row('W1.footprint_area', polygonArea(polygon))
}

title('W2 an L corner: A (0, 0) to (4, 0) thickness 0.2; B (4, 0) to (4, 3) thickness 0.3')
{
  const a = wall('wall_a', [0, 0], [4, 0], { thickness: 0.2 })
  const b = wall('wall_b', [4, 0], [4, 3], { thickness: 0.3 })
  const miters = calculateLevelMiters([a, b])
  const mine = mitresOf([plain(a), plain(b)])
  row('W2.junctions', miters.junctions.size)
  const at = miters.junctionData.get('4000,0')
  row('W2.A.left', shown(at?.get('wall_a')?.left))
  row('W2.A.left.by_equation', shown(mine.get('wall_a')?.endRight))
  row('W2.A.right', shown(at?.get('wall_a')?.right))
  row('W2.A.right.by_equation', shown(mine.get('wall_a')?.endLeft))
  row('W2.B.left', shown(at?.get('wall_b')?.left))
  row('W2.B.left.by_equation', shown(mine.get('wall_b')?.startLeft))
  row('W2.B.right', shown(at?.get('wall_b')?.right))
  row('W2.B.right.by_equation', shown(mine.get('wall_b')?.startRight))
  row('W2.A.footprint', pts(getWallPlanFootprint(a, miters)))
  row('W2.A.footprint.by_equation', pts(footprintOf(plain(a), mine)))
  row('W2.B.footprint', pts(getWallPlanFootprint(b, miters)))
  row('W2.B.footprint.by_equation', pts(footprintOf(plain(b), mine)))
  row('W2.A.footprint_area', polygonArea(getWallPlanFootprint(a, miters)))
  row('W2.B.footprint_area', polygonArea(getWallPlanFootprint(b, miters)))
}

title('W3 a bent wall: (0, 0) to (4, 0), sagitta +1, thickness 0.2')
{
  const a = wall('wall_a', [0, 0], [4, 0], { thickness: 0.2, curveOffset: 1 })
  const mine = plain(a)
  const arc = getWallArcData(a)
  const own = arcOf(mine)
  row('W3.radius', arc?.radius ?? Number.NaN)
  row('W3.radius.by_equation', own?.R ?? Number.NaN)
  row('W3.centre', shown(arc?.center))
  row('W3.centre.by_equation', shown(own?.C))
  row('W3.start_angle', arc?.startAngle ?? Number.NaN)
  row('W3.start_angle.by_equation', own?.theta0 ?? Number.NaN)
  row('W3.delta', arc?.delta ?? Number.NaN)
  row('W3.delta.by_equation', own?.delta ?? Number.NaN)
  row('W3.direction', arc?.direction ?? Number.NaN)
  for (const t of [0, 0.25, 0.5, 1]) {
    const frame = getWallCurveFrameAt(a, t)
    const here = placeOn(mine, t)
    row(`W3.frame(${t})`, `point ${pt(frame.point)} tangent ${pt(frame.tangent)} normal ${pt(frame.normal)}`)
    row(`W3.frame(${t}).by_equation`, `point ${pt(here.P)} tangent ${pt(here.T)} normal ${pt(here.N)}`)
  }
  row('W3.length', getWallCurveLength(a))
  row('W3.length.by_equation', lengthOf(mine))
  row('W3.length.exact', (arc?.radius ?? Number.NaN) * Math.abs(arc?.delta ?? Number.NaN))
  const polygon = getWallPlanFootprint(a, calculateLevelMiters([a]))
  const ownPolygon = footprintOf(mine, mitresOf([mine]))
  row('W3.footprint_points', polygon.length)
  row('W3.footprint_points.by_equation', ownPolygon.length)
  row('W3.footprint_area', polygonArea(polygon))
  row('W3.footprint_area.by_equation', polygonArea(ownPolygon))
  row('W3.footprint_area.exact', (arc?.radius ?? Number.NaN) * Math.abs(arc?.delta ?? Number.NaN) * 0.2)
  row('W3.footprint_first_three', pts(polygon.slice(0, 3)))
  row('W3.footprint_first_three.by_equation', pts(ownPolygon.slice(0, 3)))
  row('W3.footprint_point_12', pt(polygon[12]!))
  row('W3.footprint_last', pt(polygon[polygon.length - 1]!))
  const mirrored = wall('wall_m', [0, 0], [4, 0], { thickness: 0.2, curveOffset: -1 })
  const other = getWallArcData(mirrored)
  const ownOther = arcOf(plain(mirrored))
  row('W3.mirrored.centre', shown(other?.center))
  row('W3.mirrored.centre.by_equation', shown(ownOther?.C))
  row('W3.mirrored.delta', other?.delta ?? Number.NaN)
  row('W3.mirrored.delta.by_equation', ownOther?.delta ?? Number.NaN)
  row('W3.mirrored.midpoint', pt(getWallCurveFrameAt(mirrored, 0.5).point))
  row('W3.mirrored.midpoint.by_equation', pt(placeOn(plain(mirrored), 0.5).P))
}

title('W4 the limits of the sagitta on a chord of 4 m, of 0.8 m and of 10 m')
{
  const a = wall('wall_a', [0, 0], [4, 0])
  row('W4.max_offset', getMaxWallCurveOffset(a))
  row('W4.straight_snap', getWallStraightSnapOffset(a))
  for (const offset of [0.01, 0.02, 0.021, 1.5, 3, -3]) {
    row(`W4.normalised(${offset})`, normalizeWallCurveOffset(a, offset))
    row(`W4.normalised(${offset}).by_equation`, sagittaOf(plain(a), offset))
  }
  const short = wall('wall_s', [0, 0], [0.8, 0], { curveOffset: 0.004 })
  row('W4.short.straight_snap', getWallStraightSnapOffset(short))
  row('W4.short.clamped(0.004)', getClampedWallCurveOffset(short))
  row('W4.short.clamped(0.004).by_equation', sagittaOf(plain(short)))
  const long = wall('wall_l', [0, 0], [10, 0])
  row('W4.long.straight_snap', getWallStraightSnapOffset(long))
}

title('W5 a T: A (0, 0) to (6, 0) thickness 0.2 passes; B (3, 0) to (3, 2) thickness 0.1 ends on it')
{
  const a = wall('wall_a', [0, 0], [6, 0], { thickness: 0.2 })
  const b = wall('wall_b', [3, 0], [3, 2], { thickness: 0.1 })
  const miters = calculateLevelMiters([a, b])
  const mine = mitresOf([plain(a), plain(b)])
  const at = miters.junctionData.get('3000,0')
  row('W5.A.has_points', at?.has('wall_a') ?? false)
  row('W5.A.has_points.by_equation', mine.has('wall_a'))
  row('W5.B.left', shown(at?.get('wall_b')?.left))
  row('W5.B.left.by_equation', shown(mine.get('wall_b')?.startLeft))
  row('W5.B.right', shown(at?.get('wall_b')?.right))
  row('W5.B.right.by_equation', shown(mine.get('wall_b')?.startRight))
  row('W5.A.footprint', pts(getWallPlanFootprint(a, miters)))
  row('W5.A.footprint.by_equation', pts(footprintOf(plain(a), mine)))
  row('W5.B.footprint', pts(getWallPlanFootprint(b, miters)))
  row('W5.B.footprint.by_equation', pts(footprintOf(plain(b), mine)))
}

title('W6 the mitre limit: A (0, 0) to (4, 0); B from (4, 0) back to (0, d), both 0.1 thick')
for (const d of [2.0, 0.9, 0.8, 0.4]) {
  const a = wall('wall_a', [0, 0], [4, 0], { thickness: 0.1 })
  const b = wall('wall_b', [4, 0], [0, d], { thickness: 0.1 })
  const at = calculateLevelMiters([a, b]).junctionData.get('4000,0')
  const mine = mitresOf([plain(a), plain(b)]).get('wall_a')
  const between = (Math.atan2(d, 4) * 180) / Math.PI
  const key = `W6.between(${num(between, 3)} deg)`
  const said = (l: P | undefined, r: P | undefined) => `A.left ${l ? pt(l) : 'square'} A.right ${r ? pt(r) : 'square'}`
  row(key, said(at?.get('wall_a')?.left, at?.get('wall_a')?.right))
  row(`${key}.by_equation`, said(mine?.endRight, mine?.endLeft))
}
{
  const a = wall('wall_a', [0, 0], [4, 0], { thickness: 0.1 })
  const b = wall('wall_b', [4, 0], [8, 0], { thickness: 0.1 })
  const at = calculateLevelMiters([a, b]).junctionData.get('4000,0')
  row('W6.in_line', `A has points ${Boolean(at?.get('wall_a')?.left || at?.get('wall_a')?.right)}`)
  row('W6.in_line.by_equation', `A has points ${mitresOf([plain(a), plain(b)]).has('wall_a')}`)
}

title('W7 three walls at one point: east, north and south-west, all 0.2 thick')
{
  const a = wall('wall_a', [0, 0], [3, 0], { thickness: 0.2 })
  const b = wall('wall_b', [0, 0], [0, 3], { thickness: 0.2 })
  const c = wall('wall_c', [-2, -2], [0, 0], { thickness: 0.2 })
  const miters = calculateLevelMiters([a, b, c])
  const mine = mitresOf([plain(a), plain(b), plain(c)])
  const at = miters.junctionData.get('0,0')
  row('W7.wall_a', `left ${shown(at?.get('wall_a')?.left)} right ${shown(at?.get('wall_a')?.right)}`)
  row('W7.wall_a.by_equation', `left ${shown(mine.get('wall_a')?.startLeft)} right ${shown(mine.get('wall_a')?.startRight)}`)
  row('W7.wall_b', `left ${shown(at?.get('wall_b')?.left)} right ${shown(at?.get('wall_b')?.right)}`)
  row('W7.wall_b.by_equation', `left ${shown(mine.get('wall_b')?.startLeft)} right ${shown(mine.get('wall_b')?.startRight)}`)
  row('W7.wall_c', `left ${shown(at?.get('wall_c')?.left)} right ${shown(at?.get('wall_c')?.right)}`)
  row('W7.wall_c.by_equation', `left ${shown(mine.get('wall_c')?.endRight)} right ${shown(mine.get('wall_c')?.endLeft)}`)
  row('W7.C.footprint', pts(getWallPlanFootprint(c, miters)))
  row('W7.C.footprint.by_equation', pts(footprintOf(plain(c), mine)))
}

title('W8 a bent wall meeting a straight one: A (0, 0) to (4, 0) sagitta 0.5; B (4, 0) to (4, 3); both 0.2')
{
  const a = wall('wall_a', [0, 0], [4, 0], { thickness: 0.2, curveOffset: 0.5 })
  const b = wall('wall_b', [4, 0], [4, 3], { thickness: 0.2 })
  const miters = calculateLevelMiters([a, b])
  const mine = mitresOf([plain(a), plain(b)])
  const ends = getWallMiterBoundaryPoints(a, miters)
  row('W8.A.end_tangent', pt(getWallCurveFrameAt(a, 1).tangent))
  row('W8.A.end_tangent.by_equation', pt(placeOn(plain(a), 1).T))
  row('W8.A.end_left', shown(ends?.endLeft))
  row('W8.A.end_left.by_equation', shown(mine.get('wall_a')?.endLeft))
  row('W8.A.end_right', shown(ends?.endRight))
  row('W8.A.end_right.by_equation', shown(mine.get('wall_a')?.endRight))
  row('W8.A.start_left', shown(ends?.startLeft))
  const polygon = getWallSurfacePolygon(a, 24, ends ?? undefined)
  const ownPolygon = footprintOf(plain(a), mine)
  row('W8.A.footprint_points', polygon.length)
  row('W8.A.footprint_point_24', pt(polygon[24]!))
  row('W8.A.footprint_point_24.by_equation', pt(ownPolygon[24]!))
  row('W8.A.footprint_point_25', pt(polygon[25]!))
  row('W8.A.footprint_point_25.by_equation', pt(ownPolygon[25]!))
  row('W8.A.footprint_area', polygonArea(polygon))
  row('W8.A.footprint_area.by_equation', polygonArea(ownPolygon))
}

title('W9 where the top is: storey 2.7 m; a wall with no height, one of 1.1 m, one of 1.1 m on the ground')
for (const base of [0, 0.15, -0.4]) {
  const cases: Array<[string, number | undefined, boolean]> = [
    ['no_height', undefined, false],
    ['height_1.1', 1.1, false],
    ['on_ground_1.1', 1.1, true],
  ]
  for (const [name, g, onGround] of cases) {
    const node = { height: g, supportSlabId: onGround ? 'ground' : undefined }
    const key = `W9.${name}.base(${base})`
    row(key, `top ${num(resolveWallTop(node, 2.7, base))} body ${num(resolveWallEffectiveHeight(node, 2.7, base))}`)
    row(`${key}.by_equation`, `top ${num(topOf(2.7, base, g, onGround))} body ${num(topOf(2.7, base, g, onGround) - base)}`)
  }
}

title('W10 face bands: 1 to 4 bands on a wall 2.5 m high, and 4 bands squeezed into 1.2 m')
for (const [W, count] of [[2.5, 1], [2.5, 2], [2.5, 3], [2.5, 4], [1.2, 4]] as Array<[number, number]>) {
  const bands = getWallFaceBandConfig(
    { height: W, faceBands: { enabled: count > 1, count, lowerHeight: 0.84, middleHeight: 0.61, upperHeight: 0.61 } },
    W,
  )
  const mine = bandsOf(W, count)
  const key = `W10.wall(${W}).bands(${count})`
  row(key, `lower_top ${num(bands.lowerTop)} middle_top ${num(bands.middleTop)} upper_top ${num(bands.upperTop)}`)
  row(`${key}.by_equation`, `lower_top ${num(mine.lowerTop)} middle_top ${num(mine.middleTop)} upper_top ${num(mine.upperTop)}`)
}
