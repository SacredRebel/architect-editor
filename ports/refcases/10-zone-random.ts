// A second holding of port note entry 10 (zone, unit, room detection): 800 levels made by
// chance, each through the old editor's own functions and through the note's equations
// (_zone-equations.ts). The sums are printed for both; what differs between the two, room by
// room and wall by wall, is counted, and must be none.
// cd packages/viewer && bun ../../ports/refcases/10-zone-random.ts
import {
  detectSpacesForLevel,
  planAutoZonesForLevel,
  resolveAutoZonePolygon,
  wallClosesRoom,
  wallTouchesOthers,
} from '../../packages/core/src/lib/space-detection'
import { deriveUnit } from '../../packages/core/src/lib/unit-containment'
import { deriveZoneQuantityReport, type ZoneQuantityValue } from '../../packages/core/src/lib/zone-quantities'
import {
  type AnyNode,
  BuildingNode,
  CeilingNode,
  ColumnNode,
  LevelNode,
  SlabNode,
  UnitNode,
  WallNode,
  ZoneNode,
} from '../../packages/core/src/schema'
import { buildRoomClearDimensions } from '../../packages/nodes/src/zone/room-clear-dimensions'
import { polygonArea } from './_mesh'
import { num, pt, pts, row, title } from './_print'
import {
  adopted,
  areaOf,
  clearDimensions,
  closesRoom,
  liveOutline,
  type Measure,
  type P,
  quantitiesOf,
  type RoomZone,
  roomsOf,
  sidesOf,
  touches,
  unitGathers,
  type ZWall,
} from './_zone-equations'

type XY = [number, number]
const LEVEL = 'level_a'
const at = (xy: readonly number[]): P => ({ x: xy[0]!, y: xy[1]! })
const scene = (list: Array<{ id: string }>) => Object.fromEntries(list.map((node) => [node.id, node])) as Record<string, AnyNode>
const plainWall = (w: WallNode): ZWall => ({ id: w.id, S: at(w.start), E: at(w.end), s: w.curveOffset, thickness: w.thickness, front: w.frontSide, back: w.backSide })
const roomZone = (zone: ZoneNode): RoomZone => ({
  id: zone.id,
  level: zone.parentId,
  role: zone.spaceRole,
  policy: zone.clearDimensionPolicy,
  enclosure: zone.enclosureStatus,
  fromWalls: zone.autoFromWalls,
  wallIds: zone.boundaryWallIds,
})
const said = (value: ZoneQuantityValue) => (value.status === 'available' ? num(value.value) : `not proven: ${value.reason}`)
const mineSaid = (value: Measure) => ('value' in value ? num(value.value) : `not proven: ${value.reason}`)
function both(key: string, code: number, equation: number) {
  row(key, code)
  row(`${key}.by_equation`, equation)
}

// chance with a seed, so that every run makes the same levels
let seed = 987654321
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)]!
const sides = ['unknown', 'interior', 'exterior'] as const

// what is added up: [the old editor, the equations]
const sum: Record<string, [number, number]> = {}
const tally = (key: string, code: number, equation: number) => {
  sum[key] = [(sum[key]?.[0] ?? 0) + code, (sum[key]?.[1] ?? 0) + equation]
}
const differing: Record<string, number> = { rooms: 0, sides: 0, tests: 0, zones: 0, clear: 0, holds: 0, floors: 0, units: 0 }
let levels = 0
let wallCount = 0
let heldRooms = 0

// what a zone holds is slow in the old editor (every stretch of an outline against every station of every
// wall), so only the rooms of the first 60 levels go through R3 to R5
const LEVELS = 800
const HELD = 60

for (let trial = 0; trial < LEVELS; trial += 1) {
  // the walls of one level: the edges of a grid of cells 2 x 1.5, three in four kept, drawn either way
  const off = () => pick([0.03, -0.03, 0.0004, -0.0004, 0.07, 0.09, 0.002])
  const places = new Map<string, XY>()
  const corner = (i: number, j: number): XY => {
    const key = `${i},${j}`
    if (!places.has(key)) places.set(key, [i * 2 + (random() < 0.08 ? off() : 0), j * 1.5 + (random() < 0.08 ? off() : 0)])
    const place = places.get(key)!
    return random() < 0.04 ? [place[0] + off(), place[1]] : place
  }
  const walls: WallNode[] = []
  const add = (start: XY, end: XY) => {
    const turned = random() < 0.5
    walls.push(
      WallNode.parse({
        id: `wall_w${walls.length}`,
        parentId: LEVEL,
        start: turned ? end : start,
        end: turned ? start : end,
        thickness: pick([undefined, 0.1, 0.2, 0.3]),
        curveOffset: trial % 2 === 0 ? 0 : pick([0, 0, 0, 0, 0, 0, 0, 0, 0.5, -0.5, 0.3, -0.3, 0.02, 0.035]),
        frontSide: pick([...sides]),
        backSide: pick([...sides]),
      }),
    )
  }
  const across = 1 + Math.floor(random() * 3)
  const up = 1 + Math.floor(random() * 3)
  for (let i = 0; i <= across; i += 1) {
    for (let j = 0; j <= up; j += 1) {
      if (i < across && random() < 0.75) add(corner(i, j), corner(i + 1, j))
      if (j < up && random() < 0.75) add(corner(i, j), corner(i, j + 1))
    }
  }
  // a long wall along a grid line, one across it, and a wall from anywhere to anywhere
  if (random() < 0.4) add([0, 1.5 * Math.floor(random() * (up + 1))], [2 * across, 1.5 * Math.floor(random() * (up + 1))])
  if (random() < 0.4) add([2 * Math.floor(random() * (across + 1)), 0], [2 * Math.floor(random() * (across + 1)), 1.5 * up])
  if (random() < 0.3) add([random() * 2 * across, random() * 1.5 * up], [random() * 2 * across, random() * 1.5 * up])
  if (walls.length === 0) continue
  levels += 1
  wallCount += walls.length
  const plain = walls.map(plainWall)
  const wallOf = new Map(plain.map((w) => [w.id, w]))

  // R1 the rooms, the sides, the two wall tests
  const code = detectSpacesForLevel(LEVEL, walls)
  const mine = roomsOf(plain, LEVEL)
  tally('rooms', code.spaces.length, mine.length)
  tally('area', code.spaces.reduce((total, space) => total + polygonArea(space.polygon.map(at)), 0), mine.reduce((total, room) => total + areaOf(room.polygon), 0))
  tally('corners', code.spaces.reduce((total, space) => total + space.polygon.length, 0), mine.reduce((total, room) => total + room.polygon.length, 0))
  tally('faces', code.spaces.reduce((total, space) => total + space.boundaryFaces.length, 0), mine.reduce((total, room) => total + room.faces.length, 0))
  const text = (id: string, outline: ReadonlyArray<P | XY>, faces: Array<{ wallId: string; face: string; points: ReadonlyArray<P | XY> }>) =>
    `${id} ${pts(outline)} ${faces.map((face) => `${face.wallId}:${face.face} ${pts(face.points)}`).join(' | ')}`
  for (let i = 0; i < Math.max(code.spaces.length, mine.length); i += 1) {
    const a = code.spaces[i] ? text(code.spaces[i]!.id, code.spaces[i]!.polygon, code.spaces[i]!.boundaryFaces) : ''
    const b = mine[i] ? text(mine[i]!.id, mine[i]!.polygon, mine[i]!.faces) : ''
    if (a !== b) differing.rooms! += 1
  }
  for (const w of walls) {
    const update = code.wallUpdates.find((entry) => entry.wallId === w.id)!
    const own = sidesOf(plainWall(w), mine)
    for (const side of sides) {
      tally(`sides.${side}`, Number(update.frontSide === side) + Number(update.backSide === side), Number(own.front === side) + Number(own.back === side))
    }
    if (update.frontSide !== own.front || update.backSide !== own.back) differing.sides! += 1
    const closes = wallClosesRoom(walls, w)
    const ownCloses = closesRoom(plain, plainWall(w))
    const touch = wallTouchesOthers(w, walls)
    const ownTouch = touches(plainWall(w), plain)
    tally('closes', Number(closes), Number(ownCloses))
    tally('touches', Number(touch), Number(ownTouch))
    if (closes !== ownCloses || touch !== ownTouch) differing.tests! += 1
  }

  for (const [index, space] of code.spaces.entries()) {
    // R2 a zone drawn by hand on the room's corners, from another corner, half the time the other way round
    // (each side draws on its own room's corners: an arc's points can differ in their last digit)
    const turn = Math.floor(random() * space.polygon.length)
    const backwards = random() < 0.5
    const redrawn = <T,>(outline: T[]): T[] => {
      const corners = [...outline.slice(turn), ...outline.slice(0, turn)]
      return backwards ? corners.reverse() : corners
    }
    const drawn = ZoneNode.parse({ id: 'zone_d', parentId: LEVEL, name: 'Drawn', polygon: redrawn(space.polygon) })
    const plan = planAutoZonesForLevel(code.spaces, [drawn]).update[0]?.data
    const own = adopted({ polygon: redrawn(mine[index]?.polygon ?? []), fromWalls: false, wallIds: [] }, mine)
    const planText = plan ? `${plan.autoFromWalls} ${plan.boundaryWallIds?.join(' ')} ${plan.polygon ? pts(plan.polygon) : ''}` : 'none'
    const ownText = own ? `${own.fromWalls} ${own.wallIds?.join(' ')} ${own.polygon ? pts(own.polygon) : ''}` : 'none'
    tally('adopted', Number(Boolean(plan)), Number(Boolean(own)))
    // the room as a zone from its walls: the outline it is read with, its clear dimensions
    const zone = ZoneNode.parse({
      id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: space.polygon, autoFromWalls: true,
      boundaryWallIds: space.wallIds, spaceRole: 'room', clearDimensionPolicy: 'inside-faces',
    })
    const live = pts(resolveAutoZonePolygon(zone, (id) => walls.find((w) => w.id === id)))
    const ownLive = pts(liveOutline({ polygon: zone.polygon.map(at), fromWalls: true, wallIds: zone.boundaryWallIds }, (id) => wallOf.get(id)))
    if (planText !== ownText || live !== ownLive) differing.zones! += 1
    const nodes = scene([...walls, zone])
    const dims = buildRoomClearDimensions(zone, { resolve: (id: string) => nodes[id], children: [], siblings: [], parent: null } as never).flatMap((entry) =>
      entry.kind === 'dimension' ? [entry] : [],
    )
    const ownDims = clearDimensions(roomZone(zone), (id) => wallOf.get(id))
    tally('clear', dims.length, ownDims.length)
    tally(
      'clear.length',
      dims.reduce((total, entry) => total + Math.hypot(entry.end[0] - entry.start[0], entry.end[1] - entry.start[1]), 0),
      ownDims.reduce((total, entry) => total + entry.length, 0),
    )
    const dimsText = dims.map((entry) => `${pt(entry.start)} ${pt(entry.end)} ${entry.text}`).join(' | ')
    const ownDimsText = ownDims.map((entry) => `${pt(entry.start)} ${pt(entry.end)} ${entry.label}`).join(' | ')
    if (dimsText !== ownDimsText) differing.clear! += 1

    if (trial >= HELD) continue
    heldRooms += 1
    // R3 what the room holds with no floor (walls with no height of their own, no slab under them: body height 2.5)
    const report = deriveZoneQuantityReport(zone, nodes)
    const held = quantitiesOf(zone.polygon.map(at), plain, () => 2.5, [], [], LEVEL)
    tally('enclosed', Number(report.classification === 'enclosed-room'), Number(held.classification === 'enclosed-room'))
    tally('wall_surface', report.wallSurface.status === 'available' ? report.wallSurface.value : 0, 'value' in held.wallSurface ? held.wallSurface.value : 0)
    const reportText = `${report.classification} ${num(report.footprintArea)} ${num(report.perimeter)} ${report.boundaryWallIds.join(' ')} ${said(report.wallSurface)}`
    const heldText = `${held.classification} ${num(held.area)} ${num(held.perimeter)} ${held.boundaryWalls.join(' ')} ${mineSaid(held.wallSurface)}`
    if (reportText !== heldText) differing.holds! += 1
    // and what a zone drawn as a box somewhere on the level holds
    const box = (): XY[] => {
      const u0 = pick([-1, 0, 0, 0.3, 1])
      const v0 = pick([-1, 0, 0, 0.2, 1])
      const u1 = pick([2, 2.1, 4, 6, 7])
      const v1 = pick([1.5, 1.6, 3, 4.5, 5])
      return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
    }
    const hole = (): XY[] => {
      const u0 = pick([0.2, 0.5, 1, 1.9, 3])
      const v0 = pick([0.2, 0.5, 1, 1.4])
      const side = pick([0.3, 0.5, 1, 2.5])
      return [[u0, v0], [u0 + side, v0], [u0 + side, v0 + side], [u0, v0 + side]]
    }
    const boxed = ZoneNode.parse({ id: 'zone_b', parentId: LEVEL, name: 'Box', polygon: box() })
    const boxReport = deriveZoneQuantityReport(boxed, scene([...walls, boxed]))
    const boxHeld = quantitiesOf(boxed.polygon.map(at), plain, () => 2.5, [], [], LEVEL)
    tally('box.enclosed', Number(boxReport.classification === 'enclosed-room'), Number(boxHeld.classification === 'enclosed-room'))
    tally('box.wall_surface', boxReport.wallSurface.status === 'available' ? boxReport.wallSurface.value : 0, 'value' in boxHeld.wallSurface ? boxHeld.wallSurface.value : 0)
    const boxText = `${boxReport.classification} ${num(boxReport.footprintArea)} ${boxReport.boundaryWallIds.join(' ')} ${said(boxReport.wallSurface)}`
    const boxHeldText = `${boxHeld.classification} ${num(boxHeld.area)} ${boxHeld.boundaryWalls.join(' ')} ${mineSaid(boxHeld.wallSurface)}`
    if (boxText !== boxHeldText) differing.boxes = (differing.boxes ?? 0) + 1

    // R4 a floor and a ceiling made by chance: on the room's own outline or on a box, a hole in some, a second floor in some
    const slabs = [SlabNode.parse({ id: 'slab_a', parentId: LEVEL, polygon: random() < 0.5 ? space.polygon : box(), holes: random() < 0.4 ? [hole()] : [], elevation: 0.05 })]
    if (random() < 0.3) slabs.push(SlabNode.parse({ id: 'slab_b', parentId: LEVEL, polygon: box(), elevation: pick([0.05, 0.05, 0.25]) }))
    const ceilings =
      random() < 0.8
        ? [CeilingNode.parse({ id: 'ceiling_a', parentId: LEVEL, polygon: random() < 0.5 ? space.polygon : box(), holes: random() < 0.2 ? [hole()] : [], height: pick([2.4, 2.5, 0.04]) })]
        : []
    const byHand = ZoneNode.parse({ id: 'zone_a', parentId: LEVEL, name: 'Room', polygon: space.polygon })
    const covered = deriveZoneQuantityReport(byHand, scene([...walls, byHand, ...slabs, ...ceilings]))
    const ownCovered = quantitiesOf(
      byHand.polygon.map(at),
      plain,
      () => 2.5,
      slabs.map((entry) => ({ polygon: entry.polygon.map(at), holes: entry.holes.map((list) => list.map(at)), datum: entry.elevation })),
      ceilings.map((entry) => ({ polygon: entry.polygon.map(at), holes: entry.holes.map((list) => list.map(at)), datum: entry.height ?? Number.NaN })),
      LEVEL,
    )
    tally('floors_proven', Number(covered.floorSurface.status === 'available'), Number('value' in ownCovered.floorSurface))
    tally('floor_surface', covered.floorSurface.status === 'available' ? covered.floorSurface.value : 0, 'value' in ownCovered.floorSurface ? ownCovered.floorSurface.value : 0)
    tally('volumes_proven', Number(covered.volume.status === 'available'), Number('value' in ownCovered.volume))
    tally('volume', covered.volume.status === 'available' ? covered.volume.value : 0, 'value' in ownCovered.volume ? ownCovered.volume.value : 0)
    if (`${said(covered.floorSurface)} / ${said(covered.volume)}` !== `${mineSaid(ownCovered.floorSurface)} / ${mineSaid(ownCovered.volume)}`) differing.floors! += 1

    // R5 a unit of one zone, the room's own outline or a box, with that floor and three columns on the level
    const member = ZoneNode.parse({ id: 'zone_m', parentId: LEVEL, name: 'Member', polygon: random() < 0.5 ? space.polygon : box() })
    const building = BuildingNode.parse({ id: 'building_a', children: [LEVEL, 'unit_a'] })
    const levelNode = LevelNode.parse({ id: LEVEL, parentId: 'building_a', level: 0, height: 2.5 })
    const unit = UnitNode.parse({ id: 'unit_a', parentId: 'building_a', members: ['zone_m'] })
    const columns = [0, 1, 2].map((i) => ColumnNode.parse({ id: `column_c${i}`, parentId: LEVEL, position: [pick([0, 1, 2, 3.9, 4, 5]), 0, pick([0, 0.75, 1.5, 3])] }))
    const gathered = deriveUnit(unit, scene([building, levelNode, member, unit, ...walls, ...slabs, ...columns]) as never)
    const ownGathered = unitGathers(
      unit.members,
      new Map([[member.id, { id: member.id, name: member.name, level: LEVEL, outline: member.polygon.map(at) }]]),
      new Map([[LEVEL, { id: LEVEL, ordinal: 0 }]]),
      new Map([[LEVEL, plain]]),
      columns.map((column) => ({ id: column.id, level: LEVEL, at: at([column.position[0], column.position[2]]) })),
      slabs.map((entry) => ({ id: entry.id, level: LEVEL, polygon: entry.polygon.map(at), holes: entry.holes.map((list) => list.map(at)) })),
    )
    tally('units', 1, 1)
    tally('unit.walls', gathered.boundaryWallIds.length, ownGathered.boundaryWalls.length)
    tally('unit.contained', gathered.containedNodeIds.length, ownGathered.contained.length)
    tally('unit.floors', gathered.supportIds.length, ownGathered.supports.length)
    const a = `${[...gathered.boundaryWallIds].sort().join(' ')} / ${[...gathered.containedNodeIds].sort().join(' ')} / ${[...gathered.supportIds].sort().join(' ')}`
    const b = `${[...ownGathered.boundaryWalls].sort().join(' ')} / ${[...ownGathered.contained].sort().join(' ')} / ${[...ownGathered.supports].sort().join(' ')}`
    if (a !== b) differing.units! += 1
  }
}

const pair = (key: string, name: string) => both(key, sum[name]?.[0] ?? 0, sum[name]?.[1] ?? 0)

title(`R1 ${LEVELS} levels made by chance (seed 987654321): walls on the edges of a grid of cells 2 x 1.5, three in four kept, drawn either way, with no thickness or 0.1, 0.2, 0.3, any sides stored; now and then a corner or an end 0.0004 to 0.09 off, a long wall across; every second level with bent walls too`)
row('R1.levels', levels)
row('R1.walls', wallCount)
pair('R1.rooms', 'rooms')
pair('R1.rooms.area', 'area')
pair('R1.rooms.corners', 'corners')
pair('R1.rooms.faces', 'faces')
row('R1.rooms.differing', differing.rooms!)
pair('R1.sides.interior', 'sides.interior')
pair('R1.sides.exterior', 'sides.exterior')
pair('R1.sides.unknown', 'sides.unknown')
row('R1.walls.sides_differing', differing.sides!)
pair('R1.walls.closing_a_room', 'closes')
pair('R1.walls.touching_another', 'touches')
row('R1.walls.tests_differing', differing.tests!)

title('R2 every room of R1 as a zone: drawn by hand on its corners (any start, either way) and held against the rooms; then from its walls, asking for inside faces')
pair('R2.drawn_zones_taken', 'adopted')
row('R2.zones_differing', differing.zones!)
pair('R2.clear_dimensions', 'clear')
pair('R2.clear_dimensions.length', 'clear.length')
row('R2.rooms.clear_dimensions_differing', differing.clear!)

title(`R3 what the rooms of the first ${HELD} levels hold with no floor and no ceiling (body height of every wall 2.5); and a zone drawn as a box somewhere on each of them`)
row('R3.rooms', heldRooms)
pair('R3.enclosed_rooms', 'enclosed')
pair('R3.wall_surface', 'wall_surface')
row('R3.rooms_differing', differing.holds!)
pair('R3.boxes.enclosed', 'box.enclosed')
pair('R3.boxes.wall_surface', 'box.wall_surface')
row('R3.boxes_differing', differing.boxes ?? 0)

title('R4 the rooms of R3 under a floor and a ceiling made by chance: on its own outline or on a box, a hole in some, a second floor in some, at 0.05 or 0.25; the ceiling at 2.4, 2.5 or 0.04')
pair('R4.floors_proven', 'floors_proven')
pair('R4.floor_surface', 'floor_surface')
pair('R4.volumes_proven', 'volumes_proven')
pair('R4.volume', 'volume')
row('R4.rooms_differing', differing.floors!)

title('R5 for every room of R3 a unit of one zone (the room, or a box), with the floors of R4 and three columns on the level')
row('R5.units', sum.units?.[0] ?? 0)
pair('R5.boundary_walls', 'unit.walls')
pair('R5.contained', 'unit.contained')
pair('R5.floors_and_ceilings', 'unit.floors')
row('R5.units_differing', differing.units!)
