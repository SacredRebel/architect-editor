// Reference cases for the level (port note entry 9): the stack of storeys, the storey plane, and
// what a wall or a floor-standing thing stands on.
// cd packages/viewer && bun ../../ports/refcases/09-level.ts
//
// Two halves, as in 01-wall.ts. A line `K` is printed by the old editor's own functions; the line
// `K.by_equation` works the same thing out from the port note's equations alone
// (_level-equations.ts, which calls nothing of the old editor). verify.ts holds the two together.
//
// With `--notes` it prints, after the cases, three checks of the repository's own notes that the
// entry's report names. With `--fuzz` it holds the equations against the old editor on 20,000
// scenes drawn by a fixed random sequence. Neither is part of the note's block.
import { sceneRegistry as liveRegistry, useScene as liveScene } from '@pascal-app/core'
import { create } from '@react-three/test-renderer'
import { createElement } from 'react'
import { Object3D, Vector3 } from 'three'
import { z } from 'zod'
import {
  getFloorPlacedElevation,
  getFloorStackedPosition,
  GROUND_SUPPORT_ID,
} from '../../packages/core/src/hooks/spatial-grid/floor-placed-elevation'
import {
  getWallEffectiveHeightForNodes,
  spatialGridManager,
} from '../../packages/core/src/hooks/spatial-grid/spatial-grid-manager'
import { itemOverlapsPolygon } from '../../packages/core/src/lib/item-polygon-overlap'
import { getDefaultLevelName, getLevelDisplayName } from '../../packages/core/src/lib/level-name'
import { planFootprintCorners } from '../../packages/core/src/lib/plan-footprint'
import { encodeTerrainField } from '../../packages/core/src/lib/terrain-codec'
import { applyHeightPatch, createTerrainField, flattenPatch } from '../../packages/core/src/lib/terrain-field'
import { levelBaseElevationAt } from '../../packages/core/src/lib/terrain-support'
import { nodeRegistry, registerNode } from '../../packages/core/src/registry'
import { BuildingNode, CeilingNode, LevelNode, SlabNode, WallNode } from '../../packages/core/src/schema'
import {
  DEFAULT_LEVEL_BASE_ELEVATION,
  normalizeLevelBaseElevation,
} from '../../packages/core/src/schema/nodes/level'
import type { AnyNode, AnyNodeId } from '../../packages/core/src/schema/types'
import {
  DEFAULT_LEVEL_HEIGHT,
  deriveLegacyLevelHeight,
  resolveCeilingHeight,
} from '../../packages/core/src/services/level-height'
import {
  CEILING_CLAMP_MARGIN,
  getCeilingClampBound,
  getLevelAbove,
  getLevelBelow,
  getLevelElevations,
  getLevelFloorToFloorHeight,
  getStoredLevelHeight,
  getWallPlaneTop,
} from '../../packages/core/src/services/storey'
import useScene from '../../packages/core/src/store/use-scene'
import { resolveSlabPlacementElevation } from '../../packages/core/src/systems/slab/slab-placement'
import {
  clampSlabElevationForWalls,
  computeWallSlabSupport,
  getSlabElevationUpperBound,
  SUPPORT_ELEVATION_EPSILON,
  type WallSlabSupport,
  wallOverlapsSlabFootprint,
} from '../../packages/core/src/systems/slab/slab-support'
import {
  MIN_WALL_HEIGHT,
  resolveWallEffectiveHeight,
  resolveWallTop,
} from '../../packages/core/src/systems/wall/wall-top'
import { migrateVerticalSceneNodes } from '../../packages/core/src/utils/vertical-scene-migration'
import { levelDefinition } from '../../packages/nodes/src/level/definition'
import { levelWorldY } from '../../packages/plugin-eco/src/level-y'
import useViewer from '../../packages/viewer/src/store/use-viewer'
import { LevelSystem } from '../../packages/viewer/src/systems/level/level-system'
import { EXPLODED_GAP, getLevelPresentationY } from '../../packages/viewer/src/systems/level/level-utils'
import {
  afterFrame,
  bandOverlaps,
  type BuildingAt,
  ceilingBoundOf,
  cornersOf,
  electWall,
  footSupport,
  levelBase,
  liftOf,
  type Mode,
  nameOf,
  planeOf,
  rectangleOverlaps,
  renumbered,
  shownAt,
  type SlabIn,
  slabCeiling,
  slabLimit,
  slabOnPlane,
  soloState,
  stackOf,
  type Stand,
  topUnderPoint,
  wallBase,
} from './_level-equations'
import { num, pt, pts, row, title } from './_print'
import { type P, topOf } from './_wall-equations'

type Nodes = Record<AnyNodeId, AnyNode>
type Ring = Array<[number, number]>
type Wallish = { start: [number, number]; end: [number, number]; thickness?: number; curveOffset?: number }

const record = (list: AnyNode[]): Nodes => Object.fromEntries(list.map((node) => [node.id, node])) as Nodes
const square = (u0: number, v0: number, u1: number, v1: number): Ring => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
const slab = (id: string, outline: Ring, top: number, more: Record<string, unknown> = {}): SlabNode =>
  SlabNode.parse({ id: `slab_${id}`, polygon: outline, elevation: top, ...more })
const short = (id: string | null | undefined) => (id ? id.replace(/^level_/, '') : 'none')

function both(key: string, code: string | number | boolean, byEquation: string | number | boolean) {
  row(key, code)
  row(`${key}.by_equation`, byEquation)
}

// the same things, as the equations take them
const slabIn = (node: SlabNode): SlabIn => ({
  id: node.id,
  outline: node.polygon,
  holes: node.holes,
  top: node.elevation,
  thickness: node.thickness,
  recessed: node.recessed,
})
const levelsIn = (nodes: Nodes) =>
  Object.values(nodes)
    .filter((node): node is LevelNode => node.type === 'level')
    .map((node) => ({ id: node.id, ordinal: node.level, height: node.height, base: node.baseElevation, parent: node.parentId }))
const buildingsIn = (nodes: Nodes) =>
  Object.values(nodes)
    .filter((node): node is BuildingNode => node.type === 'building')
    .map((node) => ({ id: node.id, children: node.children as string[] }))

// ================================================================== the cases
title('L0 constants and defaults')
row('L0.default_storey_height', DEFAULT_LEVEL_HEIGHT)
row('L0.default_base_elevation', DEFAULT_LEVEL_BASE_ELEVATION)
row('L0.ceiling_margin', CEILING_CLAMP_MARGIN)
row('L0.least_wall_body', MIN_WALL_HEIGHT)
row('L0.pointer_cap_slack', SUPPORT_ELEVATION_EPSILON)
row('L0.ground_host', GROUND_SUPPORT_ID)
row('L0.exploded_gap', EXPLODED_GAP)
{
  const read = LevelNode.parse({})
  row('L0.level_as_read', `ordinal ${num(read.level)} base ${num(read.baseElevation)} height ${'height' in read ? num(read.height as number) : 'absent'}`)
  const made = levelDefinition.defaults() as { level: number; baseElevation: number; height?: number }
  row('L0.level_as_made', `ordinal ${num(made.level)} base ${num(made.baseElevation)} height ${made.height === undefined ? 'absent' : num(made.height)}`)
  row('L0.height_when_absent', getStoredLevelHeight(read))
  row('L0.base_when_not_a_number', normalizeLevelBaseElevation(Number.NaN))
}

function showStack(key: string, nodes: Nodes, ids: string[], withBuilding = false) {
  const code = getLevelElevations(nodes)
  const mine = stackOf(levelsIn(nodes), buildingsIn(nodes))
  for (const id of ids) {
    const e = code.get(id)!
    const D = getLevelFloorToFloorHeight(id, nodes)
    const m = mine.get(id)!
    const owner = (building: string | null) => (withBuilding ? ` in ${building ?? 'no building'}` : '')
    both(
      `${key}.${short(id)}`,
      `floor ${num(e.baseY)} to_next ${num(D)} top ${num(e.baseY + D)} above ${short(getLevelAbove(id, nodes)?.id)} below ${short(getLevelBelow(id, nodes)?.id)}${owner(e.buildingId)}`,
      `floor ${num(m.F)} to_next ${num(m.D)} top ${num(m.F + m.D)} above ${short(m.above)} below ${short(m.below)}${owner(m.building)}`,
    )
  }
}

// one building: the ground level first, two levels added above it, then one added below (the order the
// old editor's own buttons leave in the building's list); the nodes themselves in no order
function fourLevels(bases: { basement?: number; first?: number; second?: number } = {}): Nodes {
  return record([
    LevelNode.parse({ id: 'level_first', level: 1, height: 2.5, baseElevation: bases.first, parentId: 'building_a' }),
    LevelNode.parse({ id: 'level_basement', level: -1, height: 2.4, baseElevation: bases.basement, parentId: 'building_a' }),
    BuildingNode.parse({ id: 'building_a', children: ['level_ground', 'level_first', 'level_second', 'level_basement'] }),
    LevelNode.parse({ id: 'level_second', level: 2, height: 3.0, baseElevation: bases.second, parentId: 'building_a' }),
    LevelNode.parse({ id: 'level_ground', level: 0, height: 2.7, parentId: 'building_a' }),
  ])
}
const FOUR = ['level_basement', 'level_ground', 'level_first', 'level_second']

title('L1 a stack given out of order: basement (ordinal -1) 2.4 m high, ground (0) 2.7, first (1) 2.5, second (2) 3.0; then the basement sunk by its own height; then the first lifted 0.4 and the second dropped 0.25')
{
  showStack('L1', fourLevels(), FOUR)
  showStack('L1.sunk', fourLevels({ basement: -2.4 }), FOUR)
  const lifted = fourLevels({ first: 0.4, second: -0.25 })
  showStack('L1.offsets', lifted, FOUR)
  row('L1.offsets.by_plugin_eco', FOUR.map((id) => `${short(id)} ${num(levelWorldY(lifted as never, id))}`).join(' '))
}

title('L2 order and neighbours: building a with ordinals 0 (no height stored), 2, 5 and a level it only lists; building b with 0, 0.5 and two levels of ordinal 1; two levels of no building; ordinals as renumbered when a file is opened')
{
  const nodes = record([
    BuildingNode.parse({ id: 'building_a', children: ['level_a0', 'level_a2', 'level_a5', 'level_listed'] }),
    BuildingNode.parse({ id: 'building_b', children: ['level_b0', 'level_bx', 'level_by', 'level_bm'] }),
    LevelNode.parse({ id: 'level_a5', level: 5, height: 3.0, parentId: 'building_a' }),
    LevelNode.parse({ id: 'level_bx', level: 1, height: 3.0, parentId: 'building_b' }),
    LevelNode.parse({ id: 'level_a0', level: 0, parentId: 'building_a' }),
    LevelNode.parse({ id: 'level_by', level: 1, height: 2.6, parentId: 'building_b' }),
    LevelNode.parse({ id: 'level_bm', level: 0.5, height: 1.5, parentId: 'building_b' }),
    LevelNode.parse({ id: 'level_a2', level: 2, height: 2.8, parentId: 'building_a' }),
    LevelNode.parse({ id: 'level_b0', level: 0, height: 2.7, parentId: 'building_b' }),
    LevelNode.parse({ id: 'level_loose', level: 1, height: 3.0 }),
    LevelNode.parse({ id: 'level_stray', level: 0, height: 2.75 }),
    LevelNode.parse({ id: 'level_listed', level: 6, height: 2.2 }),
  ])
  showStack('L2', nodes, ['level_a0', 'level_a2', 'level_a5', 'level_listed', 'level_b0', 'level_bm', 'level_bx', 'level_by', 'level_stray', 'level_loose'], true)
  row('L2.to_next.unknown_level', getLevelFloorToFloorHeight('level_none', nodes))

  const stored = [4, -3, 0.5, -1, 4]
  const before: Record<string, Record<string, unknown>> = {
    building_m: { id: 'building_m', type: 'building', children: stored.map((_, i) => `level_m${i}`) },
  }
  stored.forEach((ordinal, i) => {
    before[`level_m${i}`] = { id: `level_m${i}`, type: 'level', parentId: 'building_m', level: ordinal, height: 2.5, children: [] }
  })
  const after = migrateVerticalSceneNodes(before).nodes as Record<string, { level: number }>
  both(
    'L2.renumbered',
    stored.map((ordinal, i) => `${ordinal} to ${after[`level_m${i}`]!.level}`).join(', '),
    stored.map((ordinal, i) => `${ordinal} to ${renumbered(stored)[i]}`).join(', '),
  )
}

title('L3 the storey plane: a ground level 2.7 m high under a first level; on it a wall (0.5, 2) to (3.5, 2), 0.2 thick, with no stored height, and a ceiling over the square (0, 0)-(4, 4); slabs of the first level over that square unless said')
{
  const wall = WallNode.parse({ id: 'wall_a', start: [0.5, 2], end: [3.5, 2], thickness: 0.2, parentId: 'level_ground' })
  const room = square(0, 0, 4, 4)
  const scene = (above: SlabNode[], firstBase = 0): Nodes =>
    record([
      BuildingNode.parse({ id: 'building_a', children: ['level_ground', 'level_first'] }),
      LevelNode.parse({ id: 'level_ground', level: 0, height: 2.7, parentId: 'building_a', children: [wall.id] }),
      LevelNode.parse({ id: 'level_first', level: 1, height: 2.5, baseElevation: firstBase, parentId: 'building_a', children: above.map((s) => s.id) }),
      wall,
      ...above,
    ])
  const show = (key: string, above: SlabNode[], firstBase = 0) => {
    const nodes = scene(above.map((s) => ({ ...s, parentId: 'level_first' })), firstBase)
    const D = getLevelFloorToFloorHeight('level_ground', nodes)
    const H = getWallPlaneTop(wall, 'level_ground', nodes)
    const mineD = stackOf(levelsIn(nodes), buildingsIn(nodes)).get('level_ground')!.D
    const mineH = planeOf(mineD, above.map(slabIn), wall)
    both(
      key,
      `to_next ${num(D)} plane ${num(H)} wall_on_a_base_of_0.15 top ${num(resolveWallTop(wall, H, 0.15))} body ${num(resolveWallEffectiveHeight(wall, H, 0.15))} ceiling ${num(getCeilingClampBound('level_ground', nodes, room))}`,
      `to_next ${num(mineD)} plane ${num(mineH)} wall_on_a_base_of_0.15 top ${num(topOf(mineH, 0.15, undefined, false))} body ${num(topOf(mineH, 0.15, undefined, false) - 0.15)} ceiling ${num(ceilingBoundOf(mineD, above.map(slabIn), room))}`,
    )
    return nodes
  }
  const deck = slab('deck', room, 0, { thickness: 0.3 })
  show('L3.no_slab_above', [])
  show('L3.floor_top_0.05_thick_0.05', [slab('floor', room, 0.05, { thickness: 0.05 })])
  const under = show('L3.deck_top_0_thick_0.3', [deck])
  show('L3.floor_top_0.05_thick_0.25', [slab('floor', room, 0.05, { thickness: 0.25 })])
  show('L3.raised_top_0.4_thick_0.1', [slab('raised', room, 0.4, { thickness: 0.1 })])
  show('L3.two_slabs_undersides_0_and_-0.55', [slab('floor', room, 0.05, { thickness: 0.05 }), slab('beam', room, 0.05, { thickness: 0.6 })])
  show('L3.pool_floor_-1', [slab('pool', room, -1, { thickness: 0.3, recessed: true })])
  show('L3.deck_beside_the_wall', [slab('deck', square(6, 0, 9, 4), 0, { thickness: 0.3 })])
  show('L3.deck_over_the_last_0.1_of_the_wall', [slab('deck', square(3.4, 0, 6, 4), 0, { thickness: 0.3 })])
  show('L3.deck_over_the_last_0.04_of_the_wall', [slab('deck', square(3.46, 0, 6, 4), 0, { thickness: 0.3 })])
  show('L3.deck_with_a_hole_over_the_wall', [slab('deck', room, 0, { thickness: 0.3, holes: [square(0.2, 1, 3.8, 3)] })])
  show('L3.first_level_lifted_0.4', [], 0.4)
  show('L3.first_level_lifted_0.4.deck', [deck], 0.4)
  show('L3.first_level_dropped_0.4', [], -0.4)

  {
    // a wall with a stored height is not held to the plane
    const stored = { height: 2.6 }
    const H = getWallPlaneTop(wall, 'level_ground', under)
    both(
      'L3.deck_top_0_thick_0.3.wall_with_a_stored_height_of_2.6_on_a_base_of_0.15',
      `plane ${num(H)} top ${num(resolveWallTop(stored, H, 0.15))} body ${num(resolveWallEffectiveHeight(stored, H, 0.15))}`,
      `plane ${num(planeOf(2.7, [slabIn(deck)], wall))} top ${num(topOf(planeOf(2.7, [slabIn(deck)], wall), 0.15, 2.6, false))} body ${num(topOf(planeOf(2.7, [slabIn(deck)], wall), 0.15, 2.6, false) - 0.15)}`,
    )
  }

  // ceilings on the ground level, under the deck
  const follows = CeilingNode.parse({ id: 'ceiling_a', parentId: 'level_ground', polygon: room })
  const D = stackOf(levelsIn(under), buildingsIn(under))
  const above = [slabIn(deck)]
  both('L3.ceiling.no_stored_height', resolveCeilingHeight(follows, under), ceilingBoundOf(D.get('level_ground')!.D, above, room))
  row('L3.ceiling.stored_2.0', resolveCeilingHeight({ ...follows, height: 2.0 }, under))
  both('L3.ceiling.beside_the_deck', getCeilingClampBound('level_ground', under, square(5, 0, 8, 4)), ceilingBoundOf(D.get('level_ground')!.D, above, square(5, 0, 8, 4)))
  both('L3.ceiling.touching_the_deck_at_one_corner', getCeilingClampBound('level_ground', under, square(4, 4, 8, 8)), ceilingBoundOf(D.get('level_ground')!.D, above, square(4, 4, 8, 8)))
  both('L3.ceiling.on_the_top_level', getCeilingClampBound('level_first', under, room), ceilingBoundOf(D.get('level_first')!.D, [], room))
  row('L3.plane.unknown_level', getWallPlaneTop(wall, 'level_none', under))
  row('L3.ceiling.bound.unknown_level', getCeilingClampBound('level_none', under, room))
  row('L3.ceiling.no_stored_height.unknown_level', resolveCeilingHeight({ ...follows, parentId: 'level_none' }, under))
}

// ------------------------------------------------------------------ what a wall stands on
const standing = (stand: Stand) =>
  `stands ${num(stand.stands)} on ${stand.on ?? 'none'} lowest ${num(stand.lowest)} runs ${
    stand.runs.length === 0 ? 'none' : stand.runs.map((run) => `${num(run.start)}..${num(run.end)} at ${num(run.height)}`).join(', ')
  }`
const fromCode = (support: WallSlabSupport): Stand => ({
  stands: support.elevation,
  on: support.electedSlabId,
  lowest: support.baseElevation,
  runs: support.baseSegments.map((segment) => ({ start: segment.start, end: segment.end, height: segment.elevation })),
})
function elect(key: string, wall: Wallish, slabs: SlabNode[], g = 0, host: string | null = null, cap: number | null = null) {
  both(
    key,
    standing(fromCode(computeWallSlabSupport(wall, slabs, [], host, cap, g))),
    standing(electWall(wall, slabs.map(slabIn), g, host, cap)),
  )
}
// the same through the old editor's manager, which reads the level's slabs and the ground under the wall's start
function manage(slabs: SlabNode[], more: AnyNode[] = [], levelId = 'level_s') {
  nodeRegistry._reset()
  spatialGridManager.clear()
  const nodes = record([LevelNode.parse({ id: levelId, level: 0, height: 2.7, children: slabs.map((s) => s.id) }), ...slabs, ...more])
  useScene.setState({ nodes })
  for (const one of slabs) spatialGridManager.handleNodeCreated(one, levelId)
  return nodes
}
function throughManager(key: string, levelId: string, wall: Wallish, slabs: SlabNode[], g: number, host?: string, offset?: number) {
  both(
    key,
    standing(fromCode(spatialGridManager.getSlabSupportForWall(levelId, wall.start, wall.end, wall.curveOffset ?? 0, wall.thickness, host, undefined, offset))),
    standing(wallBase({ ...wall, host, offset }, slabs.map(slabIn), g)),
  )
}

const along: Wallish = { start: [0, 2], end: [4, 2], thickness: 0.2 }

title('L4 a wall (0, 2) to (4, 2), 0.2 thick: on nothing, on one slab (0, 0)-(4, 4) with its top at 0.15, on the ground; then the order of the tests with a stored host and a stored offset')
{
  const one = slab('a', square(0, 0, 4, 4), 0.15)
  elect('L4.no_slab', along, [])
  elect('L4.no_slab.level_base_0.8', along, [], 0.8)
  elect('L4.on_the_slab', along, [one])
  elect('L4.one_metre_off_the_slab', { ...along, start: [0, -1], end: [4, -1] }, [one])
  elect('L4.a_wall_of_no_length', { ...along, end: [0, 2] }, [one])
  manage([])
  throughManager('L4.level_without_slabs.offset_0.25', 'level_s', along, [], 0, undefined, 0.25)
  manage([one])
  throughManager('L4.on_the_slab.offset_0.25', 'level_s', along, [one], 0, undefined, 0.25)
  throughManager('L4.on_the_slab.host_ground', 'level_s', along, [one], 0, 'ground')
  throughManager('L4.on_the_slab.host_ground.offset_0.25', 'level_s', along, [one], 0, 'ground', 0.25)
}

title('L5 the same wall on two slabs: low (top 0.15) and high (top 0.45) side by side, the share of the wall each carries as said; then a floor (0.05) with a deck (0.9) over it')
{
  const pair = (lowTo: number, highFrom: number, highTo = 4) => [slab('low', square(0, 0, lowTo, 4), 0.15), slab('high', square(highFrom, 0, highTo, 4), 0.45)]
  elect('L5.low_60_high_40', along, pair(2.4, 2.4))
  elect('L5.high_60_low_40', along, [slab('high', square(0, 0, 2.4, 4), 0.45), slab('low', square(2.4, 0, 4, 4), 0.15)])
  elect('L5.half_and_half', along, pair(2, 2))
  elect('L5.high_30_nothing_under_the_rest', along, [slab('high', square(0, 0, 1.2, 4), 0.45)])
  elect('L5.low_30_bare_30_high_40', along, pair(1.2, 2.4))
  elect('L5.high_under_the_last_0.06_only', along, [slab('high', square(3.94, 0, 6, 4), 0.45)])
  elect('L5.high_under_the_last_0.04_only', along, [slab('high', square(3.96, 0, 6, 4), 0.45)])
  elect('L5.two_at_0.1_half_each_and_one_at_0.6_under_49.75', along, [
    slab('a', square(0, 0, 2, 4), 0.1),
    slab('b', square(2, 0, 4, 4), 0.1),
    slab('raised', square(1, 1, 2.99, 3), 0.6),
  ])
  const stacked = [slab('floor', square(0, 0, 4, 4), 0.05), slab('deck', square(0, 0, 4, 4), 0.9)]
  elect('L5.deck_over_floor', along, stacked)
  elect('L5.deck_over_floor.host_floor', along, stacked, 0, 'slab_floor')
  elect('L5.deck_over_floor.host_gone', along, stacked, 0, 'slab_gone')
  elect('L5.deck_over_floor.pointer_at_0.05', along, stacked, 0, null, 0.05)
  elect('L5.deck_over_floor.pointer_at_0.85', along, stacked, 0, null, 0.85)
}

title('L6 faces, centre, holes, short and bent walls')
{
  const floor = slab('floor', square(0, 0, 4, 4), 0.05)
  const deck = slab('deck', square(0, -3, 4, 0), 1.0)
  const onEdge: Wallish = { start: [0, 0], end: [4, 0], thickness: 0.2 }
  elect('L6.on_the_shared_edge_of_a_floor_0.05_and_a_deck_1.0', onEdge, [floor, deck])
  elect('L6.on_the_edge_of_the_deck_alone', onEdge, [deck])
  const thick: Wallish = { start: [0, 2], end: [4, 2], thickness: 0.4 }
  elect('L6.wall_0.4_thick_over_a_strip_0.2_wide_at_0.3', thick, [slab('strip', square(0, 1.9, 4, 2.1), 0.3)])
  elect('L6.the_same_strip_as_a_pool_at_-0.3', thick, [slab('strip', square(0, 1.9, 4, 2.1), -0.3, { recessed: true })])
  elect('L6.the_same_pool.level_base_0.8', thick, [slab('strip', square(0, 1.9, 4, 2.1), -0.3, { recessed: true })], 0.8)
  elect('L6.inside_a_hole', along, [slab('holed', square(-1, 0, 5, 4), 0.2, { holes: [square(-0.5, 1, 4.5, 3)] })])
  elect('L6.along_the_rim_of_a_hole', along, [slab('holed', square(-1, 0, 5, 4), 0.2, { holes: [square(0, 2, 4, 3.5)] })])
  const stub: Wallish = { start: [0, 2], end: [0.08, 2], thickness: 0.2 }
  elect('L6.wall_0.08_long.slab_under_0.03', stub, [slab('tip', square(0.05, 0, 6, 4), 0.3)])
  elect('L6.wall_0.08_long.slab_under_0.05', stub, [slab('tip', square(0.03, 0, 6, 4), 0.3)])
  const bent: Wallish = { start: [0, 0], end: [4, 0], thickness: 0.2, curveOffset: 1 }
  elect('L6.bent_sagitta_1.two_slabs_meeting_under_its_middle', bent, [slab('low', square(0, -2, 2, 2), 0.15), slab('high', square(2, -2, 4, 2), 0.45)])
  elect('L6.bent_sagitta_1.a_strip_0.6_wide_along_its_chord', bent, [slab('strip', square(0, -0.3, 4, 0.3), 0.15)])
  both('L6.band_overlap.slab_under_the_last_0.06', wallOverlapsSlabFootprint(along, square(3.94, 0, 6, 4)), bandOverlaps(along, square(3.94, 0, 6, 4)))
  both('L6.band_overlap.slab_under_the_last_0.04', wallOverlapsSlabFootprint(along, square(3.96, 0, 6, 4)), bandOverlaps(along, square(3.96, 0, 6, 4)))
  const butting: Wallish = { start: [2, 4], end: [2, 7], thickness: 0.2 }
  both('L6.band_overlap.wall_butting_on_the_edge', wallOverlapsSlabFootprint(butting, square(0, 0, 4, 4)), bandOverlaps(butting, square(0, 0, 4, 4)))
  // the outline a slab is drawn with is the slab's own entry: a slab that bears on the ground is drawn
  // out to the far face of a wall whose band holds its edge, a raised deck is drawn as stored
  const beside = WallNode.parse({ id: 'wall_beside', start: [0, -0.06], end: [4, -0.06], thickness: 0.1 })
  const like = { start: beside.start, end: beside.end, thickness: beside.thickness }
  row('L6.wall_0.06_outside_the_edge.slab_on_the_ground', standing(fromCode(computeWallSlabSupport(like, [slab('room', square(0, 0, 4, 4), 0.1, { thickness: 0.1 })], [beside]))))
  row('L6.wall_0.06_outside_the_edge.raised_deck', standing(fromCode(computeWallSlabSupport(like, [slab('deck', square(0, 0, 4, 4), 1.5)], [beside]))))
}

// ------------------------------------------------------------------ what a floor-standing thing stands on
// the old editor asks each kind for its rectangle; here the kind is a plain one that states its own
function floorKind() {
  registerNode({
    kind: 'column',
    schemaVersion: 1,
    schema: z.object({ type: z.literal('column') }) as never,
    category: 'utility',
    defaults: () => ({}) as never,
    capabilities: {
      floorPlaced: {
        footprint: (node: AnyNode) => {
          const thing = node as unknown as { size: [number, number, number]; rotation: number }
          return { dimensions: thing.size, rotation: [0, thing.rotation, 0] as [number, number, number] }
        },
      },
    },
  } as never)
}
const thing = (levelId: string, position: [number, number, number], more: Record<string, unknown> = {}) =>
  ({
    object: 'node',
    id: 'column_a',
    type: 'column',
    parentId: levelId,
    visible: true,
    metadata: {},
    children: [],
    position,
    rotation: 0,
    size: [0.4, 2.5, 0.4],
    ...more,
  }) as unknown as AnyNode

title('L7 a thing 0.4 by 0.4 m standing on a level with a slab low (0, 0)-(4, 4), top 0.15, and a slab high (4, 0)-(8, 4), top 0.45; then a slab with a hole, a pool, a turned rectangle, a point')
{
  const low = slab('low', square(0, 0, 4, 4), 0.15, { parentId: 'level_s' })
  const high = slab('high', square(4, 0, 8, 4), 0.45, { parentId: 'level_s' })
  let slabs = [low, high]
  let nodes = manage(slabs)
  floorKind()
  const at = (key: string, u: number, v: number, host: string | null = null, cap: number | null = null) => {
    const support = spatialGridManager.getSlabSupportForItem('level_s', [u, 0, v], [0.4, 2.5, 0.4], [0, 0, 0], cap)
    const node = thing('level_s', [u, 0, v], host ? { supportSlabId: host } : {})
    const lift = getFloorPlacedElevation({ node, nodes, position: [u, 0, v], maxElevation: cap })
    const foot = { u, v, width: 0.4, depth: 0.4 }
    const mine = footSupport(foot, slabs.map(slabIn), cap)
    both(
      key,
      `under it ${support.slabId ?? 'none'} at ${num(support.elevation)} lift ${num(lift)}`,
      `under it ${mine.on ?? 'none'} at ${num(mine.top)} lift ${num(liftOf([foot], slabs.map(slabIn), 0, host, cap))}`,
    )
  }
  at('L7.at(2, 2)', 2, 2)
  at('L7.at(6, 2)', 6, 2)
  at('L7.at(4, 2).astride', 4, 2)
  at('L7.at(2, 6).off_both', 2, 6)
  at('L7.at(2, 4.195).0.005_over_the_edge', 2, 4.195)
  at('L7.at(2, 4.18).0.02_over_the_edge', 2, 4.18)
  at('L7.at(4, 2).host_low', 4, 2, 'slab_low')
  at('L7.at(6, 2).host_low', 6, 2, 'slab_low')
  at('L7.at(6, 2).host_ground', 6, 2, 'ground')
  at('L7.at(4, 2).pointer_at_0.2', 4, 2, null, 0.2)
  at('L7.at(4, 2).pointer_at_0.39', 4, 2, null, 0.39)
  at('L7.at(4, 2).pointer_at_0.41', 4, 2, null, 0.41)
  {
    const node = thing('level_s', [6, 0.3, 2])
    const placed = getFloorStackedPosition({ node, nodes, position: [6, 0.3, 2] })
    both('L7.at(6, 2).stored_height_0.3', `(${placed.map((value) => num(value)).join(', ')})`, `(${num(6)}, ${num(0.3 + liftOf([{ u: 6, v: 2, width: 0.4, depth: 0.4 }], slabs.map(slabIn)))}, ${num(2)})`)
    row('L7.at(2, 2).parent_not_a_level', getFloorPlacedElevation({ node: thing('shelf_x', [2, 0, 2]), nodes, position: [2, 0, 2] }))
  }
  slabs = [slab('holed', square(0, 0, 4, 4), 0.2, { parentId: 'level_s', holes: [square(1, 1, 3, 3)] })]
  nodes = manage(slabs)
  floorKind()
  at('L7.hole(1, 1)-(3, 3).at(2.9, 2)', 2.9, 2)
  at('L7.hole(1, 1)-(3, 3).at(3.1, 2)', 3.1, 2)
  slabs = [slab('pool', square(0, 0, 4, 4), -0.5, { parentId: 'level_s', recessed: true })]
  nodes = manage(slabs)
  floorKind()
  at('L7.pool_floor_-0.5.at(2, 2)', 2, 2)

  const turned = { u: 2, v: 3, width: 2, depth: 1, turn: Math.PI / 6 }
  both('L7.rectangle_2_by_1_at(2, 3)_turned_30_deg', pts(planFootprintCorners([2, 0, 3], [2, 1, 1], Math.PI / 6)), pts(cornersOf(turned)))
  both('L7.the_same_shrunk_by_0.01', pts(planFootprintCorners([2, 0, 3], [2, 1, 1], Math.PI / 6, 0.01)), pts(cornersOf(turned, 0.01)))
  const small = square(1.4, 0.7, 1.8, 1.1)
  for (const degrees of [30, -30]) {
    const turn = (degrees * Math.PI) / 180
    both(
      `L7.rectangle_4_by_0.4_at(0, 0)_turned_${degrees}_deg.over_a_slab(1.4, 0.7)-(1.8, 1.1)`,
      itemOverlapsPolygon([0, 0, 0], [4, 1, 0.4], [0, turn, 0], small, 0.01),
      rectangleOverlaps({ u: 0, v: 0, width: 4, depth: 0.4, turn }, small, 0.01),
    )
  }
  {
    // which way the drawn body turns: the library the old editor draws with, asked directly
    const body = new Object3D()
    body.rotation.y = Math.PI / 6
    body.updateMatrixWorld(true)
    const axis = new Vector3(1, 0, 0).applyMatrix4(body.matrixWorld)
    row('L7.turned_30_deg.the_drawn_body_points_its_width_along', pt([axis.x, axis.z]))
    const corners = planFootprintCorners([0, 0, 0], [1, 1, 1], Math.PI / 6)
    row('L7.turned_30_deg.the_rectangle_points_its_width_along', pt([corners[1]![0] - corners[0]![0], corners[1]![1] - corners[0]![1]]))
  }
  slabs = [slab('pool', square(0, 0, 4, 4), -0.5, { parentId: 'level_s', recessed: true }), slab('top', square(2, 0, 6, 4), 0.3, { parentId: 'level_s' })]
  nodes = manage(slabs)
  for (const [u, v, what] of [[1, 2, 'over_the_pool'], [3, 2, 'over_the_slab'], [2, 2, 'on_its_west_edge'], [6, 2, 'on_its_east_edge'], [9, 9, 'over_nothing']] as Array<[number, number, string]>) {
    both(`L7.under_the_point(${u}, ${v}).${what}`, spatialGridManager.getSlabElevationAt('level_s', u, v), topUnderPoint({ x: u, y: v }, slabs.map(slabIn)))
  }
}

title('L8 the ground as the level base: a site whose ground is 1.5 m high over 0 <= u, v <= 2 and 0 around it (read here only on the plateau or a metre and more off it); a building with a basement 2.4 (ordinal -1) under a ground level 2.7')
{
  const flat = createTerrainField({ cols: 9, rows: 9, spacing: 1, origin: [-4, -4] })
  const patch = flattenPatch(flat, { minX: 0, minZ: 0, maxX: 2, maxZ: 2 }, 1.5)
  const site = {
    id: 'site_a',
    type: 'site',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    children: ['building_a'],
    terrain: encodeTerrainField(applyHeightPatch(flat, patch as never)),
  } as unknown as AnyNode
  const plateau = (p: P) => (p.x >= -1e-9 && p.x <= 2 + 1e-9 && p.y >= -1e-9 && p.y <= 2 + 1e-9 ? 1.5 : 0)
  const scene = (place: [number, number, number], turn: number, basementBase: number, more: AnyNode[] = []) =>
    record([
      site,
      BuildingNode.parse({ id: 'building_a', parentId: 'site_a', children: ['level_basement', 'level_ground'], position: place, rotation: [0, turn, 0] }),
      LevelNode.parse({ id: 'level_basement', level: -1, height: 2.4, baseElevation: basementBase, parentId: 'building_a', children: more.map((node) => node.id) }),
      LevelNode.parse({ id: 'level_ground', level: 0, height: 2.7, parentId: 'building_a' }),
      ...more,
    ])
  const base = (key: string, nodes: Nodes, levelId: string, u: number, v: number) => {
    const building = nodes['building_a' as AnyNodeId] as BuildingNode
    const where: BuildingAt = { u: building.position[0], up: building.position[1], v: building.position[2], turn: building.rotation[1] }
    const F = stackOf(levelsIn(nodes), buildingsIn(nodes)).get(levelId)!.F
    both(key, levelBaseElevationAt(nodes, levelId, u, v), levelBase({ x: u, y: v }, F, where, plateau))
  }
  let nodes = scene([0, 0, 0], 0, 0)
  base('L8.basement.at(1, 1)', nodes, 'level_basement', 1, 1)
  base('L8.basement.at(-3, -3)', nodes, 'level_basement', -3, -3)
  base('L8.ground_level.at(1, 1)', nodes, 'level_ground', 1, 1)
  nodes = scene([0, 0, 0], 0, -2.4)
  base('L8.basement_sunk_2.4.basement.at(1, 1)', nodes, 'level_basement', 1, 1)
  base('L8.basement_sunk_2.4.ground_level.at(1, 1)', nodes, 'level_ground', 1, 1)
  nodes = scene([0, -0.3, 0], 0, 0.3)
  base('L8.building_0.3_down_basement_0.3_up.basement.at(1, 1)', nodes, 'level_basement', 1, 1)
  nodes = scene([0, 0.5, 0], 0, 0)
  base('L8.building_0.5_up.basement.at(1, 1)', nodes, 'level_basement', 1, 1)
  nodes = scene([3, 0, 0], 0, 0)
  base('L8.building_3_east.basement.at(-2, 1)', nodes, 'level_basement', -2, 1)
  base('L8.building_3_east.basement.at(1, 1)', nodes, 'level_basement', 1, 1)
  nodes = scene([0, 0, 0], Math.PI / 2, 0)
  base('L8.building_turned_90_deg.basement.at(-1, 1)', nodes, 'level_basement', -1, 1)
  base('L8.building_turned_90_deg.basement.at(1, 1)', nodes, 'level_basement', 1, 1)

  // a wall and a thing on that ground, through the manager
  const onGround = (slabs: SlabNode[]) => {
    const made = scene([0, 0, 0], 0, 0, slabs)
    nodeRegistry._reset()
    spatialGridManager.clear()
    floorKind()
    useScene.setState({ nodes: made })
    for (const one of slabs) spatialGridManager.handleNodeCreated(one, 'level_basement')
    return made
  }
  nodes = onGround([])
  const onPlateau: Wallish = { start: [1, 1], end: [3, 1], thickness: 0.2 }
  throughManager('L8.wall(1, 1)-(3, 1)', 'level_basement', onPlateau, [], 1.5)
  throughManager('L8.wall(1, 1)-(3, 1).offset_0.25', 'level_basement', onPlateau, [], 1.5, undefined, 0.25)
  throughManager('L8.wall(1, 1)-(3, 1).host_ground.offset_0.25', 'level_basement', onPlateau, [], 1.5, 'ground', 0.25)
  throughManager('L8.wall(-3, 1)-(1, 1).its_start_off_the_plateau', 'level_basement', { start: [-3, 1], end: [1, 1], thickness: 0.2 }, [], 0)
  const lifted = (key: string, made: Nodes, slabs: SlabNode[], host?: string) => {
    const node = thing('level_basement', [1, 0, 1], host ? { supportSlabId: host } : {})
    both(key, getFloorPlacedElevation({ node, nodes: made, position: [1, 0, 1] }), liftOf([{ u: 1, v: 1, width: 0.4, depth: 0.4 }], slabs.map(slabIn), 1.5, host ?? null))
  }
  lifted('L8.thing.at(1, 1)', nodes, [])
  const pad = slab('pad', square(0, 0, 2, 2), 0.2, { parentId: 'level_basement' })
  nodes = onGround([pad])
  const onPad: Wallish = { start: [0.5, 1], end: [1.5, 1], thickness: 0.2 }
  throughManager('L8.pad_top_0.2_on_the_plateau.wall(0.5, 1)-(1.5, 1)', 'level_basement', onPad, [pad], 1.5)
  throughManager('L8.pad_top_0.2_on_the_plateau.wall.host_ground', 'level_basement', onPad, [pad], 1.5, 'ground')
  lifted('L8.pad_top_0.2_on_the_plateau.thing.at(1, 1)', nodes, [pad])
  lifted('L8.pad_top_0.2_on_the_plateau.thing.host_ground', nodes, [pad], 'ground')
}

title('L9 how high a slab may rise under a wall with no stored height: storey 2.7, wall (1, 2) to (3, 2) on the slab (0, 0)-(4, 4); and a slab set on a plane')
{
  const free = [WallNode.parse({ id: 'wall_a', start: [1, 2], end: [3, 2], thickness: 0.2 })]
  const fixed = [WallNode.parse({ id: 'wall_a', start: [1, 2], end: [3, 2], thickness: 0.2, height: 1.1 })]
  const under = slab('under', square(0, 0, 4, 4), 0.15)
  const away = slab('away', square(10, 0, 14, 4), 0.15)
  const limit = (key: string, proposed: number, one: SlabNode, walls: WallNode[]) => {
    const code = clampSlabElevationForWalls(proposed, one, walls, [one], 2.7)
    const mine = slabLimit(proposed, slabIn(one), walls, [slabIn(one)], 2.7)
    both(key, `${num(code.elevation)} ${code.clamped ? 'held' : 'free'}`, `${num(mine.top)} ${mine.held ? 'held' : 'free'}`)
  }
  for (const proposed of [2.0, 2.2, 2.4, 3.5]) limit(`L9.asked_${proposed}`, proposed, under, free)
  limit('L9.asked_2.4.the_wall_has_a_stored_height', 2.4, under, fixed)
  limit('L9.asked_2.4.no_wall_on_the_slab', 2.4, away, free)
  both('L9.highest_allowed', getSlabElevationUpperBound(under, free, [under], 2.7), slabCeiling(slabIn(under), free, [slabIn(under)], 2.7))
  both('L9.highest_allowed.no_wall_on_the_slab', getSlabElevationUpperBound(away, free, [away], 2.7), slabCeiling(slabIn(away), free, [slabIn(away)], 2.7))
  {
    // the limit is taken from the stored storey height; the wall ends at the plane (L3)
    const wall = WallNode.parse({ id: 'wall_a', start: [1, 2], end: [3, 2], thickness: 0.2, parentId: 'level_ground' })
    const raised = slab('under', square(0, 0, 4, 4), 2.2, { parentId: 'level_ground' })
    const deck = slab('deck', square(0, 0, 4, 4), 0, { thickness: 0.3, parentId: 'level_first' })
    const nodes = record([
      BuildingNode.parse({ id: 'building_a', children: ['level_ground', 'level_first'] }),
      LevelNode.parse({ id: 'level_ground', level: 0, height: 2.7, parentId: 'building_a', children: [wall.id, raised.id] }),
      LevelNode.parse({ id: 'level_first', level: 1, height: 2.5, parentId: 'building_a', children: [deck.id] }),
      wall,
      raised,
      deck,
    ])
    nodeRegistry._reset()
    spatialGridManager.clear()
    useScene.setState({ nodes })
    spatialGridManager.handleNodeCreated(raised, 'level_ground')
    spatialGridManager.handleNodeCreated(deck, 'level_first')
    const H = planeOf(2.7, [slabIn(deck)], wall)
    both('L9.slab_at_its_limit_2.2_under_a_deck_0.3_thick.wall_body', getWallEffectiveHeightForNodes(wall, nodes), topOf(H, 2.2, undefined, false) - 2.2)
  }
  both('L9.slab_top_0.05_set_on_a_plane_at_1.2', resolveSlabPlacementElevation({ elevation: 0.05, recessed: false }, 1.2), slabOnPlane(0.05, false, 1.2))
  both('L9.pool_floor_-0.5_set_on_a_plane_at_1.2', resolveSlabPlacementElevation({ elevation: -0.5, recessed: true }, 1.2), slabOnPlane(-0.5, true, 1.2))
  both('L9.slab_top_0.05_set_on_no_plane', resolveSlabPlacementElevation({ elevation: 0.05, recessed: false }, null), slabOnPlane(0.05, false, null))
}

title('L10 names for ordinals -2 to 2, a stored name, an empty stored name')
for (const ordinal of [-2, -1, 0, 1, 2]) both(`L10.ordinal(${ordinal})`, getDefaultLevelName(ordinal), nameOf(ordinal))
both('L10.ordinal(1).stored_Atelier', getLevelDisplayName({ name: 'Atelier', level: 1 }), nameOf(1, 'Atelier'))
both('L10.ordinal(-1).stored_empty', getLevelDisplayName({ name: '', level: -1 }), nameOf(-1, ''))

title('L11 display only: the stack of L1 as shown in each mode; every level drawn at 1.0, then one frame of 1/60 s, then one of 0.2 s; in solo and manual the first level is the chosen one')
{
  const nodes = fourLevels()
  const stack = stackOf(levelsIn(nodes), buildingsIn(nodes))
  const levels = FOUR.map((id) => nodes[id as AnyNodeId] as LevelNode)
  // the frame system reads the stores of the built package, as it does in the running editor
  liveScene.setState({ nodes } as never)
  const drawn = levels.map((level) => {
    const object = new Object3D()
    liveRegistry.nodes.set(level.id, object)
    liveRegistry.byType.level!.add(level.id)
    return object
  })
  const frame = async (seconds: number) => {
    const renderer = await create(createElement(LevelSystem))
    try {
      await renderer.advanceFrames(1, seconds)
    } finally {
      await renderer.unmount()
    }
  }
  const state = (object: Object3D) => (!object.visible ? 'not drawn' : object.layers.mask === 1 << 4 ? 'shadow only' : 'drawn')
  const list = (values: Array<number | string>) => values.map((value) => (typeof value === 'number' ? num(value) : value)).join(' | ')
  for (const mode of ['stacked', 'exploded', 'solo', 'manual'] as Mode[]) {
    const chosen = mode === 'solo' || mode === 'manual' ? 'level_first' : null
    useViewer.setState({ levelMode: mode, selection: { ...useViewer.getState().selection, levelId: chosen } } as never)
    const targets = levels.map((level) => shownAt(stack.get(level.id)!.F, level.level, mode))
    both(`L11.${mode}.settles_at`, list(levels.map((level) => getLevelPresentationY(level.id, nodes, mode))), list(targets))
    for (const object of drawn) {
      object.position.y = 1
      object.visible = true
    }
    await frame(1 / 60)
    const first = drawn.map((object) => object.position.y)
    await frame(0.2)
    if (mode === 'exploded') {
      // the step toward the height is the same in every mode: printed once
      both('L11.exploded.after_1/60_s', list(first), list(targets.map((target) => afterFrame(1, target, 1 / 60))))
      both('L11.exploded.after_0.2_s_more', list(drawn.map((object) => object.position.y)), list(targets.map((target) => afterFrame(afterFrame(1, target, 1 / 60), target, 0.2))))
    }
    both(
      `L11.${mode}.drawn`,
      list(drawn.map(state)),
      list(levels.map((level) => soloState(level.level, chosen ? 1 : null, level.id === chosen, mode))),
    )
  }
  liveRegistry.clear()
}

// ================================================================== not part of the block
if (process.argv.includes('--notes')) {
  title("notes (with --notes only): three statements of the repository's own notes, run")
  // wiki\architecture\systems.md, the systems table: "WallCutout | Cuts door/window holes in wall geometry".
  // The hole is cut by the mesh builder alone; nothing of WallCutout is mounted here.
  const { calculateLevelMiters, DoorNode, sceneRegistry } = await import('@pascal-app/core')
  const { Mesh } = await import('three')
  const { generateExtrudedWall } = await import('../../packages/viewer/src/systems/wall/wall-system')
  const { meshFacts } = await import('./_mesh')
  const wall = WallNode.parse({ id: 'wall_n', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  const door = DoorNode.parse({ id: 'door_n', wallId: wall.id, position: [1, 1.05, 0], width: 0.9, height: 2.1 })
  sceneRegistry.nodes.set(wall.id, new Mesh())
  row('N.wall_4_by_0.2_by_2.5.volume', meshFacts(generateExtrudedWall(wall as never, [], calculateLevelMiters([wall as never]))).volume)
  row('N.the_same_with_a_door_0.9_by_2.1.volume', meshFacts(generateExtrudedWall(wall as never, [door], calculateLevelMiters([wall as never]))).volume)
  sceneRegistry.nodes.delete(wall.id)
  // wiki\architecture\vertical-model.md: "a default legacy storey stores 2.55 = 0.05 slab + 2.5 wall"
  const old = record([
    LevelNode.parse({ id: 'level_old', children: ['slab_old', 'wall_old'] }),
    SlabNode.parse({ id: 'slab_old', parentId: 'level_old', polygon: square(0, 0, 4, 4), elevation: 0.05 }),
    WallNode.parse({ id: 'wall_old', parentId: 'level_old', start: [1, 2], end: [3, 2], height: 2.5 }),
  ])
  row('N.height_given_to_an_old_level', deriveLegacyLevelHeight('level_old', old))
  // annex 1.9, last section, item 7: a ceiling with no stored height resolves to the plane less 0.01
  // (L3.ceiling.no_stored_height); ceiling-system.tsx then sets the mesh a further 0.01 down (read, line 117)
}

// With `--fuzz`: the equations against the old editor on scenes drawn by a fixed random sequence,
// to look for a place where the two part. Not part of the block either.
if (process.argv.includes('--fuzz')) {
  let seed = 20261002
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!
  const grid = (lo: number, hi: number, step: number) => lo + Math.round((rnd() * (hi - lo)) / step) * step
  const near = (a: number, b: number) => Math.abs(a - b) <= 2e-6 || (!Number.isFinite(a) && a === b)
  const tops = [0.05, 0.15, 0.15 + 5e-5, 0.3, 0.45, 0.9]
  const ring = (): Ring => {
    if (rnd() < 0.7) {
      const u0 = grid(-2, 5, 0.5)
      const v0 = grid(-2, 5, 0.5)
      return square(u0, v0, u0 + grid(0.5, 5, 0.5), v0 + grid(0.5, 5, 0.5))
    }
    // a four-sided ring that is not square to the axes
    const c: [number, number] = [grid(0, 4, 0.25), grid(0, 4, 0.25)]
    return [0, 1, 2, 3].map((k) => {
      const angle = (k + 0.2 + rnd() * 0.6) * (Math.PI / 2)
      const reach = 0.6 + rnd() * 2.5
      return [c[0] + Math.cos(angle) * reach, c[1] + Math.sin(angle) * reach] as [number, number]
    })
  }
  const holeIn = (outline: Ring): Ring[] => {
    if (rnd() < 0.6) return []
    const us = outline.map((q) => q[0])
    const vs = outline.map((q) => q[1])
    const u0 = Math.min(...us) + (Math.max(...us) - Math.min(...us)) * grid(0, 0.5, 0.25)
    const v0 = Math.min(...vs) + (Math.max(...vs) - Math.min(...vs)) * grid(0, 0.5, 0.25)
    return [square(u0, v0, u0 + grid(0.25, 2, 0.25), v0 + grid(0.25, 2, 0.25))]
  }
  // every slab drawn as stored: raised ones (their underside off the floor), and one pool at most
  const someSlabs = (parentId: string): SlabNode[] => {
    const list: SlabNode[] = []
    const count = 1 + Math.floor(rnd() * 4)
    for (let k = 0; k < count; k += 1) {
      const outline = ring()
      const pool = k === 0 && rnd() < 0.15
      list.push(slab(`f${k}`, outline, pool ? -0.3 : pick(tops), { thickness: 0.02, recessed: pool, holes: holeIn(outline), parentId }))
    }
    return list
  }
  const someWall = (): Wallish => {
    const start: [number, number] = [grid(-1, 5, 0.5), grid(-1, 5, 0.5)]
    const end: [number, number] = rnd() < 0.5 ? [start[0] + grid(0.5, 5, 0.5), start[1]] : [grid(-1, 5, 0.25), grid(-1, 5, 0.25)]
    return { start, end, thickness: pick([0, 0.1, 0.2, 0.4]), curveOffset: rnd() < 0.2 ? pick([0.5, -0.8, 1]) : 0 }
  }
  let scenes = 0
  let numbers = 0
  const apart: string[] = []
  const hold = (what: string, a: number, b: number) => {
    numbers += 1
    if (!near(a, b) && apart.length < 12) apart.push(`${what}: the code ${a}, the equations ${b}`)
  }
  const same = (what: string, a: Stand, b: Stand) => {
    hold(`${what} stands`, a.stands, b.stands)
    hold(`${what} lowest`, a.lowest, b.lowest)
    hold(`${what} runs`, a.runs.length, b.runs.length)
    if (a.on !== b.on && apart.length < 12) apart.push(`${what}: on ${a.on} against ${b.on}`)
    a.runs.forEach((run, k) => {
      const other = b.runs[k]
      if (!other) return
      hold(`${what} run ${k} start`, run.start, other.start)
      hold(`${what} run ${k} end`, run.end, other.end)
      hold(`${what} run ${k} height`, run.height, other.height)
    })
  }
  for (let round = 0; round < 20000; round += 1) {
    scenes += 1
    // what a wall stands on
    const slabs = someSlabs('level_s')
    const wall = someWall()
    const g = pick([0, 0, 0.8, -0.2])
    const host = rnd() < 0.3 ? pick([...slabs.map((one) => one.id), 'slab_gone']) : null
    const cap = rnd() < 0.3 ? pick([0.05, 0.2, 0.4, 0.9]) : null
    const what = `round ${round} wall ${JSON.stringify(wall)} slabs ${JSON.stringify(slabs.map((one) => [one.polygon, one.holes, one.elevation]))} g ${g} host ${host} cap ${cap}`
    same(what, fromCode(computeWallSlabSupport(wall, slabs, [], host, cap, g)), electWall(wall, slabs.map(slabIn), g, host, cap))
    for (const one of slabs) {
      numbers += 1
      if (wallOverlapsSlabFootprint(wall, one.polygon, one.holes) !== bandOverlaps(wall, one.polygon, one.holes) && apart.length < 12) apart.push(`${what}: band over ${one.id}`)
    }
    // the plane under the same slabs set on a level above, and a ceiling's bound
    const first = slabs.map((one) => ({ ...one, parentId: 'level_first' }))
    const firstBase = pick([0, 0, 0.4, -0.4])
    const nodes = record([
      BuildingNode.parse({ id: 'building_a', children: ['level_ground', 'level_first'] }),
      LevelNode.parse({ id: 'level_ground', level: 0, height: 2.7, parentId: 'building_a' }),
      LevelNode.parse({ id: 'level_first', level: 1, height: 2.5, baseElevation: firstBase, parentId: 'building_a', children: first.map((one) => one.id) }),
      ...first,
    ])
    const D = stackOf(levelsIn(nodes), buildingsIn(nodes)).get('level_ground')!.D
    hold(`${what} plane`, getWallPlaneTop(wall, 'level_ground', nodes), planeOf(D, first.map(slabIn), wall))
    const over = ring()
    hold(`${what} ceiling over ${JSON.stringify(over)}`, getCeilingClampBound('level_ground', nodes, over), ceilingBoundOf(D, first.map(slabIn), over))
    // a rectangle on the slabs, a point, and a thing with that rectangle and maybe a stored host
    const onLevel = manage(slabs)
    floorKind()
    const foot = { u: grid(-1, 6, 0.25), v: grid(-1, 6, 0.25), width: pick([0.4, 1, 2.5]), depth: pick([0.4, 0.6, 1]), turn: pick([0, 0, Math.PI / 2, Math.PI / 6, -1.1]) }
    const support = spatialGridManager.getSlabSupportForItem('level_s', [foot.u, 0, foot.v], [foot.width, 1, foot.depth], [0, foot.turn, 0], cap)
    const mine = footSupport(foot, slabs.map(slabIn), cap)
    hold(`${what} rectangle ${JSON.stringify(foot)}`, support.elevation, mine.top)
    if (support.slabId !== mine.on && apart.length < 12) apart.push(`${what} rectangle ${JSON.stringify(foot)}: under it ${support.slabId} against ${mine.on}`)
    hold(`${what} point`, spatialGridManager.getSlabElevationAt('level_s', foot.u, foot.v), topUnderPoint({ x: foot.u, y: foot.v }, slabs.map(slabIn)))
    const named = host === null ? (rnd() < 0.1 ? 'ground' : null) : host
    const standingThing = thing('level_s', [foot.u, 0, foot.v], { size: [foot.width, 1, foot.depth], rotation: foot.turn, ...(named ? { supportSlabId: named } : {}) })
    hold(
      `${what} thing ${JSON.stringify(foot)} host ${named}`,
      getFloorPlacedElevation({ node: standingThing, nodes: onLevel, position: [foot.u, 0, foot.v], maxElevation: cap }),
      liftOf([foot], slabs.map(slabIn), 0, named, cap),
    )
    // the slab's limit under the wall. The old editor takes the level's walls into the outline a slab
    // is drawn with (entry 4): a pool's edge in a wall's band moves, a raised slab's does not. So only
    // scenes without a pool are held here, where drawn and stored are the same ring.
    const asked = pick([2.0, 2.3, 3.5])
    const walls = [WallNode.parse({ id: 'wall_f', start: wall.start, end: wall.end, thickness: wall.thickness, curveOffset: wall.curveOffset, ...(rnd() < 0.2 ? { height: 1.2 } : {}) })]
    if (!slabs.some((one) => one.recessed)) {
      const held = clampSlabElevationForWalls(asked, slabs[0]!, walls, slabs, 2.7)
      const heldMine = slabLimit(asked, slabIn(slabs[0]!), walls, slabs.map(slabIn), 2.7)
      hold(`${what} limit asked ${asked}`, held.elevation, heldMine.top)
      hold(`${what} highest allowed`, getSlabElevationUpperBound(slabs[0]!, walls, slabs, 2.7), slabCeiling(slabIn(slabs[0]!), walls, slabs.map(slabIn), 2.7))
    }
    // a stack
    const levels: LevelNode[] = []
    const buildings = ['building_p', 'building_q'].map((id) => BuildingNode.parse({ id, children: [] }))
    const count = 1 + Math.floor(rnd() * 6)
    for (let k = 0; k < count; k += 1) {
      const owner = pick(['building_p', 'building_p', 'building_q', null])
      const level = LevelNode.parse({
        id: `level_z${k}`,
        level: pick([-2, -1, 0, 0.5, 1, 1, 2, 5]),
        ...(rnd() < 0.8 ? { height: pick([2.4, 2.5, 2.7, 3]) } : {}),
        baseElevation: pick([0, 0, 0, 0.4, -0.25]),
        parentId: rnd() < 0.8 ? owner : null,
      })
      if (owner && rnd() < 0.8) (buildings.find((b) => b.id === owner)!.children as string[]).push(level.id)
      levels.push(level)
    }
    const scene = record(rnd() < 0.5 ? [...levels, ...buildings] : [...buildings, ...levels])
    const code = getLevelElevations(scene)
    const stack = stackOf(levelsIn(scene), buildingsIn(scene))
    for (const level of levels) {
      const m = stack.get(level.id)!
      hold(`stack ${round} ${level.id} floor`, code.get(level.id)!.baseY, m.F)
      hold(`stack ${round} ${level.id} to next`, getLevelFloorToFloorHeight(level.id, scene), m.D)
      if ((getLevelAbove(level.id, scene)?.id ?? null) !== m.above || (getLevelBelow(level.id, scene)?.id ?? null) !== m.below || code.get(level.id)!.buildingId !== m.building) {
        if (apart.length < 12) apart.push(`stack ${round} ${level.id}: neighbours or building differ`)
      }
    }
  }
  title(`fuzz (with --fuzz only): ${scenes} scenes, ${numbers} numbers held, ${apart.length === 0 ? 'none apart' : `apart: ${apart.length}${apart.length >= 12 ? ' or more' : ''}`}`)
  for (const line of apart) console.log(line)
}
