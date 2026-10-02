// Reference cases for the roof segment's body (port note entry 6): the old editor's own mesh
// builder, and what the note's equations give for the same segment.
// cd packages/viewer && bun ../../ports/refcases/06-roof-segment-body.ts
//
// Volumes are printed to the litre (three decimals): the old editor holds a body's corners in
// single precision and cuts with a mesh boolean, so its own number moves in the fifth decimal.
// Beside that, this script stops when a mesh and the equations are more than 1e-4 m3 apart (the
// note's tolerance for a body cut by a boolean). Boxes and heights are printed to six decimals.
import { type AnyNode, RoofNode, RoofSegmentNode, roofOverlapEntryOwns } from '@pascal-app/core'
import type * as THREE from 'three'
import {
  generateRoofSegmentGeometry,
  getRoofOuterSurfaceFrameAtPoint,
  getRoofSegmentBrushes,
} from '../../packages/viewer/src/systems/roof/roof-system'
import { meshFacts } from './_mesh'
import { num, row, title } from './_print'
import {
  bandFacets,
  bent,
  bodyOf,
  type Box,
  boxOf,
  coneSector,
  crossed,
  enclosed,
  type Face,
  fanTriangles,
  helperY,
  kept,
  less,
  moduleFaces,
  owns,
  piecesBox,
  piecesVolume,
  placed,
  plain,
  planArea,
  rakeBoards,
  rakeBoardsBox,
  type Seg,
  seatOf,
  shedSlabThickness,
  slopeOf,
  together,
  topOfFaces,
  trimPlanes,
  volumeFaces,
  volumesOf,
} from './_roof-segment-equations'

type Fields = Record<string, unknown>
type Geometry = THREE.BufferGeometry

const litres = (value: number) => num(value, 3)
const boxText = (b: { min: readonly number[]; max: readonly number[] }) =>
  `x ${num(b.min[0]!)}..${num(b.max[0]!)} y ${num(b.min[1]!)}..${num(b.max[1]!)} z ${num(b.min[2]!)}..${num(b.max[2]!)}`
const p3 = (p: { x: number; y: number; z: number }) => `(${num(p.x)}, ${num(p.y)}, ${num(p.z)})`
const joined = (...boxes: Box[]): Box => ({
  min: [0, 1, 2].map((axis) => Math.min(...boxes.map((b) => b.min[axis]!))) as Box['min'],
  max: [0, 1, 2].map((axis) => Math.max(...boxes.map((b) => b.max[axis]!))) as Box['max'],
})
const geometryOf = (brush: { geometry: unknown }) => brush.geometry as Geometry
const heights = (values: readonly number[]) => (values.length === 0 ? 'none' : values.map((value) => num(value)).join(' '))

// the heights at which a plumb line through a plan point crosses the old editor's mesh
function pierced(geometry: Geometry, x: number, z: number): number[] {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : position.count
  const at = (i: number): [number, number, number] => {
    const v = index ? index.getX(i) : i
    return [position.getX(v), position.getY(v), position.getZ(v)]
  }
  const found: number[] = []
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const [a, b, c] = [at(offset), at(offset + 1), at(offset + 2)]
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
    if (Math.abs(det) < 1e-12) continue
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det
    const w = 1 - u - v
    if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue
    const y = u * a[1] + v * b[1] + w * c[1]
    if (!found.some((other) => Math.abs(other - y) < 5e-6)) found.push(y)
  }
  return found.sort((p, q) => p - q)
}

// the old editor's volume and the equations' must agree to the note's tolerance for a cut body
function hold(key: string, mesh: number, equations: number) {
  if (Math.abs(mesh - equations) > 1e-4) throw new Error(`${key}: the mesh encloses ${mesh}, the equations give ${equations}`)
}

// One solid of the old editor: how many triangles, what it encloses, its box.
// triangles: a number is held against the mesh; null leaves the line out (a cut solid's
// triangles are the boolean's own). volume: left out when not given.
function solid(key: string, geometry: Geometry, own: { triangles?: number | null; volume?: number; box?: Box }) {
  const f = meshFacts(geometry)
  if (own.triangles !== null) row(`${key}.triangles`, f.triangles)
  if (typeof own.triangles === 'number') row(`${key}.triangles.by_equation`, own.triangles)
  if (own.volume !== undefined) {
    hold(key, f.volume, own.volume)
    row(`${key}.volume`, litres(f.volume))
    row(`${key}.volume.by_equation`, litres(own.volume))
  }
  row(`${key}.box`, boxText(f))
  if (own.box) row(`${key}.box.by_equation`, boxText(own.box))
}

// The body of one segment standing alone: the two layers, then all of it.
// parts: 'all' adds the two volumes of the wall; 'whole' leaves the layers out;
// 'boxes' gives the layers' boxes without their volumes.
function body(key: string, fields: Fields, parts: 'all' | 'layers' | 'boxes' | 'whole' = 'layers') {
  const node = RoofSegmentNode.parse(fields)
  const mine = plain(node as unknown as Partial<Seg>)
  const own = bodyOf(mine)
  const brushes = getRoofSegmentBrushes(node)
  if (!brushes) throw new Error(`${key}: the old editor made no body`)
  if (parts === 'all') {
    const wall = volumeFaces(own.volumes.wall)
    solid(`${key}.wall_volume`, geometryOf(brushes.wallBrush), { triangles: fanTriangles(wall), volume: enclosed(wall), box: boxOf(wall) })
    const inner = moduleFaces(own.volumes.inner.module)
    solid(`${key}.inner_volume`, geometryOf(brushes.innerBrush), { triangles: fanTriangles(inner), box: boxOf(inner) })
    row(`${key}.inner_volume.grown`, `x ${num(brushes.innerBrush.scale.x, 9)} z ${num(brushes.innerBrush.scale.z, 9)}`)
    row(`${key}.inner_volume.grown.by_equation`, `x ${num(own.volumes.inner.scaleX, 9)} z ${num(own.volumes.inner.scaleZ, 9)}`)
  }
  if (parts !== 'whole') {
    const volumes = parts !== 'boxes'
    if (own.deck.length === 0) {
      // a solid that came out empty is one triangle of no size
      const f = meshFacts(geometryOf(brushes.deckSlab))
      row(`${key}.deck`, f.volume === 0 && f.triangles <= 1 ? 'none' : `${f.triangles} triangles`)
      row(`${key}.deck.by_equation`, 'none')
    } else {
      solid(`${key}.deck`, geometryOf(brushes.deckSlab), { triangles: null, volume: volumes ? piecesVolume(own.deck) : undefined, box: piecesBox(own.deck) })
    }
    solid(`${key}.shingles`, geometryOf(brushes.shinSlab), { triangles: null, volume: volumes ? piecesVolume(own.shingles) : undefined, box: piecesBox(own.shingles) })
  }
  const geometry = generateRoofSegmentGeometry(node)
  const all = [...own.deck, ...own.shingles, ...own.shell]
  solid(`${key}.body`, geometry, { volume: together([own.deck, own.shingles, own.shell]), box: piecesBox(all) })
  return { geometry, all, mine }
}

const OTHER = { width: 5, depth: 9, pitch: 30, wallHeight: 2.6 }

// ------------------------------------------------------------------ the cases
title('B1 gable, 8 x 6, wall 0.5, 40 degrees: the two volumes of the wall, the deck, the shingles, the whole body; a plumb line through it at three places')
{
  const made = body('B1', { roofType: 'gable' }, 'all')
  // the two layers as clean layers, without the 2 mm the cutting volumes are grown by
  const s = made.mine
  const slope = slopeOf(s)
  const reach = s.wallThickness / 2 + s.overhang * slope.cos
  row('B1.deck.volume.exact', litres(((s.width + 2 * reach) * (s.depth + 2 * reach) * s.deckThickness) / slope.cos))
  row('B1.shingles.volume.exact', litres(((s.width + 2 * reach) * (s.depth + 2 * reach + s.shingleThickness * slope.sin) * s.shingleThickness) / slope.cos))
  // 0.5 m from the ridge, over the room, and over the front wall: what a plumb line crosses
  for (const [x, z] of [
    [0, 0.5],
    [0, 2],
    [0, 3],
  ] as Array<[number, number]>) {
    row(`B1.plumb_line(${x}, ${z})`, heights(pierced(made.geometry, x, z)))
    row(`B1.plumb_line(${x}, ${z}).by_equation`, heights(crossed(made.all, x, z)))
  }
  made.geometry.dispose()
}

title('B2 the 5 cm floor under every eave: flat at wall 0; gable at wall 0 (the deck is lost) and at wall 0.2 (the deck is thin)')
for (const [name, fields, parts] of [
  ['flat_wall_0', { roofType: 'flat', wallHeight: 0 }, 'boxes'],
  ['gable_wall_0', { roofType: 'gable', wallHeight: 0 }, 'layers'],
  ['gable_wall_0.2', { roofType: 'gable', wallHeight: 0.2 }, 'layers'],
] as Array<[string, Fields, 'boxes' | 'layers']>) {
  const made = body(`B2.${name}`, fields, parts)
  row(`B2.${name}.plumb_line(0, 2)`, heights(pierced(made.geometry, 0, 2)))
  row(`B2.${name}.plumb_line(0, 2).by_equation`, heights(crossed(made.all, 0, 2)))
  made.geometry.dispose()
}

title('B3 the other types at 8 x 6, wall 0.5, 40 degrees')
for (const roofType of ['flat', 'hip', 'shed', 'gambrel', 'mansard', 'conical'] as const) body(`B3.${roofType}`, { roofType }, roofType === 'flat' ? 'boxes' : 'layers').geometry.dispose()

title('B4 dutch, 8 x 6, wall 0.5, 40 degrees: its list of faces does not close, so no volume is given; the rake boards')
{
  const node = RoofSegmentNode.parse({ roofType: 'dutch' })
  const mine = plain(node as unknown as Partial<Seg>)
  const volumes = volumesOf(mine)
  const brushes = getRoofSegmentBrushes(node)!
  const wall = volumeFaces(volumes.wall)
  solid('B4.wall_volume', geometryOf(brushes.wallBrush), { triangles: fanTriangles(wall), box: boxOf(wall) })
  const inner = moduleFaces(volumes.inner.module)
  solid('B4.inner_volume', geometryOf(brushes.innerBrush), { triangles: fanTriangles(inner), box: boxOf(inner) })
  const boards = rakeBoards(mine)
  // each board: an upper face, an under face and four sides, every one of them with both faces
  solid('B4.rake_boards', brushes.rakeBoards!, { triangles: boards.length * 6 * 2 * 2, box: rakeBoardsBox(boards) })
  solid('B4.deck', geometryOf(brushes.deckSlab), { triangles: null })
  solid('B4.shingles', geometryOf(brushes.shinSlab), { triangles: null })
  const geometry = generateRoofSegmentGeometry(node)
  // the wall from the base up, the shingles' own volume from its eave up, the boards
  const top = volumeFaces(volumes.shingleTop).map((face) => face.filter((p) => p.y >= volumes.shingleTop.module.E - 1e-9)).filter((face) => face.length > 0)
  solid('B4.body', geometry, { box: joined(boxOf(wall), boxOf(top), rakeBoardsBox(boards)) })
  geometry.dispose()
}

title('B5 another size: 5 x 9, wall 2.6, 30 degrees; and the gambrel of S5 with its kink at 0.3, whose end faces fold')
for (const roofType of ['gable', 'hip', 'gambrel', 'mansard'] as const) body(`B5.${roofType}`, { roofType, ...OTHER }, 'whole').geometry.dispose()
{
  // not held to the equations: the pentagon of each end is not convex, and a fan of triangles
  // from its first corner folds over itself, which the boolean cannot cut cleanly
  const node = RoofSegmentNode.parse({ roofType: 'gambrel', gambrelLowerWidthRatio: 0.3 })
  const own = bodyOf(plain(node as unknown as Partial<Seg>))
  const geometry = generateRoofSegmentGeometry(node)
  const f = meshFacts(geometry)
  row('B5.gambrel_ratio_0.3.body.triangles', f.triangles)
  row('B5.gambrel_ratio_0.3.body.volume', litres(f.volume))
  row('B5.gambrel_ratio_0.3.body.volume.exact', litres(together([own.deck, own.shingles, own.shell])))
  row('B5.gambrel_ratio_0.3.body.box', boxText(f))
  row('B5.gambrel_ratio_0.3.body.box.by_equation', boxText(piecesBox([...own.deck, ...own.shingles, ...own.shell])))
  geometry.dispose()
}

title('B6 part of a cone, built without cutting: diameter 8, wall 0.5, from 30 degrees through -90 degrees; with no wall; through +90 degrees')
for (const [name, fields] of [
  ['sweep_-90', { conicalSweepAngle: -Math.PI / 2 }],
  ['sweep_-90_wall_0', { conicalSweepAngle: -Math.PI / 2, wallHeight: 0 }],
  ['sweep_+90', { conicalSweepAngle: Math.PI / 2 }],
] as Array<[string, Fields]>) {
  const node = RoofSegmentNode.parse({ roofType: 'conical', conicalStartAngle: Math.PI / 6, ...fields })
  const mine = plain(node as unknown as Partial<Seg>)
  const cone = coneSector(mine)
  const ring = cone.wallRadii
    ? Array.from({ length: cone.sides + 1 }, (_, k) => {
        const a = cone.start + (k / cone.sides) * cone.sweep
        return cone.wallRadii!.flatMap((r) => [
          { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r },
          { x: Math.cos(a) * r, y: mine.wallHeight, z: Math.sin(a) * r },
        ])
      })
    : []
  const box = joined(boxOf(cone.faces), ...(ring.length > 0 ? [boxOf(ring)] : []))
  const geometry = generateRoofSegmentGeometry(node)
  if (cone.sweep < 0) {
    solid(`B6.${name}`, geometry, { triangles: cone.triangles, volume: enclosed(cone.faces), box })
  } else {
    // The rim and the two ends are wound inwards. The volume printed is the same sum over the
    // faces as everywhere else, which is then not what they enclose; .exact is what they enclose.
    solid(`B6.${name}`, geometry, { triangles: cone.triangles, box })
    row(`B6.${name}.volume`, litres(meshFacts(geometry).volume))
    row(`B6.${name}.volume.by_equation`, litres(Math.abs(enclosed(cone.asListed))))
    row(`B6.${name}.volume.exact`, litres(enclosed(cone.faces)))
  }
  geometry.dispose()
}

title('B7 trims on the gable of B1: 1 m off the left side; a corner 2 by 2 off the front left')
for (const [name, trim] of [
  ['left_1', { left: 1 }],
  ['corner_2x2', { frontLeftX: 2, frontLeftZ: 2 }],
] as Array<[string, Record<string, number>]>) {
  const node = RoofSegmentNode.parse({ roofType: 'gable', trim })
  const mine = plain(node as unknown as Partial<Seg>)
  const own = bodyOf(mine)
  const planes = trimPlanes(mine, trim)
  const parts = [kept(own.deck, planes), kept(own.shingles, planes), kept(own.shell, planes)]
  const geometry = generateRoofSegmentGeometry(node)
  solid(`B7.${name}.body`, geometry, { volume: together(parts), box: piecesBox(parts.flat()) })
  geometry.dispose()
}

title('B8 a shed drawn straight from a plan outline (8 x 6, wall 0.5, 40 degrees) against the same shed cut from volumes; a shed bent round a centre')
{
  const outline: [number, number][] = [
    [-4, -3],
    [4, -3],
    [4, 3],
    [-4, 3],
  ]
  const node = RoofSegmentNode.parse({ roofType: 'shed', shedFootprintPieces: [outline] })
  const mine = plain(node as unknown as Partial<Seg>)
  const up = shedSlabThickness(mine)
  const under = outline.map(([x, z]) => ({ x, y: helperY(mine, x, z), z }))
  const over = under.map((p) => ({ ...p, y: p.y + up }))
  const geometry = generateRoofSegmentGeometry(node)
  solid('B8.from_outline', geometry, {
    triangles: 2 * (outline.length - 2) + 2 * outline.length,
    volume: planArea(outline) * up,
    box: boxOf([under, over]),
  })
  // under and over the roof on a plumb line through the middle of the plan
  const ends = (values: readonly number[]) => (values.length === 0 ? 'none' : `${num(values[0]!)} ${num(values[values.length - 1]!)} thickness ${num(values[values.length - 1]! - values[0]!)}`)
  row('B8.from_outline.under_and_over(0, 0)', ends(pierced(geometry, 0, 0)))
  row('B8.from_outline.under_and_over(0, 0).by_equation', ends([helperY(mine, 0, 0), helperY(mine, 0, 0) + up]))
  geometry.dispose()
  // the same shed with no outline stored: cut from volumes, as in B3
  const plainShed = RoofSegmentNode.parse({ roofType: 'shed' })
  const cutGeometry = generateRoofSegmentGeometry(plainShed)
  const own = bodyOf(plain(plainShed as unknown as Partial<Seg>))
  row('B8.cut_from_volumes.under_and_over(0, 0)', ends(pierced(cutGeometry, 0, 0)))
  row('B8.cut_from_volumes.under_and_over(0, 0).by_equation', ends(crossed([...own.deck, ...own.shingles, ...own.shell], 0, 0)))
  cutGeometry.dispose()
}
{
  // the old editor's own test: a shed 8 wide, 2 deep, 10 degrees, bent round (0, 4) at radius 5
  const arc = { centerX: 0, centerZ: 4, radius: 5 }
  const node = RoofSegmentNode.parse({ roofType: 'shed', width: 8, depth: 2, wallHeight: 0, wallThickness: 0.01, pitch: 10, overhang: 0, deckThickness: 0.1, shingleThickness: 0.025, arc })
  const mine = plain(node as unknown as Partial<Seg>)
  const up = shedSlabThickness(mine)
  const facets = bandFacets(mine.width)
  const faces: Face[] = []
  for (let i = 0; i < facets; i += 1) {
    const x0 = -mine.width / 2 + (i / facets) * mine.width
    const x1 = -mine.width / 2 + ((i + 1) / facets) * mine.width
    const at = (x: number, z: number, lift: number) => {
      const [bx, bz] = bent(arc, x, z)
      return { x: bx, y: helperY(mine, x, z) + lift, z: bz }
    }
    const back = -mine.depth / 2
    const front = mine.depth / 2
    faces.push(
      [at(x0, back, 0), at(x1, back, 0), at(x1, front, 0), at(x0, front, 0)],
      [at(x0, front, up), at(x1, front, up), at(x1, back, up), at(x0, back, up)],
      [at(x1, back, 0), at(x0, back, 0), at(x0, back, up), at(x1, back, up)],
      [at(x0, front, 0), at(x1, front, 0), at(x1, front, up), at(x0, front, up)],
    )
    if (i === 0) faces.push([at(x0, back, 0), at(x0, front, 0), at(x0, front, up), at(x0, back, up)])
    if (i === facets - 1) faces.push([at(x1, front, 0), at(x1, back, 0), at(x1, back, up), at(x1, front, up)])
  }
  const geometry = generateRoofSegmentGeometry(node)
  solid('B8.bent', geometry, { triangles: fanTriangles(faces), volume: Math.abs(enclosed(faces)), box: boxOf(faces) })
  // the true ring: the angle the width subtends, between the two radii (5 at the back, 3 at the front)
  row('B8.bent.volume.exact', litres(((mine.width / arc.radius) * (5 ** 2 - 3 ** 2) * up) / 2))
  geometry.dispose()
}

title('B9 two segments of one roof over one place: a flat 4 x 3 with wall 1 at (5, 0, 0) entering a flat 10 x 8 with wall 3; and a shed among others')
{
  const roof = RoofNode.parse({ id: 'roof_b9', children: ['rseg_host', 'rseg_small'] })
  const host = RoofSegmentNode.parse({ id: 'rseg_host', parentId: roof.id, roofType: 'flat', width: 10, depth: 8, wallHeight: 3 })
  const small = RoofSegmentNode.parse({ id: 'rseg_small', parentId: roof.id, roofType: 'flat', width: 4, depth: 3, wallHeight: 1, position: [5, 0, 0] })
  const nodes = { [roof.id]: roof, [host.id]: host, [small.id]: small } as unknown as Record<string, AnyNode>
  const mineHost = plain(host as unknown as Partial<Seg>)
  const mineSmall = plain(small as unknown as Partial<Seg>)
  const entry = (n: RoofSegmentNode) => ({ roofId: String(roof.id), segmentId: String(n.id), width: n.width, depth: n.depth })
  row('B9.host_owns', roofOverlapEntryOwns(entry(host), entry(small)))
  row('B9.host_owns.by_equation', owns(entry(host), entry(small)))
  // the host's inner volume, set in the small segment's frame, then grown by its own factors there
  const inner = volumesOf(mineHost).inner
  const hostInner = moduleFaces(inner.module).map((face) =>
    face.map((p) => {
      const inRoof = placed(p, mineHost.position, mineHost.rotation)
      return { x: (inRoof.x - mineSmall.position[0]!) * inner.scaleX, y: inRoof.y - mineSmall.position[1]!, z: (inRoof.z - mineSmall.position[2]!) * inner.scaleZ }
    }),
  )
  const own = bodyOf(mineSmall)
  const cut = (pieces: readonly Face[][]) => pieces.flatMap((piece) => less(piece, hostInner))
  const parts = [cut(own.deck), cut(own.shingles), cut(own.shell)]
  const alone = generateRoofSegmentGeometry(small)
  solid('B9.small_alone', alone, { volume: together([own.deck, own.shingles, own.shell]), box: piecesBox([...own.deck, ...own.shingles, ...own.shell]) })
  const entering = generateRoofSegmentGeometry(small, nodes)
  solid('B9.small_in_the_roof', entering, { volume: together(parts), box: piecesBox(parts.flat()) })
  const hostAlone = generateRoofSegmentGeometry(host)
  const hostIn = generateRoofSegmentGeometry(host, nodes)
  const hostOwn = bodyOf(mineHost)
  const hostVolume = together([hostOwn.deck, hostOwn.shingles, hostOwn.shell])
  solid('B9.host_alone', hostAlone, { volume: hostVolume })
  solid('B9.host_in_the_roof', hostIn, { volume: hostVolume })
  for (const geometry of [alone, entering, hostAlone, hostIn]) geometry.dispose()
}
{
  // a shed is given its wall only when it is the one segment of its roof
  const roof = RoofNode.parse({ id: 'roof_sheds', children: ['rseg_shed_a', 'rseg_shed_b'] })
  const a = RoofSegmentNode.parse({ id: 'rseg_shed_a', parentId: roof.id, roofType: 'shed', width: 4, depth: 3, pitch: 20 })
  const b = RoofSegmentNode.parse({ id: 'rseg_shed_b', parentId: roof.id, roofType: 'shed', width: 4, depth: 3, pitch: 20, position: [20, 0, 0] })
  const nodes = { [roof.id]: roof, [a.id]: a, [b.id]: b } as unknown as Record<string, AnyNode>
  const own = bodyOf(plain(a as unknown as Partial<Seg>))
  const alone = generateRoofSegmentGeometry(a)
  solid('B9.shed_alone', alone, { volume: together([own.deck, own.shingles, own.shell]), box: piecesBox([...own.deck, ...own.shingles, ...own.shell]) })
  const among = generateRoofSegmentGeometry(a, nodes)
  solid('B9.shed_among_others', among, { volume: together([own.deck, own.shingles]), box: piecesBox([...own.deck, ...own.shingles]) })
  alone.dispose()
  among.dispose()
}

title('B10 where a skylight is seated: the viewer\'s second builder of the outer surface, against the top of the shingles as built')
for (const [roofType, x, z] of [
  ['flat', 0, 2.5],
  ['gable', 0, 2.5],
  ['shed', 0, 2.5],
  ['hip', 3, 1],
  ['gambrel', 0, 1],
  ['mansard', 3, 1],
  ['dutch', 0, 2.5],
  ['conical', 3, 1],
] as Array<[RoofSegmentNode['roofType'], number, number]>) {
  const node = RoofSegmentNode.parse({ roofType })
  const mine = plain(node as unknown as Partial<Seg>)
  const seat = getRoofOuterSurfaceFrameAtPoint(node, x, z)
  const own = seatOf(mine, x, z)
  const key = `B10.${roofType}(${x}, ${z})`
  row(`${key}.seat`, `height ${num(seat.point.y)} normal ${p3(seat.normal)}`)
  row(`${key}.seat.by_equation`, `height ${num(own.y)} normal ${p3(own.normal)}`)
  const geometry = generateRoofSegmentGeometry(node)
  const through = pierced(geometry, x, z)
  row(`${key}.top_as_built`, through.length > 0 ? through[through.length - 1]! : Number.NaN)
  row(`${key}.top_as_built.by_equation`, topOfFaces(volumeFaces(volumesOf(mine).shingleTop), x, z) ?? Number.NaN)
  geometry.dispose()
}
