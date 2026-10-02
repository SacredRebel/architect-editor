// Reference cases for the slab's body (port note entry 4): the old editor's own mesh builders,
// and what the note's equations give for the same slab.
// cd packages/viewer && bun ../../ports/refcases/04-slab-body.ts
//
// A mesh's positions are 32-bit numbers: an area or a volume read from it agrees with the
// equation's to 1e-6, not to the last digit.
import {
  BuildingNode,
  commitTerrainField,
  createTerrainField,
  getRenderableSlabPolygon,
  LevelNode,
  SiteNode,
  SlabNode,
  WallNode,
} from '@pascal-app/core'
import type * as THREE from 'three'
import { buildSlabGeometry } from '../../packages/nodes/src/slab/geometry'
import { generateSlabGeometry } from '../../packages/viewer/src/systems/slab/slab-system'
import { meshFacts } from './_mesh'
import { num, row, title } from './_print'
import {
  type Box,
  builtRing,
  fillFacts,
  type Land,
  pitFacts,
  type Ring,
  type SitePlace,
  slabOf,
  solidFacts,
  topArea,
} from './_slab-equations'
import { plain } from './_wall-equations'

const RECT: Ring = [[0, 0], [4, 0], [4, 3], [0, 3]]
const ELL: Ring = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]]
const square = (x0: number, z0: number, x1: number, z1: number): Ring => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
const ALONE = { walls: [], siblingSlabs: [] }

function slab(id: string, polygon: Ring, more: Record<string, unknown> = {}): SlabNode {
  return SlabNode.parse({ id, polygon, ...more })
}

// a mesh read by its own triangles: those that look up, those that look down, the rest
function read(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : (position?.count ?? 0)
  let up = 0
  let downCount = 0
  const downHeights = new Set<string>()
  const sideHeights = new Set<string>()
  const corner = (i: number): [number, number, number] => {
    const v = index ? index.getX(i) : i
    return [position.getX(v), position.getY(v), position.getZ(v)]
  }
  const down: Array<{ flat: number; mean: number }> = []
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const a = corner(offset)
    const b = corner(offset + 1)
    const c = corner(offset + 2)
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]
    const length = Math.hypot(n[0]!, n[1]!, n[2]!)
    const ny = length > 1e-12 ? n[1]! / length : 0
    if (ny > 0.5) {
      up += length / 2
    } else if (ny < -0.5) {
      downCount += 1
      down.push({ flat: Math.abs(n[1]!) / 2, mean: (a[1] + b[1] + c[1]) / 3 }) // its area seen from above, its mean height
      for (const p of [a, b, c]) downHeights.add(num(p[1]))
    } else {
      for (const p of [a, b, c]) sideHeights.add(num(p[1]))
    }
  }
  const sorted = (set: Set<string>) => [...set].sort((x, y) => Number(x) - Number(y))
  return {
    vertices: position?.count ?? 0,
    up,
    downCount,
    downHeights: sorted(downHeights),
    sideHeights: sorted(sideHeights),
    // the space between a level and the faces that look down
    under: (top: number) => down.reduce((sum, face) => sum + face.flat * (top - face.mean), 0),
  }
}

const boxText = (box: { min: number[]; max: number[] }) =>
  `x ${num(box.min[0]!)}..${num(box.max[0]!)} y ${num(box.min[1]!)}..${num(box.max[1]!)} z ${num(box.min[2]!)}..${num(box.max[2]!)}`

type Facts = { triangles: number; vertices: number; topArea: number; volume: number; signedVolume?: number; box?: Box }

// `short`: the count, the top and the volume only
function solid(key: string, node: SlabNode, context: { walls: WallNode[]; siblingSlabs: SlabNode[] }, mine: Facts, short = false) {
  const geometry = generateSlabGeometry(node, context)
  const f = meshFacts(geometry)
  const r = read(geometry)
  const thickness = node.thickness ?? 0.05
  row(`${key}.triangles`, f.triangles)
  row(`${key}.triangles.by_equation`, mine.triangles)
  if (!short) {
    row(`${key}.vertices`, r.vertices)
    row(`${key}.vertices.by_equation`, mine.vertices)
  }
  row(`${key}.top_area`, r.up)
  row(`${key}.top_area.by_equation`, mine.topArea)
  row(`${key}.volume`, r.up * thickness)
  row(`${key}.volume.by_equation`, mine.volume)
  if (!short && mine.signedVolume !== undefined) {
    row(`${key}.signed_volume_of_the_mesh`, f.volume)
    row(`${key}.signed_volume_of_the_mesh.by_equation`, mine.signedVolume)
  }
  if (!short && mine.box) {
    row(`${key}.box`, boxText(f))
    row(`${key}.box.by_equation`, boxText(mine.box))
  }
  geometry.dispose()
}

const alone = (node: SlabNode) => solidFacts(builtRing(slabOf(node), [], []), slabOf(node).holes, slabOf(node).elevation, slabOf(node).thickness)

// ------------------------------------------------------------------ the cases
title('B1 the rectangle 4 x 3 of S1: top at 0.3, 0.2 thick')
{
  const node = slab('slab_b1', RECT, { elevation: 0.3, thickness: 0.2 })
  solid('B1', node, ALONE, alone(node))
}

title('B2 the L of S2, nothing else given (top at 0.05, 0.05 thick); and drawn the other way round')
{
  const node = slab('slab_b2', ELL)
  solid('B2', node, ALONE, alone(node))
  const other = slab('slab_b2r', [...ELL].reverse() as Ring)
  solid('B2.other_way_round', other, ALONE, alone(other), true)
}

title('B3 a hole inside: the rectangle of B1 with a hole 1 x 1 from (1, 1) to (2, 2); the L with a hole 1 x 1 from (0.5, 3)')
{
  const node = slab('slab_b3', RECT, { elevation: 0.3, thickness: 0.2, holes: [square(1, 1, 2, 2)] })
  solid('B3', node, ALONE, alone(node))
  const ell = slab('slab_b3l', ELL, { holes: [square(0.5, 3, 1.5, 4)] })
  solid('B3.L', ell, ALONE, alone(ell), true)
}

title('B4 holes that are not inside, in the rectangle of B1: one over the edge, (1, -0.5) to (3, 1); one outside, (6, 0) to (7, 1); one over the whole slab, (-1, -1) to (5, 4)')
{
  const holes = [square(1, -0.5, 3, 1)]
  const node = slab('slab_b4', RECT, { elevation: 0.3, thickness: 0.2, holes })
  // the outline with the hole's part taken out of it: 8 corners, no hole left inside
  const cut: Ring = [[0, 0], [1, 0], [1, 1], [3, 1], [3, 0], [4, 0], [4, 3], [0, 3]]
  solid('B4.over_the_edge', node, ALONE, { ...solidFacts(cut, [], 0.3, 0.2), topArea: topArea(RECT, holes), volume: topArea(RECT, holes) * 0.2 })
  const outside = slab('slab_b4o', RECT, { elevation: 0.3, thickness: 0.2, holes: [square(6, 0, 7, 1)] })
  solid('B4.outside', outside, ALONE, solidFacts(RECT, [], 0.3, 0.2), true)
  const all = slab('slab_b4a', RECT, { elevation: 0.3, thickness: 0.2, holes: [square(-1, -1, 5, 4)] })
  solid('B4.over_the_whole_slab', all, ALONE, { triangles: 0, vertices: 0, topArea: 0, volume: 0 }, true)
}

title('B4 holes that touch, where the old editor does not cut as the rule says (the exact line is the ring less the holes): the hole over the edge with a second hole lying against the top edge from outside, (1, 3) to (3, 4); a hole across the whole width, (-1, 1) to (5, 2), with one lying against the bottom edge from outside, (1, -1) to (3, 0); a hole flush with the left edge, (0, 1) to (1, 2), with one inside that touches its corner, (1, 2) to (2, 2.5)')
{
  for (const [name, holes] of [
    ['over_the_edge_and_one_against_the_ring', [square(1, -0.5, 3, 1), square(1, 3, 3, 4)]],
    ['across_the_width_and_one_against_the_ring', [square(-1, 1, 5, 2), square(1, -1, 3, 0)]],
    ['flush_with_the_edge_and_one_touching_its_corner', [square(0, 1, 1, 2), square(1, 2, 2, 2.5)]],
  ] as Array<[string, Ring[]]>) {
    const geometry = generateSlabGeometry(slab('slab_b4t', RECT, { elevation: 0.3, thickness: 0.2, holes }), ALONE)
    row(`B4.${name}.triangles`, meshFacts(geometry).triangles)
    row(`B4.${name}.top_area`, read(geometry).up)
    row(`B4.${name}.top_area.exact`, topArea(RECT, holes))
    geometry.dispose()
  }
}

title('B5 two holes that overlap, (1, 1) to (2, 2) and (1.5, 1.5) to (2.5, 2.5): they are joined into one')
{
  const holes = [square(1, 1, 2, 2), square(1.5, 1.5, 2.5, 2.5)]
  const node = slab('slab_b5', RECT, { elevation: 0.3, thickness: 0.2, holes })
  // joined: one hole of 8 corners
  const joined: Ring = [[1, 1], [2, 1], [2, 1.5], [2.5, 1.5], [2.5, 2.5], [1.5, 2.5], [1.5, 2], [1, 2]]
  solid('B5', node, ALONE, { ...solidFacts(RECT, [joined], 0.3, 0.2), topArea: topArea(RECT, holes), volume: topArea(RECT, holes) * 0.2, box: undefined })
}

title("B6 the automatic slab of S4 in its room of four walls 0.2 thick; and a slab of that room drawn at the walls' outer faces")
{
  const walls = [
    WallNode.parse({ id: 'wall_a', start: [0, 0], end: [4, 0], thickness: 0.2 }),
    WallNode.parse({ id: 'wall_b', start: [4, 0], end: [4, 4], thickness: 0.2 }),
    WallNode.parse({ id: 'wall_c', start: [4, 4], end: [0, 4], thickness: 0.2 }),
    WallNode.parse({ id: 'wall_d', start: [0, 4], end: [0, 0], thickness: 0.2 }),
  ]
  const auto = slab('slab_b6', square(0, 0, 4, 4), { autoFromWalls: true })
  solid('B6', auto, { walls, siblingSlabs: [] }, { ...solidFacts(builtRing(slabOf(auto), walls.map(plain), []), [], 0.05, 0.05), signedVolume: undefined })
  const drawn = slab('slab_b6o', square(-0.1, -0.1, 4.1, 4.1))
  const ring = builtRing(slabOf(drawn), walls.map(plain), [])
  row('B6.drawn_at_the_outer_faces.ring_points', getRenderableSlabPolygon(drawn, { walls, siblingSlabs: [] }).length)
  row('B6.drawn_at_the_outer_faces.ring_points.by_equation', ring.length)
  solid('B6.drawn_at_the_outer_faces', drawn, { walls, siblingSlabs: [] }, solidFacts(ring, [], 0.05, 0.05), true)
}

function pit(key: string, node: SlabNode, ring: Ring, inside: Ring[], short = false) {
  const geometry = generateSlabGeometry(node, ALONE)
  const f = meshFacts(geometry)
  const r = read(geometry)
  const mine = pitFacts(ring, inside, slabOf(node).elevation, slabOf(node).rim)
  row(`${key}.triangles`, f.triangles)
  row(`${key}.triangles.by_equation`, mine.triangles)
  if (!short) {
    row(`${key}.vertices`, r.vertices)
    row(`${key}.vertices.by_equation`, mine.vertices)
    row(`${key}.floor_area`, r.up)
    row(`${key}.floor_area.by_equation`, mine.floorArea)
  }
  row(`${key}.depth`, f.max[1] - f.min[1])
  row(`${key}.depth.by_equation`, mine.depth)
  row(`${key}.volume_of_the_pit`, r.up * (f.max[1] - f.min[1]))
  row(`${key}.volume_of_the_pit.by_equation`, mine.volume)
  if (!short && inside.length === 0) {
    row(`${key}.box_in_its_own_frame`, boxText(f))
    row(`${key}.box_in_its_own_frame.by_equation`, boxText(mine.box))
    row(`${key}.faces_that_look_down`, r.downCount)
  }
  row(`${key}.set_at_height`, (buildSlabGeometry(node).children[0] as THREE.Mesh).position.y)
  row(`${key}.set_at_height.by_equation`, mine.setAt)
  geometry.dispose()
}

title('B7 a pit (recessed) on the rectangle 4 x 3, its floor at -1.2 (its rim at 0); the same with its rim at 0.3; a pit whose floor (0.2) is above its rim (0); the first pit with a hole 1 x 1 from (1, 1)')
{
  pit('B7', slab('slab_b7', RECT, { elevation: -1.2, recessed: true }), RECT, [])
  pit('B7.rim_0.3', slab('slab_b7r', RECT, { elevation: -1.2, recessed: true, recessedRimElevation: 0.3 }), RECT, [], true)
  pit('B7.rim_below_floor', slab('slab_b7z', RECT, { elevation: 0.2, recessed: true }), RECT, [], true)
  pit('B7.hole', slab('slab_b7h', RECT, { elevation: -1.2, recessed: true, holes: [square(1, 1, 2, 2)] }), RECT, [square(1, 1, 2, 2)])
}

title('B8 the body as it is put in the scene, one mesh of the faces that look up and one of all the others: the rectangle of B1, the same with the hole of B3, the pit of B7')
{
  for (const [name, node] of [
    ['rectangle', slab('slab_b8', RECT, { elevation: 0.3, thickness: 0.2 })],
    ['rectangle_with_hole', slab('slab_b8h', RECT, { elevation: 0.3, thickness: 0.2, holes: [square(1, 1, 2, 2)] })],
    ['pit', slab('slab_b8p', RECT, { elevation: -1.2, recessed: true })],
  ] as Array<[string, SlabNode]>) {
    const meshes = buildSlabGeometry(node).children as THREE.Mesh[]
    row(`B8.${name}.meshes`, meshes.length)
    row(`B8.${name}.looking_up`, `triangles ${num(meshFacts(meshes[0]!.geometry).triangles)} set at height ${num(meshes[0]!.position.y)}`)
    row(`B8.${name}.the_others`, `triangles ${num(meshFacts(meshes[1]!.geometry).triangles)} set at height ${num(meshes[1]!.position.y)}`)
  }
}

// ------------------------------------------------------------------ the fill down to the land
// a land of 9 x 9 heights 1 m apart from (-2, -2) of the site, and a slab on the lowest storey of a building
type Where = { levelBase?: number; at?: SitePlace }
function onLand(height: ((x: number, z: number) => number) | null, node: SlabNode, where: Where = {}) {
  const field = createTerrainField({ origin: [-2, -2], spacing: 1, cols: 9, rows: 9 })
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) field.heights[r * 9 + c] = Math.round((height ? height(-2 + c, -2 + r) : 0) / field.step)
  }
  const at = where.at ?? { turn: 0, x: 0, z: 0 }
  const site = SiteNode.parse({ id: 'site_a', ...(height ? { terrain: commitTerrainField(field) } : {}), children: ['building_a'] })
  const building = BuildingNode.parse({ id: 'building_a', parentId: 'site_a', children: ['level_0'], position: [at.x, 0, at.z], rotation: [0, at.turn, 0] })
  const level = LevelNode.parse({ id: 'level_0', level: 0, height: 2.7, baseElevation: where.levelBase ?? 0, parentId: 'building_a', children: [node.id] })
  const all: Record<string, unknown> = { [site.id]: site, [building.id]: building, [level.id]: level, [node.id]: node }
  const ctx = { resolve: (id: string) => all[id], children: [], siblings: [], parent: level }
  return buildSlabGeometry({ ...node, parentId: level.id } as SlabNode, ctx as never)
}
const land = (height: (u: number, v: number) => number): Land => ({ origin: [-2, -2], spacing: 1, cols: 9, rows: 9, height })

function fill(key: string, group: THREE.Group, top: number, mine: ReturnType<typeof fillFacts>, onePlane: boolean) {
  const mesh = group.children[2] as THREE.Mesh | undefined
  row(`${key}.fill_made`, Boolean(mesh))
  row(`${key}.fill_made.by_equation`, Boolean(mine))
  if (!mesh || !mine) return
  const f = meshFacts(mesh.geometry)
  const r = read(mesh.geometry)
  row(`${key}.skirt_triangles`, f.triangles - r.downCount)
  row(`${key}.skirt_triangles.by_equation`, mine.skirtTriangles)
  row(`${key}.bottom_triangles`, r.downCount)
  row(`${key}.bottom_triangles.by_equation`, mine.bottomTriangles)
  row(`${key}.box`, boxText(f))
  row(`${key}.box.by_equation`, boxText(mine.box))
  row(`${key}.heights_of_the_bottom`, r.downHeights.join(' '))
  row(`${key}.volume_under_the_slab`, r.under(top))
  if (onePlane) row(`${key}.volume_under_the_slab.by_equation`, mine.volumeOnOnePlane)
}

title("B9 fill to the land under the rectangle of B1 (its underside at 0.1). The land: 9 x 9 heights 1 m apart from (-2, -2) of the site. Falling 0.25 per metre of the site's x, the building at the site's origin; the same land, the building at (1, 2) and turned 90 degrees; a ridge along x = 2 falling 0.25 per metre to both sides; a site with no land sculpted; a land at 0.5, above the underside; the slope again with the storey 0.5 above the ground, with a pit, with no fill asked for")
{
  const node = slab('slab_b9', RECT, { elevation: 0.3, thickness: 0.2, fillToTerrain: true })
  const slope = (x: number, _z: number) => -0.25 * x
  fill('B9.slope', onLand(slope, node), 0.1, fillFacts(RECT, 0.3, 0.2, land(slope)), true)

  const at: SitePlace = { turn: Math.PI / 2, x: 1, z: 2 }
  fill('B9.slope.building_at(1, 2)_turned_90', onLand(slope, node, { at }), 0.1, fillFacts(RECT, 0.3, 0.2, land(slope), at), true)

  const ridge = (x: number, _z: number) => -0.25 * Math.abs(x - 2)
  fill('B9.ridge', onLand(ridge, node), 0.1, fillFacts(RECT, 0.3, 0.2, land(ridge)), false)
  // under the land itself: the ridge is straight between its heights 1 m apart, so each metre of u counts at its middle
  let exact = 0
  for (let k = 0; k < 4; k += 1) exact += 3 * (0.1 - ridge(k + 0.5, 0))
  row('B9.ridge.volume_under_the_slab.exact', exact)

  // a site with no land sculpted: the ground is 0 everywhere and has no creases
  const flat: Land = { origin: [0, 0], spacing: 1, cols: 0, rows: 0, height: () => 0 }
  fill('B9.no_land_sculpted', onLand(null, node), 0.1, fillFacts(RECT, 0.3, 0.2, flat), true)

  const high = (_x: number, _z: number) => 0.5
  fill('B9.land_above_the_underside', onLand(high, node), 0.1, fillFacts(RECT, 0.3, 0.2, land(high)), true)
  const none: Array<[string, THREE.Group]> = [
    ['storey_0.5_above_the_ground', onLand(slope, node, { levelBase: 0.5 })],
    ['pit', onLand(slope, slab('slab_b9p', RECT, { elevation: -0.4, recessed: true, fillToTerrain: true }))],
    ['fill_not_asked_for', onLand(slope, slab('slab_b9n', RECT, { elevation: 0.3, thickness: 0.2 }))],
  ]
  for (const [name, group] of none) row(`B9.${name}.fill_made`, group.children.length > 2)
}
