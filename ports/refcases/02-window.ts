// Reference cases for the window (port note entry 2): where it sits on its wall, and the hole.
// cd packages/viewer && bun ../../ports/refcases/02-window.ts
//
// Two halves, as in 01-wall.ts. The first calls the old editor's own functions. The second works
// the same things out again from the port note's equations alone (_window-equations.ts calls
// nothing of the old editor): a line `K.by_equation` must give the number of the line `K`.
import { WallNode, WindowNode } from '@pascal-app/core'
import type * as THREE from 'three'
import { projectWallLocalPointToPlan } from '../../packages/nodes/src/shared/wall-attach-target'
import {
  clampToWall,
  DEFAULT_WINDOW_SILL_M,
  hasWallChildOverlap,
  wallLocalToWorld,
} from '../../packages/nodes/src/window/window-math'
import {
  buildOpeningCutoutGeometry,
  buildOpeningCutoutShape,
  getOpeningCutoutBottomPadding,
  getOpeningCutoutProxyDepth,
  hasFlatOpeningCutoutBottom,
} from '../../packages/viewer/src/systems/wall/opening-cutout-geometry'
import { meshFacts, polygonArea } from './_mesh'
import { num, pt, pts, row, title } from './_print'
import {
  archChordFactor,
  archOutline,
  archRise,
  areaOf,
  bevelOf,
  boxOf,
  flatBottom,
  FRESH_SILL,
  holeOutline,
  inPlan,
  overlaps,
  padding,
  placeWithin,
  quarterChordFactor,
  radiiOf,
  rectangleOutline,
  rectAt,
  roundedOutline,
  type Rect,
  type XY,
} from './_window-equations'

// ------------------------------------------------------------------ reading what the fork made
// an outline's corners: points that repeat the one before (or the first) are one corner
function corners(points: readonly XY[]): XY[] {
  const out: XY[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) out.push({ x: p.x, y: p.y })
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (first && last && out.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) <= 1e-9) out.pop()
  return out
}

// the four radii of a rounded outline, read off where its straight top and bottom runs end
function radiiFrom(points: readonly XY[], rect: Rect): string {
  const on = (y: number) => points.filter((p) => Math.abs(p.y - y) < 1e-9).map((p) => p.x)
  const bottom = on(rect.bottom)
  const top = on(rect.top)
  return [
    Math.min(...top) - rect.left,
    rect.right - Math.max(...top),
    rect.right - Math.max(...bottom),
    Math.min(...bottom) - rect.left,
  ]
    .map((value) => num(value))
    .join(' ')
}

// the area of the outline a closed mesh has where the plane z = 0 cuts it
function sectionArea(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : position.count
  const at = (i: number): [number, number, number] => {
    const v = index ? index.getX(i) : i
    return [position.getX(v), position.getY(v), position.getZ(v)]
  }
  let twice = 0
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const tri = [at(offset), at(offset + 1), at(offset + 2)] as const
    const cuts: Array<[number, number]> = []
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k]!
      const b = tri[(k + 1) % 3]!
      if ((a[2] < 0 && b[2] > 0) || (a[2] > 0 && b[2] < 0)) {
        const s = a[2] / (a[2] - b[2])
        cuts.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s])
      }
    }
    if (cuts.length !== 2) continue
    const [a, b, c] = tri
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    // the piece of outline, taken so that the triangle's own normal is on its right
    let [p, q] = cuts as [[number, number], [number, number]]
    if ((q[0] - p[0]) * -ny + (q[1] - p[1]) * nx < 0) [p, q] = [q, p]
    twice += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(twice) / 2
}

function cutterBox(geometry: THREE.BufferGeometry): string {
  const f = meshFacts(geometry)
  return `x ${num(f.min[0])}..${num(f.max[0])} y ${num(f.min[1])}..${num(f.max[1])} z ${num(f.min[2])}..${num(f.max[2])}`
}

// the same box from an outline and the depth the cutter has (2 T, and the bevel past each face)
function boxSaid(outline: readonly XY[], T: number, bevel: number): string {
  const b = boxOf(outline)
  return `x ${num(b.left)}..${num(b.right)} y ${num(b.bottom)}..${num(b.top)} z ${num(-T - bevel)}..${num(T + bevel)}`
}

const RECT: Rect = { left: 1.4, right: 2.6, bottom: 1.0, top: 2.0 } // a 1.2 x 1.0 opening
const at = (more: Record<string, unknown> = {}) =>
  WindowNode.parse({ id: 'window_h', position: [2, 1.5, 0], width: 1.2, height: 1.0, ...more })

// ------------------------------------------------------------------ the cases
title('H0 what a window is when nothing is given, and the sill a fresh one gets')
{
  const d = WindowNode.parse({ id: 'window_h0' })
  row('H0.size', `${num(d.width)} x ${num(d.height)}`)
  row('H0.position', pt(d.position))
  row('H0.kind', `${d.openingKind}, ${d.windowType}, ${d.openingShape}, radii ${d.openingRadiusMode}`)
  row('H0.arch_height', d.archHeight)
  row('H0.corner_radius', d.cornerRadius)
  row('H0.corner_radii', d.openingCornerRadii.map((value) => num(value)).join(' '))
  row('H0.reveal_radius', d.openingRevealRadius)
  row('H0.frame', `thickness ${num(d.frameThickness)} depth ${num(d.frameDepth)}`)
  row('H0.grid', `columns ${d.columnRatios.map((v) => num(v)).join(' ')} rows ${d.rowRatios.map((v) => num(v)).join(' ')}`)
  row('H0.dividers', `column ${num(d.columnDividerThickness)} row ${num(d.rowDividerThickness)}`)
  row('H0.sill', `${d.sill} depth ${num(d.sillDepth)} thickness ${num(d.sillThickness)}`)
  row('H0.operation', `state ${num(d.operationState)}, awning ${d.awningDirection}, casement ${d.casementStyle}, hinges ${d.hingesSide}`)
  row('H0.fresh_sill', DEFAULT_WINDOW_SILL_M)
  row('H0.fresh_sill.by_equation', FRESH_SILL)
  row('H0.fresh_centre_height', DEFAULT_WINDOW_SILL_M + d.height / 2)
  row('H0.fresh_centre_height.by_equation', FRESH_SILL + 1.5 / 2)
}

title('H1 where it sits: a wall from (1, 2) to (4, 6); a window 2.5 m along it, its middle 1.25 m up')
{
  const wall = WallNode.parse({ id: 'wall_h1', start: [1, 2], end: [4, 6], thickness: 0.2, height: 2.5 })
  const S = { x: 1, y: 2 }
  const E = { x: 4, y: 6 }
  row('H1.centre_in_plan', pt(projectWallLocalPointToPlan(wall, 2.5)))
  row('H1.centre_in_plan.by_equation', pt(inPlan(S, E, 2.5)))
  row('H1.0.075_to_the_front', pt(projectWallLocalPointToPlan(wall, 2.5, 0.075)))
  row('H1.0.075_to_the_front.by_equation', pt(inPlan(S, E, 2.5, 0.075)))
  // the wall stands on a floor 0.15 m up: (u, height above the level, v)
  row('H1.in_the_level', pt(wallLocalToWorld(wall, 2.5, 1.25, 0, 0.15)))
  const c = inPlan(S, E, 2.5)
  row('H1.in_the_level.by_equation', pt([c.x, 0.15 + 1.25, c.y]))
}

title('H2 the limits of the place on that wall (5 m long, 2.5 m high): the middle asked for; width x height')
{
  const wall = WallNode.parse({ id: 'wall_h2', start: [1, 2], end: [4, 6], thickness: 0.2, height: 2.5 })
  const nodes = { [wall.id]: wall } as never
  for (const [x, y, w, h] of [
    [2.5, 1.25, 1.5, 1.5],
    [0.2, 0.1, 1.5, 1.5],
    [9, 9, 1.5, 1.5],
    [2.5, 1.25, 6, 4],
  ] as Array<[number, number, number, number]>) {
    const kept = clampToWall(wall, x, y, w, h, nodes)
    const mine = placeWithin(5, 2.5, x, y, w, h)
    row(`H2.place(${x}, ${y}; ${w} x ${h})`, pt([kept.clampedX, kept.clampedY]))
    row(`H2.place(${x}, ${y}; ${w} x ${h}).by_equation`, pt([mine.x, mine.y]))
  }
}

title('H3 two openings on one wall: a window 1 x 1 with its middle at (1, 1.25); a second 1 x 1 tried at five places')
{
  const wall = WallNode.parse({ id: 'wall_h3', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  const first = WindowNode.parse({ id: 'window_h3', wallId: wall.id, position: [1, 1.25, 0], width: 1, height: 1 })
  const nodes = { [wall.id]: { ...wall, children: [first.id] }, [first.id]: first } as never
  for (const [x, y] of [
    [1.5, 1.25],
    [1.999, 1.25],
    [2, 1.25],
    [1, 2.2],
    [1, 2.25],
  ] as Array<[number, number]>) {
    row(`H3.overlap(${x}, ${y})`, hasWallChildOverlap(wall.id, nodes, x, y, 1, 1))
    row(`H3.overlap(${x}, ${y}).by_equation`, overlaps(rectAt(x, y, 1, 1), rectAt(1, 1.25, 1, 1)))
  }
  row('H3.wall_not_found', hasWallChildOverlap('wall_none', nodes, 3, 1.25, 1, 1))
}

title('H4 the rectangle: an opening 1.2 x 1.0 from (1.4, 1.0) to (2.6, 2.0) in a wall 0.2 thick; and the 0.02 a cutter goes lower when the opening starts below 0.005 and its bottom is straight')
{
  const window = at()
  const points = corners(buildOpeningCutoutShape(window, RECT).getPoints())
  const mine = rectangleOutline(RECT)
  row('H4.rectangle.corners', pts(points))
  row('H4.rectangle.corners.by_equation', pts(mine))
  row('H4.rectangle.area', polygonArea(points))
  row('H4.rectangle.area.by_equation', areaOf(mine))
  const geometry = buildOpeningCutoutGeometry(window, RECT, 0.4, 0.2)
  row('H4.rectangle.cutter_box', cutterBox(geometry))
  row('H4.rectangle.cutter_box.by_equation', boxSaid(mine, 0.2, 0))
  row('H4.rectangle.cutter_section', sectionArea(geometry))
  row('H4.rectangle.cutter_section.by_equation', areaOf(holeOutline(window, 0.2, RECT)))
  geometry.dispose()
  for (const bottom of [-0.1, 0, 0.004, 0.005, 0.9]) {
    row(`H4.rectangle.lowered(bottom ${bottom})`, getOpeningCutoutBottomPadding(at(), bottom))
    row(`H4.rectangle.lowered(bottom ${bottom}).by_equation`, padding(at(), bottom))
  }
  for (const [name, more] of [
    ['arch', { openingShape: 'arch' }],
    ['rounded', { openingShape: 'rounded' }],
    ['rounded_radius_0', { openingShape: 'rounded', cornerRadius: 0 }],
    ['rounded_each_0.2_0.2_0_0', { openingShape: 'rounded', openingRadiusMode: 'individual', openingCornerRadii: [0.2, 0.2, 0, 0] }],
    ['rounded_each_0_0_0.2_0', { openingShape: 'rounded', openingRadiusMode: 'individual', openingCornerRadii: [0, 0, 0.2, 0] }],
  ] as Array<[string, Record<string, unknown>]>) {
    const window = at(more)
    row(`H4.${name}`, `straight bottom ${hasFlatOpeningCutoutBottom(window)}, lowered ${num(getOpeningCutoutBottomPadding(window, 0))}`)
    row(`H4.${name}.by_equation`, `straight bottom ${flatBottom(window)}, lowered ${num(padding(window, 0))}`)
  }
}

title('H5 the arch: the same opening with an arch 0.35 high; then where its sides end for arch heights 0, 0.6, 5 and none')
{
  const window = at({ openingShape: 'arch' })
  const points = corners(buildOpeningCutoutShape(window, RECT).getPoints())
  const mine = archOutline(RECT, archRise(0.35, 1.2, 1.0))
  row('H5.corners', points.length)
  row('H5.corners.by_equation', mine.length)
  row('H5.first_five', pts(points.slice(0, 5)))
  row('H5.first_five.by_equation', pts(mine.slice(0, 5)))
  row('H5.crown', pt(points[18]!))
  row('H5.crown.by_equation', pt(mine[18]!))
  row('H5.last_two', pts(points.slice(-2)))
  row('H5.last_two.by_equation', pts(mine.slice(-2)))
  row('H5.area', polygonArea(points))
  row('H5.area.by_equation', areaOf(mine))
  row('H5.area.exact', 1.2 * 0.65 + (Math.PI * 0.6 * 0.35) / 2)
  // K: what the 32 chords leave of the half ellipse, area = W (H - a) + a W K
  row('H5.chord_factor', (polygonArea(points) - 1.2 * 0.65) / (0.35 * 1.2))
  row('H5.chord_factor.by_equation', archChordFactor())
  row('H5.chord_factor.exact', Math.PI / 4)
  const geometry = buildOpeningCutoutGeometry(window, RECT, 0.4, 0.2)
  row('H5.cutter_box', cutterBox(geometry))
  row('H5.cutter_box.by_equation', boxSaid(mine, 0.2, 0))
  row('H5.cutter_section', sectionArea(geometry))
  row('H5.cutter_section.by_equation', areaOf(holeOutline(window, 0.2, RECT)))
  geometry.dispose()
  // the springing: how high the outline's straight right side reaches
  const springing = (window: WindowNode) =>
    Math.max(
      ...buildOpeningCutoutShape(window, RECT)
        .getPoints()
        .filter((p) => Math.abs(p.x - RECT.right) < 1e-9)
        .map((p) => p.y),
    )
  for (const archHeight of [0, 0.6, 5]) {
    row(`H5.springing(arch height ${archHeight})`, springing(at({ openingShape: 'arch', archHeight })))
    row(`H5.springing(arch height ${archHeight}).by_equation`, RECT.top - archRise(archHeight, 1.2, 1.0))
  }
  const bare = { ...at({ openingShape: 'arch' }), archHeight: undefined } as unknown as WindowNode
  row('H5.springing(no arch height)', springing(bare))
  row('H5.springing(no arch height).by_equation', RECT.top - archRise(undefined, 1.2, 1.0))
}

title('H6 the radii of a rounded opening: top-left, top-right, bottom-right, bottom-left')
for (const [name, more, w, h] of [
  ['one of 0.15 on 1.2 x 1.0', { cornerRadius: 0.15 }, 1.2, 1.0],
  ['one of 10 on 1.5 x 1.5', { cornerRadius: 10 }, 1.5, 1.5],
  ['one of 10 on 1.2 x 1.0', { cornerRadius: 10 }, 1.2, 1.0],
  ['one of -1 on 1.2 x 1.0', { cornerRadius: -1 }, 1.2, 1.0],
  ['each 0.3 0.1 0 0 on 1.2 x 1.0', { openingRadiusMode: 'individual', openingCornerRadii: [0.3, 0.1, 0, 0] }, 1.2, 1.0],
  ['each 4 4 0 0 on 1.0 x 2.0', { openingRadiusMode: 'individual', openingCornerRadii: [4, 4, 0, 0] }, 1.0, 2.0],
  ['each 0.8 0.2 0.2 0.8 on 1.2 x 1.0', { openingRadiusMode: 'individual', openingCornerRadii: [0.8, 0.2, 0.2, 0.8] }, 1.2, 1.0],
  ['each -1 0.2 0.2 0.2 on 1.2 x 1.0', { openingRadiusMode: 'individual', openingCornerRadii: [-1, 0.2, 0.2, 0.2] }, 1.2, 1.0],
] as Array<[string, Record<string, unknown>, number, number]>) {
  const rect: Rect = { left: 0, right: w, bottom: 0, top: h }
  const window = at({ openingShape: 'rounded', ...more })
  const r = radiiOf(window, w, h)
  row(`H6.radii(${name})`, radiiFrom(corners(buildOpeningCutoutShape(window, rect).getPoints()), rect))
  row(`H6.radii(${name}).by_equation`, [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft].map((v) => num(v)).join(' '))
}

title('H7 the rounded outline and its bevel: the same opening, radius 0.15, reveal radius 0.025, wall 0.2 thick; then the cutter as given, with reveal radius 0, in a wall 0.04 thick, with radius 0.02, with radii each 0.3, 0.1, 0, 0 (and a stored radius of 0.02 beside them), with radius 10')
{
  const window = at({ openingShape: 'rounded' })
  // the points the cutter is made of: three takes a quarter circle in 2 x 24 chords
  const points = corners(buildOpeningCutoutShape(window, RECT).extractPoints(24).shape)
  const mine = roundedOutline(RECT, radiiOf(window, 1.2, 1.0))
  row('H7.corners', points.length)
  row('H7.corners.by_equation', mine.length)
  row('H7.first_three', pts(points.slice(0, 3)))
  row('H7.first_three.by_equation', pts(mine.slice(0, 3)))
  row('H7.bottom_right_at_45_degrees', pt(points[25]!))
  row('H7.bottom_right_at_45_degrees.by_equation', pt(mine[25]!))
  row('H7.area_as_drawn', polygonArea(points))
  row('H7.area_as_drawn.by_equation', areaOf(mine))
  row('H7.area_as_drawn.exact', 1.2 * 1.0 - (4 - Math.PI) * 0.15 * 0.15)
  // Q: what the 48 chords leave of a quarter disc, area = W H - (1 - Q) (sum of r squared)
  row('H7.quarter_factor', 1 - (1.2 * 1.0 - polygonArea(points)) / (4 * 0.15 * 0.15))
  row('H7.quarter_factor.by_equation', quarterChordFactor())
  row('H7.quarter_factor.exact', Math.PI / 4)
}
for (const [name, more, T] of [
  ['as_given', {}, 0.2],
  ['reveal_0', { openingRevealRadius: 0 }, 0.2],
  ['wall_0.04_thick', {}, 0.04],
  ['radius_0.02', { cornerRadius: 0.02 }, 0.2],
  ['each_0.3_0.1_0_0', { openingRadiusMode: 'individual', openingCornerRadii: [0.3, 0.1, 0, 0] }, 0.2],
  ['each_0.3_0.1_0_0.radius_0.02', { openingRadiusMode: 'individual', openingCornerRadii: [0.3, 0.1, 0, 0], cornerRadius: 0.02 }, 0.2],
  ['radius_10', { cornerRadius: 10 }, 0.2],
] as Array<[string, Record<string, unknown>, number]>) {
  const window = at({ openingShape: 'rounded', ...more })
  const geometry = buildOpeningCutoutGeometry(window, RECT, 2 * T, T)
  const hole = holeOutline(window, T, RECT)
  row(`H7.${name}.cutter_box`, cutterBox(geometry))
  row(`H7.${name}.cutter_box.by_equation`, boxSaid(hole, T, bevelOf(window, T)))
  row(`H7.${name}.cutter_section`, sectionArea(geometry))
  row(`H7.${name}.cutter_section.by_equation`, areaOf(hole))
  geometry.dispose()
}

title('H8 the unseen box an opening is picked by: how far it stands past the wall')
row('H8.depth(wall 0.2 thick)', getOpeningCutoutProxyDepth(0.2))
row('H8.depth(wall 0.2 thick).by_equation', 0.2 + 0.08)
