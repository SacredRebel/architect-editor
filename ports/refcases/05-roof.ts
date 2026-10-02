// Reference cases for the roof container (port note entry 5): where a roof stands, how it is
// turned, what holds it up, its plan outline, how the roof tool makes one, which roof owns an
// overlap. The roof shapes themselves are entry 6.
// cd packages/viewer && bun ../../ports/refcases/05-roof.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone (_roof-equations.ts calls nothing of the old
// editor): a line `K.by_equation` must give the number of the line `K`.
//
// Core is called through its package, as the roof's own files in packages/nodes call it, so
// that the tool, the elevation rule and this file share one scene registry and one spatial grid.
//
// Not part of the reference: with ROOF_AT_RANDOM=1 set, the end of this file also holds the
// equations against the fork on random inputs and prints one line of counts for each.
import {
  type AnyNode,
  type AnyNodeId,
  type FloorplanGeometry,
  fitRoofFootprint,
  type GeometryContext,
  getLevelElevations,
  getRoofPlanBounds,
  getRoofSegmentVisibleTopBounds,
  initSpatialGridSync,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  resolveRoofElevation,
  resolveRoomRoofFootprint,
  roofOverlapEntryOwns,
  roofPlanBoundsOverlap,
  roofPlanOverlapEntryOwns,
  type SceneApi,
  SlabNode,
  sceneRegistry,
  spatialGridManager,
  useScene,
  WallNode,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import * as THREE from 'three'
// not among the package's exports: the built file itself, so that it shares the package's scene store
import { initializeRoofElevationSync } from '../../packages/core/dist/systems/roof/roof-elevation-system.js'
import { createConicalRoofSectorAboveWall } from '../../packages/nodes/src/roof/conical-roof'
import { resolveConicalRoofPlacement } from '../../packages/nodes/src/roof/conical-roof-placement'
import { roofDefinition } from '../../packages/nodes/src/roof/definition'
import { buildRoofFloorplan } from '../../packages/nodes/src/roof/floorplan'
import { isStandardRoofWallEligible, parseRoofFootprintSource } from '../../packages/nodes/src/roof/roof-footprint'
import { commitRoofFootprint, commitRoofPlacement } from '../../packages/nodes/src/roof/tool'
import { polygonArea } from './_mesh'
import { num, pt, pts, row, title } from './_print'
import {
  areaOf,
  type Box,
  baseOnWalls,
  boxesOverlap,
  boxOf,
  coneOn,
  coneOnExact,
  coneOnWall,
  cornersOf,
  cutCorners,
  type Deck,
  drawn,
  eavesReach,
  fitOf,
  floorsOf,
  footprintFrom,
  type Host,
  heightAfterChange,
  isGuide,
  type Level,
  levelAbove,
  levelBelow,
  levelToRoof,
  levelToSeg,
  type Owner,
  owns,
  ownsInPlan,
  type Roof,
  type Seg,
  segToLevel,
  shared,
  sorted,
  supportAfterMove,
  unionArea,
  unionCorners,
  type WallIn,
  wallTopFor,
} from './_roof-equations'
import { type P, plain } from './_wall-equations'

type Nodes = Record<string, AnyNode>
type Op = { node: AnyNode; parentId?: AnyNodeId }
const DEG = Math.PI / 180

// ------------------------------------------------------------------ what the cases share
function record(...lists: AnyNode[][]): Nodes {
  return Object.fromEntries(lists.flat().map((node) => [node.id, node])) as Nodes
}

// a scene to write into, as the editor hands one to a tool
function sceneOf(nodes: Nodes) {
  const made: Op[] = []
  const api = {
    nodes: () => nodes,
    createMany: (ops: Op[]) => made.push(...ops),
    upsert: (node: AnyNode, parentId?: AnyNodeId) => made.push({ node, parentId }),
  } as unknown as SceneApi
  return { api, made }
}

function room(level: LevelNode, corners: Array<[number, number]>, heights: Array<number | undefined>): WallNode[] {
  return corners.map((start, index) =>
    WallNode.parse({
      parentId: level.id,
      start,
      end: corners[(index + 1) % corners.length],
      height: heights[index % heights.length],
    }),
  )
}

// the outline rings the plan builder draws for a roof
function outlineOf(roof: RoofNode, segments: RoofSegmentNode[], siblings: AnyNode[], nodes: Nodes): P[][] {
  const context = {
    resolve: <N = AnyNode>(id: AnyNodeId) => nodes[id] as N | undefined,
    children: segments,
    siblings,
    parent: null,
  } as unknown as GeometryContext
  const geometry: FloorplanGeometry | null = buildRoofFloorplan({ ...roof, children: segments.map((s) => s.id) }, context)
  if (geometry?.kind !== 'group') return []
  return geometry.children.flatMap((child) =>
    child.kind === 'polygon' && child.fill === 'none'
      ? [(child.points as Array<[number, number]>).map(([x, y]) => ({ x, y }))]
      : [],
  )
}

const roofIn = (roof: RoofNode): Roof => ({ P: roof.position, rho: roof.rotation })
const segIn = (seg: RoofSegmentNode): Seg => ({
  s: seg.position,
  sigma: seg.rotation,
  w: seg.width,
  d: seg.depth,
  cone: seg.roofType === 'conical',
})
const wallIn = (wall: WallNode, level: number, b = 0): WallIn => ({ ...plain(wall), level, g: wall.height, b })

const v3 = (p: readonly number[]) => pt([p[0]!, p[1]!, p[2]!])
const boxText = (box: Box) => `u ${num(box.minU)}..${num(box.maxU)} v ${num(box.minV)}..${num(box.maxV)}`
const forkBox = (b: { minX: number; maxX: number; minZ: number; maxZ: number }): Box => ({
  minU: b.minX,
  maxU: b.maxX,
  minV: b.minZ,
  maxV: b.maxZ,
})
const roofText = (P: readonly number[], turn: number, support: string) =>
  `roof P ${v3(P)} turn ${num(turn)} support ${support}`
const segText = (s: readonly number[], w: number, d: number, turn: number, wall: number, pitch: number, type: string) =>
  `segment at ${v3(s)} w ${num(w)} d ${num(d)} turn ${num(turn)} wall ${num(wall)} pitch ${num(pitch)} ${type}`
const forkSeg = (seg: RoofSegmentNode) =>
  segText(seg.position, seg.width, seg.depth, seg.rotation, seg.wallHeight, seg.pitch, seg.roofType)
const forkRoof = (roof: RoofNode) => roofText(roof.position, roof.rotation, roof.support.kind)

const ROOM: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
]
const AROUND: Array<[number, number]> = [
  [-1, -1],
  [5, -1],
  [5, 4],
  [-1, 4],
]

// ------------------------------------------------------------------ the cases
title('R0 a roof as the schema makes it, with nothing given')
{
  const roof = RoofNode.parse({})
  row('R0.position', v3(roof.position))
  row('R0.rotation', roof.rotation)
  row('R0.support', roof.support.kind)
  const mounted = RoofNode.parse({ support: { kind: 'roof', roofSegmentId: 'rseg_host', localPosition: [0, 0] } })
  row('R0.curb_height', mounted.support.kind === 'roof' ? mounted.support.curbHeight : Number.NaN)
}

title(
  'R1 into the level and back: a roof at (10, 3, 4) turned 0, 90 and 30 degrees; its segment 6 x 4 at (2, 0.5, 1) in the roof, not turned and turned 60 degrees; the point (1, 0.25, 1.5) of the segment',
)
for (const [turn, segTurn] of [
  [0, 0],
  [90, 0],
  [30, 0],
  [30, 60],
] as Array<[number, number]>) {
  const level = LevelNode.parse({ level: 0 })
  const roof = RoofNode.parse({ parentId: level.id, position: [10, 3, 4], rotation: turn * DEG })
  const seg = RoofSegmentNode.parse({
    parentId: roof.id,
    position: [2, 0.5, 1],
    rotation: segTurn * DEG,
    width: 6,
    depth: 4,
  })
  roof.children = [seg.id]
  level.children = [roof.id]
  const nodes = record([level, roof, seg])
  const key = segTurn ? `R1.turn(${turn}).segment_turn(${segTurn})` : `R1.turn(${turn})`
  // the point as three.js places it: the roof's group and the segment's object carry `position`
  // and `rotation.y`, which is how the roof's renderer and the roof system set them
  const group = new THREE.Group()
  group.position.set(roof.position[0], roof.position[1], roof.position[2])
  group.rotation.y = roof.rotation
  const body = new THREE.Object3D()
  body.position.set(seg.position[0], seg.position[1], seg.position[2])
  body.rotation.y = seg.rotation
  group.add(body)
  group.updateMatrixWorld(true)
  const origin = group.localToWorld(new THREE.Vector3(0, 0, 0))
  const along = group.localToWorld(new THREE.Vector3(1, 0, 0))
  row(`${key}.roof_x_axis`, pt([along.x - origin.x, along.z - origin.z]))
  row(`${key}.roof_x_axis.by_equation`, pt([Math.cos(roof.rotation), -Math.sin(roof.rotation)]))
  const placed = body.localToWorld(new THREE.Vector3(1, 0.25, 1.5))
  const mine = segToLevel(roofIn(roof), segIn(seg), 1, 1.5, 0.25)
  row(`${key}.point`, v3([placed.x, placed.y, placed.z]))
  row(`${key}.point.by_equation`, v3(mine))
  // the same point back into the segment's own plan: the place a cone would be given on this segment
  const back = resolveConicalRoofPlacement({
    nodes,
    levelId: level.id,
    center: [placed.x, placed.z],
    radius: 0,
    curbHeight: 0,
    allowRoofSupport: true,
    requireRoofSupport: true,
  })
  row(`${key}.point.back`, back.valid && back.kind === 'roof' ? pt(back.support.localPosition) : 'none')
  row(`${key}.point.back.by_equation`, pt(levelToSeg(roofIn(roof), segIn(seg), mine[0], mine[2])))
  // the segment's four corners, by the plan builder
  row(`${key}.corners`, pts(outlineOf(roof, [seg], [], nodes)[0] ?? []))
  row(`${key}.corners.by_equation`, pts(cornersOf(roofIn(roof), segIn(seg), 0.01)))
  const box = getRoofPlanBounds({ position: roof.position, rotation: roof.rotation, segments: [seg] })
  row(`${key}.box`, box ? boxText(forkBox(box)) : 'none')
  row(`${key}.box.by_equation`, boxText(boxOf(roofIn(roof), [segIn(seg)])))
}

// One scene for R2 and R3: a room 4 x 3 of walls on the lower level, a roof with one segment
// 4 x 3 over it, and what is asked for on top of that.
type Wanted = {
  heights?: Array<number | undefined>
  support?: 'level' | 'walls' | 'roof'
  stored?: number
  slab?: number
  deck?: boolean
  upperOffset?: number
  sameLevel?: boolean
  between?: boolean
  noWalls?: boolean
  noSegments?: boolean
  turn?: number
  extra?: { start: [number, number]; end: [number, number]; height: number; curveOffset?: number }
}

function standing(want: Wanted) {
  spatialGridManager.clear()
  const lower = LevelNode.parse({ level: 0, height: 2.7 })
  const middle = want.between ? LevelNode.parse({ level: 1, height: 2.7 }) : null
  const upper = want.sameLevel
    ? null
    : LevelNode.parse({ level: want.between ? 2 : 1, height: 2.7, baseElevation: want.upperOffset ?? 0 })
  const roofLevel = upper ?? lower
  const walls = want.noWalls ? [] : room(lower, ROOM, want.heights ?? [2.4])
  if (want.extra) walls.push(WallNode.parse({ parentId: lower.id, ...want.extra }))
  const support =
    want.support === 'roof'
      ? { kind: 'roof', roofSegmentId: 'rseg_host', localPosition: [0, 0] }
      : { kind: want.support ?? 'walls' }
  const roof = RoofNode.parse({
    parentId: roofLevel.id,
    support,
    position: [2, want.stored ?? 0, 1.5],
    rotation: (want.turn ?? 0) * DEG,
  })
  const segment = RoofSegmentNode.parse({ parentId: roof.id, width: 4, depth: 3 })
  roof.children = want.noSegments ? [] : [segment.id]
  const slab =
    want.slab === undefined ? null : SlabNode.parse({ parentId: lower.id, elevation: want.slab, polygon: AROUND })
  const deck =
    want.deck && upper ? SlabNode.parse({ parentId: upper.id, elevation: 0.05, thickness: 0.3, polygon: AROUND }) : null
  // the slab a wall stands on is asked of the spatial grid, which hears of a slab when it is made
  if (slab) spatialGridManager.handleNodeCreated(slab, lower.id)
  lower.children = [...walls.map((w) => w.id), ...(slab ? [slab.id] : []), ...(upper ? [] : [roof.id])]
  if (upper) upper.children = [roof.id, ...(deck ? [deck.id] : [])]
  const nodes = record(
    [lower, roof, segment],
    middle ? [middle] : [],
    upper ? [upper] : [],
    slab ? [slab] : [],
    deck ? [deck] : [],
    walls,
  )
  const base = resolveRoofElevation(roof, nodes)
  const world = (getLevelElevations(nodes).get(roofLevel.id)?.baseY ?? Number.NaN) + base
  spatialGridManager.clear()

  // the same from the note's equations
  const levels: Level[] = [{ ordinal: 0, height: 2.7 }]
  if (middle) levels.push({ ordinal: 1, height: 2.7 })
  if (upper) levels.push({ ordinal: want.between ? 2 : 1, height: 2.7, offset: want.upperOffset ?? 0 })
  const roofAt = levels.length - 1
  const wallsIn = walls.map((wall) => wallIn(wall, 0, want.slab ?? 0))
  const decks: Deck[] = deck
    ? [{ level: roofAt, polygon: AROUND.map(([x, y]) => ({ x, y })), elevation: 0.05, thickness: 0.3 }]
    : []
  const ownBase =
    (want.support ?? 'walls') === 'walls'
      ? baseOnWalls(
          levels,
          { ...roofIn(roof), level: roofAt, segs: want.noSegments ? [] : [segIn(segment)] },
          wallsIn,
          decks,
          // with no segment the fork asks which room the roof's own point lies in: here, the room
          want.noSegments ? wallsIn.slice(0, 4) : [],
        )
      : roof.position[1]
  return { base, world, own: { base: ownBase, world: floorsOf(levels)[roofAt]! + ownBase } }
}

title(
  'R2 the base height for each support: storeys of 2.7 m; a room (0, 0) to (4, 3) of walls 0.1 thick on the lower level; the roof, one segment 4 x 3, on the upper level at (2, y, 1.5). The slab: under all the walls, its top 0.15 above the lower floor. The deck: a slab 0.3 thick on the upper level over all the walls, its top 0.05 above that floor',
)
for (const [name, want] of [
  ['level.stored_0', { support: 'level', stored: 0 }],
  ['level.stored_0.4', { support: 'level', stored: 0.4 }],
  ['on_a_roof.stored_3.9', { support: 'roof', stored: 3.9 }],
  ['walls.2.4_high', { heights: [2.4] }],
  ['walls.no_height', { heights: [undefined] }],
  ['walls.2.4_and_no_height', { heights: [2.4, undefined] }],
  ['walls.2.4_high.on_a_slab_0.15', { heights: [2.4], slab: 0.15 }],
  ['walls.no_height.on_a_slab_0.15', { heights: [undefined], slab: 0.15 }],
  ['walls.2.4_high.under_a_deck', { heights: [2.4], deck: true }],
  ['walls.no_height.under_a_deck', { heights: [undefined], deck: true }],
  ['walls.2.4_high.upper_level_raised_0.5', { heights: [2.4], upperOffset: 0.5 }],
  ['walls.no_height.upper_level_raised_0.5', { heights: [undefined], upperOffset: 0.5 }],
  ['walls.2.4_high.roof_on_their_own_level', { heights: [2.4], sameLevel: true }],
] as Array<[string, Wanted]>) {
  const got = standing(want)
  row(`R2.${name}`, `base ${num(got.base)} world ${num(got.world)}`)
  row(`R2.${name}.by_equation`, `base ${num(got.own.base)} world ${num(got.own.world)}`)
}

title(
  'R3 which walls hold a following roof up: the R2 room of walls 2.4 m, the roof stored at 1.25. Then one more wall 3.5 m high and 0.1 thick: a partition (2, 0) to (2, 3); beside the edge u = 4 with its centreline 0.2 and 0.05 outside; running on from beside the edge past the corner (4, 3), with 0.06 and 0.04 m of it beside the roof; butting on the edge from (4, 1.5) to (7, 1.5); 0.3 beyond the end v = 3, the roof as it is and turned 90 degrees; bent, from (4.3, 0.5) to (4.3, 2.5), with sagitta -0.5 (its middle 0.2 under the roof) and +0.5. Then the room two levels down, no walls, a roof with no segment',
)
for (const [name, want] of [
  ['room_only', {}],
  ['partition_inside', { extra: { start: [2, 0], end: [2, 3], height: 3.5 } }],
  ['outside_by_0.2', { extra: { start: [4.2, 0], end: [4.2, 3], height: 3.5 } }],
  ['outside_by_0.05', { extra: { start: [4.05, 0], end: [4.05, 3], height: 3.5 } }],
  ['along_the_edge.0.06_beside', { extra: { start: [4.05, 2.94], end: [4.05, 6], height: 3.5 } }],
  ['along_the_edge.0.04_beside', { extra: { start: [4.05, 2.96], end: [4.05, 6], height: 3.5 } }],
  ['butting_on_the_edge', { extra: { start: [4, 1.5], end: [7, 1.5], height: 3.5 } }],
  ['beyond_the_end.roof_as_it_is', { extra: { start: [1, 3.3], end: [3, 3.3], height: 3.5 } }],
  ['beyond_the_end.roof_turned_90', { turn: 90, extra: { start: [1, 3.3], end: [3, 3.3], height: 3.5 } }],
  ['bent.bulging_under', { extra: { start: [4.3, 0.5], end: [4.3, 2.5], height: 3.5, curveOffset: -0.5 } }],
  ['bent.bulging_away', { extra: { start: [4.3, 0.5], end: [4.3, 2.5], height: 3.5, curveOffset: 0.5 } }],
  ['two_levels_down', { between: true }],
  ['no_walls', { noWalls: true }],
  ['no_segments', { noSegments: true }],
] as Array<[string, Wanted]>) {
  const got = standing({ stored: 1.25, ...want })
  row(`R3.${name}`, got.base)
  row(`R3.${name}.by_equation`, got.own.base)
}

title(
  'R4 the plan outline: a roof at (10, 0, 4); segment A 8 x 6 at its origin, segment B 4 x 4 at (5, 0, 0); then B turned 30 degrees; then the roof turned 30 degrees; then one segment 0.4 x 3 and one 0.004 x 3; then how far the eaves of an 8 x 6 segment reach past it',
)
{
  const sizes = { a: { width: 8, depth: 6 }, b: { width: 4, depth: 4, position: [5, 0, 0] as [number, number, number] } }
  for (const [name, roofTurn, bTurn, both] of [
    ['one', 0, 0, false],
    ['two', 0, 0, true],
    ['two.b_turned_30', 0, 30, true],
    ['two.roof_turned_30', 30, 0, true],
  ] as Array<[string, number, number, boolean]>) {
    const roof = RoofNode.parse({ position: [10, 0, 4], rotation: roofTurn * DEG })
    const a = RoofSegmentNode.parse({ parentId: roof.id, ...sizes.a })
    const b = RoofSegmentNode.parse({ parentId: roof.id, ...sizes.b, rotation: bTurn * DEG })
    const segments = both ? [a, b] : [a]
    const rings = outlineOf(roof, segments, [], record([roof, a, b]))
    const A = cornersOf(roofIn(roof), segIn(a), 0.01)
    const B = cornersOf(roofIn(roof), segIn(b), 0.01)
    row(`R4.${name}.rings`, rings.length)
    row(`R4.${name}.outline`, pts(rings[0] ?? []))
    if (!both) row(`R4.${name}.outline.by_equation`, pts(A))
    row(`R4.${name}.corners`, pts(sorted(rings[0] ?? [])))
    row(`R4.${name}.corners.by_equation`, pts(both ? unionCorners(A, B) : sorted(A)))
    row(`R4.${name}.area`, polygonArea(rings[0] ?? []))
    row(`R4.${name}.area.by_equation`, both ? unionArea(A, B) : areaOf(A))
    const box = getRoofPlanBounds({ position: roof.position, rotation: roof.rotation, segments })
    row(`R4.${name}.box`, box ? boxText(forkBox(box)) : 'none')
    row(`R4.${name}.box.by_equation`, boxText(boxOf(roofIn(roof), segments.map(segIn))))
  }
  // segments under one metre and under one centimetre wide: the outline, the overlap box and
  // the alignment box each have their own least size
  for (const width of [0.4, 0.004]) {
    const roof = RoofNode.parse({ position: [10, 0, 4] })
    const thin = RoofSegmentNode.parse({ parentId: roof.id, width, depth: 3 })
    roof.children = [thin.id]
    const nodes = record([roof, thin])
    const key = `R4.narrow_${width}`
    row(`${key}.corners`, pts(sorted(outlineOf(roof, [thin], [], nodes)[0] ?? [])))
    row(`${key}.corners.by_equation`, pts(sorted(cornersOf(roofIn(roof), segIn(thin), 0.01))))
    const box = getRoofPlanBounds({ position: roof.position, rotation: roof.rotation, segments: [thin] })
    row(`${key}.box`, box ? boxText(forkBox(box)) : 'none')
    row(`${key}.box.by_equation`, boxText(boxOf(roofIn(roof), [segIn(thin)])))
    const aligned = roofDefinition.capabilities?.alignmentFootprint?.(roof, nodes as never) as
      | { minX: number; maxX: number; minZ: number; maxZ: number }
      | null
      | undefined
    row(`${key}.alignment_box`, aligned ? boxText(forkBox(aligned)) : 'none')
    row(`${key}.alignment_box.by_equation`, boxText(boxOf(roofIn(roof), [segIn(thin)], 1)))
  }
  for (const [type, pitch] of [
    ['gable', 40],
    ['hip', 40],
    ['shed', 40],
    ['flat', 40],
    ['gable', 0],
  ] as Array<[RoofSegmentNode['roofType'], number]>) {
    const seg = RoofSegmentNode.parse({ roofType: type, pitch, width: 8, depth: 6 })
    const top = getRoofSegmentVisibleTopBounds(seg)
    const reach = eavesReach(type, pitch)
    const key = `R4.eaves.${type}_${pitch}`
    row(key, `x ${num(top.maxX - 4)} front ${num(top.maxZ - 3)} back ${num(-top.minZ - 3)}`)
    row(`${key}.by_equation`, `x ${num(reach.x)} front ${num(reach.front)} back ${num(reach.back)}`)
  }
}

// the draw tool, on a level that holds what is given
function draw(
  nodes: Nodes,
  levelId: LevelNode['id'],
  c1: [number, number],
  c2: [number, number],
  quarter: boolean,
  selected: string[] = [],
  mode: 'auto' | 'ground' | 'roof' = 'auto',
) {
  const { api, made } = sceneOf(nodes)
  // the clicks come from a plane 9 m up: the tool does not read their height
  commitRoofPlacement(api, levelId, [c1[0], 9, c1[1]], [c2[0], 9, c2[1]], selected, quarter, mode)
  return {
    roof: made.find((op) => op.node.type === 'roof')?.node as RoofNode | undefined,
    segment: made.find((op) => op.node.type === 'roof-segment')?.node as RoofSegmentNode | undefined,
  }
}

title(
  'R5 the draw tool: clicks at (1, 2) and (9, 8); the same with the quarter turn; clicks 0.4 m apart, (0, 0) and (0.4, 3); the first clicks with a preset that turns the roof 30 degrees; and which walls it offers as guides: (0, 0) to (4, 0), to (4, 0.0001), to (4, 0.001), to (4, 4), and a bent wall from (-2, 0) to (2, 0) with sagitta 2',
)
{
  for (const [name, end, sagitta] of [
    ['along_u', [4, 0], 0],
    ['off_by_0.0001', [4, 0.0001], 0],
    ['off_by_0.001', [4, 0.001], 0],
    ['at_45_degrees', [4, 4], 0],
    ['bent', [2, 0], 2],
  ] as Array<[string, [number, number], number]>) {
    const wall = WallNode.parse({ start: sagitta ? [-2, 0] : [0, 0], end, curveOffset: sagitta })
    row(`R5.guide.${name}`, isStandardRoofWallEligible(wall))
    row(`R5.guide.${name}.by_equation`, isGuide(plain(wall)))
  }
  const level = LevelNode.parse({ level: 0 })
  const nodes = record([level])
  for (const [name, c1, c2, quarter, preset] of [
    ['plain', [1, 2], [9, 8], false, 0],
    ['quarter_turn', [1, 2], [9, 8], true, 0],
    ['clicks_0.4_apart', [0, 0], [0.4, 3], false, 0],
    ['preset_turned_30', [1, 2], [9, 8], false, 30],
    ['preset_turned_30.quarter_turn', [1, 2], [9, 8], true, 30],
  ] as Array<[string, [number, number], [number, number], boolean, number]>) {
    if (preset) useEditor.getState().setToolDefaults('roof', { rotation: preset * DEG })
    const got = draw(nodes, level.id, c1, c2, quarter)
    if (preset) useEditor.getState().setToolDefaults('roof', null)
    const mine = drawn({ x: c1[0], y: c1[1] }, { x: c2[0], y: c2[1] }, quarter, preset * DEG)
    row(`R5.${name}`, got.roof && got.segment ? `${forkRoof(got.roof)}; ${forkSeg(got.segment)}` : 'nothing')
    row(
      `R5.${name}.by_equation`,
      `${roofText([mine.centre.x, 0, mine.centre.y], preset * DEG, 'level')}; ${segText([0, 0, 0], mine.w, mine.d, mine.sigma, 0.5, 40, 'gable')}`,
    )
    if (preset && got.roof && got.segment) {
      row(`R5.${name}.corners`, pts(sorted(outlineOf(got.roof, [got.segment], [], nodes)[0] ?? [])))
      row(
        `R5.${name}.corners.by_equation`,
        pts(
          sorted(
            cornersOf(
              { P: [mine.centre.x, 0, mine.centre.y], rho: preset * DEG },
              { s: [0, 0, 0], sigma: mine.sigma, w: mine.w, d: mine.d },
            ),
          ),
        ),
      )
    }
  }
}

title(
  'R6 one more segment for a selected roof: the roof at (5, 0, 5) turned 30 degrees; clicks at (8, 4) and (12, 6). With the roof known to the scene as in the running editor (the roof selected, one of its segments selected, both selected); then not known; then known inside a building that stands 100 m east and 50 m south',
)
{
  const level = LevelNode.parse({ level: 0 })
  const roof = RoofNode.parse({ parentId: level.id, position: [5, 0, 5], rotation: 30 * DEG })
  const first = RoofSegmentNode.parse({ parentId: roof.id, width: 8, depth: 6 })
  roof.children = [first.id]
  level.children = [roof.id]
  const nodes = record([level, roof, first])
  const centreOf = (seg: RoofSegmentNode) => {
    const box = getRoofPlanBounds({ position: roof.position, rotation: roof.rotation, segments: [seg] })
    return box ? pt([(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]) : 'none'
  }
  const mine = drawn({ x: 8, y: 4 }, { x: 12, y: 6 }, false, roof.rotation)
  const [a, b] = levelToRoof(roofIn(roof), mine.centre.x, mine.centre.y)
  const own: Seg = { s: [a, 0, b], sigma: mine.sigma, w: mine.w, d: mine.d }
  const ownBox = boxOf(roofIn(roof), [own])

  // the roof's group, placed as its renderer places it, and known to the scene
  const group = new THREE.Group()
  group.position.set(roof.position[0], roof.position[1], roof.position[2])
  group.rotation.y = roof.rotation
  group.updateMatrixWorld(true)
  sceneRegistry.nodes.set(roof.id, group)
  const known = draw(nodes, level.id, [8, 4], [12, 6], false, [roof.id]).segment
  sceneRegistry.nodes.delete(roof.id)
  row('R6.known', known ? forkSeg(known) : 'nothing')
  row('R6.known.by_equation', segText(own.s, own.w, own.d, own.sigma, 0.5, 40, 'gable'))
  row('R6.known.centre_in_level', known ? centreOf(known) : 'none')
  row('R6.known.centre_in_level.by_equation', pt([(ownBox.minU + ownBox.maxU) / 2, (ownBox.minV + ownBox.maxV) / 2]))

  // the same with a segment of the roof selected instead of the roof
  sceneRegistry.nodes.set(roof.id, group)
  const bySegment = draw(nodes, level.id, [8, 4], [12, 6], false, [first.id]).segment
  sceneRegistry.nodes.delete(roof.id)
  row('R6.known.segment_selected', bySegment ? forkSeg(bySegment) : 'nothing')
  row('R6.known.segment_selected.by_equation', segText(own.s, own.w, own.d, own.sigma, 0.5, 40, 'gable'))

  // two things selected: not one more segment, a new roof as in R5
  const two = draw(nodes, level.id, [8, 4], [12, 6], false, [roof.id, first.id])
  const fresh = drawn({ x: 8, y: 4 }, { x: 12, y: 6 })
  row('R6.two_selected', two.roof && two.segment ? `${forkRoof(two.roof)}; ${forkSeg(two.segment)}` : 'nothing')
  row(
    'R6.two_selected.by_equation',
    `${roofText([fresh.centre.x, 0, fresh.centre.y], 0, 'level')}; ${segText([0, 0, 0], fresh.w, fresh.d, fresh.sigma, 0.5, 40, 'gable')}`,
  )

  // not known to the scene: the tool's own fallback arithmetic
  const unknown = draw(nodes, level.id, [8, 4], [12, 6], false, [roof.id]).segment
  row('R6.not_known', unknown ? forkSeg(unknown) : 'nothing')
  row('R6.not_known.centre_in_level', unknown ? centreOf(unknown) : 'none')

  // known, but the building it is in does not stand at the site's origin: the building's group
  // carries the building's place, as its renderer sets it, and the roof's group is inside it
  const building = new THREE.Group()
  building.position.set(100, 0, 50)
  building.add(group)
  building.updateMatrixWorld(true)
  sceneRegistry.nodes.set(roof.id, group)
  const moved = draw(nodes, level.id, [8, 4], [12, 6], false, [roof.id]).segment
  sceneRegistry.nodes.delete(roof.id)
  row('R6.known.building_moved', moved ? forkSeg(moved) : 'nothing')
  row('R6.known.building_moved.centre_in_level', moved ? centreOf(moved) : 'none')
}

title(
  'R7 the room tool: storeys of 2.7 m; a room (0, 0) to (4, 3) of walls 2.4 m on the lower level, clicked at (2, 1) with the upper level active; the same with the quarter turn; with no upper level; with its walls listed from the corner (4, 0); a room turned 45 degrees, clicked at (1, 3), its walls listed from (0, 0) and from (4, 4); outlines that are not rectangles; an L-shaped room clicked at (1, 1), alone and over the first room; the first room with the tool set to the conical type',
)
{
  const levels: Level[] = [
    { ordinal: 0, height: 2.7 },
    { ordinal: 1, height: 2.7 },
  ]
  for (const [name, corners, click, quarter, topFloor] of [
    ['room', ROOM, [2, 1], false, false],
    ['room.quarter_turn', ROOM, [2, 1], true, false],
    ['room.top_floor', ROOM, [2, 1], false, true],
    ['room_walls_listed_from_another_corner', [[4, 0], [4, 3], [0, 3], [0, 0]], [2, 1], false, false],
    ['turned_room', [[0, 0], [4, 4], [2, 6], [-2, 2]], [1, 3], false, false],
    ['turned_room.quarter_turn', [[0, 0], [4, 4], [2, 6], [-2, 2]], [1, 3], true, false],
    ['turned_room_walls_listed_from_another_corner', [[4, 4], [2, 6], [-2, 2], [0, 0]], [1, 3], false, false],
  ] as Array<[string, Array<[number, number]>, [number, number], boolean, boolean]>) {
    spatialGridManager.clear()
    const lower = LevelNode.parse({ level: 0, height: 2.7 })
    const upper = LevelNode.parse({ level: 1, height: 2.7 })
    const walls = room(lower, corners, [2.4])
    lower.children = walls.map((w) => w.id)
    const nodes = record([lower], topFloor ? [] : [upper], walls)
    const active = topFloor ? lower : upper
    const target = resolveRoomRoofFootprint(active.id, nodes, click, { rectangularOnly: true })
    const polygon = (target?.polygon ?? []).map(([x, y]) => ({ x, y }))
    const fit = fitOf(polygon)
    if (!name.includes('.')) {
      // the room's own outline, as the fork's room detection gives it (through the walls' centrelines)
      row(`R7.${name}.polygon`, pts(polygon))
      row(
        `R7.${name}.fit`,
        target
          ? `centre ${pt(target.center)} w ${num(target.width)} d ${num(target.depth)} turn ${num(target.rotation)} rectangle ${target.rectangular}`
          : 'none',
      )
      row(
        `R7.${name}.fit.by_equation`,
        fit
          ? `centre ${pt(fit.centre)} w ${num(fit.W)} d ${num(fit.D)} turn ${num(fit.rho)} rectangle ${fit.rectangular}`
          : 'none',
      )
    }
    const { api, made } = sceneOf(nodes)
    if (target) commitRoofFootprint(api, active.id, target, quarter)
    const roofOp = made.find((op) => op.node.type === 'roof')
    const segOp = made.find((op) => op.node.type === 'roof-segment')
    const where = (id: unknown) => (id === upper.id ? 'upper' : id === lower.id ? 'lower' : 'no')
    row(
      `R7.${name}.made`,
      roofOp && segOp
        ? `on the ${where(roofOp.parentId)} level; ${forkRoof(roofOp.node as RoofNode)}; ${forkSeg(segOp.node as RoofSegmentNode)}`
        : 'nothing',
    )
    if (fit) {
      const storeys = topFloor ? levels.slice(0, 1) : levels
      const above = levelAbove(storeys, 0)
      const parent = above >= 0 ? above : 0
      const y = Math.max(...walls.map((wall) => wallTopFor(storeys, wallIn(wall, 0), parent)))
      row(
        `R7.${name}.made.by_equation`,
        `on the ${parent === 1 ? 'upper' : 'lower'} level; ${roofText([fit.centre.x, y, fit.centre.y], fit.rho, 'walls')}; ${segText([0, 0, 0], quarter ? fit.D : fit.W, quarter ? fit.W : fit.D, quarter ? Math.PI / 2 : 0, 0, 40, 'gable')}`,
      )
    }
  }
  // outlines that are nearly, and not, rectangles
  for (const [name, polygon] of [
    ['notch_0.6', [[0, 0], [4, 0], [4, 3], [0.6, 3], [0.6, 2.4], [0, 2.4]]],
    ['notch_0.8', [[0, 0], [4, 0], [4, 3], [0.8, 3], [0.8, 2.2], [0, 2.2]]],
    ['l_shape', [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]],
  ] as Array<[string, Array<[number, number]>]>) {
    const target = fitRoofFootprint(name, polygon, [])
    const fit = fitOf(polygon.map(([x, y]) => ({ x, y })))
    row(
      `R7.${name}.fit`,
      target
        ? `centre ${pt(target.center)} w ${num(target.width)} d ${num(target.depth)} turn ${num(target.rotation)} rectangle ${target.rectangular}`
        : 'none',
    )
    row(
      `R7.${name}.fit.by_equation`,
      fit
        ? `centre ${pt(fit.centre)} w ${num(fit.W)} d ${num(fit.D)} turn ${num(fit.rho)} rectangle ${fit.rectangular}`
        : 'none',
    )
  }
  // the L-shaped room as walls: the tool makes nothing
  {
    const corners: Array<[number, number]> = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]
    const lower = LevelNode.parse({ level: 0, height: 2.7 })
    const walls = room(lower, corners, [2.4])
    lower.children = walls.map((w) => w.id)
    const nodes = record([lower], walls)
    const fit = fitOf(corners.map(([x, y]) => ({ x, y })))
    row('R7.l_shape.room_taken', resolveRoomRoofFootprint(lower.id, nodes, [1, 1], { rectangularOnly: true }) !== null)
    row('R7.l_shape.room_taken.by_equation', fit?.rectangular === true)
    // the same L-shaped room on the active level, over the 4 x 3 room on the level below
    const below = LevelNode.parse({ level: -1, height: 2.7 })
    const under = room(below, ROOM, [2.4])
    below.children = under.map((w) => w.id)
    const stacked = record([lower, below], walls, under)
    row('R7.l_shape.over_a_room_below.room_taken', resolveRoomRoofFootprint(lower.id, stacked, [1, 1], { rectangularOnly: true }) !== null)
    // the active level has a room at the click: it alone is asked
    row('R7.l_shape.over_a_room_below.room_taken.by_equation', fit ? fit.rectangular : true)
  }
  // the first room again, with the tool set to the conical type: the room tool makes no cone
  {
    const lower = LevelNode.parse({ level: 0, height: 2.7 })
    const upper = LevelNode.parse({ level: 1, height: 2.7 })
    const walls = room(lower, ROOM, [2.4])
    lower.children = walls.map((w) => w.id)
    const nodes = record([lower, upper], walls)
    const target = resolveRoomRoofFootprint(upper.id, nodes, [2, 1], { rectangularOnly: true })
    const { api, made } = sceneOf(nodes)
    useEditor.getState().setToolDefaults('roof', { roofType: 'conical' })
    if (target) commitRoofFootprint(api, upper.id, target, false)
    useEditor.getState().setToolDefaults('roof', null)
    row('R7.room.conical_type.made', made.length === 0 ? 'nothing' : `${made.length} nodes`)
    row('R7.room.conical_type.made.by_equation', footprintFrom('conical', 'room') === 'room' ? 'a roof' : 'nothing')
  }
}

title(
  'R8 a cone. Drawn as a circle of radius 1 over a gable roof 10 x 8 (walls 2 m, pitch 45 degrees) that stands at (2, 1, 3): at its middle, 2 m off its ridge, half over its edge, away from it; the same roof turned 30 degrees; with a flat roof 6 x 6 (walls 0.5 m) at (2, 8, 3) above it; drawn with clicks (0.5, 2.5) and (3.5, 3.5). Made on a bent wall from (-2, 0) to (2, 0), sagitta 2, 2.4 m high under a 2.7 m storey, clicked from the level above. And what the tool takes a footprint from',
)
{
  const level = LevelNode.parse({ id: 'level_host', level: 0, height: 2.7, children: ['roof_host'] })
  const cone = (c: P, r: number, mode: 'auto' | 'ground' | 'roof', hostTurn = 0) => {
    const host = RoofNode.parse({
      id: 'roof_host',
      parentId: level.id,
      position: [2, 1, 3],
      rotation: hostTurn * DEG,
      children: ['rseg_host'],
    })
    const segment = RoofSegmentNode.parse({
      id: 'rseg_host',
      parentId: host.id,
      roofType: 'gable',
      width: 10,
      depth: 8,
      wallHeight: 2,
      pitch: 45,
    })
    const placement = resolveConicalRoofPlacement({
      nodes: record([level, host, segment]),
      levelId: level.id,
      center: [c.x, c.y],
      radius: r,
      curbHeight: 0.5,
      allowRoofSupport: mode !== 'ground',
      requireRoofSupport: mode === 'roof',
    })
    const own: Host = { roof: roofIn(host), seg: segIn(segment), wallHeight: 2, pitchDeg: 45 }
    return { placement, host: own, nodes: record([level, host, segment]) }
  }
  const said = (kind: string, P?: readonly number[], wall?: number, local?: readonly number[], curb?: number) =>
    kind === 'none'
      ? 'nothing'
      : kind === 'level'
        ? `on the level: P ${v3(P!)} wall ${num(wall!)}`
        : `on the roof: P ${v3(P!)} wall ${num(wall!)} at ${pt([local![0]!, local![1]!])} of its segment, curb ${num(curb!)}`
  for (const [name, c, mode, hostTurn] of [
    ['ground_mode.at_the_middle', { x: 2, y: 3 }, 'ground', 0],
    ['auto.at_the_middle', { x: 2, y: 3 }, 'auto', 0],
    ['auto.2_off_the_ridge', { x: 2, y: 5 }, 'auto', 0],
    ['auto.half_over_the_edge', { x: 6.5, y: 3 }, 'auto', 0],
    ['auto.away', { x: 20, y: 20 }, 'auto', 0],
    ['roof_mode.away', { x: 20, y: 20 }, 'roof', 0],
    ['auto.host_turned_30', { x: 2, y: 3 }, 'auto', 30],
  ] as Array<[string, P, 'auto' | 'ground' | 'roof', number]>) {
    const { placement, host } = cone(c, 1, mode, hostTurn)
    const mine = coneOn([host], c, 1, 0.5, mode)
    row(
      `R8.${name}`,
      !placement.valid
        ? said('none')
        : placement.kind === 'level'
          ? said('level', placement.position, placement.wallHeight)
          : said('roof', placement.position, placement.wallHeight, placement.support.localPosition, placement.support.curbHeight),
    )
    row(
      `R8.${name}.by_equation`,
      mine.kind === 'none'
        ? said('none')
        : mine.kind === 'level'
          ? said('level', mine.P, mine.wall)
          : said('roof', mine.P, mine.wall, mine.local, mine.curb),
    )
    if (hostTurn && mine.kind === 'roof') {
      const exact = coneOnExact(host, c, 1, 0.5)
      row(`R8.${name}.exact`, said('roof', [c.x, exact.base, c.y], exact.wall, mine.local, mine.curb))
    }
  }
  // two roofs under the circle: the one with the higher top carries it
  {
    const { nodes, host } = cone({ x: 2, y: 3 }, 1, 'auto')
    const terrace = RoofNode.parse({ id: 'roof_terrace', parentId: level.id, position: [2, 8, 3], children: ['rseg_terrace'] })
    const flat = RoofSegmentNode.parse({
      id: 'rseg_terrace',
      parentId: terrace.id,
      roofType: 'flat',
      width: 6,
      depth: 6,
      wallHeight: 0.5,
    })
    const placement = resolveConicalRoofPlacement({
      nodes: { ...nodes, [terrace.id]: terrace, [flat.id]: flat },
      levelId: level.id,
      center: [2, 3],
      radius: 1,
      curbHeight: 0.5,
      allowRoofSupport: true,
      requireRoofSupport: false,
    })
    const above: Host = { roof: roofIn(terrace), seg: segIn(flat), wallHeight: 0.5, pitchDeg: 0 }
    const mine = coneOn([host, above], { x: 2, y: 3 }, 1, 0.5, 'auto')
    row(
      'R8.auto.a_flat_roof_at_8_above_it',
      placement.valid && placement.kind === 'roof'
        ? `${said('roof', placement.position, placement.wallHeight, placement.support.localPosition, placement.support.curbHeight)}, the ${placement.support.roofSegmentId === flat.id ? 'flat' : 'gable'} one`
        : 'not on a roof',
    )
    row(
      'R8.auto.a_flat_roof_at_8_above_it.by_equation',
      mine.kind === 'roof'
        ? `${said('roof', mine.P, mine.wall, mine.local, mine.curb)}, the ${mine.host === above ? 'flat' : 'gable'} one`
        : 'not on a roof',
    )
  }
  // the tool itself, set to make cones: the two clicks give the circle
  {
    const { nodes, host } = cone({ x: 2, y: 3 }, 1, 'auto')
    useEditor.getState().setToolDefaults('roof', { roofType: 'conical' })
    const got = draw(nodes, level.id, [0.5, 2.5], [3.5, 3.5], false)
    useEditor.getState().setToolDefaults('roof', null)
    const size = drawn({ x: 0.5, y: 2.5 }, { x: 3.5, y: 3.5 })
    const diameter = Math.max(size.W, size.D)
    const mine = coneOn([host], size.centre, diameter / 2, 0.5, 'auto')
    row('R8.drawn_3_by_1', got.roof && got.segment ? `${forkRoof(got.roof)}; ${forkSeg(got.segment)}` : 'nothing')
    row(
      'R8.drawn_3_by_1.by_equation',
      mine.kind === 'none'
        ? 'nothing'
        : `${roofText(mine.P, 0, mine.kind)}; ${segText([0, 0, 0], diameter, diameter, 0, mine.wall, 40, 'conical')}`,
    )
  }
  // a cone on a bent wall
  {
    spatialGridManager.clear()
    const lower = LevelNode.parse({ level: 0, height: 2.7 })
    const upper = LevelNode.parse({ level: 1, height: 2.7 })
    const bent = WallNode.parse({ parentId: lower.id, start: [-2, 0], end: [2, 0], curveOffset: 2, height: 2.4 })
    lower.children = [bent.id]
    const nodes = record([lower, upper, bent])
    const { api, made } = sceneOf(nodes)
    const segmentId = createConicalRoofSectorAboveWall(bent, nodes, api, upper.id)
    const roof = made.find((op) => op.node.type === 'roof')?.node as RoofNode | undefined
    const segment = made.find((op) => op.node.type === 'roof-segment')?.node as RoofSegmentNode | undefined
    const levels: Level[] = [
      { ordinal: 0, height: 2.7 },
      { ordinal: 1, height: 2.7 },
    ]
    const wall = wallIn(bent, 0)
    const mine = coneOnWall(wall, wallTopFor(levels, wall, 1))
    const sector = (start: number, sweep: number, full: boolean) =>
      `start ${num(start)} sweep ${num(sweep)} whole circle ${full}`
    row(
      'R8.on_a_bent_wall',
      roof && segment
        ? `${forkRoof(roof)}; ${forkSeg(segment)}; ${sector(segment.conicalStartAngle ?? Number.NaN, segment.conicalSweepAngle ?? Number.NaN, segment.conicalFullCircle === true)}`
        : 'nothing',
    )
    row(
      'R8.on_a_bent_wall.by_equation',
      mine
        ? `${roofText(mine.P, 0, 'walls')}; ${segText([0, 0, 0], mine.w, mine.w, 0, 0, 40, 'conical')}; ${sector(mine.start, mine.sweep, true)}`
        : 'nothing',
    )
    if (roof && segment) {
      // put where the editor would put them, and asked again where the roof stands
      const placedRoof = { ...roof, parentId: upper.id, position: [roof.position[0], 1.25, roof.position[2]] } as RoofNode
      const placedSegment = { ...segment, parentId: roof.id } as RoofSegmentNode
      const scene = (seg: RoofSegmentNode) =>
        record([lower, { ...upper, children: [placedRoof.id] }, bent, placedRoof, seg])
      const own = (seg: RoofSegmentNode) =>
        baseOnWalls(levels, { ...roofIn(placedRoof), level: 1, segs: [segIn(seg)] }, [wall])
      row('R8.on_a_bent_wall.follows_it', resolveRoofElevation(placedRoof, scene(placedSegment)))
      row('R8.on_a_bent_wall.follows_it.by_equation', own(placedSegment))
      const wider = { ...placedSegment, width: 6 } as RoofSegmentNode
      row('R8.on_a_bent_wall.cone_made_6_wide', resolveRoofElevation(placedRoof, scene(wider)))
      row('R8.on_a_bent_wall.cone_made_6_wide.by_equation', own(wider))
      const again = sceneOf(scene(placedSegment))
      const secondId = createConicalRoofSectorAboveWall(bent, scene(placedSegment), again.api, upper.id)
      row('R8.on_a_bent_wall.clicked_again', `the same segment ${secondId === segmentId}, new nodes ${again.made.length}`)
    }
    // the same wall seen from two levels up, and a straight wall: no cone
    const top = LevelNode.parse({ level: 2, height: 2.7 })
    const three = record([lower, upper, top, bent])
    const storeys: Level[] = [...levels, { ordinal: 2, height: 2.7 }]
    row(
      'R8.on_a_bent_wall.from_two_levels_up',
      createConicalRoofSectorAboveWall(bent, three, sceneOf(three).api, top.id) === null ? 'nothing' : 'a cone',
    )
    row('R8.on_a_bent_wall.from_two_levels_up.by_equation', levelBelow(storeys, 2) === wall.level ? 'a cone' : 'nothing')
    const straight = WallNode.parse({ parentId: lower.id, start: [-2, 0], end: [2, 0], height: 2.4 })
    const plainScene = record([{ ...lower, children: [straight.id] }, upper, straight])
    row(
      'R8.on_a_straight_wall',
      createConicalRoofSectorAboveWall(straight, plainScene, sceneOf(plainScene).api, upper.id) === null ? 'nothing' : 'a cone',
    )
    row('R8.on_a_straight_wall.by_equation', coneOnWall(plain(straight), 0) ? 'a cone' : 'nothing')
  }
  // what the tool takes the footprint from, by the roof type and the choice made in the tool
  for (const [type, chosen] of [
    ['gable', 'draw'],
    ['gable', 'room'],
    ['conical', 'draw'],
    ['conical', 'room'],
  ] as Array<[RoofSegmentNode['roofType'], string]>) {
    row(`R8.footprint_from.${type}.${chosen}_chosen`, parseRoofFootprintSource(chosen, type))
    row(`R8.footprint_from.${type}.${chosen}_chosen.by_equation`, footprintFrom(type, chosen))
  }
}

title(
  'R9 two roofs: the box of a roof at (10, 0, 4) turned 90 degrees with one segment 6 x 2, held against other boxes; which of two segments owns an overlap; a roof 8 x 4 at (3, 0, 0) entering a roof 10 x 8 at the origin',
)
{
  const box = getRoofPlanBounds({
    position: [10, 0, 4],
    rotation: 90 * DEG,
    segments: [{ position: [0, 0, 0], rotation: 0, width: 6, depth: 2 }],
  })!
  const mine = boxOf({ P: [10, 0, 4], rho: 90 * DEG }, [{ s: [0, 0, 0], sigma: 0, w: 6, d: 2 }])
  row('R9.box', boxText(forkBox(box)))
  row('R9.box.by_equation', boxText(mine))
  for (const [name, other] of [
    ['crossing', { minU: 10, maxU: 12, minV: 6, maxV: 8 }],
    ['touching', { minU: 11, maxU: 12, minV: 0, maxV: 8 }],
    ['gap_0.0000005', { minU: 11.0000005, maxU: 12, minV: 0, maxV: 8 }],
    ['gap_0.000002', { minU: 11.000002, maxU: 12, minV: 0, maxV: 8 }],
    ['apart', { minU: 20, maxU: 22, minV: 20, maxV: 22 }],
  ] as Array<[string, Box]>) {
    row(
      `R9.overlap.${name}`,
      roofPlanBoundsOverlap(box, { minX: other.minU, maxX: other.maxU, minZ: other.minV, maxZ: other.maxV }),
    )
    row(`R9.overlap.${name}.by_equation`, boxesOverlap(mine, other))
  }
  const big: Owner = { roofId: 'roof_b', segId: 'rseg_b', w: 10, d: 8 }
  const small: Owner = { roofId: 'roof_a', segId: 'rseg_a', w: 8, d: 4 }
  const twin: Owner = { roofId: 'roof_a', segId: 'rseg_a', w: 10, d: 8 }
  const tower: Owner = { roofId: 'roof_t', segId: 'rseg_t', w: 3, d: 3, onRoofId: 'roof_b', onSegId: 'rseg_b' }
  const fork = (o: Owner) => ({
    roofId: o.roofId,
    segmentId: o.segId,
    width: o.w,
    depth: o.d,
    supportRoofId: o.onRoofId,
    supportRoofSegmentId: o.onSegId,
  })
  for (const [name, candidate, current] of [
    ['larger_over_smaller', big, small],
    ['smaller_over_larger', small, big],
    ['same_size.earlier_id', twin, big],
    ['same_size.later_id', big, twin],
    ['standing_on_the_other', tower, big],
    ['carrying_the_other', big, tower],
  ] as Array<[string, Owner, Owner]>) {
    row(`R9.owns.${name}`, `in the body ${roofOverlapEntryOwns(fork(candidate), fork(current))} in the plan ${roofPlanOverlapEntryOwns(fork(candidate), fork(current))}`)
    row(`R9.owns.${name}.by_equation`, `in the body ${owns(candidate, current)} in the plan ${ownsInPlan(candidate, current)}`)
  }
  // in the plan: the smaller roof's outline loses what lies in the larger one's
  const hostRoof = RoofNode.parse({ id: 'roof_host', children: ['rseg_host'] })
  const entering = RoofNode.parse({ id: 'roof_entering', position: [3, 0, 0], children: ['rseg_entering'] })
  const hostSeg = RoofSegmentNode.parse({ id: 'rseg_host', parentId: hostRoof.id, width: 10, depth: 8 })
  const enteringSeg = RoofSegmentNode.parse({ id: 'rseg_entering', parentId: entering.id, width: 8, depth: 4 })
  const nodes = record([hostRoof, entering, hostSeg, enteringSeg])
  const H = cornersOf(roofIn(hostRoof), segIn(hostSeg), 0.01)
  const E = cornersOf(roofIn(entering), segIn(enteringSeg), 0.01)
  const cut = outlineOf(entering, [enteringSeg], [hostRoof], nodes)[0] ?? []
  row('R9.plan.entering_roof', pts(sorted(cut)))
  row('R9.plan.entering_roof.by_equation', pts(cutCorners(E, H)))
  row('R9.plan.entering_roof.area', polygonArea(cut))
  row('R9.plan.entering_roof.area.by_equation', areaOf(E) - areaOf(shared(E, H)))
  const whole = outlineOf(hostRoof, [hostSeg], [entering], nodes)[0] ?? []
  row('R9.plan.host_roof', pts(sorted(whole)))
  row('R9.plan.host_roof.by_equation', pts(sorted(H)))
}

title(
  'R10 a roof that follows its walls: moved by hand from y = 1; and a room of walls 3 m high under a 3 m storey, the roof on the level above, the walls then made 4.2, 4.20005 and 4.3 m high',
)
{
  const handles =
    typeof roofDefinition.handles === 'function'
      ? roofDefinition.handles(RoofNode.parse({}), undefined as never)
      : (roofDefinition.handles ?? [])
  const handle = handles.find((entry) => entry.kind === 'translate')
  for (const [name, support, y] of [
    ['raised_to_2', 'walls', 2],
    ['moved_level', 'walls', 1],
    ['raised_by_0.00005', 'walls', 1.00005],
    ['custom.raised_to_2', 'level', 2],
  ] as Array<[string, 'walls' | 'level', number]>) {
    const node = RoofNode.parse({ support: { kind: support }, position: [2, 1, 1] })
    const patch = handle?.kind === 'translate' ? (handle.apply(node, [8, y, 3], undefined as never) as Partial<RoofNode>) : {}
    row(`R10.by_hand.${name}`, `support ${(patch.support ?? node.support).kind}`)
    row(`R10.by_hand.${name}.by_equation`, `support ${supportAfterMove(support, 1, y)}`)
  }

  // The follow rule writes through the editor's scene store, which asks the browser for an
  // animation frame when a node changes. There is no browser here: the request is answered at
  // once, the way the fork's own test of this rule answers it.
  type Frame = (callback: (time: number) => void) => number
  const world = globalThis as unknown as { requestAnimationFrame?: Frame; cancelAnimationFrame?: (id: number) => void }
  world.requestAnimationFrame ??= (callback) => {
    callback(0)
    return 0
  }
  world.cancelAnimationFrame ??= () => {}
  spatialGridManager.clear()
  const lower = LevelNode.parse({ level: 0, height: 3 })
  const upper = LevelNode.parse({ level: 1, height: 3 })
  const walls = room(lower, ROOM, [3])
  const roof = RoofNode.parse({ parentId: upper.id, support: { kind: 'walls' }, position: [2, 0, 1.5] })
  const segment = RoofSegmentNode.parse({ parentId: roof.id, width: 4, depth: 3 })
  roof.children = [segment.id]
  lower.children = walls.map((w) => w.id)
  upper.children = [roof.id]
  const before = useScene.getState()
  useScene.setState({
    nodes: record([lower, upper, roof, segment], walls) as never,
    rootNodeIds: [lower.id, upper.id] as never,
    dirtyNodes: new Set() as never,
    readOnly: false,
  })
  const stopFollowing = initializeRoofElevationSync()
  const stopGrid = initSpatialGridSync()
  await Promise.resolve()
  const stored = () => (useScene.getState().nodes[roof.id as AnyNodeId] as RoofNode).position[1]
  const levels: Level[] = [
    { ordinal: 0, height: 3 },
    { ordinal: 1, height: 3 },
  ]
  let mine = 0
  row('R10.walls_3', stored())
  row('R10.walls_3.by_equation', mine)
  for (const height of [4.2, 4.20005, 4.3]) {
    for (const wall of walls) useScene.getState().updateNode(wall.id as AnyNodeId, { height })
    await Promise.resolve()
    const resolved = baseOnWalls(
      levels,
      { ...roofIn(roof), level: 1, segs: [segIn(segment)] },
      walls.map((wall) => ({ ...wallIn(wall, 0), g: height })),
    )
    mine = heightAfterChange(mine, resolved)
    row(`R10.walls_${height}`, stored())
    row(`R10.walls_${height}.by_equation`, mine)
  }
  stopFollowing()
  stopGrid()
  spatialGridManager.clear()
  useScene.setState(before)
}

// ------------------------------------------------------------------ not a reference case
// Asked for only: with ROOF_AT_RANDOM=1 in the environment the equations are held against the
// fork on inputs drawn at random (a fixed seed), one line of counts for each. Nothing is
// printed without it, so the reference block and verify.ts do not see this part.
if (process.env.ROOF_AT_RANDOM) {
  const { wallOverlapsSlabFootprint } = await import('../../packages/core/dist/systems/slab/slab-support.js')
  const eq = await import('./_roof-equations')
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9
  const report = (name: string, n: number, differ: number, more = '') =>
    console.log(`AT RANDOM ${name}: ${n} tried, ${differ} differ${more}`)

  // (6) the wall test
  {
    let differ = 0
    let counted = 0
    const N = 40000
    for (let i = 0; i < N; i += 1) {
      const roof = { P: [rnd() * 4 - 2, 0, rnd() * 4 - 2], rho: rnd() * Math.PI * 2 }
      const seg = { s: [rnd() * 2 - 1, 0, rnd() * 2 - 1], sigma: rnd() * Math.PI * 2, w: 1 + rnd() * 6, d: 1 + rnd() * 6 }
      const rect = eq.cornersOf(roof, seg, 0)
      const start: [number, number] = [rnd() * 12 - 6, rnd() * 12 - 6]
      const short = rnd() < 0.2
      const end: [number, number] = short
        ? [start[0] + (rnd() - 0.5) * 0.2, start[1] + (rnd() - 0.5) * 0.2]
        : [rnd() * 12 - 6, rnd() * 12 - 6]
      const bent = rnd() < 0.3
      const chord = Math.hypot(end[0] - start[0], end[1] - start[1])
      const wall = WallNode.parse({ start, end, thickness: 0.05 + rnd() * 0.5, curveOffset: bent ? (rnd() - 0.5) * chord : 0 })
      const fork = wallOverlapsSlabFootprint(wall, rect.map((p) => [p.x, p.y] as [number, number]))
      const mine = eq.wallCounts(plain(wall), rect)
      if (fork) counted += 1
      if (fork !== mine) differ += 1
    }
    report('(6) wall under a rectangle', N, differ, `, ${counted} counted`)
  }

  // (1) (2) (9) boxes, and (3) the way back
  {
    let differ = 0
    let back = 0
    const N = 5000
    for (let i = 0; i < N; i += 1) {
      const level = LevelNode.parse({ level: 0 })
      const roof = RoofNode.parse({ parentId: level.id, position: [rnd() * 20 - 10, rnd() * 3, rnd() * 20 - 10], rotation: rnd() * 8 - 4 })
      const segs = [0, 1].map(() =>
        RoofSegmentNode.parse({ parentId: roof.id, position: [rnd() * 6 - 3, rnd(), rnd() * 6 - 3], rotation: rnd() * 8 - 4, width: 1 + rnd() * 8, depth: 1 + rnd() * 8 }),
      )
      roof.children = segs.map((s) => s.id)
      const box = getRoofPlanBounds({ position: roof.position, rotation: roof.rotation, segments: segs })!
      const mine = eq.boxOf(roofIn(roof), segs.map(segIn))
      if (!(near(box.minX, mine.minU) && near(box.maxX, mine.maxU) && near(box.minZ, mine.minV) && near(box.maxZ, mine.maxV))) differ += 1
      // a point of the first segment, out and back
      const x = (rnd() - 0.5) * segs[0]!.width * 0.98
      const z = (rnd() - 0.5) * segs[0]!.depth * 0.98
      const [u, , v] = eq.segToLevel(roofIn(roof), segIn(segs[0]!), x, z)
      const placement = resolveConicalRoofPlacement({
        nodes: record([{ ...level, children: [roof.id] }, { ...roof, children: [segs[0]!.id] }, segs[0]!]),
        levelId: level.id,
        center: [u, v],
        radius: 0,
        curbHeight: 0,
        allowRoofSupport: true,
        requireRoofSupport: true,
      })
      if (!(placement.valid && placement.kind === 'roof' && near(placement.support.localPosition[0], x) && near(placement.support.localPosition[1], z))) back += 1
    }
    report('(1) (2) (9) the box of two segments', N, differ)
    report('(3) a point out and back', N, back)
  }

  // (8) the outline's area, (9) the alignment box, (12) one more segment
  {
    let area = 0
    let aligned = 0
    let added = 0
    const N = 3000
    for (let i = 0; i < N; i += 1) {
      const level = LevelNode.parse({ level: 0 })
      const roof = RoofNode.parse({ parentId: level.id, position: [rnd() * 20 - 10, 0, rnd() * 20 - 10], rotation: rnd() * 8 - 4 })
      const segs = [0, 1].map(() =>
        RoofSegmentNode.parse({
          parentId: roof.id,
          position: [rnd() * 6 - 3, 0, rnd() * 6 - 3],
          rotation: rnd() * 8 - 4,
          width: 0.3 + rnd() * 8,
          depth: 0.3 + rnd() * 8,
        }),
      )
      roof.children = segs.map((s) => s.id)
      level.children = [roof.id]
      const nodes = record([level, roof], segs)
      const rings = outlineOf(roof, segs, [], nodes)
      const A = eq.cornersOf(roofIn(roof), segIn(segs[0]!), 0.01)
      const B = eq.cornersOf(roofIn(roof), segIn(segs[1]!), 0.01)
      const drawnArea = rings.reduce((sum, ring) => sum + polygonArea(ring), 0)
      if (Math.abs(drawnArea - eq.unionArea(A, B)) > 1e-6) area += 1
      const box = roofDefinition.capabilities?.alignmentFootprint?.(roof, nodes as never) as
        | { minX: number; maxX: number; minZ: number; maxZ: number }
        | null
        | undefined
      const mine = eq.boxOf(roofIn(roof), segs.map(segIn), 1)
      if (!(box && near(box.minX, mine.minU) && near(box.maxX, mine.maxU) && near(box.minZ, mine.minV) && near(box.maxZ, mine.maxV))) aligned += 1
      // one more segment, the roof known to the scene
      const group = new THREE.Group()
      group.position.set(roof.position[0], roof.position[1], roof.position[2])
      group.rotation.y = roof.rotation
      group.updateMatrixWorld(true)
      sceneRegistry.nodes.set(roof.id, group)
      const c1: [number, number] = [rnd() * 20 - 10, rnd() * 20 - 10]
      const c2: [number, number] = [rnd() * 20 - 10, rnd() * 20 - 10]
      const quarter = rnd() < 0.5
      const got = draw(nodes, level.id, c1, c2, quarter, [roof.id]).segment
      sceneRegistry.nodes.delete(roof.id)
      const size = eq.drawn({ x: c1[0], y: c1[1] }, { x: c2[0], y: c2[1] }, quarter, roof.rotation)
      const [a, b] = eq.levelToRoof(roofIn(roof), size.centre.x, size.centre.y)
      if (!(got && near(got.position[0], a) && near(got.position[2], b) && near(got.rotation, size.sigma) && near(got.width, size.w) && near(got.depth, size.d))) added += 1
    }
    report('(8) the area of the outline of two segments', N, area)
    report('(9) the alignment box', N, aligned)
    report('(12) one more segment for a roof known to the scene', N, added)
  }

  // (14) a cone on a bent wall
  {
    let differ = 0
    let made = 0
    const N = 3000
    for (let i = 0; i < N; i += 1) {
      spatialGridManager.clear()
      const storey = 2.4 + Math.round(rnd() * 6) / 10
      const lower = LevelNode.parse({ level: 0, height: storey })
      const upper = LevelNode.parse({ level: 1, height: 2.7 })
      const start: [number, number] = [rnd() * 10 - 5, rnd() * 10 - 5]
      const end: [number, number] = [rnd() * 10 - 5, rnd() * 10 - 5]
      const chord = Math.hypot(end[0] - start[0], end[1] - start[1])
      const bent = WallNode.parse({
        parentId: lower.id,
        start,
        end,
        curveOffset: (rnd() - 0.5) * chord * 1.2,
        height: rnd() < 0.3 ? undefined : 1 + Math.round(rnd() * 30) / 10,
      })
      lower.children = [bent.id]
      const nodes = record([lower, upper, bent])
      const { api, made: ops } = sceneOf(nodes)
      const id = createConicalRoofSectorAboveWall(bent, nodes, api, upper.id)
      const roof = ops.find((op) => op.node.type === 'roof')?.node as RoofNode | undefined
      const segment = ops.find((op) => op.node.type === 'roof-segment')?.node as RoofSegmentNode | undefined
      const levels: Level[] = [
        { ordinal: 0, height: storey },
        { ordinal: 1, height: 2.7 },
      ]
      const wall = wallIn(bent, 0)
      const mine = eq.coneOnWall(wall, eq.wallTopFor(levels, wall, 1))
      if (id !== null) made += 1
      const same =
        (id === null && mine === null) ||
        (roof !== undefined &&
          segment !== undefined &&
          mine !== null &&
          near(roof.position[0], mine.P[0]) &&
          near(roof.position[1], mine.P[1]) &&
          near(roof.position[2], mine.P[2]) &&
          near(segment.width, mine.w) &&
          near(segment.conicalStartAngle ?? Number.NaN, mine.start) &&
          near(segment.conicalSweepAngle ?? Number.NaN, mine.sweep))
      if (!same) differ += 1
    }
    report('(14) a cone on a bent wall', N, differ, `, ${made} made`)
  }

  // (13) the fit
  {
    let differ = 0
    const N = 20000
    for (let i = 0; i < N; i += 1) {
      const kind = rnd()
      let polygon: Array<[number, number]>
      if (kind < 0.4) {
        // a turned rectangle
        const a = rnd() * 7 - 3.5
        const w = 1 + rnd() * 8
        const d = 1 + rnd() * 8
        const cx = rnd() * 10 - 5
        const cz = rnd() * 10 - 5
        polygon = (
          [
            [-w / 2, -d / 2],
            [w / 2, -d / 2],
            [w / 2, d / 2],
            [-w / 2, d / 2],
          ] as Array<[number, number]>
        ).map(([x, z]) => [cx + x * Math.cos(a) - z * Math.sin(a), cz + x * Math.sin(a) + z * Math.cos(a)])
      } else {
        // points round a centre
        const n = 3 + Math.floor(rnd() * 6)
        polygon = Array.from({ length: n }, (_, k) => {
          const angle = ((k + rnd() * 0.8) / n) * Math.PI * 2
          const r = 1 + rnd() * 4
          return [Math.cos(angle) * r, Math.sin(angle) * r] as [number, number]
        })
      }
      const fork = fitRoofFootprint('x', polygon, [])
      const mine = eq.fitOf(polygon.map(([x, y]) => ({ x, y })))
      const same =
        (fork === null && mine === null) ||
        (fork !== null &&
          mine !== null &&
          near(fork.width, mine.W) &&
          near(fork.depth, mine.D) &&
          near(fork.rotation, mine.rho) &&
          near(fork.center[0], mine.centre.x) &&
          near(fork.center[1], mine.centre.y) &&
          fork.rectangular === mine.rectangular)
      if (!same) differ += 1
    }
    report('(13) the fit of an outline', N, differ)
  }

  // (15) a circle on roofs
  {
    let differ = 0
    let onRoof = 0
    const N = 10000
    const level = LevelNode.parse({ id: 'level_fuzz', level: 0 })
    for (let i = 0; i < N; i += 1) {
      const hosts = [0, 1].map((k) => {
        const roof = RoofNode.parse({
          id: `roof_${k}`,
          parentId: level.id,
          position: [rnd() * 4 - 2, rnd() * 3, rnd() * 4 - 2],
          rotation: rnd() * 7 - 3.5,
          children: [`rseg_${k}`],
        })
        const seg = RoofSegmentNode.parse({
          id: `rseg_${k}`,
          parentId: roof.id,
          roofType: rnd() < 0.3 ? 'flat' : 'gable',
          position: [rnd() * 2 - 1, rnd(), rnd() * 2 - 1],
          rotation: rnd() * 7 - 3.5,
          width: 4 + rnd() * 8,
          depth: 4 + rnd() * 8,
          wallHeight: rnd() * 3,
          pitch: 5 + rnd() * 50,
        })
        return { roof, seg }
      })
      const c = { x: rnd() * 6 - 3, y: rnd() * 6 - 3 }
      const r = rnd() < 0.1 ? 0 : 0.2 + rnd() * 2
      const curb = rnd() < 0.1 ? -0.3 : rnd()
      const mode = (['auto', 'ground', 'roof'] as const)[Math.floor(rnd() * 3)]!
      const fork = resolveConicalRoofPlacement({
        nodes: record(
          [level],
          hosts.flatMap((h) => [h.roof, h.seg]),
        ),
        levelId: level.id,
        center: [c.x, c.y],
        radius: r,
        curbHeight: curb,
        allowRoofSupport: mode !== 'ground',
        requireRoofSupport: mode === 'roof',
      })
      const own = hosts.map((h) => ({
        roof: roofIn(h.roof),
        seg: segIn(h.seg),
        wallHeight: h.seg.wallHeight,
        pitchDeg: h.seg.roofType === 'flat' ? 0 : h.seg.pitch,
      }))
      const mine = eq.coneOn(own, c, r, curb, mode)
      let same = false
      if (!fork.valid) same = mine.kind === 'none'
      else if (fork.kind === 'level') same = mine.kind === 'level' && near(fork.wallHeight, mine.wall) && near(fork.position[1], mine.P[1])
      else {
        onRoof += 1
        same =
          mine.kind === 'roof' &&
          near(fork.position[1], mine.P[1]) &&
          near(fork.wallHeight, mine.wall) &&
          near(fork.support.localPosition[0], mine.local[0]) &&
          near(fork.support.localPosition[1], mine.local[1]) &&
          near(fork.support.curbHeight, mine.curb) &&
          fork.support.roofSegmentId === hosts[own.indexOf(mine.host)]!.seg.id
      }
      if (!same) differ += 1
    }
    report('(15) a circle on two roofs', N, differ, `, ${onRoof} on a roof`)
  }

  // (16) (17) boxes and owners
  {
    let differ = 0
    let ownersDiffer = 0
    const N = 20000
    const letters = '0123456789abcdefghijklmnopqrstuvwxyz'
    const id = (prefix: string) =>
      `${prefix}_${Array.from({ length: 4 }, () => letters[Math.floor(rnd() * letters.length)]).join('')}`
    for (let i = 0; i < N; i += 1) {
      const box = () => {
        const u = Math.round(rnd() * 8) / 2
        const v = Math.round(rnd() * 8) / 2
        const jitter = () => (rnd() < 0.3 ? (rnd() - 0.5) * 4e-6 : 0)
        return { minU: u + jitter(), maxU: u + 1 + jitter(), minV: v + jitter(), maxV: v + 1 + jitter() }
      }
      const a = box()
      const b = box()
      const fork = roofPlanBoundsOverlap(
        { minX: a.minU, maxX: a.maxU, minZ: a.minV, maxZ: a.maxV },
        { minX: b.minU, maxX: b.maxU, minZ: b.minV, maxZ: b.maxV },
      )
      if (fork !== eq.boxesOverlap(a, b)) differ += 1
      const one = { roofId: id('roof'), segId: id('rseg'), w: 1 + Math.floor(rnd() * 3), d: 1 + Math.floor(rnd() * 3) } as Owner
      const two = {
        roofId: rnd() < 0.2 ? one.roofId : id('roof'),
        segId: id('rseg'),
        w: 1 + Math.floor(rnd() * 3),
        d: 1 + Math.floor(rnd() * 3),
      } as Owner
      const mounted = rnd()
      if (mounted < 0.15) Object.assign(one, { onRoofId: two.roofId, onSegId: two.segId })
      else if (mounted < 0.3) Object.assign(two, { onRoofId: one.roofId, onSegId: one.segId })
      const f = (o: Owner) => ({
        roofId: o.roofId,
        segmentId: o.segId,
        width: o.w,
        depth: o.d,
        supportRoofId: o.onRoofId,
        supportRoofSegmentId: o.onSegId,
      })
      if (roofOverlapEntryOwns(f(one), f(two)) !== eq.owns(one, two)) ownersDiffer += 1
      if (roofPlanOverlapEntryOwns(f(one), f(two)) !== eq.ownsInPlan(one, two)) ownersDiffer += 1
    }
    report('(16) two boxes', N, differ)
    report('(17) owners, body and plan', N, ownersDiffer)
  }

  // (10) the eaves
  {
    let differ = 0
    const N = 5000
    const types = ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat', 'conical'] as const
    for (let i = 0; i < N; i += 1) {
      const type = types[Math.floor(rnd() * types.length)]!
      const pitch = rnd() < 0.1 ? 0 : rnd() * 85
      const t = rnd() * 0.4
      const o = rnd()
      const n = rnd() * 0.3
      const seg = RoofSegmentNode.parse({ roofType: type, pitch, width: 8, depth: 6, wallThickness: t, overhang: o, shingleThickness: n })
      const top = getRoofSegmentVisibleTopBounds(seg)
      const reach = eq.eavesReach(type, pitch, t, o, n)
      if (!(near(top.maxX - 4, reach.x) && near(-top.minX - 4, reach.x) && near(top.maxZ - 3, reach.front) && near(-top.minZ - 3, reach.back))) differ += 1
    }
    report('(10) the eaves of a segment', N, differ)
  }

  // (11) the draw tool
  {
    let differ = 0
    const N = 3000
    const level = LevelNode.parse({ level: 0 })
    const nodes = record([level])
    for (let i = 0; i < N; i += 1) {
      const c1: [number, number] = [rnd() * 20 - 10, rnd() * 20 - 10]
      const c2: [number, number] = rnd() < 0.2 ? [c1[0] + rnd() * 0.9, c1[1] - rnd() * 0.9] : [rnd() * 20 - 10, rnd() * 20 - 10]
      const quarter = rnd() < 0.5
      const got = draw(nodes, level.id, c1, c2, quarter)
      const mine = eq.drawn({ x: c1[0], y: c1[1] }, { x: c2[0], y: c2[1] }, quarter)
      const same =
        got.roof &&
        got.segment &&
        near(got.roof.position[0], mine.centre.x) &&
        near(got.roof.position[2], mine.centre.y) &&
        got.roof.position[1] === 0 &&
        near(got.segment.width, mine.w) &&
        near(got.segment.depth, mine.d) &&
        near(got.segment.rotation, mine.sigma)
      if (!same) differ += 1
    }
    report('(11) the draw tool', N, differ)
  }

  // (5) (6) a following roof over random walls
  {
    let differ = 0
    let stays = 0
    const N = 4000
    for (let i = 0; i < N; i += 1) {
      spatialGridManager.clear()
      const lowerHeight = 2.4 + Math.round(rnd() * 6) / 10
      const offset = rnd() < 0.3 ? Math.round(rnd() * 5) / 10 : 0
      const lower = LevelNode.parse({ level: 0, height: lowerHeight })
      const upper = LevelNode.parse({ level: 1, height: 2.7, baseElevation: offset })
      const onUpper = rnd() < 0.7
      const walls = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => {
        const start: [number, number] = [rnd() * 10 - 5, rnd() * 10 - 5]
        const end: [number, number] = [rnd() * 10 - 5, rnd() * 10 - 5]
        const chord = Math.hypot(end[0] - start[0], end[1] - start[1])
        return WallNode.parse({
          parentId: (rnd() < 0.8 ? lower : upper).id,
          start,
          end,
          thickness: 0.1 + Math.round(rnd() * 3) / 10,
          height: rnd() < 0.3 ? undefined : 1 + Math.round(rnd() * 30) / 10,
          curveOffset: rnd() < 0.25 ? (rnd() - 0.5) * chord * 0.8 : 0,
        })
      })
      const roof = RoofNode.parse({
        parentId: (onUpper ? upper : lower).id,
        support: { kind: 'walls' },
        position: [rnd() * 4 - 2, 7.5, rnd() * 4 - 2],
        rotation: rnd() * 7 - 3.5,
      })
      const segs = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () =>
        RoofSegmentNode.parse({
          parentId: roof.id,
          position: [rnd() * 4 - 2, 0, rnd() * 4 - 2],
          rotation: rnd() * 7 - 3.5,
          width: 1 + rnd() * 5,
          depth: 1 + rnd() * 5,
        }),
      )
      roof.children = segs.map((s) => s.id)
      lower.children = [...walls.filter((w) => w.parentId === lower.id).map((w) => w.id), ...(onUpper ? [] : [roof.id])]
      upper.children = [...walls.filter((w) => w.parentId === upper.id).map((w) => w.id), ...(onUpper ? [roof.id] : [])]
      const nodes = record([lower, upper, roof], segs, walls)
      const fork = resolveRoofElevation(roof, nodes)
      const levels: Level[] = [
        { ordinal: 0, height: lowerHeight },
        { ordinal: 1, height: 2.7, offset },
      ]
      const mine = eq.baseOnWalls(
        levels,
        { ...roofIn(roof), level: onUpper ? 1 : 0, segs: segs.map(segIn) },
        walls.map((w) => wallIn(w, w.parentId === lower.id ? 0 : 1)),
      )
      if (fork === 7.5) stays += 1
      if (!near(fork, mine)) differ += 1
    }
    report('(5) (6) a following roof over random walls', N, differ, `, ${stays} kept their height`)
  }
}
