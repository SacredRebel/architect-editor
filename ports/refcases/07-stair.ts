// Reference cases for the stair and its parts (port note entry 7): the rise, the flights kept
// in step with it, the chain of flights and landings, the plan footprints, what the stair
// stands on, and the opening it cuts in the floor above.
// cd packages/viewer && bun ../../ports/refcases/07-stair.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone (_stair-equations.ts calls nothing of the old
// editor): a line `K.by_equation` must give the number of the line `K`.
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  CeilingNode,
  createDefaultStairSegment,
  createStairFlightFromStair,
  DEFAULT_LEVEL_HEIGHT,
  getFloorStackedPosition,
  getLevelFloorToFloorHeight,
  LevelNode,
  registerNode,
  resolveStairTotalRise,
  SlabNode,
  StairNode,
  StairSegmentNode,
  spatialGridManager,
  stairFootprintAABB,
  syncAutoStairOpenings,
  syncStairRises,
} from '@pascal-app/core'
import { planFootprintCorners } from '../../packages/core/src/lib/plan-footprint'
import { computeSegmentTransforms } from '../../packages/core/src/systems/stair/stair-footprint'
import * as placed from '../../packages/editor/src/components/tools/stair/stair-defaults'
import {
  buildFloorplanStairEntry,
  computeFloorplanStairSegmentTransforms,
  getFloorplanStairSegmentPolygon,
} from '../../packages/editor/src/lib/floorplan/stairs'
import { stairDefinition } from '../../packages/nodes/src/stair/definition'
import {
  computeStairSegmentFloorStackTransforms,
  getStairFloorPlacedFootprints,
} from '../../packages/nodes/src/stair/floor-stack'
import { getStairTypeChange } from '../../packages/nodes/src/stair/stair-type'
import { num, pt, pts, row, title } from './_print'
import {
  type Arc,
  arcBox,
  arcFootprint,
  type Box,
  boxOfParts,
  chainOf,
  cornersOf,
  curvedOpening,
  flightOfStair,
  floorToFloor,
  inStep,
  opensCeiling,
  opensSlab,
  type Pad,
  type Part,
  type Place,
  padCorners,
  padsOfArc,
  padsOfParts,
  polygonArea,
  riseOf,
  type Standing,
  spiralOpening,
  straightOpening,
  type V2,
} from './_stair-equations'

type Nodes = Record<string, AnyNode>
type Stair = ReturnType<typeof StairNode.parse>
type Segment = ReturnType<typeof StairSegmentNode.parse>

// the old editor's stair kind, with its own rule for what a stair stands on, as the running
// editor has it
registerNode(stairDefinition as never)

const STAIR = 'stair_a'
const sceneOf = (list: AnyNode[]): Nodes => Object.fromEntries(list.map((node) => [node.id, node]))
const big: Array<[number, number]> = [[-20, -20], [20, -20], [20, 20], [-20, 20]]
const squareAt = (x: number, z: number, half: number): Array<[number, number]> => [
  [x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half],
]

// a part of the note as the old editor's node
function segmentOf(part: Part, i: number): Segment {
  return StairSegmentNode.parse({
    id: `sseg_${i}`,
    parentId: STAIR,
    segmentType: part.flight ? 'stair' : 'landing',
    width: part.width,
    length: part.length,
    height: part.height,
    stepCount: part.steps,
    attachmentSide: part.side,
    fillToFloor: part.filled,
    thickness: part.thickness,
    visible: !part.hidden,
  })
}
const flight = (more: Partial<Part> = {}): Part => ({
  flight: true, width: 1, length: 3, height: 2.5, steps: 10, side: 'front', filled: true, thickness: 0.25, ...more,
})
const landing = (more: Partial<Part> = {}): Part => ({
  flight: false, width: 1, length: 1, height: 0, steps: 0, side: 'front', filled: true, thickness: 0.32, ...more,
})

// one building, its storeys one above the other, a stair on the lowest
function building(o: {
  heights: Array<number | undefined>
  bases?: number[]
  stair?: Record<string, unknown>
  parts?: Part[]
  more?: (levelIds: string[]) => AnyNode[]
}) {
  const levelIds = o.heights.map((_, k) => `level_${k}`)
  const segments = (o.parts ?? []).map(segmentOf)
  const stair = StairNode.parse({
    id: STAIR,
    parentId: levelIds[0],
    fromLevelId: levelIds[0],
    toLevelId: levelIds[1] ?? null,
    children: segments.map((segment) => segment.id),
    ...o.stair,
  })
  const more = o.more?.(levelIds) ?? []
  const levels = o.heights.map((height, k) =>
    LevelNode.parse({
      id: levelIds[k],
      parentId: 'building_a',
      level: k,
      baseElevation: o.bases?.[k] ?? 0,
      ...(height === undefined ? {} : { height }),
      children: [...(k === 0 ? [stair.id] : []), ...more.filter((node) => node.parentId === levelIds[k]).map((node) => node.id)],
    }),
  )
  const house = BuildingNode.parse({ id: 'building_a', children: levelIds })
  const nodes = sceneOf([house, ...levels, stair, ...segments, ...more] as AnyNode[])
  spatialGridManager.clear()
  for (const node of more) if (node.type === 'slab') spatialGridManager.handleNodeCreated(node, node.parentId as string)
  return { nodes, stair, segments, levelIds }
}
const slabOn = (levelId: string, id: string, polygon: Array<[number, number]>, more: Record<string, unknown> = {}) =>
  SlabNode.parse({ id, parentId: levelId, polygon, ...more }) as AnyNode

const standing = (stair: Stair): Standing => ({ P: { x: stair.position[0], y: stair.position[2] }, rho: stair.rotation })
const placeText = (p: { position: readonly number[]; rotation: number }) => `at ${pt(p.position)} turned ${num(p.rotation)}`
const myPlaceText = (p: Place) => `at ${pt([p.x, p.y, p.z])} turned ${num(p.phi)}`
const boxText = (b: Box | null) => (b ? `u ${num(b.minX)}..${num(b.maxX)} v ${num(b.minZ)}..${num(b.maxZ)}` : 'none')
const flightText = (s: { width: number; length: number; height: number; stepCount: number }) =>
  `width ${num(s.width)} length ${num(s.length)} height ${num(s.height)} steps ${num(s.stepCount)}`
const padText = (p: { position?: readonly number[]; dimensions: readonly number[]; rotation: readonly number[] }) =>
  `centre ${pt(p.position ?? [])} size ${pt(p.dimensions)} turn ${num(p.rotation[1]!)}`
const myPadText = (p: Pad) => `centre ${pt(p.centre)} size ${pt(p.size)} turn ${num(p.turn)}`
const holesOf = (nodes: Nodes, id: string): Array<Array<[number, number]>> =>
  ((syncAutoStairOpenings(nodes).find((update) => update.id === id)?.data as { holes?: Array<Array<[number, number]>> })?.holes ?? [])
const loopsText = (loops: ReadonlyArray<ReadonlyArray<readonly [number, number] | V2>>) =>
  loops.length === 0 ? 'none' : loops.map((loop) => pts(loop as V2[])).join(' | ')
const areaOfTuples = (loop: ReadonlyArray<readonly [number, number]>) => polygonArea(loop.map(([x, y]) => ({ x, y })))
const standsAt = (scene: { nodes: Nodes; stair: Stair }) =>
  getFloorStackedPosition({ node: scene.stair, nodes: scene.nodes, position: scene.stair.position, rotation: scene.stair.rotation })[1]

// ------------------------------------------------------------------ the cases
title('S0 the numbers a new stair and a new flight carry')
{
  const stair = StairNode.parse({ id: STAIR })
  const part = createDefaultStairSegment()
  row('S0.stair', `width ${num(stair.width)} steps ${num(stair.stepCount)} thickness ${num(stair.thickness)} inner_radius ${num(stair.innerRadius)} sweep ${num(stair.sweepAngle)}`)
  row('S0.stair.more', `railing_height ${num(stair.railingHeight)} top_landing_depth ${num(stair.topLandingDepth)} opening_offset ${num(stair.openingOffset)}`)
  row('S0.stair.kinds', `type ${stair.stairType} railing ${stair.railingMode} opening ${stair.slabOpeningMode} top_landing ${stair.topLandingMode} filled ${stair.fillToFloor} column ${stair.showCenterColumn} supports ${stair.showStepSupports}`)
  row('S0.flight', `${flightText(part)} thickness ${num(part.thickness)} hangs ${part.attachmentSide} filled ${part.fillToFloor}`)
  row('S0.level_height', DEFAULT_LEVEL_HEIGHT)
  row('S0.the_stair_tool_places', `type ${placed.DEFAULT_STAIR_TYPE} width ${num(placed.DEFAULT_STAIR_WIDTH)} length ${num(placed.DEFAULT_STAIR_LENGTH)} steps ${num(placed.DEFAULT_STAIR_STEP_COUNT)} thickness ${num(placed.DEFAULT_STAIR_THICKNESS)} filled ${placed.DEFAULT_STAIR_FILL_TO_FLOOR} railing ${placed.DEFAULT_STAIR_RAILING_MODE} railing_height ${num(placed.DEFAULT_STAIR_RAILING_HEIGHT)} opening_offset ${num(placed.DEFAULT_STAIR_OPENING_OFFSET)}`)
  row('S0.a_stair_made_spiral_gets_the_sweep', getStairTypeChange(stair, 'spiral', {}).updates.sweepAngle ?? Number.NaN)
  const curvedOne = StairNode.parse({ id: STAIR, stairType: 'curved', width: 0.9, stepCount: 16, thickness: 0.16, fillToFloor: false, totalRise: 3.81 })
  const madeStraight = getStairTypeChange(curvedOne, 'straight', { [curvedOne.id]: curvedOne }).segment
  row('S0.a_curved_stair_made_straight_gets_the_flight', madeStraight ? `${flightText(madeStraight)} thickness ${num(madeStraight.thickness)} filled ${madeStraight.fillToFloor}` : 'none')
  const mine = flightOfStair({ width: 0.9, stepCount: 16, thickness: 0.16, filled: false }, riseOf({ stored: 3.81 }))
  row('S0.a_curved_stair_made_straight_gets_the_flight.by_equation', `${flightText({ ...mine, stepCount: mine.steps })} thickness ${num(mine.thickness)} filled ${mine.filled}`)
}

title('S1 the rise: a stair on a storey of 2.7 m, by what is above it and under it')
{
  const say = (key: string, scene: { nodes: Nodes; stair: Stair }, mine: number) => {
    row(key, resolveStairTotalRise(scene.stair, scene.nodes))
    row(`${key}.by_equation`, mine)
  }
  say('S1.stored_2.9', building({ heights: [2.7], stair: { totalRise: 2.9 } }), riseOf({ stored: 2.9, floorToFloor: 2.7 }))
  say('S1.in_no_level', { nodes: {}, stair: StairNode.parse({ id: STAIR }) }, riseOf({}))
  say('S1.top_storey', building({ heights: [2.7] }), riseOf({ floorToFloor: floorToFloor([{ height: 2.7 }], 0) }))
  say('S1.storey_without_a_height', building({ heights: [undefined] }), riseOf({ floorToFloor: floorToFloor([{}], 0) }))
  say(
    'S1.next_storey_set_0.3_higher',
    building({ heights: [2.7, 2.5], bases: [0, 0.3] }),
    riseOf({ floorToFloor: floorToFloor([{ height: 2.7 }, { height: 2.5, baseElevation: 0.3 }], 0) }),
  )
  say('S1.stair_lifted_0.2', building({ heights: [2.7], stair: { position: [0, 0.2, 0] } }), riseOf({ floorToFloor: 2.7, base: 0.2 }))
  const onFloor = building({ heights: [2.7], parts: [flight()], more: ([ground]) => [slabOn(ground!, 'slab_floor', big, { elevation: 0.05 })] })
  row('S1.on_a_floor_0.05.stands_at', standsAt(onFloor))
  say('S1.on_a_floor_0.05', onFloor, riseOf({ floorToFloor: 2.7, base: 0.05 }))
  const deck = (ground: string) => slabOn(ground, 'slab_deck', squareAt(9, 9, 1), { elevation: 1.25 })
  say(
    'S1.to_a_deck_at_1.25',
    building({ heights: [2.7], stair: { deckSlabId: 'slab_deck' }, parts: [flight()], more: ([ground]) => [deck(ground!)] }),
    riseOf({ deck: 1.25 }),
  )
  say(
    'S1.to_a_deck_at_1.25.on_a_floor_0.05',
    building({
      heights: [2.7],
      stair: { deckSlabId: 'slab_deck' },
      parts: [flight()],
      more: ([ground]) => [deck(ground!), slabOn(ground!, 'slab_floor', squareAt(0, 0, 5), { elevation: 0.05 })],
    }),
    riseOf({ deck: 1.25, base: 0.05 }),
  )
  const three = building({ heights: [2.7, 3.0, 2.5], bases: [0, 0.3, -0.1] })
  const storeys = [{ height: 2.7, baseElevation: 0 }, { height: 3.0, baseElevation: 0.3 }, { height: 2.5, baseElevation: -0.1 }]
  row('S1.floor_to_floor', three.levelIds.map((id) => num(getLevelFloorToFloorHeight(id, three.nodes as Record<AnyNodeId, AnyNode>))).join(' '))
  row('S1.floor_to_floor.by_equation', storeys.map((_, k) => num(floorToFloor(storeys, k))).join(' '))
  spatialGridManager.clear()
}

title('S2 one flight with the default numbers on a storey of 2.7 m: 1.0 wide, 3.0 long, 10 steps')
{
  const bare = building({ heights: [2.7] })
  row('S2.flight_of_a_stair_without_parts', flightText(createStairFlightFromStair(bare.stair, bare.nodes)))
  const mineBare = flightOfStair({ width: 1, stepCount: 10, thickness: 0.25, filled: true }, riseOf({ floorToFloor: 2.7 }))
  row('S2.flight_of_a_stair_without_parts.by_equation', flightText({ ...mineBare, stepCount: mineBare.steps }))
  const odd = building({ heights: [2.7], stair: { totalRise: 0.04, stepCount: 1.4, width: 1.2 } })
  row('S2.flight_of_a_stair_without_parts.least', flightText(createStairFlightFromStair(odd.stair, odd.nodes)))
  const mineOdd = flightOfStair({ width: 1.2, stepCount: 1.4, thickness: 0.25, filled: true }, riseOf({ stored: 0.04 }))
  row('S2.flight_of_a_stair_without_parts.least.by_equation', flightText({ ...mineOdd, stepCount: mineOdd.steps }))
  row('S2.box_of_a_stair_without_parts', boxText(stairFootprintAABB(bare.stair, bare.nodes)))

  const parts = [flight({ height: 2.7 })]
  for (const [name, position, rotation] of [['at_the_origin', [0, 0, 0], 0], ['at_(2,1)_turned_a_quarter', [2, 0, 1], Math.PI / 2], ['at_(2,1)_turned_30_degrees', [2, 0, 1], Math.PI / 6]] as const) {
    const scene = building({ heights: [2.7], stair: { position, rotation }, parts })
    const at = standing(scene.stair)
    const polygon = getFloorplanStairSegmentPolygon(scene.stair, scene.segments[0]!, computeFloorplanStairSegmentTransforms(scene.segments)[0]!)
    row(`S2.${name}.footprint`, pts(polygon))
    row(`S2.${name}.footprint.by_equation`, pts(cornersOf(parts[0]!, chainOf(parts)[0]!, at)))
    row(`S2.${name}.box`, boxText(stairFootprintAABB(scene.stair, scene.nodes)))
    row(`S2.${name}.box.by_equation`, boxText(boxOfParts(parts, at)))
  }
}

title('S3 the flights kept in step with the rise')
{
  const say = (key: string, o: { heights: number[]; stair?: Record<string, unknown>; parts: Part[]; more?: (ids: string[]) => AnyNode[] }, rise: number, applies = true) => {
    const scene = building(o)
    const updates = syncStairRises(scene.nodes)
    row(key, updates.length === 0 ? 'unchanged' : updates.map((update) => num((update.data as { height: number }).height)).join(' '))
    const mine = applies ? inStep(o.parts, rise) : null
    row(`${key}.by_equation`, mine ? mine.map((height) => num(height)).join(' ') : 'unchanged')
  }
  say('S3.one_flight_of_2.5_under_2.7', { heights: [2.7], parts: [flight()] }, 2.7)
  say('S3.flights_1.0_and_1.5_a_landing_0.1_high_under_3.0', { heights: [3.0], parts: [flight({ height: 1.0 }), landing({ height: 0.1 }), flight({ height: 1.5 })] }, 3.0)
  say('S3.two_flights_of_no_height_under_2.7', { heights: [2.7], parts: [flight({ height: 0 }), flight({ height: 0 })] }, 2.7)
  say('S3.already_in_step', { heights: [2.7], parts: [flight({ height: 1.2 }), flight({ height: 1.5 })] }, 2.7)
  say('S3.a_stored_rise_of_2.0', { heights: [2.7], stair: { totalRise: 2.0 }, parts: [flight()] }, 2.0, false)
  say(
    'S3.a_stored_rise_of_2.0_and_a_deck',
    { heights: [2.7], stair: { totalRise: 2.0, deckSlabId: 'slab_deck' }, parts: [flight()], more: ([ground]) => [slabOn(ground!, 'slab_deck', squareAt(9, 9, 1), { elevation: 1.25 })] },
    2.0,
  )
  spatialGridManager.clear()
}

// the L stair of the note: a flight, a landing in front of it, a flight on the landing's left
const lStair: Part[] = [
  flight({ length: 1.5, height: 1.35, steps: 5 }),
  landing(),
  flight({ length: 1.5, height: 1.35, steps: 5, side: 'left' }),
]

title('S4 the chain: an L stair (a flight 1.5 long rising 1.35, a landing 1.0 by 1.0, a flight on its left)')
{
  const chainText = (parts: Part[]) => {
    const segments = parts.map(segmentOf)
    const core = computeSegmentTransforms(segments)
    const others = [computeStairSegmentFloorStackTransforms(segments), computeFloorplanStairSegmentTransforms(segments)]
    let apart = 0
    for (const other of others) {
      other.forEach((entry, i) => {
        apart = Math.max(apart, Math.abs(entry.rotation - core[i]!.rotation), ...entry.position.map((value, axis) => Math.abs(value - core[i]!.position[axis]!)))
      })
    }
    return { core, apart }
  }
  const l = chainText(lStair)
  const mine = chainOf(lStair)
  lStair.forEach((_, i) => {
    row(`S4.part(${i})`, placeText(l.core[i]!))
    row(`S4.part(${i}).by_equation`, myPlaceText(mine[i]!))
  })
  row('S4.three_copies_of_the_chain_apart_by', l.apart)

  const scene = building({ heights: [2.7], stair: { position: [2, 0, 1], rotation: Math.PI / 2 }, parts: lStair })
  const at = standing(scene.stair)
  const transforms = computeFloorplanStairSegmentTransforms(scene.segments)
  lStair.forEach((part, i) => {
    row(`S4.at_(2,1)_turned_a_quarter.footprint(${i})`, pts(getFloorplanStairSegmentPolygon(scene.stair, scene.segments[i]!, transforms[i]!)))
    row(`S4.at_(2,1)_turned_a_quarter.footprint(${i}).by_equation`, pts(cornersOf(part, mine[i]!, at)))
  })
  row('S4.at_(2,1)_turned_a_quarter.box', boxText(stairFootprintAABB(scene.stair, scene.nodes)))
  row('S4.at_(2,1)_turned_a_quarter.box.by_equation', boxText(boxOfParts(lStair, at)))

  const variants: Array<[string, Part[]]> = [
    ['S4.second_flight_on_the_right', [lStair[0]!, lStair[1]!, { ...lStair[2]!, side: 'right' }]],
    ['S4.u_stair', [lStair[0]!, landing(), landing({ side: 'left' }), flight({ length: 1.5, height: 1.35, steps: 5, side: 'left' })]],
    ['S4.a_flight_hung_on_the_side_of_a_flight', [lStair[0]!, { ...lStair[2]!, side: 'left' }]],
  ]
  for (const [key, parts] of variants) {
    const last = parts.length - 1
    row(`${key}.part(${last})`, placeText(chainText(parts).core[last]!))
    row(`${key}.part(${last}).by_equation`, myPlaceText(chainOf(parts)[last]!))
  }
  const origin: Standing = { P: { x: 0, y: 0 }, rho: 0 }
  const shown = building({ heights: [2.7], parts: lStair })
  row('S4.box', boxText(stairFootprintAABB(shown.stair, shown.nodes)))
  row('S4.box.by_equation', boxText(boxOfParts(lStair, origin)))
  const hidden = lStair.map((part, i) => (i === 1 ? { ...part, hidden: true } : part))
  const hiddenScene = building({ heights: [2.7], parts: hidden })
  row('S4.landing_hidden.box', boxText(stairFootprintAABB(hiddenScene.stair, hiddenScene.nodes)))
  row('S4.landing_hidden.box.by_equation', boxText(boxOfParts(hidden, origin)))
}

title('S5 what it stands on: the boxes held against the floors')
{
  const scene = building({ heights: [2.7], stair: { position: [2, 0, 1], rotation: Math.PI / 2 }, parts: lStair })
  const pads = getStairFloorPlacedFootprints(scene.stair, scene.nodes as Record<AnyNodeId, AnyNode>)
  const mine = padsOfParts(lStair, standing(scene.stair))
  pads.forEach((pad, i) => {
    row(`S5.l_stair_at_(2,1)_turned_a_quarter.box(${i})`, padText(pad))
    row(`S5.l_stair_at_(2,1)_turned_a_quarter.box(${i}).by_equation`, myPadText(mine[i]!))
  })

  // the default flight turned 30 degrees: its box, the four corners the floors take that box to
  // have, and its true footprint
  const small = (x: number, z: number, e: number, id: string) => (levelId: string) => slabOn(levelId, id, squareAt(x, z, 0.2), { elevation: e })
  const turned = (rotation: number, more: Array<(levelId: string) => AnyNode>) =>
    building({ heights: [2.7], stair: { rotation }, parts: [flight()], more: ([ground]) => more.map((make) => make(ground!)) })
  const one = turned(Math.PI / 6, [])
  const pad = getStairFloorPlacedFootprints(one.stair, one.nodes as Record<AnyNodeId, AnyNode>)[0]!
  const minePad = padsOfParts([flight()], standing(one.stair))[0]!
  row('S5.turned_30_degrees.box', padText(pad))
  row('S5.turned_30_degrees.box.by_equation', myPadText(minePad))
  row('S5.turned_30_degrees.box_as_the_floors_read_it', pts(planFootprintCorners(pad.position as [number, number, number], pad.dimensions, pad.rotation[1]!)))
  row('S5.turned_30_degrees.box_as_the_floors_read_it.by_equation', pts(padCorners(minePad)))
  row('S5.turned_30_degrees.footprint', pts(getFloorplanStairSegmentPolygon(one.stair, one.segments[0]!, computeFloorplanStairSegmentTransforms(one.segments)[0]!)))
  row('S5.turned_30_degrees.footprint.by_equation', pts(cornersOf(flight(), chainOf([flight()])[0]!, standing(one.stair))))
  // a floor 0.4 up under the flight's head, then one 0.6 up beside the flight, under nothing of it
  row('S5.turned_30_degrees.floor_0.4_under_its_head_at_(1.5,2.6).stands_at', standsAt(turned(Math.PI / 6, [small(1.5, 2.598076, 0.4, 'slab_head')])))
  row('S5.turned_30_degrees.floor_0.6_beside_it_at_(0,2.6).stands_at', standsAt(turned(Math.PI / 6, [small(0, 2.598076, 0.6, 'slab_beside')])))
  row('S5.turned_a_quarter.floor_0.4_under_its_head_at_(3,0).stands_at', standsAt(turned(Math.PI / 2, [small(3, 0, 0.4, 'slab_head')])))
  spatialGridManager.clear()
}

title('S6 the opening in the floor above: straight stairs, the floor above 0.05 over its storey')
{
  const say = (key: string, o: { stair?: Record<string, unknown>; parts: Part[]; bases?: number[]; floor?: number }, rise: number) => {
    const scene = building({
      heights: [2.7, 2.7],
      bases: o.bases,
      stair: { slabOpeningMode: 'destination', ...o.stair },
      parts: o.parts,
      more: (ids) => [
        slabOn(ids[1]!, 'slab_above', big),
        ...(o.floor === undefined ? [] : [slabOn(ids[0]!, 'slab_floor', big, { elevation: o.floor })]),
      ],
    })
    row(key, loopsText(holesOf(scene.nodes, 'slab_above')))
    const target = 2.7 + (o.bases?.[1] ?? 0) + 0.05 - scene.stair.position[1]
    const mine = straightOpening(o.parts, { ...standing(scene.stair), rise, stepCount: scene.stair.stepCount, offset: scene.stair.openingOffset }, target)
    row(`${key}.by_equation`, loopsText(mine))
  }
  say('S6.default_flight', { parts: [flight({ height: 2.7 })] }, 2.7)
  say('S6.default_flight.at_(2,1)_turned_a_quarter.grown_0.1', { stair: { position: [2, 0, 1], rotation: Math.PI / 2, openingOffset: 0.1 }, parts: [flight({ height: 2.7 })] }, 2.7)
  say('S6.flight_6_long_12_steps', { parts: [flight({ length: 6, steps: 12, height: 2.7 })] }, 2.7)
  say('S6.flight_and_a_top_landing_1.4_wide', { parts: [flight({ height: 2.7 }), landing({ width: 1.4 })] }, 2.7)
  say('S6.l_stair', { parts: lStair }, 2.7)
  say('S6.flight_that_stops_at_1.5.grown_0.1', { stair: { totalRise: 1.5, openingOffset: 0.1 }, parts: [flight({ height: 1.5 })] }, 1.5)
  say('S6.next_storey_set_0.5_higher.grown_0.1', { bases: [0, 0.5], stair: { totalRise: 2.7, openingOffset: 0.1 }, parts: [flight({ height: 2.7 })] }, 2.7)
  say('S6.next_storey_set_0.5_higher.on_a_floor_0.05.grown_0.1', { bases: [0, 0.5], floor: 0.05, stair: { totalRise: 2.7, openingOffset: 0.1 }, parts: [flight({ height: 2.7 })] }, 2.7)
  say('S6.next_storey_set_0.5_higher.stair_lifted_0.2.grown_0.1', { bases: [0, 0.5], stair: { totalRise: 2.7, openingOffset: 0.1, position: [0, 0.2, 0] }, parts: [flight({ height: 2.7 })] }, 2.7)

  // which floors and ceilings: three storeys, the stair from the lowest to the highest
  const three = building({
    heights: [2.7, 2.7, 2.7],
    stair: { slabOpeningMode: 'destination', toLevelId: 'level_2' },
    parts: [flight({ height: 2.7 })],
    more: (ids) => [
      ...ids.map((id, k) => slabOn(id, `slab_${k}`, big)),
      ...ids.map((id, k) => CeilingNode.parse({ id: `ceiling_${k}`, parentId: id, polygon: big }) as AnyNode),
    ],
  })
  const opened = [0, 1, 2].flatMap((k) => [`floor_${k} ${holesOf(three.nodes, `slab_${k}`).length}`, `ceiling_${k} ${holesOf(three.nodes, `ceiling_${k}`).length}`])
  row('S6.from_storey_0_to_storey_2.holes', opened.join(' '))
  row('S6.from_storey_0_to_storey_2.holes.by_equation', [0, 1, 2].flatMap((k) => [`floor_${k} ${opensSlab(0, 2, k) ? 1 : 0}`, `ceiling_${k} ${opensCeiling(0, 2, k) ? 1 : 0}`]).join(' '))

  // which of the floors of the storey above: one over the stair, one beside it, one that
  // already has a wider hole of its own there
  const some = building({
    heights: [2.7, 2.7],
    stair: { slabOpeningMode: 'destination' },
    parts: [flight({ height: 2.7 })],
    more: (ids) => [
      slabOn(ids[1]!, 'slab_over', squareAt(0, 1.5, 4)),
      slabOn(ids[1]!, 'slab_beside', squareAt(10, 1.5, 4)),
      slabOn(ids[1]!, 'slab_holed', squareAt(0, 1.5, 5), { holes: [squareAt(0, 1.5, 2)], holeMetadata: [{ source: 'manual' }] }),
    ],
  })
  const changes = syncAutoStairOpenings(some.nodes)
  const added = (id: string) => (changes.find((update) => update.id === id)?.data as { holes?: unknown[] } | undefined)?.holes?.length ?? 'unchanged'
  row('S6.floors_of_the_storey_above.holes_after', `over_the_stair ${added('slab_over')} beside_it ${added('slab_beside')} with_a_wider_hole_of_its_own ${added('slab_holed')}`)
  const none = building({ heights: [2.7, 2.7], parts: [flight({ height: 2.7 })], more: (ids) => [slabOn(ids[1]!, 'slab_above', big)] })
  row('S6.opening_mode_none.holes', holesOf(none.nodes, 'slab_above').length)
  const bare = building({ heights: [2.7, 2.7], stair: { slabOpeningMode: 'destination' }, more: (ids) => [slabOn(ids[1]!, 'slab_above', big)] })
  row('S6.stair_without_parts.holes', holesOf(bare.nodes, 'slab_above').length)
  spatialGridManager.clear()
}

const curved: Arc = { spiral: false, innerRadius: 0.9, width: 1, sweep: Math.PI / 2, stepCount: 10, thickness: 0.25, filled: true, rise: 2.7 }
const spiral: Arc = { spiral: true, innerRadius: 0.3, width: 1, sweep: (400 * Math.PI) / 180, stepCount: 16, thickness: 0.25, filled: true, rise: 2.7, landingDepth: 0.9 }
const arcStair = (a: Arc, more: Record<string, unknown> = {}) => ({
  stairType: a.spiral ? 'spiral' : 'curved',
  innerRadius: a.innerRadius,
  width: a.width,
  sweepAngle: a.sweep,
  stepCount: a.stepCount,
  thickness: a.thickness,
  fillToFloor: a.filled,
  totalRise: a.rise,
  topLandingMode: a.landingDepth === undefined ? 'none' : 'integrated',
  ...(a.landingDepth === undefined ? {} : { topLandingDepth: a.landingDepth }),
  slabOpeningMode: 'destination',
  ...more,
})
const arcScene = (a: Arc, more: Record<string, unknown> = {}) =>
  building({ heights: [2.7, 2.7], stair: arcStair(a, more), more: (ids) => [slabOn(ids[1]!, 'slab_above', big)] })
function sectorLines(key: string, a: Arc, scene: { stair: Stair }) {
  const sector = buildFloorplanStairEntry(scene.stair, [])?.hitPolygons[0] ?? []
  const mine = arcFootprint(a, standing(scene.stair))
  row(`${key}.footprint.points`, sector.length)
  row(`${key}.footprint.points.by_equation`, mine.length)
  row(`${key}.footprint.first_and_last_of_the_outer_rim`, pts([sector[0]!, sector[sector.length / 2 - 1]!]))
  row(`${key}.footprint.first_and_last_of_the_outer_rim.by_equation`, pts([mine[0]!, mine[mine.length / 2 - 1]!]))
  row(`${key}.footprint.area`, polygonArea(sector))
  row(`${key}.footprint.area.by_equation`, polygonArea(mine))
}

title('S7 a curved stair in plan: inner radius 0.9, width 1.0, sweep a quarter turn, 10 steps')
{
  for (const [name, more] of [['at_the_origin', {}], ['at_(2,1)_turned_a_quarter', { position: [2, 0, 1], rotation: Math.PI / 2 }]] as const) {
    const scene = arcScene(curved, more)
    const at = standing(scene.stair)
    sectorLines(`S7.${name}`, curved, scene)
    row(`S7.${name}.box`, boxText(stairFootprintAABB(scene.stair)))
    row(`S7.${name}.box.by_equation`, boxText(arcBox(curved, at)))
    const pads = getStairFloorPlacedFootprints(scene.stair, scene.nodes as Record<AnyNodeId, AnyNode>)
    const minePads = padsOfArc(curved, at)
    row(`S7.${name}.boxes_under_it`, pads.length)
    row(`S7.${name}.boxes_under_it.by_equation`, minePads.length)
    row(`S7.${name}.box_under_it(0)`, padText(pads[0]!))
    row(`S7.${name}.box_under_it(0).by_equation`, myPadText(minePads[0]!))
  }
  for (const [name, offset] of [['opening', 0], ['opening_grown_0.1', 0.1]] as const) {
    const scene = arcScene(curved, { openingOffset: offset })
    const hole = holesOf(scene.nodes, 'slab_above')[0] ?? []
    const mine = curvedOpening(curved, { ...standing(scene.stair), offset })
    row(`S7.${name}.points`, hole.length)
    row(`S7.${name}.points.by_equation`, mine.length)
    row(`S7.${name}.first_two`, pts(hole.slice(0, 2)))
    row(`S7.${name}.first_two.by_equation`, pts(mine.slice(0, 2)))
    row(`S7.${name}.outer_end_and_inner_end`, pts(hole.slice(hole.length / 2 - 1, hole.length / 2 + 1)))
    row(`S7.${name}.outer_end_and_inner_end.by_equation`, pts(mine.slice(mine.length / 2 - 1, mine.length / 2 + 1)))
    row(`S7.${name}.area`, areaOfTuples(hole))
    row(`S7.${name}.area.by_equation`, polygonArea(mine))
  }
  // the opening takes the stored inner radius as it is; the stair's body keeps it at 0.2 or more
  const thin = { ...curved, innerRadius: 0.1 }
  const thinScene = arcScene(thin)
  const thinHole = holesOf(thinScene.nodes, 'slab_above')[0] ?? []
  row('S7.inner_radius_0.1.box', boxText(stairFootprintAABB(thinScene.stair)))
  row('S7.inner_radius_0.1.box.by_equation', boxText(arcBox(thin, standing(thinScene.stair))))
  row('S7.inner_radius_0.1.opening_inner_end', pt(thinHole[thinHole.length / 2]!))
  row('S7.inner_radius_0.1.opening_inner_end.by_equation', pt(curvedOpening(thin, { ...standing(thinScene.stair), offset: 0 })[thinHole.length / 2]!))
}

title('S8 a spiral stair in plan: inner radius 0.3, width 1.0, sweep 400 degrees, 16 steps, a top landing 0.9 deep')
{
  const scene = arcScene(spiral)
  const at = standing(scene.stair)
  sectorLines('S8', spiral, scene)
  row('S8.box', boxText(stairFootprintAABB(scene.stair)))
  row('S8.box.by_equation', boxText(arcBox(spiral, at)))
  const short = { ...spiral, sweep: Math.PI, landingDepth: undefined }
  const shortScene = arcScene(short)
  sectorLines('S8.half_turn_no_landing', short, shortScene)
  row('S8.half_turn_no_landing.box', boxText(stairFootprintAABB(shortScene.stair)))
  row('S8.half_turn_no_landing.box.by_equation', boxText(arcBox(short, standing(shortScene.stair))))
  const withLanding = { ...spiral, sweep: Math.PI }
  const withLandingScene = arcScene(withLanding)
  sectorLines('S8.half_turn_with_landing', withLanding, withLandingScene)
  row('S8.half_turn_with_landing.box', boxText(stairFootprintAABB(withLandingScene.stair)))
  row('S8.half_turn_with_landing.box.by_equation', boxText(arcBox(withLanding, standing(withLandingScene.stair))))
  const pads = getStairFloorPlacedFootprints(scene.stair, scene.nodes as Record<AnyNodeId, AnyNode>)
  const minePads = padsOfArc(spiral, at)
  row('S8.boxes_under_it', pads.length)
  row('S8.boxes_under_it.by_equation', minePads.length)
  row('S8.box_under_it(0)', padText(pads[0]!))
  row('S8.box_under_it(0).by_equation', myPadText(minePads[0]!))
  row('S8.box_under_the_column', padText(pads[pads.length - 1]!))
  row('S8.box_under_the_column.by_equation', myPadText(minePads[minePads.length - 1]!))
  for (const [name, offset] of [['opening', 0], ['opening_grown_0.1', 0.1]] as const) {
    const grown = arcScene(spiral, { openingOffset: offset })
    const hole = holesOf(grown.nodes, 'slab_above')[0] ?? []
    const mine = spiralOpening(spiral, { ...standing(grown.stair), offset })
    row(`S8.${name}.points`, hole.length)
    row(`S8.${name}.points.by_equation`, mine.length)
    row(`S8.${name}.first_three`, pts(hole.slice(0, 3)))
    row(`S8.${name}.first_three.by_equation`, pts(mine.slice(0, 3)))
    row(`S8.${name}.area`, areaOfTuples(hole))
    row(`S8.${name}.area.by_equation`, polygonArea(mine))
    row(`S8.${name}.area.exact`, Math.PI * (1.3 + offset) ** 2)
  }
  spatialGridManager.clear()
}
