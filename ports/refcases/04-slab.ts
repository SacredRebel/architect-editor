// Reference cases for the slab (port note entry 4): the ring, what is measured, the automatic
// slab, the outline as built, the heights that are set, and what stands on a slab.
// cd packages/viewer && bun ../../ports/refcases/04-slab.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone (_slab-equations.ts calls nothing of the old
// editor): a line `K.by_equation` must give the number of the line `K`.
import { SpatialGridManager } from '../../packages/core/src/hooks/spatial-grid/spatial-grid-manager'
import { getRenderableSlabPolygon } from '../../packages/core/src/lib/slab-polygon'
import { detectSpacesForLevel, planAutoSlabsForLevel } from '../../packages/core/src/lib/space-detection'
import { BuildingNode, LevelNode, SlabNode, WallNode } from '../../packages/core/src/schema'
import useScene from '../../packages/core/src/store/use-scene'
import { MIN_SLAB_THICKNESS } from '../../packages/core/src/schema/nodes/slab'
import {
  getCeilingClampBound,
  getCoveringSlabUndersideAt,
  getWallPlaneTop,
} from '../../packages/core/src/services/storey'
import { resolveSlabPlacementElevation } from '../../packages/core/src/systems/slab/slab-placement'
import {
  clampSlabElevationForWalls,
  computeWallSlabSupport,
  getSlabElevationUpperBound,
  SUPPORT_ELEVATION_EPSILON,
  type WallSlabSupport,
  wallOverlapsPolygon,
} from '../../packages/core/src/systems/slab/slab-support'
import {
  applySlabElevationPreset,
  applySlabRecessDepthChange,
  applySlabThicknessChange,
  applySlabTopChange,
  getSlabAnchorElevation,
  getSlabBaseElevation,
  getSlabRecessDepth,
} from '../../packages/nodes/src/slab/elevation-limit'
import { slabParametrics } from '../../packages/nodes/src/slab/parametrics'
import { slabQuickMeasurement } from '../../packages/nodes/src/slab/quick-measurement'
import { num, pt, pts, row, title } from './_print'
import {
  anchorOf,
  areaOf,
  builtRing,
  centroidOf,
  depthOf,
  drawnAt,
  floorAt,
  heldBy,
  heldUnderWalls,
  highestUnderWalls,
  measuredArea,
  perimeterOf,
  pointedAt,
  type Ring,
  roomRing,
  type Slab,
  slabOf,
  slabsUnder,
  standsOn,
  undersideOf,
  type WallStanding,
  wallLiesOn,
  wallStandsOn,
  withDepth,
  withPreset,
  withThickness,
  withTop,
} from './_slab-equations'
import { plain } from './_wall-equations'

const RECT: Ring = [[0, 0], [4, 0], [4, 3], [0, 3]]
const ELL: Ring = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]]

function slab(id: string, polygon: Ring, more: Record<string, unknown> = {}): SlabNode {
  return SlabNode.parse({ id, polygon, ...more })
}
function wall(id: string, start: [number, number], end: [number, number], more: Record<string, unknown> = {}): WallNode {
  return WallNode.parse({ id, start, end, ...more })
}
const square = (u0: number, v0: number, u1: number, v1: number): Ring => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
const metric = (node: SlabNode, key: string) =>
  slabQuickMeasurement(node)?.metrics.find((entry) => entry.key === key)?.value ?? Number.NaN
const reportAt = (node: SlabNode) => slabQuickMeasurement(node)?.anchor ?? [Number.NaN, Number.NaN, Number.NaN]
const said = (value: { elevation?: number; thickness?: number; recessed?: boolean; recessedRimElevation?: number; rim?: number }) =>
  [
    value.elevation === undefined ? '' : `elevation ${num(value.elevation)}`,
    value.thickness === undefined ? '' : `thickness ${num(value.thickness)}`,
    value.recessed === undefined ? '' : `recessed ${value.recessed}`,
    (value.recessedRimElevation ?? value.rim) === undefined ? '' : `rim ${num((value.recessedRimElevation ?? value.rim)!)}`,
  ]
    .filter(Boolean)
    .join(' ')

function measured(key: string, node: SlabNode, areaOnly = false) {
  const mine = slabOf(node)
  row(`${key}.area`, metric(node, 'area'))
  row(`${key}.area.by_equation`, measuredArea(mine.polygon, mine.holes))
  if (areaOnly) return
  row(`${key}.perimeter`, metric(node, 'perimeter'))
  row(`${key}.perimeter.by_equation`, perimeterOf(mine.polygon))
  const at = reportAt(node)
  const centre = centroidOf(mine.polygon)
  row(`${key}.centroid`, pt([at[0]!, at[2]!]))
  row(`${key}.centroid.by_equation`, centre ? pt(centre) : 'none')
}

// the area of a ring the old editor returned (the old editor measures a slab's stored ring only;
// it has no function for the area of the ring it builds on)
function areaOfRing(ring: Array<[number, number]>): number {
  let twice = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(twice) / 2
}

function built(key: string, node: SlabNode, walls: WallNode[], siblings: SlabNode[]) {
  row(key, pts(getRenderableSlabPolygon(node, { walls, siblingSlabs: siblings })))
  row(`${key}.by_equation`, pts(builtRing(slabOf(node), walls.map(plain), siblings.map(slabOf))))
}

// ------------------------------------------------------------------ the cases
title('S0 what a slab holds when nothing is given, and its limits')
{
  const bare = SlabNode.parse({ polygon: [] })
  row('S0.default_elevation', bare.elevation)
  row('S0.default_thickness', bare.thickness)
  row('S0.default_recessed', bare.recessed)
  row('S0.default_auto_from_walls', bare.autoFromWalls)
  row('S0.default_holes', bare.holes.length)
  row('S0.min_thickness_when_edited', MIN_SLAB_THICKNESS)
  for (const field of slabParametrics.groups.flatMap((group) => group.fields)) {
    const f = field as { key: string; min?: number; max?: number; step?: number }
    row(`S0.inspector.${f.key}`, `min ${num(f.min ?? Number.NaN)} max ${num(f.max ?? Number.NaN)} step ${num(f.step ?? Number.NaN)}`)
  }
  row('S0.pointer_tolerance', SUPPORT_ELEVATION_EPSILON)
}

title('S1 a rectangle 4 x 3: (0, 0) (4, 0) (4, 3) (0, 3), top at 0.3, 0.2 thick')
{
  const node = slab('slab_s1', RECT, { elevation: 0.3, thickness: 0.2 })
  measured('S1', node)
  row('S1.report_height', reportAt(node)[1]!)
  row('S1.report_height.by_equation', slabOf(node).elevation + 0.04)
  row('S1.underside', getSlabBaseElevation(node))
  row('S1.underside.by_equation', undersideOf(slabOf(node)))
  built('S1.built_ring', node, [], [])
}

title('S2 an L: (0, 0) (6, 0) (6, 2) (2, 2) (2, 5) (0, 5), nothing else given; and drawn the other way round')
{
  const node = slab('slab_s2', ELL)
  measured('S2', node)
  row('S2.underside', getSlabBaseElevation(node))
  row('S2.underside.by_equation', undersideOf(slabOf(node)))
  measured('S2.other_way_round', slab('slab_s2r', [...ELL].reverse() as Ring))
}

title('S3 what is measured with holes. In the rectangle of S1: 1 x 1 from (1, 1); over the edge, (1, -0.5) to (3, 1); two that overlap, 1 x 1 from (1, 1) and from (1.5, 1.5); outside, (6, 0) to (7, 1); over the whole slab, (-1, -1) to (5, 4). In the L of S2: 1 x 1 from (0.5, 3)')
{
  measured('S3.hole_1x1', slab('slab_s3a', RECT, { holes: [square(1, 1, 2, 2)] }))
  for (const [name, holes] of [
    ['hole_over_the_edge', [square(1, -0.5, 3, 1)]],
    ['two_holes_overlapping', [square(1, 1, 2, 2), square(1.5, 1.5, 2.5, 2.5)]],
    ['hole_outside', [square(6, 0, 7, 1)]],
    ['hole_over_the_whole_slab', [square(-1, -1, 5, 4)]],
  ] as Array<[string, Ring[]]>) {
    measured(`S3.${name}`, slab(`slab_${name}`, RECT, { holes }), true)
  }
  measured('S3.L_hole_1x1', slab('slab_s3b', ELL, { holes: [square(0.5, 3, 1.5, 4)] }), true)
}

title('S4 the automatic slab: a room of four walls 0.2 thick, listed (0, 0) to (4, 0) to (4, 4) to (0, 4) and back; the same walls listed the other way, (0, 0) to (0, 4) first; a room on the L of S2, six walls 0.3 thick')
{
  const rooms: Array<[string, WallNode[]]> = [
    ['S4', [
      wall('wall_a', [0, 0], [4, 0], { thickness: 0.2 }),
      wall('wall_b', [4, 0], [4, 4], { thickness: 0.2 }),
      wall('wall_c', [4, 4], [0, 4], { thickness: 0.2 }),
      wall('wall_d', [0, 4], [0, 0], { thickness: 0.2 }),
    ]],
    ['S4.other_way', [
      wall('wall_a', [0, 0], [0, 4], { thickness: 0.2 }),
      wall('wall_b', [0, 4], [4, 4], { thickness: 0.2 }),
      wall('wall_c', [4, 4], [4, 0], { thickness: 0.2 }),
      wall('wall_d', [4, 0], [0, 0], { thickness: 0.2 }),
    ]],
    ['S4.L_room', ELL.map((point, i) => wall(`wall_${i}`, point, ELL[(i + 1) % ELL.length]!, { thickness: 0.3 }))],
  ]
  for (const [key, walls] of rooms) {
    const found = detectSpacesForLevel('level_a', walls)
    const plan = planAutoSlabsForLevel(found.roomPolygons, [])
    const made = plan.create[0]!
    const stored = roomRing(walls.map(plain))
    if (key === 'S4') {
      row(`${key}.rooms`, found.roomPolygons.length)
      row(`${key}.slabs_made`, plan.create.length)
      row(`${key}.made_as`, `elevation ${num(made.elevation)} thickness ${num(made.thickness)} holes ${num(made.holes.length)} auto ${made.autoFromWalls} recessed ${made.recessed} name ${made.name}`)
    }
    row(`${key}.stored_ring`, pts(made.polygon))
    row(`${key}.stored_ring.by_equation`, stored ? pts(stored) : 'none')
    const ring = getRenderableSlabPolygon(made, { walls, siblingSlabs: [] })
    const mine = builtRing(slabOf(made), walls.map(plain), [])
    row(`${key}.built_ring`, pts(ring))
    row(`${key}.built_ring.by_equation`, pts(mine))
    row(`${key}.built_area`, areaOfRing(ring))
    row(`${key}.built_area.by_equation`, areaOf(mine))
    row(`${key}.measured_area`, metric(made, 'area'))
    row(`${key}.measured_area.by_equation`, measuredArea(slabOf(made).polygon, []))
  }
}

title("S5 the outline as built, in the room of S4 (four walls 0.2 thick on the square (0, 0) to (4, 4)): a slab drawn at the walls' inner faces, at their outer faces, 0.15 and 0.17 inside their centrelines; and on the centrelines with the wall on u = 0 made 0.5 thick")
{
  const room = [
    wall('wall_a', [0, 0], [4, 0], { thickness: 0.2 }),
    wall('wall_b', [4, 0], [4, 4], { thickness: 0.2 }),
    wall('wall_c', [4, 4], [0, 4], { thickness: 0.2 }),
    wall('wall_d', [0, 4], [0, 0], { thickness: 0.2 }),
  ]
  built('S5.drawn_at_the_inner_faces', slab('slab_in', square(0.1, 0.1, 3.9, 3.9)), room, [])
  built('S5.drawn_at_the_outer_faces', slab('slab_out', square(-0.1, -0.1, 4.1, 4.1)), room, [])
  built('S5.drawn_0.15_inside_the_centrelines', slab('slab_15', square(0.15, 0.15, 3.85, 3.85)), room, [])
  built('S5.drawn_0.17_inside_the_centrelines', slab('slab_17', square(0.17, 0.17, 3.83, 3.83)), room, [])
  built('S5.one_wall_0.5_thick', slab('slab_t', square(0, 0, 4, 4)), [room[0]!, room[1]!, room[2]!, wall('wall_d', [0, 4], [0, 0], { thickness: 0.5 })], [])
}

title("S5 two rooms side by side, seven walls 0.2 thick, the one between them on u = 4. Both slabs drawn at the walls' inner faces: A on (0.1, 0.1) to (3.9, 2.9), B on (4.1, 0.1) to (7.9, 2.9). Then on the centrelines, A on (0, 0) to (4, 3), B on (4, 0) to (8, 3): B like A; B raised (top 0.3, 0.3 thick); B a deck (top 0.6, 0.1 thick); B a pit (floor -0.4)")
{
  const two = [
    wall('wall_1', [0, 0], [4, 0], { thickness: 0.2 }),
    wall('wall_2', [4, 0], [8, 0], { thickness: 0.2 }),
    wall('wall_3', [8, 0], [8, 3], { thickness: 0.2 }),
    wall('wall_4', [8, 3], [4, 3], { thickness: 0.2 }),
    wall('wall_5', [4, 3], [0, 3], { thickness: 0.2 }),
    wall('wall_6', [0, 3], [0, 0], { thickness: 0.2 }),
    wall('wall_7', [4, 0], [4, 3], { thickness: 0.2 }),
  ]
  built('S5.two_rooms_drawn_at_the_inner_faces.A', slab('slab_a', square(0.1, 0.1, 3.9, 2.9)), two, [slab('slab_b', square(4.1, 0.1, 7.9, 2.9))])
  built('S5.two_rooms_drawn_at_the_inner_faces.B', slab('slab_b', square(4.1, 0.1, 7.9, 2.9)), two, [slab('slab_a', square(0.1, 0.1, 3.9, 2.9))])
  const a = slab('slab_a', square(0, 0, 4, 3))
  for (const [name, more] of [
    ['two_rooms', {}],
    ['B_raised', { elevation: 0.3, thickness: 0.3 }],
    ['B_a_deck', { elevation: 0.6, thickness: 0.1 }],
    ['B_a_pit', { elevation: -0.4, recessed: true }],
  ] as Array<[string, Record<string, unknown>]>) {
    const b = slab('slab_b', square(4, 0, 8, 3), more)
    built(`S5.${name}.A`, a, two, [b])
    built(`S5.${name}.B`, b, two, [a])
  }
}

title('S5 no wall: the slab (0, 0) to (4, 3) and a second slab from u = 4.04 to 8 beside it; then from u = 4.06')
{
  const left = slab('slab_l', square(0, 0, 4, 3))
  const right = slab('slab_r', square(4.04, 0, 8, 3))
  built('S5.slabs_0.04_apart.left', left, [], [right])
  built('S5.slabs_0.04_apart.right', right, [], [left])
  built('S5.slabs_0.06_apart.left', left, [], [slab('slab_r', square(4.06, 0, 8, 3))])
}

title('S5 a wall under part of an edge: wall (0, 0) to (2, 0), 0.2 thick, slab (0, 0) to (6, 3). Two walls along one edge of the rectangle of S1: (0, 0) to (1.5, 0), 0.2 thick, and (1.5, 0) to (4, 0), 0.4 thick. A sharp corner: slab (0, 0) (4, 0) (4, 1), walls 0.2 thick on (0, 0)-(4, 0) and (4, 1)-(0, 0); then the same with (4, 0.6). A bent wall: (0, 0) to (4, 0), sagitta 0.05, 0.2 thick, under the rectangle of S1')
{
  built('S5.wall_on_part_of_an_edge', slab('slab_p', square(0, 0, 6, 3)), [wall('wall_p', [0, 0], [2, 0], { thickness: 0.2 })], [])
  built('S5.two_walls_along_one_edge', slab('slab_q', RECT), [wall('wall_p', [0, 0], [1.5, 0], { thickness: 0.2 }), wall('wall_q', [1.5, 0], [4, 0], { thickness: 0.4 })], [])
  for (const rise of [1, 0.6]) {
    const walls = [wall('wall_x', [0, 0], [4, 0], { thickness: 0.2 }), wall('wall_y', [4, rise], [0, 0], { thickness: 0.2 })]
    built(`S5.sharp_corner(${num((Math.atan2(rise, 4) * 180) / Math.PI, 2)} deg)`, slab('slab_c', [[0, 0], [4, 0], [4, rise]]), walls, [])
  }
  built('S5.bent_wall', slab('slab_bw', RECT), [wall('wall_bent', [0, 0], [4, 0], { thickness: 0.2, curveOffset: 0.05 })], [])
}

title('S6 the heights that are set, on the rectangle of S1 as: a slab with its top at 0.3, 0.2 thick; the default slab (0.05, 0.05); a pit with its floor at -0.4; that pit with its rim at 0.3; a pit whose floor (0.2) is above its rim (0)')
{
  const raised = slab('slab_r', RECT, { elevation: 0.3, thickness: 0.2 })
  const grounded = slab('slab_g', RECT)
  const pit = slab('slab_p', RECT, { elevation: -0.4, recessed: true })
  const pitRim = slab('slab_q', RECT, { elevation: -0.4, recessed: true, recessedRimElevation: 0.3 })
  for (const [name, node] of [['top_0.3_thick_0.2', raised], ['pit_floor_-0.4', pit], ['pit_floor_-0.4_rim_0.3', pitRim]] as Array<[string, SlabNode]>) {
    row(`S6.${name}.anchor`, getSlabAnchorElevation(node))
    row(`S6.${name}.anchor.by_equation`, anchorOf(slabOf(node)))
  }
  for (const t of [0.5, 0.001]) {
    row(`S6.top_0.3_thick_0.2.thickness_to(${t})`, said(applySlabThicknessChange(raised, t)))
    row(`S6.top_0.3_thick_0.2.thickness_to(${t}).by_equation`, said(withThickness(slabOf(raised), t)))
  }
  for (const [name, node, tops] of [
    ['top_0.3_thick_0.2', raised, [0.8, -0.4]],
    ['default', grounded, [0, -0.4]],
    ['pit_floor_-0.4', pit, [-0.1, 0.01, 0.25]],
    ['pit_floor_-0.4_rim_0.3', pitRim, [0.5]],
  ] as Array<[string, SlabNode, number[]]>) {
    for (const top of tops) {
      row(`S6.${name}.top_to(${top})`, said(applySlabTopChange(node, top)))
      row(`S6.${name}.top_to(${top}).by_equation`, said(withTop(slabOf(node), top)))
    }
  }
  for (const [name, node, presets] of [
    ['default', grounded, [-0.15, 0.02, 0.05, 0.15]],
    ['top_0.3_thick_0.2', raised, [-0.15, 0.15]],
    ['pit_floor_-0.4_rim_0.3', pitRim, [-0.15, 0.15]],
  ] as Array<[string, SlabNode, number[]]>) {
    for (const signed of presets) {
      row(`S6.${name}.preset(${signed})`, said(applySlabElevationPreset(node, signed)))
      row(`S6.${name}.preset(${signed}).by_equation`, said(withPreset(slabOf(node), signed)))
    }
  }
  for (const [name, node] of [
    ['pit_floor_-0.4', pit],
    ['pit_floor_-0.4_rim_0.3', pitRim],
    ['pit_floor_0.2_rim_0', slab('slab_z', RECT, { elevation: 0.2, recessed: true })],
  ] as Array<[string, SlabNode]>) {
    row(`S6.${name}.depth_shown`, getSlabRecessDepth(node))
    row(`S6.${name}.depth_shown.by_equation`, depthOf(slabOf(node)))
  }
  for (const depth of [1.5, 0.001]) {
    row(`S6.pit_floor_-0.4_rim_0.3.depth_to(${depth})`, said(applySlabRecessDepthChange(pitRim, depth)))
    row(`S6.pit_floor_-0.4_rim_0.3.depth_to(${depth}).by_equation`, said(withDepth(slabOf(pitRim), depth)))
  }
  for (const [name, node] of [['default', grounded], ['pit_floor_-0.4', pit]] as Array<[string, SlabNode]>) {
    row(`S6.${name}.drawn_on_a_plane_at_0.6`, resolveSlabPlacementElevation(node, 0.6))
    row(`S6.${name}.drawn_on_a_plane_at_0.6.by_equation`, drawnAt(slabOf(node), 0.6))
  }
}

title('S6 the limit under walls: a room of four walls 0.1 thick on the rectangle of S1, storey 2.7, its floor slab asked up to 2.5 and to 2.2; the same with walls 2.5 high; a slab on (10, 10) to (12, 12), under no wall, asked up to 2.5')
{
  const ring = (height?: number) => RECT.map((point, i) => wall(`wall_${i}`, point, RECT[(i + 1) % 4]!, { height }))
  const withHeight = (walls: WallNode[]) => walls.map((w) => ({ ...plain(w), height: w.height }))
  const floor = slab('slab_f', RECT, { autoFromWalls: true })
  const island = slab('slab_i', square(10, 10, 12, 12))
  for (const [name, node, walls, proposed] of [
    ['walls_without_height.to(2.5)', floor, ring(), 2.5],
    ['walls_without_height.to(2.2)', floor, ring(), 2.2],
    ['walls_2.5_high.to(2.5)', floor, ring(2.5), 2.5],
    ['slab_under_no_wall.to(2.5)', island, ring(), 2.5],
  ] as Array<[string, SlabNode, WallNode[], number]>) {
    const got = clampSlabElevationForWalls(proposed, node, walls, [node], 2.7)
    const mine = heldUnderWalls(proposed, slabOf(node), withHeight(walls), [slabOf(node)], 2.7)
    row(`S6.${name}`, `elevation ${num(got.elevation)} held ${got.clamped}`)
    row(`S6.${name}.by_equation`, `elevation ${num(mine.elevation)} held ${mine.held}`)
  }
  for (const [name, walls] of [['walls_without_height', ring()], ['walls_2.5_high', ring(2.5)]] as Array<[string, WallNode[]]>) {
    row(`S6.${name}.highest`, getSlabElevationUpperBound(floor, walls, [floor], 2.7))
    row(`S6.${name}.highest.by_equation`, highestUnderWalls(slabOf(floor), withHeight(walls), [slabOf(floor)], 2.7))
  }
}

const told = (s: WallSlabSupport | WallStanding) => {
  const runs = 'baseSegments' in s ? s.baseSegments : s.runs
  const id = 'electedSlabId' in s ? s.electedSlabId : s.slabId
  const lowest = 'baseElevation' in s ? s.baseElevation : s.lowest
  return `stands at ${num(s.elevation)} on ${id}; lowest ${num(lowest)}; runs ${runs.map((r) => `${num(r.start, 4)}..${num(r.end, 4)} at ${num(r.elevation)}`).join(', ')}`
}

// three slabs on one level: a low one, a high one that overlaps it and has a hole, and a pit
const LOW = slab('slab_low', square(0, 0, 4, 3), { elevation: 0.1, thickness: 0.1 })
const HIGH = slab('slab_high', square(2, 0, 6, 3), { elevation: 0.6, thickness: 0.6, holes: [square(2.5, 2, 3.5, 2.8)] })
const PIT = slab('slab_pit', square(8, 0, 10, 3), { elevation: -0.4, recessed: true })
const LEVEL = [LOW, HIGH, PIT]
const MINE: Slab[] = LEVEL.map(slabOf)
const asBuilt = (one: Slab) => builtRing(one, [], MINE.filter((other) => other.id !== one.id))

title('S7 a point and a thing 1 x 1 on three slabs of one level: low, (0, 0) to (4, 3), top 0.1; high, (2, 0) to (6, 3), top 0.6, with a hole (2.5, 2) to (3.5, 2.8); a pit, (8, 0) to (10, 3), floor -0.4. Then the room of S4 with its automatic slab: a thing 0.1 x 0.1 and a point at (4.06, 2), under the wall on u = 4; and the wall (0, 0) to (4, 0) itself')
{
  const manager = new SpatialGridManager()
  for (const node of LEVEL) manager.handleNodeCreated(node, 'level_a')
  for (const [u, v] of [[1, 1.5], [3, 1], [3, 2.4], [5, 1.5], [7, 1.5], [9, 1.5]] as Array<[number, number]>) {
    row(`S7.floor_at(${u}, ${v})`, manager.getSlabElevationAt('level_a', u, v))
    row(`S7.floor_at(${u}, ${v}).by_equation`, floorAt(MINE, u, v))
  }
  const things: Array<[string, number, number, number, number | null]> = [
    ['thing_at(1, 1.5)', 1, 1.5, 0, null],
    ['thing_at(1.5, 1.5)', 1.5, 1.5, 0, null],
    ['thing_at(1.6, 1.5)', 1.6, 1.5, 0, null],
    ['thing_at(1.6, 1.5).pointer_on_0.1', 1.6, 1.5, 0, 0.1],
    ['thing_at(1.45, 1.5)', 1.45, 1.5, 0, null],
    ['thing_at(1.45, 1.5).turned_45_deg', 1.45, 1.5, Math.PI / 4, null],
    ['thing_at(3, 2.4).in_the_hole', 3, 2.4, 0, null],
    ['thing_at(9, 1.5).in_the_pit', 9, 1.5, 0, null],
    ['thing_at(7, 1.5).on_no_slab', 7, 1.5, 0, null],
  ]
  for (const [name, u, v, turn, cap] of things) {
    const got = manager.getSlabSupportForItem('level_a', [u, 0, v], [1, 1, 1], [0, turn, 0], cap)
    const mine = standsOn(MINE, asBuilt, u, v, 1, 1, turn, cap)
    row(`S7.${name}`, `elevation ${num(got.elevation)} slab ${got.slabId}`)
    row(`S7.${name}.by_equation`, `elevation ${num(mine.elevation)} slab ${mine.slabId}`)
  }
  const listed = (list: Array<{ slabId: string; elevation: number }>) => list.map((entry) => `${entry.slabId} ${num(entry.elevation)}`).join('; ')
  row('S7.thing_at(3, 1).slabs_under_it', listed(manager.getSupportCandidatesForFootprint('level_a', [3, 0, 1], [1, 1, 1], [0, 0, 0])))
  row('S7.thing_at(3, 1).slabs_under_it.by_equation', listed(slabsUnder(MINE, asBuilt, 3, 1, 1, 1, 0)))
  // a slab stored on the thing as its host is kept while it still carries the thing
  for (const u of [3, 5]) {
    const kept = (value: number | null) => (value === null ? 'not kept' : `kept at ${num(value)}`)
    row(`S7.thing_at(${u}, 1).host_low`, kept(manager.getHostSlabElevationForFootprint('level_a', 'slab_low', [u, 0, 1], [1, 1, 1], [0, 0, 0])))
    row(`S7.thing_at(${u}, 1).host_low.by_equation`, kept(heldBy(MINE, asBuilt, 'slab_low', u, 1, 1, 1, 0)))
  }
  // the built ring, not the stored one, carries a thing: the room of S4 and its automatic slab on another level
  {
    const walls = [
      wall('wall_a', [0, 0], [4, 0], { thickness: 0.2, parentId: 'level_r' }),
      wall('wall_b', [4, 0], [4, 4], { thickness: 0.2, parentId: 'level_r' }),
      wall('wall_c', [4, 4], [0, 4], { thickness: 0.2, parentId: 'level_r' }),
      wall('wall_d', [0, 4], [0, 0], { thickness: 0.2, parentId: 'level_r' }),
    ]
    const floor = slab('slab_room', square(0, 0, 4, 4), { autoFromWalls: true, parentId: 'level_r' })
    const level = LevelNode.parse({ id: 'level_r', level: 0, height: 2.7, children: [...walls.map((w) => w.id), floor.id] })
    useScene.setState({ nodes: Object.fromEntries([level, ...walls, floor].map((node) => [node.id, node])) as never })
    manager.handleNodeCreated(floor, 'level_r')
    const mineFloor = [slabOf(floor)]
    const ring = (one: Slab) => builtRing(one, walls.map(plain), [])
    const got = manager.getSlabSupportForItem('level_r', [4.06, 0, 2], [0.1, 1, 0.1], [0, 0, 0])
    const mine = standsOn(mineFloor, ring, 4.06, 2, 0.1, 0.1, 0)
    row('S7.room_of_S4.thing_0.1x0.1_at(4.06, 2)', `elevation ${num(got.elevation)} slab ${got.slabId}`)
    row('S7.room_of_S4.thing_0.1x0.1_at(4.06, 2).by_equation', `elevation ${num(mine.elevation)} slab ${mine.slabId}`)
    row('S7.room_of_S4.floor_at(4.06, 2)', manager.getSlabElevationAt('level_r', 4.06, 2))
    row('S7.room_of_S4.floor_at(4.06, 2).by_equation', floorAt(mineFloor, 4.06, 2))
    row('S7.room_of_S4.wall_on_its_own_floor', told(computeWallSlabSupport(walls[0]!, [floor], walls)))
    row('S7.room_of_S4.wall_on_its_own_floor.by_equation', told(wallStandsOn(plain(walls[0]!), mineFloor, ring)))
    useScene.setState({ nodes: {} as never })
  }
  // which surface a ray points at (level frame: from a point [u, up, v] along a direction [u, up, v])
  const rays: Array<[string, [number, number, number], [number, number, number]]> = [
    ['from(3, 5, 1).down', [3, 5, 1], [0, -1, 0]],
    ['from(0, 0.4, 1.5).along(1, -0.1, 0)', [0, 0.4, 1.5], [1, -0.1, 0]],
    ['from(3, 5, 2.4).down', [3, 5, 2.4], [0, -1, 0]],
    ['from(7, 5, 1.5).down', [7, 5, 1.5], [0, -1, 0]],
    ['from(3, 5, 1).up', [3, 5, 1], [0, 1, 0]],
  ]
  const shown = (hit: { elevation: number; slabId: string | null; point: readonly number[] | null }) =>
    `elevation ${num(hit.elevation)} slab ${hit.slabId} at ${hit.point ? pt(hit.point) : 'none'}`
  for (const [name, origin, direction] of rays) {
    row(`S7.pointer.${name}`, shown(manager.getPointedSupportSurface('level_a', origin, direction)))
    row(`S7.pointer.${name}.by_equation`, shown(pointedAt(MINE, asBuilt, origin, direction)))
  }
}

title("S8 a wall 0.2 thick on the slabs of S7. Half on the high slab: (0, 1.5) to (4, 1.5); a third on it: (0, 1.5) to (3, 1.5); a third on none, a third on each: (-2, 1.5) to (4, 1.5); one face on the high slab: (1.9, 0) to (1.9, 3); on the low slab's edge: (0, 0) to (0, 3); ending on that edge: (-2, 1.5) to (0, 1.5); over the hole: (2, 2.4) to (4, 2.4); in the pit: (8.5, 1.5) to (9.5, 1.5); on no slab: (6.5, 1) to (7.5, 1); bent: (0, 1.5) to (4, 1.5), sagitta 0.5")
{
  const half = wall('wall_1', [0, 1.5], [4, 1.5], { thickness: 0.2 })
  const ending = wall('wall_6', [-2, 1.5], [0, 1.5], { thickness: 0.2 })
  const none = wall('wall_9', [6.5, 1], [7.5, 1], { thickness: 0.2 })
  const walls: Array<[string, WallNode, string | null, number | null, number]> = [
    ['half_on_the_high_slab', half, null, null, 0],
    ['half_on_the_high_slab.host_low', half, 'slab_low', null, 0],
    ['half_on_the_high_slab.pointer_on_0.1', half, null, 0.1, 0],
    ['a_third_on_the_high_slab', wall('wall_2', [0, 1.5], [3, 1.5], { thickness: 0.2 }), null, null, 0],
    ['thirds_none_low_high', wall('wall_3', [-2, 1.5], [4, 1.5], { thickness: 0.2 }), null, null, 0],
    ['one_face_on_the_high_slab', wall('wall_4', [1.9, 0], [1.9, 3], { thickness: 0.2 }), null, null, 0],
    ['on_the_low_slabs_edge', wall('wall_5', [0, 0], [0, 3], { thickness: 0.2 }), null, null, 0],
    ['ending_on_the_low_slabs_edge', ending, null, null, 0],
    ['over_the_hole', wall('wall_7', [2, 2.4], [4, 2.4], { thickness: 0.2 }), null, null, 0],
    ['in_the_pit', wall('wall_8', [8.5, 1.5], [9.5, 1.5], { thickness: 0.2 }), null, null, 0],
    ['on_no_slab', none, null, null, 0],
    ['on_no_slab.ground_at_0.4', none, null, null, 0.4],
    ['bent', wall('wall_10', [0, 1.5], [4, 1.5], { thickness: 0.2, curveOffset: 0.5 }), null, null, 0],
  ]
  for (const [name, node, host, cap, ground] of walls) {
    row(`S8.${name}`, told(computeWallSlabSupport(node, LEVEL, [], host, cap, ground)))
    row(`S8.${name}.by_equation`, told(wallStandsOn(plain(node), MINE, asBuilt, host, cap, ground)))
  }
  // the wall's own stored offset, and the ground as its stored host (through the level's own book of slabs)
  const manager = new SpatialGridManager()
  for (const node of LEVEL) manager.handleNodeCreated(node, 'level_a')
  const lifted = (s: WallStanding, by: number): WallStanding => ({
    ...s,
    elevation: s.elevation + by,
    lowest: s.lowest + by,
    runs: s.runs.map((run) => ({ ...run, elevation: run.elevation + by })),
  })
  row('S8.half_on_the_high_slab.offset_0.3', told(manager.getSlabSupportForWall('level_a', half.start, half.end, 0, 0.2, null, undefined, 0.3)))
  row('S8.half_on_the_high_slab.offset_0.3.by_equation', told(lifted(wallStandsOn(plain(half), MINE, asBuilt), 0.3)))
  row('S8.half_on_the_high_slab.host_ground_offset_0.3', told(manager.getSlabSupportForWall('level_a', half.start, half.end, 0, 0.2, 'ground', undefined, 0.3)))
  row('S8.half_on_the_high_slab.host_ground_offset_0.3.by_equation', told({ elevation: 0.3, slabId: null, lowest: 0.3, runs: [{ start: 0, end: 1, elevation: 0.3 }] }))
  for (const [name, node] of [['half_on_the_high_slab', half], ['ending_on_the_low_slabs_edge', ending]] as Array<[string, WallNode]>) {
    row(`S8.${name}.lies_on_the_low_slab`, wallOverlapsPolygon(node, LOW.polygon))
    row(`S8.${name}.lies_on_the_low_slab.by_equation`, wallLiesOn(plain(node), MINE[0]!.polygon))
  }
}

title('S9 a slab seen from the storey below: two storeys 2.7 high; on the upper one the rectangle of S1 with its top at 0.05, 0.3 thick; below, a wall (1, 1) to (3, 1) under it, a wall (5, 1) to (7, 1) beside it, and a ceiling on the same rectangle')
{
  const building = BuildingNode.parse({ id: 'building_a', children: ['level_0', 'level_1'] })
  const above = slab('slab_up', RECT, { elevation: 0.05, thickness: 0.3, parentId: 'level_1' })
  const lower = LevelNode.parse({ id: 'level_0', level: 0, height: 2.7, parentId: 'building_a', children: [] })
  const upper = LevelNode.parse({ id: 'level_1', level: 1, height: 2.7, parentId: 'building_a', children: ['slab_up'] })
  const nodes = { [building.id]: building, [lower.id]: lower, [upper.id]: upper, [above.id]: above } as never
  const under = 2.7 + undersideOf(slabOf(above))
  row('S9.underside_seen_from_below_at(2, 1.5)', getCoveringSlabUndersideAt('level_0', nodes, 2, 1.5) ?? Number.NaN)
  row('S9.underside_seen_from_below_at(2, 1.5).by_equation', under)
  row('S9.underside_seen_from_below_at(5, 1.5)', getCoveringSlabUndersideAt('level_0', nodes, 5, 1.5) === null ? 'no slab over it' : 'a slab over it')
  row('S9.top_plane_of_a_wall_under_it', getWallPlaneTop({ start: [1, 1], end: [3, 1], thickness: 0.2 }, 'level_0', nodes))
  row('S9.top_plane_of_a_wall_under_it.by_equation', Math.min(2.7, under))
  row('S9.top_plane_of_a_wall_beside_it', getWallPlaneTop({ start: [5, 1], end: [7, 1], thickness: 0.2 }, 'level_0', nodes))
  row('S9.top_plane_of_a_wall_beside_it.by_equation', 2.7)
  row('S9.highest_ceiling_under_it', getCeilingClampBound('level_0', nodes, RECT))
  row('S9.highest_ceiling_under_it.by_equation', Math.min(2.7, under) - 0.01)
}
