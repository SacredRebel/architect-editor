// Reference cases for the zone, the unit and room detection (port note entry 10).
// cd packages/viewer && bun ../../ports/refcases/10-zone.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone (_zone-equations.ts calls nothing of the old
// editor): a line `K.by_equation` must give what the line `K` gives (verify.ts holds the two
// together). `K.exact` is the true value where the old editor takes less: the room between the
// wall faces and not on the walls' centrelines, a bent wall as its arc, a crossed outline as
// its two lobes.
import { MathUtils } from 'three'
import {
  detectSpacesForLevel,
  planAutoZonesForLevel,
  resolveAutoZonePolygon,
  wallClosesRoom,
  wallTouchesOthers,
} from '../../packages/core/src/lib/space-detection'
import {
  deriveUnit,
  unitWarnings as codeUnitWarnings,
  unassignedZoneIds,
  unitsForZone,
} from '../../packages/core/src/lib/unit-containment'
import { buildUnitReport } from '../../packages/core/src/lib/unit-report'
import { deriveZoneQuantityReport, type ZoneQuantityValue } from '../../packages/core/src/lib/zone-quantities'
import {
  type AnyNode,
  BuildingNode,
  CeilingNode,
  ColumnNode,
  DoorNode,
  LevelNode,
  SlabNode,
  UnitNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '../../packages/core/src/schema'
import { UNIT_KINDS } from '../../packages/core/src/schema/nodes/unit'
import { DEFAULT_LEVEL_HEIGHT } from '../../packages/core/src/services/level-height'
import { CEILING_CLAMP_MARGIN } from '../../packages/core/src/services/storey'
import { buildZoneContextualDimensions } from '../../packages/nodes/src/zone/contextual-dimensions'
import { buildZoneFloorplan } from '../../packages/nodes/src/zone/floorplan'
import { zoneQuickMeasurement } from '../../packages/nodes/src/zone/quick-measurement'
import { buildRoomClearDimensions } from '../../packages/nodes/src/zone/room-clear-dimensions'
import { buildRoomFloorplanSchedule } from '../../packages/nodes/src/zone/room-documentation'
import { owningUnitForZone } from '../../packages/nodes/src/zone/unit-membership'
import { polygonArea } from './_mesh'
import { num, pt, pts, row, title } from './_print'
import { arcOf, topOf } from './_wall-equations'
import {
  adopted,
  areaLabelAt,
  areaOf,
  chordsOf,
  clearDimensions,
  clearOutline,
  closesRoom,
  type Cover,
  edgesOf,
  fadeStep,
  hoverAnchor,
  liveOutline,
  type Measure,
  nameLabelAt,
  ownerOf,
  type P,
  perimeterOf,
  quantitiesOf,
  type Room,
  roomList,
  type RoomZone,
  roomsOf,
  sidesOf,
  touches,
  unitGathers,
  unitReport,
  unitWarnings,
  type UZone,
  type ZWall,
} from './_zone-equations'

type XY = [number, number]
const LEVEL = 'level_a'

// ------------------------------------------------------------------ what the cases are made of
function wall(name: string, start: XY, end: XY, more: Partial<WallNode> = {}): WallNode {
  return WallNode.parse({ id: `wall_${name}`, parentId: LEVEL, start, end, thickness: 0.2, ...more })
}
// walls a, b, c … round an outline, each from one corner to the next
function ring(points: XY[], names = 'abcdefgh', more: Partial<WallNode> = {}): WallNode[] {
  return points.map((start, i) => wall(names[i]!, start, points[(i + 1) % points.length]!, more))
}
const scene = (list: Array<{ id: string }>) => Object.fromEntries(list.map((node) => [node.id, node])) as Record<string, AnyNode>
const contextOf = (list: Array<{ id: string }>, siblings: ZoneNode[] = []) => {
  const nodes = scene(list)
  return { resolve: (id: string) => nodes[id], children: [], siblings, parent: null } as never
}

// the same things as the port note's equations read them
const at = (xy: readonly number[]): P => ({ x: xy[0]!, y: xy[1]! })
const plainWall = (w: WallNode): ZWall => ({
  id: w.id,
  S: at(w.start),
  E: at(w.end),
  s: w.curveOffset,
  thickness: w.thickness,
  front: w.frontSide,
  back: w.backSide,
})
const roomZone = (zone: ZoneNode): RoomZone => ({
  id: zone.id,
  level: zone.parentId,
  role: zone.spaceRole,
  policy: zone.clearDimensionPolicy,
  enclosure: zone.enclosureStatus,
  fromWalls: zone.autoFromWalls,
  wallIds: zone.boundaryWallIds,
})

const sub = (text: string) => title(`  ${text}`)
function both(key: string, code: number | string | boolean, equation: number | string | boolean) {
  row(key, code)
  row(`${key}.by_equation`, equation)
}
const shown = (p: P | null) => (p ? pt(p) : 'none')
const sidesText = (list: Array<{ id: string; front: string; back: string }>) =>
  list.map((entry) => `${entry.id} ${entry.front}/${entry.back}`).join(' ')
const facesText = (faces: Array<{ wallId: string; face: string; points: ReadonlyArray<P | XY> }>, points: boolean) =>
  faces.map((face) => (points ? `${face.wallId}:${face.face} ${pts(face.points)}` : `${face.wallId}:${face.face}`)).join(points ? ' | ' : ' ')

// one level's walls through the old editor's detection and through the note's equations
type Show = { outline?: boolean; area?: boolean; walls?: boolean; faces?: 'names' | 'points'; sides?: boolean; id?: boolean }
function detect(key: string, walls: WallNode[], show: Show = {}): { rooms: Room[] } {
  const code = detectSpacesForLevel(LEVEL, walls)
  const rooms = roomsOf(walls.map(plainWall), LEVEL)
  both(`${key}.rooms`, code.spaces.length, rooms.length)
  code.spaces.forEach((space, i) => {
    const name = code.spaces.length === 1 ? `${key}.room` : `${key}.room${i + 1}`
    const mine = rooms[i]
    if (show.outline) both(`${name}.outline`, pts(space.polygon), mine ? pts(mine.polygon) : 'none')
    if (show.area) both(`${name}.area`, polygonArea(space.polygon.map(at)), mine ? areaOf(mine.polygon) : Number.NaN)
    if (show.walls) both(`${name}.walls`, space.wallIds.join(' '), mine ? mine.wallIds.join(' ') : 'none')
    if (show.faces) both(`${name}.faces`, facesText(space.boundaryFaces, show.faces === 'points'), mine ? facesText(mine.faces, show.faces === 'points') : 'none')
    if (show.id) both(`${name}.id`, space.id, mine ? mine.id : 'none')
  })
  if (show.sides) {
    both(
      `${key}.sides`,
      sidesText(code.wallUpdates.map((update) => ({ id: update.wallId, front: update.frontSide, back: update.backSide }))),
      sidesText(walls.map((w) => ({ id: w.id, ...sidesOf(plainWall(w), rooms) }))),
    )
  }
  return { rooms }
}
// the walls with the sides that detection gives them written on them, as the editor stores them
function withSides(walls: WallNode[]): WallNode[] {
  const found = detectSpacesForLevel(LEVEL, walls)
  return walls.map((w) => {
    const update = found.wallUpdates.find((entry) => entry.wallId === w.id)!
    return { ...w, frontSide: update.frontSide, backSide: update.backSide }
  })
}

const rect: XY[] = [[0, 0], [4, 0], [4, 3], [0, 3]]
const ell: XY[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]
// the square room of most cases: wall a (0, 0) to (4, 0), b to (4, 3), c to (0, 3), d back to (0, 0)
const square = (more: Partial<WallNode> = {}) => ring(rect, 'abcd', more)

// ------------------------------------------------------------------ the cases
title('Z0 what a zone and a unit hold when nothing is given, and the limits the schema sets')
{
  const zone = ZoneNode.parse({ id: 'zone_a', name: 'Zone', polygon: [] })
  const common = new Set(['object', 'id', 'type', 'parentId', 'visible', 'camera', 'metadata'])
  const taken = (more: Record<string, unknown>) => (ZoneNode.safeParse({ id: 'zone_a', name: 'Zone', polygon: [], ...more }).success ? 'taken' : 'refused')
  row('Z0.zone.fields', Object.keys(ZoneNode.shape).filter((name) => !common.has(name)).join(' '))
  row(
    'Z0.zone.not_given',
    `autoFromWalls ${zone.autoFromWalls}, boundaryWallIds ${zone.boundaryWallIds.length}, spaceRole ${zone.spaceRole}, enclosureStatus ${zone.enclosureStatus}, clearDimensionPolicy ${zone.clearDimensionPolicy}, color ${zone.color}`,
  )
  row('Z0.zone.ceiling_height', zone.ceilingHeight)
  row('Z0.zone.ceiling_height_least', `0.1 ${taken({ ceilingHeight: 0.1 })}, 0.09 ${taken({ ceilingHeight: 0.09 })}`)
  row(
    'Z0.zone.text_lengths',
    `room number 32 ${taken({ roomNumber: 'x'.repeat(32) })} 33 ${taken({ roomNumber: 'x'.repeat(33) })}, a finish 120 ${taken({ wallFinish: 'x'.repeat(120) })} 121 ${taken({ wallFinish: 'x'.repeat(121) })}, occupancy 80 ${taken({ occupancy: 'x'.repeat(80) })} 81 ${taken({ occupancy: 'x'.repeat(81) })}`,
  )
  const unit = UnitNode.parse({ id: 'unit_a' })
  row('Z0.unit.not_given', `name ${unit.name}, kind ${unit.kind}, members ${unit.members.length}, color ${unit.color}`)
  row('Z0.unit.kinds', UNIT_KINDS.join(' '))
  row('Z0.storey.default_height', DEFAULT_LEVEL_HEIGHT)
  row('Z0.ceiling.below_the_storey_plane', CEILING_CLAMP_MARGIN)
  row('Z0.slab.default_elevation', SlabNode.parse({ id: 'slab_a', polygon: [] }).elevation)
}

title('Z1 outlines by themselves: a rectangle (0, 0) (4, 0) (4, 3) (0, 3); an L (0, 0) (4, 0) (4, 2) (2, 2) (2, 4) (0, 4); outlines with no area')
{
  const measures = (key: string, polygon: XY[], edges = false) => {
    const zone = ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Zone', polygon })
    const outline = polygon.map(at)
    const report = deriveZoneQuantityReport(zone, scene([zone]))
    both(`${key}.area`, report.footprintArea, areaOf(outline))
    both(`${key}.perimeter`, report.perimeter, perimeterOf(outline))
    if (edges) both(`${key}.edges`, report.edgeLengths.map((edge) => num(edge)).join(' '), edgesOf(outline).map((edge) => num(edge)).join(' '))
    const label = buildZoneContextualDimensions(zone, contextOf([zone]))
    both(`${key}.area_label_at`, label && label.kind === 'dimension-label' ? pt([label.cx, label.cy]) : 'none', shown(areaLabelAt(outline)))
    const plan = buildZoneFloorplan(zone, contextOf([zone]))
    const name = plan && plan.kind === 'group' ? plan.children.find((child) => child.kind === 'text') : undefined
    both(`${key}.name_at`, name && name.kind === 'text' ? pt([name.x, name.y]) : 'none', shown(nameLabelAt(outline)))
    const hover = zoneQuickMeasurement(zone)
    const anchor = hoverAnchor(outline)
    both(
      `${key}.hover_report`,
      hover ? `area ${num(hover.metrics[0]!.value)} perimeter ${num(hover.metrics[1]!.value)} anchor ${pt(hover.anchor)}` : 'none',
      anchor ? `area ${num(areaOf(outline))} perimeter ${num(perimeterOf(outline))} anchor ${pt(anchor)}` : 'none',
    )
  }
  measures('Z1.rect', rect, true)
  measures('Z1.ell', ell, true)
  sub('the L with its corners in the opposite order')
  measures('Z1.ell_the_other_way_round', [...ell].reverse())
  sub('three points in a line: (0, 0) (2, 0) (4, 0)')
  measures('Z1.in_a_line', [[0, 0], [2, 0], [4, 0]])
  sub('an outline that crosses itself: (0, 0) (4, 4) (4, 0) (0, 2); its two lobes meet at (4/3, 4/3)')
  measures('Z1.crossed', [[0, 0], [4, 4], [4, 0], [0, 2]])
  row('Z1.crossed.area.exact', areaOf([at([0, 0]), at([4 / 3, 4 / 3]), at([0, 2])]) + areaOf([at([4 / 3, 4 / 3]), at([4, 4]), at([4, 0])]))
  sub('two points: (0, 0) (4, 0)')
  measures('Z1.two_points', [[0, 0], [4, 0]])
}

title('Z2 a square room: walls a (0, 0) to (4, 0), b to (4, 3), c to (0, 3), d back to (0, 0), all 0.2 thick')
{
  const walls = square()
  const { rooms } = detect('Z2', walls, { outline: true, area: true, walls: true, faces: 'names', id: true, sides: true })
  const zone = ZoneNode.parse({
    id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: rect, autoFromWalls: true,
    boundaryWallIds: walls.map((w) => w.id), spaceRole: 'room', clearDimensionPolicy: 'inside-faces',
  })
  const wallOf = new Map(walls.map((w) => [w.id as string, plainWall(w)]))
  const clear = clearOutline(roomZone(zone), (id) => wallOf.get(id))
  row('Z2.room.area.exact', clear && rooms.length === 1 ? areaOf(clear) : Number.NaN)
  sub('the same four walls, each drawn from its end to its start')
  detect('Z2.other_way', walls.map((w) => wall(w.id.slice(5), w.end as XY, w.start as XY)), { outline: true, faces: 'names', sides: true })
}

title('Z3 two rooms and the wall between them: a ring 8 x 3 (a b c d from (0, 0)) and wall s from (4, 0) to (4, 3), all 0.2 thick')
{
  const outer = ring([[0, 0], [8, 0], [8, 3], [0, 3]])
  detect('Z3', [...outer, wall('s', [4, 0], [4, 3])], { outline: true, faces: 'points', sides: true })
  sub('the left room alone first (a, s, c, d), its sides stored on its walls; then walls e, f, g close the right room')
  const left = withSides([wall('a', [0, 0], [4, 0]), wall('s', [4, 0], [4, 3]), wall('c', [4, 3], [0, 3]), wall('d', [0, 3], [0, 0])])
  detect('Z3.second_room_added_later', [...left, wall('e', [4, 0], [8, 0]), wall('f', [8, 0], [8, 3]), wall('g', [8, 3], [4, 3])], { sides: true })
  sub('wall s stops 0.05 short of the two long walls: from (4, 0.05) to (4, 2.95); then 0.09 short')
  detect('Z3.stops_0.05_short', [...outer, wall('s', [4, 0.05], [4, 2.95])], { outline: true })
  detect('Z3.stops_0.09_short', [...outer, wall('s', [4, 0.09], [4, 2.91])], { outline: true })
}

title('Z4 rings that do not close, and the limits of size (the square of Z2 unless said)')
{
  const walls = square()
  sub('walls a, b, c with the sides they had in Z2, wall d taken away')
  detect('Z4.one_wall_taken_away', withSides(walls).slice(0, 3), { sides: true })
  sub('two walls: (0, 0) to (4, 0) and (4, 0) to (0, 0.5)')
  detect('Z4.two_walls', [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [0, 0.5])])
  sub('wall d ends at (0, gap) and not at (0, 0)')
  const open = (gap: number) => [...walls.slice(0, 3), wall('d', [0, 3], [0, gap])]
  detect('Z4.gap(0.0004)', open(0.0004), { outline: true })
  detect('Z4.gap(0.002)', open(0.002))
  detect('Z4.gap(0.05)', open(0.05))
  sub('wall a starts at (0.0002, 0), wall d ends at (-0.0002, 0)')
  detect('Z4.ends_either_side_of_zero', [wall('a', [0.0002, 0], [4, 0]), ...walls.slice(1, 3), wall('d', [0, 3], [-0.0002, 0])])
  sub('rings of four walls, width x depth')
  for (const [width, depth] of [[0.7, 0.7], [1, 0.5], [100, 100], [101, 100]] as Array<[number, number]>) {
    detect(`Z4.room(${width} x ${depth})`, ring([[0, 0], [width, 0], [width, depth], [0, depth]]))
  }
  sub('a round room of radius 50 in 1900 and in 2100 straight walls, corner to corner')
  for (const count of [1900, 2100]) {
    const corner = (i: number): XY => [50 * Math.cos((2 * Math.PI * i) / count), 50 * Math.sin((2 * Math.PI * i) / count)]
    const many = Array.from({ length: count }, (_, i) => WallNode.parse({ id: `wall_r${i}`, parentId: LEVEL, start: corner(i), end: corner((i + 1) % count), thickness: 0.2 }))
    detect(`Z4.round_room_in_${count}_walls`, many)
  }
  sub('a corridor 4 x 0.17: its walls with no thickness of their own, then 0.1 thick')
  const corridor: XY[] = [[0, 0], [4, 0], [4, 0.17], [0, 0.17]]
  detect('Z4.corridor.no_thickness', ring(corridor, 'abcd', { thickness: undefined }), { sides: true })
  detect('Z4.corridor.thickness_0.1', ring(corridor, 'abcd', { thickness: 0.1 }), { sides: true })
}

title('Z5 a room in a room, a wall that sticks into a room, a wall that crosses one, two rooms at one corner')
{
  const big: XY[] = [[0, 0], [8, 0], [8, 6], [0, 6]]
  const small: XY[] = [[3, 2], [5, 2], [5, 4], [3, 4]]
  sub('a ring 8 x 6 from (0, 0) (a b c d) and inside it a ring 2 x 2 from (3, 2) (p q r s)')
  detect('Z5.inside', [...ring(big), ...ring(small, 'pqrs')], { outline: true, area: true, sides: true })
  sub('the same, and wall j from (0, 3) to (3, 3) joining the two rings')
  detect('Z5.inside_and_joined', [...ring(big), ...ring(small, 'pqrs'), wall('j', [0, 3], [3, 3])], { outline: true, area: true })
  sub('the square of Z2 and wall t from (2, 0) to (2, 1.5)')
  detect('Z5.sticks_in', [...square(), wall('t', [2, 0], [2, 1.5])], { outline: true, faces: 'points', sides: true })
  sub('the square of Z2 and wall x from (2, -1) to (2, 4)')
  detect('Z5.crosses', [...square(), wall('x', [2, -1], [2, 4])], { outline: true, sides: true })
  sub('a ring 4 x 3 from (1, 1) (a b c d) and walls e (1, 1) to (3, -2), f (3, -2) to (5, 1)')
  detect(
    'Z5.one_corner',
    [...ring([[1, 1], [5, 1], [5, 4], [1, 4]]), wall('e', [1, 1], [3, -2]), wall('f', [3, -2], [5, 1])],
    { outline: true, id: true },
  )
}

title('Z6 a room with a bent wall: the square of Z2 with wall a bent, sagitta +1, -1 and +0.1')
for (const sagitta of [1, -1, 0.1]) {
  const walls = [wall('a', [0, 0], [4, 0], { curveOffset: sagitta }), ...square().slice(1)]
  const key = `Z6.sagitta(${sagitta})`
  detect(key, walls, { outline: true, area: true, sides: true })
  const arc = arcOf({ id: 'a', S: at([0, 0]), E: at([4, 0]), s: sagitta, thickness: 0.2 })
  const segment = arc ? 0.5 * arc.R * arc.R * (Math.abs(arc.delta) - Math.sin(Math.abs(arc.delta))) : 0
  row(`${key}.room.area.exact`, 12 + Math.sign(sagitta) * segment)
  both(`${key}.wall_a.points`, detectSpacesForLevel(LEVEL, walls).spaces[0]!.boundaryFaces[0]!.points.length, chordsOf(plainWall(walls[0]!)).length)
}
{
  sub('sagitta +1, and wall t from the middle of the arc (2, -1) to (2, 3)')
  detect('Z6.a_wall_onto_the_arc', [wall('a', [0, 0], [4, 0], { curveOffset: 1 }), ...square().slice(1), wall('t', [2, -1], [2, 3])], { outline: true })
  sub('wall a bent, sagitta +1, closed by its own chord: as one wall b (4, 0) to (0, 0), then as two, b to (2, 0) and c to (0, 0); a wall z stands apart')
  const arc = wall('a', [0, 0], [4, 0], { curveOffset: 1 })
  const apart = wall('z', [10, 0], [12, 0])
  detect('Z6.arc_and_chord_in_one_wall', [arc, wall('b', [4, 0], [0, 0]), apart])
  detect('Z6.arc_and_chord_in_two_walls', [arc, wall('b', [4, 0], [2, 0]), wall('c', [2, 0], [0, 0]), apart], { area: true })
}

title('Z7 clear dimensions of a room zone that asks for inside faces (walls 0.2 thick unless said)')
{
  const clear = (key: string, walls: WallNode[], zoneMore: Partial<ZoneNode> = {}, others: ZoneNode[] = [], otherWalls: WallNode[] = []) => {
    const zone = ZoneNode.parse({
      id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: [], autoFromWalls: true,
      boundaryWallIds: walls.map((w) => w.id), spaceRole: 'room', clearDimensionPolicy: 'inside-faces', ...zoneMore,
    })
    const all = [...walls, ...otherWalls.filter((w) => !walls.some((own) => own.id === w.id))]
    const code = buildRoomClearDimensions(zone, contextOf([...all, zone, ...others], others)).flatMap((entry) => (entry.kind === 'dimension' ? [entry] : []))
    const wallOf = new Map(all.map((w) => [w.id as string, plainWall(w)]))
    const mine = clearDimensions(roomZone(zone), (id) => wallOf.get(id), others.map(roomZone))
    both(`${key}.count`, code.length, mine.length)
    code.forEach((entry, i) => {
      const length = Math.hypot(entry.end[0] - entry.start[0], entry.end[1] - entry.start[1])
      both(
        `${key}.${i + 1}`,
        `${pt(entry.start)} to ${pt(entry.end)} length ${num(length)} label ${entry.text}`,
        mine[i] ? `${pt(mine[i]!.start)} to ${pt(mine[i]!.end)} length ${num(mine[i]!.length)} label ${mine[i]!.label}` : 'none',
      )
    })
  }
  sub('the square of Z2; then the same walls listed c, d, a, b on the zone')
  clear('Z7.rect', square())
  clear('Z7.rect_walls_listed_from_c', [...square().slice(2), ...square().slice(0, 2)])
  sub('the square with wall a 0.4 thick and wall b 0.1 thick')
  clear('Z7.walls_0.4_and_0.1', [wall('a', [0, 0], [4, 0], { thickness: 0.4 }), wall('b', [4, 0], [4, 3], { thickness: 0.1 }), ...square().slice(2)])
  sub('the square with its first side in two walls: (0, 0) to (2, 0) and (2, 0) to (4, 0)')
  clear('Z7.one_side_in_two_walls', ring([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]))
  sub('walls round the L of Z1; walls round a U: (0, 0) (6, 0) (6, 4) (4, 4) (4, 2) (2, 2) (2, 4) (0, 4)')
  clear('Z7.ell', ring(ell))
  clear('Z7.u', ring([[0, 0], [6, 0], [6, 4], [4, 4], [4, 2], [2, 2], [2, 4], [0, 4]]))
  sub('a ring 4 x 0.45 (0.25 clear); five sides (0, 0) (4, 0) (4, 2) (2, 3) (0, 2); slanted (0, 0) (4, 0) (5, 3) (1, 3); the square with wall a bent, sagitta 0.5')
  clear('Z7.clear_width_0.25', ring([[0, 0], [4, 0], [4, 0.45], [0, 0.45]]))
  clear('Z7.five_sides', ring([[0, 0], [4, 0], [4, 2], [2, 3], [0, 2]]))
  clear('Z7.slanted', ring([[0, 0], [4, 0], [5, 3], [1, 3]]))
  clear('Z7.a_bent_wall', [wall('a', [0, 0], [4, 0], { curveOffset: 0.5 }), ...square().slice(1)])
  sub('the square, with the policy none, the zone marked open, the zone not from walls')
  clear('Z7.policy_none', square(), { clearDimensionPolicy: 'none' })
  clear('Z7.marked_open', square(), { enclosureStatus: 'open' })
  clear('Z7.not_from_walls', square(), { autoFromWalls: false })
  sub('two rooms side by side, both asking for finish faces: zone_a on walls a, s, c, d (s from (4, 0) to (4, 3)), zone_b on e, f, g, s to (8, 3)')
  const sideBySide = (key: string, between: number) => {
    const shared = wall('s', [4, 0], [4, 3], { thickness: between })
    const left = [wall('a', [0, 0], [4, 0]), shared, wall('c', [4, 3], [0, 3]), wall('d', [0, 3], [0, 0])]
    const right = [wall('e', [4, 0], [8, 0]), wall('f', [8, 0], [8, 3]), wall('g', [8, 3], [4, 3]), shared]
    const neighbour = ZoneNode.parse({
      id: 'zone_b', parentId: LEVEL, name: 'Next', polygon: [], autoFromWalls: true,
      boundaryWallIds: right.map((w) => w.id), spaceRole: 'room', clearDimensionPolicy: 'finish-faces',
    })
    clear(key, left, { clearDimensionPolicy: 'finish-faces' }, [neighbour], right)
  }
  sideBySide('Z7.finish_faces_with_a_neighbour', 0.2)
  sub('the same with wall s 0.02 thick')
  sideBySide('Z7.finish_faces.wall_between_0.02_thick', 0.02)
}

title('Z8 what the square room of Z2 holds: a slab under it (elevation 0.05), a ceiling at 2.5, storey 2.5, a door 0.9 x 2.1 in wall a, a window 1.2 x 1.0 in wall b')
{
  const level = LevelNode.parse({ id: LEVEL, height: 2.5, children: [] })
  const slab = SlabNode.parse({ id: 'slab_a', parentId: LEVEL, polygon: rect })
  const ceiling = CeilingNode.parse({ id: 'ceiling_a', parentId: LEVEL, polygon: rect, height: 2.5 })
  const said = (value: ZoneQuantityValue) => (value.status === 'available' ? num(value.value) : `not proven: ${value.reason}`)
  const mine = (value: Measure) => ('value' in value ? num(value.value) : `not proven: ${value.reason}`)
  type Field = 'classification' | 'area' | 'perimeter' | 'walls' | 'wall_surface' | 'floor_surface' | 'volume'
  // base: the top of the slab the walls stand on (entry 1, equation 8), 0 where they stand on none
  const hold = (
    key: string,
    fields: Field[],
    parts: { zone?: ZoneNode; walls?: WallNode[]; slabs?: SlabNode[]; ceilings?: CeilingNode[]; more?: Array<{ id: string }>; base?: number } = {},
  ) => {
    const zone = parts.zone ?? ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: rect })
    const walls = parts.walls ?? square()
    const slabs = parts.slabs ?? [slab]
    const ceilings = parts.ceilings ?? [ceiling]
    const base = parts.base ?? 0.05
    const code = deriveZoneQuantityReport(zone, scene([level, ...walls, zone, ...slabs, ...ceilings, ...(parts.more ?? [])]))
    const heightOf = new Map(walls.map((w) => [w.id as string, topOf(2.5, base, w.height, w.supportSlabId === 'ground') - base]))
    const floors: Cover[] = slabs.map((entry) => ({ polygon: entry.polygon.map(at), holes: entry.holes.map((hole) => hole.map(at)), datum: entry.elevation }))
    const tops: Cover[] = ceilings.map((entry) => ({
      polygon: entry.polygon.map(at),
      holes: entry.holes.map((hole) => hole.map(at)),
      datum: entry.height ?? 2.5 - CEILING_CLAMP_MARGIN,
    }))
    const equation = quantitiesOf(zone.polygon.map(at), walls.map(plainWall), (id) => heightOf.get(id) ?? Number.NaN, floors, tops, LEVEL)
    for (const field of fields) {
      if (field === 'classification') both(`${key}.classification`, code.classification, equation.classification)
      if (field === 'area') both(`${key}.footprint_area`, code.footprintArea, equation.area)
      if (field === 'perimeter') both(`${key}.perimeter`, code.perimeter, equation.perimeter)
      if (field === 'walls') both(`${key}.boundary_walls`, code.boundaryWallIds.join(' ') || 'none', equation.boundaryWalls.join(' ') || 'none')
      if (field === 'wall_surface') both(`${key}.wall_surface`, said(code.wallSurface), mine(equation.wallSurface))
      if (field === 'floor_surface') both(`${key}.floor_surface`, said(code.floorSurface), mine(equation.floorSurface))
      if (field === 'volume') both(`${key}.volume`, said(code.volume), mine(equation.volume))
    }
  }
  const walls = square()
  const door = DoorNode.parse({ id: 'door_a', parentId: 'wall_a', wallId: 'wall_a', position: [1, 1.05, 0], width: 0.9, height: 2.1 })
  const window = WindowNode.parse({ id: 'window_a', parentId: 'wall_b', wallId: 'wall_b', position: [1.5, 1.4, 0], width: 1.2, height: 1.0 })
  hold('Z8', ['classification', 'area', 'perimeter', 'walls', 'wall_surface', 'floor_surface', 'volume'], { more: [door, window] })
  // between the wall faces: the clear outline of equation (9), the clear height, the two openings taken out
  const zone = ZoneNode.parse({
    id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: rect, autoFromWalls: true,
    boundaryWallIds: walls.map((w) => w.id), spaceRole: 'room', clearDimensionPolicy: 'inside-faces',
  })
  const wallOf = new Map(walls.map((w) => [w.id as string, plainWall(w)]))
  const clear = clearOutline(roomZone(zone), (id) => wallOf.get(id)) ?? []
  const clearHeight = 2.5 - slab.elevation
  row('Z8.wall_surface.exact', perimeterOf(clear) * clearHeight - door.width * door.height - window.width * window.height)
  row('Z8.floor_surface.exact', areaOf(clear))
  row('Z8.volume.exact', areaOf(clear) * clearHeight)
  sub('the same without the door and the window; then with ceilingHeight 3 on the zone')
  hold('Z8.without_the_door_and_window', ['wall_surface'])
  hold('Z8.zone_ceiling_height_3', ['volume'], { zone: ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: rect, ceilingHeight: 3 }) })
  sub('the ceiling with no height of its own; at 0.04; no ceiling')
  hold('Z8.ceiling_with_no_height', ['volume'], { ceilings: [CeilingNode.parse({ id: 'ceiling_a', parentId: LEVEL, polygon: rect })] })
  hold('Z8.ceiling_at_0.04', ['volume'], { ceilings: [CeilingNode.parse({ id: 'ceiling_a', parentId: LEVEL, polygon: rect, height: 0.04 })] })
  hold('Z8.no_ceiling', ['volume'], { ceilings: [] })
  sub('walls with a height of 3; no slab')
  hold('Z8.walls_3_high', ['wall_surface'], { walls: square({ height: 3 }) })
  hold('Z8.no_slab', ['wall_surface', 'floor_surface', 'volume'], { slabs: [], base: 0 })
  sub('a hole in the slab: 1 x 1 from (1, 1); 2 x 1 from (3, 1), across the outline; a slab 6 x 5 from (-1, -1) with a hole 5 x 4 from (-0.5, -0.5), round the zone')
  const withHole = (hole: XY[], polygon: XY[] = rect) => [SlabNode.parse({ id: 'slab_a', parentId: LEVEL, polygon, holes: [hole] })]
  hold('Z8.slab_hole_inside', ['floor_surface'], { slabs: withHole([[1, 1], [2, 1], [2, 2], [1, 2]]) })
  hold('Z8.slab_hole_across_the_outline', ['floor_surface'], { slabs: withHole([[3, 1], [5, 1], [5, 2], [3, 2]]) })
  hold('Z8.slab_hole_round_the_zone', ['floor_surface'], {
    slabs: withHole([[-0.5, -0.5], [4.5, -0.5], [4.5, 3.5], [-0.5, 3.5]], [[-1, -1], [5, -1], [5, 4], [-1, 4]]),
  })
  sub('the slab only from u = 0 to 3.85, to 3.7; two slabs, u = 0 to 2 at 0.05 and 2 to 4 at 0.25')
  const slabTo = (u: number, from = 0, elevation = 0.05, id = 'slab_a') =>
    SlabNode.parse({ id, parentId: LEVEL, polygon: [[from, 0], [u, 0], [u, 3], [from, 3]], elevation })
  hold('Z8.slab_under_3.85_of_4', ['floor_surface'], { slabs: [slabTo(3.85)] })
  hold('Z8.slab_under_3.7_of_4', ['floor_surface'], { slabs: [slabTo(3.7)] })
  hold('Z8.two_slabs_0.05_and_0.25', ['floor_surface'], { slabs: [slabTo(2), slabTo(4, 2, 0.25, 'slab_b')] })
  sub('no slab, no ceiling, walls 2.5 high that stop 0.02 short of every corner')
  const short = rect.map((start, i) => {
    const end = rect[(i + 1) % rect.length]!
    const run = Math.hypot(end[0] - start[0], end[1] - start[1])
    const along = [(end[0] - start[0]) / run, (end[1] - start[1]) / run]
    return wall('abcd'[i]!, [start[0] + along[0]! * 0.02, start[1] + along[1]! * 0.02], [end[0] - along[0]! * 0.02, end[1] - along[1]! * 0.02], { height: 2.5 })
  })
  hold('Z8.walls_short_of_the_corners', ['classification', 'walls', 'wall_surface'], { walls: short, slabs: [], ceilings: [], base: 0 })
  sub('no slab, no ceiling: the zone is the left half of a ring 8 x 3; then the zone 8 x 3 over that ring with wall s from (4, 0) to (4, 3)')
  const wide = ring([[0, 0], [8, 0], [8, 3], [0, 3]])
  hold('Z8.half_of_a_room', ['classification', 'walls', 'wall_surface'], { walls: wide, slabs: [], ceilings: [], base: 0 })
  hold('Z8.over_two_rooms', ['classification', 'walls', 'wall_surface'], {
    zone: ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Both', polygon: [[0, 0], [8, 0], [8, 3], [0, 3]] }),
    walls: [...wide, wall('s', [4, 0], [4, 3])],
    slabs: [],
    ceilings: [],
    base: 0,
  })
  sub('the room of Z8 with the zone drawn on the wall faces: (0.1, 0.1) (3.9, 0.1) (3.9, 2.9) (0.1, 2.9)')
  hold('Z8.zone_on_the_wall_faces', ['classification', 'area', 'wall_surface', 'floor_surface', 'volume'], {
    zone: ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Inner', polygon: [[0.1, 0.1], [3.9, 0.1], [3.9, 2.9], [0.1, 2.9]] }),
  })

  sub('the room list: Bath (number 10, the square), Hall (2, 2 x 3, marked enclosed, no walls), Store (no number, 1 x 3), Attic (a1), Annex (A1, marked open), and Garden, not a room')
  const rooms = [
    ZoneNode.parse({ id: 'zone_bath', parentId: LEVEL, name: 'Bath', polygon: rect, spaceRole: 'room', roomNumber: '10' }),
    ZoneNode.parse({ id: 'zone_hall', parentId: LEVEL, name: 'Hall', polygon: [[4, 0], [6, 0], [6, 3], [4, 3]], spaceRole: 'room', roomNumber: '2', enclosureStatus: 'enclosed' }),
    ZoneNode.parse({ id: 'zone_store', parentId: LEVEL, name: 'Store', polygon: [[6, 0], [7, 0], [7, 3], [6, 3]], spaceRole: 'room' }),
    ZoneNode.parse({ id: 'zone_attic', parentId: LEVEL, name: 'Attic', polygon: rect, spaceRole: 'room', roomNumber: 'a1' }),
    ZoneNode.parse({ id: 'zone_annex', parentId: LEVEL, name: 'Annex', polygon: rect, spaceRole: 'room', roomNumber: 'A1', enclosureStatus: 'open' }),
    ZoneNode.parse({ id: 'zone_garden', parentId: LEVEL, name: 'Garden', polygon: rect }),
  ]
  const list = buildRoomFloorplanSchedule({ siblings: rooms, nodes: scene([level, ...walls, ...rooms]), levelId: LEVEL, unit: 'metric' })
  const own = roomList(
    rooms
      .filter((room) => room.spaceRole === 'room')
      .map((room) => {
        const held = quantitiesOf(room.polygon.map(at), walls.map(plainWall), () => 2.5, [], [], LEVEL)
        return { id: room.id, name: room.name, number: room.roomNumber, enclosure: room.enclosureStatus, area: held.area, classification: held.classification }
      }),
  )
  both('Z8.room_list.order', list?.rows.map((entry) => entry.id).join(' ') ?? 'none', own.rows.map((entry) => entry.id).join(' '))
  both(
    'Z8.room_list.cells',
    list?.rows.map((entry) => `${entry.cells.number} ${entry.cells.area} ${entry.cells.enclosure}`).join(' | ') ?? 'none',
    own.rows.map((entry) => `${entry.number} ${entry.area} ${entry.enclosure}`).join(' | '),
  )
  both('Z8.room_list.issues', list?.issues?.join(' | ') ?? 'none', own.issues.join(' | '))
  row('Z8.room_list.ceiling_height_cell', list?.rows[0]?.cells.ceilingHeight)
}

title('Z9 units of one building with levels a (ordinal 0), b (1), c (3)')
{
  sub('zones: Kitchen 3 x 2 from (0.5, 0.5) on level a, inside the square of Z2; Bedroom, the L of Z1, on level b; Hall 2 x 3 from (4, 0) on level a; Loft 4 x 3 on level c')
  sub('units, as the building lists them: unit_other (Kitchen, Loft), unit_flat (Kitchen, Bedroom, Kitchen again, a zone that is gone), unit_empty (a zone that is gone)')
  sub('on level a also: walls far (20, 0) to (24, 0) and hall (6, 0) to (6, 3), columns at (1, 1) and (3.8, 1), a slab on the square')
  const building = BuildingNode.parse({ id: 'building_a', children: ['level_a', 'level_b', 'level_c', 'unit_other', 'unit_flat', 'unit_empty'] })
  const levelNodes = [
    LevelNode.parse({ id: 'level_a', parentId: 'building_a', level: 0, height: 2.5 }),
    LevelNode.parse({ id: 'level_b', parentId: 'building_a', level: 1, height: 2.5 }),
    LevelNode.parse({ id: 'level_c', parentId: 'building_a', level: 3, height: 2.5 }),
  ]
  const zones = [
    ZoneNode.parse({ id: 'zone_kitchen', parentId: 'level_a', name: 'Kitchen', polygon: [[0.5, 0.5], [3.5, 0.5], [3.5, 2.5], [0.5, 2.5]] }),
    ZoneNode.parse({ id: 'zone_bedroom', parentId: 'level_b', name: 'Bedroom', polygon: ell }),
    ZoneNode.parse({ id: 'zone_hall', parentId: 'level_a', name: 'Hall', polygon: [[4, 0], [6, 0], [6, 3], [4, 3]] }),
    ZoneNode.parse({ id: 'zone_loft', parentId: 'level_c', name: 'Loft', polygon: rect }),
  ]
  const units = [
    UnitNode.parse({ id: 'unit_flat', parentId: 'building_a', name: 'Flat', members: ['zone_kitchen', 'zone_bedroom', 'zone_kitchen', 'zone_gone'] }),
    UnitNode.parse({ id: 'unit_other', parentId: 'building_a', name: 'Other', members: ['zone_kitchen', 'zone_loft'] }),
    UnitNode.parse({ id: 'unit_empty', parentId: 'building_a', name: 'Empty', members: ['zone_gone'] }),
  ]
  const walls = [...square(), wall('far', [20, 0], [24, 0]), wall('hall', [6, 0], [6, 3])]
  const columns = [
    ColumnNode.parse({ id: 'column_in', parentId: 'level_a', position: [1, 0, 1] }),
    ColumnNode.parse({ id: 'column_out', parentId: 'level_a', position: [3.8, 0, 1] }),
  ]
  const slab = SlabNode.parse({ id: 'slab_a', parentId: 'level_a', polygon: rect })
  const nodes = scene([building, ...levelNodes, ...zones, ...units, ...walls, ...columns, slab]) as never
  const flat = units[0]!

  const zoneOf = new Map<string, UZone>(zones.map((zone) => [zone.id, { id: zone.id, name: zone.name, level: zone.parentId, outline: zone.polygon.map(at) }]))
  const levelOf = new Map(levelNodes.map((entry) => [entry.id as string, { id: entry.id as string, ordinal: entry.level }]))

  const report = buildUnitReport(flat, nodes)
  const own = unitReport(flat.members, zoneOf, levelOf)
  both('Z9.flat.members', report.memberCount, own.count)
  both('Z9.flat.areas', report.members.map((member) => `${member.name} ${num(member.areaM2)}`).join(' '), own.areas.map((member) => `${member.name} ${num(member.area)}`).join(' '))
  both('Z9.flat.gross_area', report.grossAreaM2, own.gross)
  both(
    'Z9.flat.levels',
    report.levelSpan ? `from ${report.levelSpan.minOrdinal} to ${report.levelSpan.maxOrdinal}, ${report.levelSpan.count} levels` : 'none',
    own.span ? `from ${own.span.from} to ${own.span.to}, ${own.span.count} levels` : 'none',
  )
  const warnings = (unit: UnitNode) => codeUnitWarnings(unit, nodes).map((entry) => entry.code).join(' ') || 'none'
  both(
    'Z9.warnings',
    units.map((unit) => `${unit.id} ${warnings(unit)}`).join(', '),
    units.map((unit) => `${unit.id} ${unitWarnings(unit.members, zoneOf, levelOf).join(' ') || 'none'}`).join(', '),
  )
  const inBuildingOrder = building.children.flatMap((id) => units.filter((unit) => unit.id === id))
  both(
    'Z9.kitchen.wears',
    owningUnitForZone(zones[0]!, (id) => (nodes as Record<string, AnyNode>)[id])?.id ?? 'none',
    ownerOf('zone_kitchen', inBuildingOrder) ?? 'none',
  )
  both(
    'Z9.kitchen.listed_by',
    unitsForZone('zone_kitchen', nodes).map((unit) => unit.id).join(' '),
    units.filter((unit) => unit.members.includes('zone_kitchen')).map((unit) => unit.id).join(' '),
  )
  const listed = new Set(units.flatMap((unit) => unit.members))
  both(
    'Z9.building.zones_in_no_unit',
    unassignedZoneIds('building_a', nodes).join(' ') || 'none',
    zones.filter((zone) => !listed.has(zone.id)).map((zone) => zone.id).join(' ') || 'none',
  )
  const gathered = deriveUnit(flat, nodes)
  const mine = unitGathers(
    flat.members,
    zoneOf,
    levelOf,
    new Map([['level_a', walls.map(plainWall)]]),
    columns.map((column) => ({ id: column.id, level: column.parentId as string, at: at([column.position[0], column.position[2]]) })),
    [{ id: slab.id, level: 'level_a', polygon: slab.polygon.map(at), holes: [] }],
  )
  both('Z9.flat.gathers.levels', gathered.levelIds.join(' '), mine.levels.join(' '))
  both('Z9.flat.gathers.boundary_walls', gathered.boundaryWallIds.join(' ') || 'none', mine.boundaryWalls.join(' ') || 'none')
  both('Z9.flat.gathers.contained', gathered.containedNodeIds.join(' ') || 'none', mine.contained.join(' ') || 'none')
  both('Z9.flat.gathers.floors_and_ceilings', gathered.supportIds.join(' ') || 'none', mine.supports.join(' ') || 'none')
}

title('Z10 a zone taken from a room; a wall that closes a room; walls that touch (the square of Z2)')
{
  const walls = square()
  const spaces = detectSpacesForLevel(LEVEL, walls).spaces
  const rooms = roomsOf(walls.map(plainWall), LEVEL)
  const told = (plan: { autoFromWalls?: boolean; boundaryWallIds?: string[]; polygon?: Array<XY | P> } | undefined | null) =>
    plan
      ? [
          plan.autoFromWalls ? 'from walls' : '',
          plan.boundaryWallIds ? `walls ${plan.boundaryWallIds.join(' ')}` : '',
          plan.polygon ? `outline ${pts(plan.polygon)}` : '',
        ]
          .filter(Boolean)
          .join(', ')
      : 'left as it is'
  const take = (key: string, zone: ZoneNode) => {
    const plan = planAutoZonesForLevel(spaces, [zone]).update[0]?.data
    const mine = adopted({ polygon: zone.polygon.map(at), fromWalls: zone.autoFromWalls, wallIds: zone.boundaryWallIds }, rooms)
    both(key, told(plan), told(mine && Object.keys(mine).length > 0 ? { autoFromWalls: mine.fromWalls, boundaryWallIds: mine.wallIds, polygon: mine.polygon } : null))
  }
  sub('a zone drawn by hand over the room, from (0, 3) the other way round; one drawn 0.1 inside it')
  take('Z10.drawn_over_the_room', ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Drawn', polygon: [[0, 3], [0, 0], [4, 0], [4, 3]] }))
  take('Z10.drawn_0.1_inside', ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Drawn', polygon: [[0.1, 0.1], [3.9, 0.1], [3.9, 2.9], [0.1, 2.9]] }))
  sub('a zone from walls a, b, c, d with the square stored: read after wall b moved out to u = 5; read after wall d was deleted')
  const auto = ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Auto', polygon: rect, autoFromWalls: true, boundaryWallIds: walls.map((w) => w.id) })
  const moved = [wall('a', [0, 0], [5, 0]), wall('b', [5, 0], [5, 3]), wall('c', [5, 3], [0, 3]), walls[3]!]
  const read = (list: WallNode[]) => {
    const byId = new Map(list.map((w) => [w.id as string, w]))
    const plain = new Map(list.map((w) => [w.id as string, plainWall(w)]))
    return [
      pts(resolveAutoZonePolygon(auto, (id) => byId.get(id as string))),
      pts(liveOutline({ polygon: auto.polygon.map(at), fromWalls: true, wallIds: auto.boundaryWallIds }, (id) => plain.get(id))),
    ] as const
  }
  both('Z10.outline_after_a_wall_moved', ...read(moved))
  both('Z10.outline_after_a_wall_was_deleted', ...read(moved.slice(0, 3)))

  sub('does it close a room: wall d of the square; wall c without d; a wall from (2, 0) into the room, 1.5 long, then 0.1 long')
  const stub = (length: number) => wall('t', [2, 0], [2, length])
  both('Z10.closes.fourth_wall', wallClosesRoom(walls, walls[3]!), closesRoom(walls.map(plainWall), plainWall(walls[3]!)))
  both('Z10.closes.third_wall', wallClosesRoom(walls.slice(0, 3), walls[2]!), closesRoom(walls.slice(0, 3).map(plainWall), plainWall(walls[2]!)))
  for (const length of [1.5, 0.1]) {
    both(
      `Z10.closes.wall_${length}_long_into_the_room`,
      wallClosesRoom([...walls, stub(length)], stub(length)),
      closesRoom([...walls, stub(length)].map(plainWall), plainWall(stub(length))),
    )
  }
  sub('does it touch the square: a wall from (2, gap) to (2, 2)')
  for (const gap of [0.09, 0.11]) {
    const near = wall('t', [2, gap], [2, 2])
    both(`Z10.touches.end_${gap}_from_a_wall`, wallTouchesOthers(near, walls), touches(plainWall(near), walls.map(plainWall)))
  }
}

title('Z11 the fade of a zone in the 3D view: four frames from hidden toward shown, at frame times 0.016, 0.1, 0.15 and 0.25 s')
for (const dt of [0.016, 0.1, 0.15, 0.25]) {
  const code: number[] = []
  const mine: number[] = []
  for (let frame = 0; frame < 4; frame += 1) {
    // the line of ZoneSystem: uOpacity = MathUtils.lerp(uOpacity, target, 10 * delta)
    code.push(MathUtils.lerp(code[frame - 1] ?? 0, 1, 10 * dt))
    mine.push(fadeStep(mine[frame - 1] ?? 0, 1, dt))
  }
  both(`Z11.frame_time(${dt})`, code.map((value) => num(value)).join(' '), mine.map((value) => num(value)).join(' '))
}
