// Reference cases for the wall's body (port note entry 1): the old editor's own mesh builder,
// and the volume the note's equations give for the same wall.
// cd packages/viewer && bun ../../ports/refcases/01-wall-body.ts
import {
  calculateLevelMiters,
  DoorNode,
  sceneRegistry,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import * as THREE from 'three'
import { generateExtrudedWall } from '../../packages/viewer/src/systems/wall/wall-system'
import { meshFacts, polygonArea } from './_mesh'
import { num, row, title } from './_print'
import { footprintOf, mitresOf, plain, topOf } from './_wall-equations'

function facts(key: string, geometry: THREE.BufferGeometry, byEquation?: number) {
  const f = meshFacts(geometry)
  row(`${key}.triangles`, f.triangles)
  row(`${key}.volume`, f.volume)
  if (byEquation !== undefined) row(`${key}.volume.by_equation`, byEquation)
  row(
    `${key}.box`,
    `x ${num(f.min[0])}..${num(f.max[0])} y ${num(f.min[1])}..${num(f.max[1])} z ${num(f.min[2])}..${num(f.max[2])}`,
  )
  geometry.dispose()
}

// the cutters need the wall's mesh to be known to the scene, as it is in the running editor
function withRegistered<T>(wallId: string, run: () => T): T {
  const mesh = new THREE.Mesh()
  sceneRegistry.nodes.set(wallId, mesh)
  try {
    return run()
  } finally {
    sceneRegistry.nodes.delete(wallId)
    mesh.geometry.dispose()
  }
}

// equation (8) of the note, for a wall alone or among others: footprint area times body height
function prism(wall: WallNode, all: WallNode[], H = 2.5, b = 0): number {
  const top = topOf(H, b, wall.height, wall.supportSlabId === 'ground')
  return polygonArea(footprintOf(plain(wall), mitresOf(all.map(plain)))) * (top - b)
}

title('B1 a plain wall: (0, 0) to (4, 0), thickness 0.2, height 2.5')
{
  const wall = WallNode.parse({ id: 'wall_b1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  facts('B1', generateExtrudedWall(wall, [], calculateLevelMiters([wall])), prism(wall, [wall]))
}

title('B2 the same wall with a door 0.9 x 2.1 whose middle is 1.0 m along and 1.05 m up')
{
  const wall = WallNode.parse({ id: 'wall_b2', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  const door = DoorNode.parse({ id: 'door_b2', wallId: wall.id, position: [1, 1.05, 0], width: 0.9, height: 2.1 })
  withRegistered(wall.id, () =>
    facts('B2', generateExtrudedWall(wall, [door], calculateLevelMiters([wall])), prism(wall, [wall]) - 0.9 * 2.1 * 0.2),
  )
}

title('B3 the same wall with a window 1.2 x 1.0 whose middle is 2.5 m along and 1.4 m up')
{
  const wall = WallNode.parse({ id: 'wall_b3', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  const window = WindowNode.parse({ id: 'window_b3', wallId: wall.id, position: [2.5, 1.4, 0], width: 1.2, height: 1.0 })
  withRegistered(wall.id, () =>
    facts('B3', generateExtrudedWall(wall, [window], calculateLevelMiters([wall])), prism(wall, [wall]) - 1.2 * 1.0 * 0.2),
  )
}

title('B4 an arched door 1.0 x 2.2, arch 0.5 high, middle 2.0 m along (the arch is entry 3)')
{
  const wall = WallNode.parse({ id: 'wall_b4', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  const door = DoorNode.parse({
    id: 'door_b4',
    wallId: wall.id,
    position: [2, 1.1, 0],
    width: 1.0,
    height: 2.2,
    openingShape: 'arch',
    archHeight: 0.5,
  })
  withRegistered(wall.id, () => facts('B4', generateExtrudedWall(wall, [door], calculateLevelMiters([wall]))))
  // a rectangle 1.0 x 1.7 under half a true ellipse of half-axes 0.5 and 0.5
  row('B4.volume.exact', 4 * 0.2 * 2.5 - (1.0 * 1.7 + (Math.PI * 0.5 * 0.5) / 2) * 0.2)
}

title('B5 the bent wall of W3: sagitta +1, thickness 0.2, height 2.5')
{
  const wall = WallNode.parse({ id: 'wall_b5', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, curveOffset: 1 })
  facts('B5', generateExtrudedWall(wall, [], calculateLevelMiters([wall])), prism(wall, [wall]))
  row('B5.volume.exact', 2.5 * 1.8545904360032246 * 0.2 * 2.5)
}

title('B6 no stored height: the top is the storey plane (2.5 m by default; then 3.0 m, on a slab 0.15 m up)')
{
  const wall = WallNode.parse({ id: 'wall_b6', start: [0, 0], end: [4, 0], thickness: 0.2 })
  facts('B6.default_storey', generateExtrudedWall(wall, [], calculateLevelMiters([wall])), prism(wall, [wall]))
  facts(
    'B6.storey_3_slab_0.15',
    generateExtrudedWall(wall, [], calculateLevelMiters([wall]), 0.15, 0.15, [{ start: 0, end: 1, elevation: 0.15 }], 3.0),
    prism(wall, [wall], 3.0, 0.15),
  )
}

title('B7 the mitred pair of W2: A 0.2 thick and B 0.3 thick meeting at (4, 0), both 2.5 high')
{
  const a = WallNode.parse({ id: 'wall_a', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  const b = WallNode.parse({ id: 'wall_b', start: [4, 0], end: [4, 3], thickness: 0.3, height: 2.5 })
  const miters = calculateLevelMiters([a, b])
  facts('B7.A', generateExtrudedWall(a, [], miters), prism(a, [a, b]))
  facts('B7.B', generateExtrudedWall(b, [], miters), prism(b, [a, b]))
}
