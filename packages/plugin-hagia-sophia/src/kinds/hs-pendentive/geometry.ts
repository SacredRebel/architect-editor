import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LOD,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import { truePendentiveGrid } from '../../temple/proportions'
import type { HsPendentiveNode, HsPendentiveQuadrant } from './schema'

/** LOD distances (m). */
export const PENDENTIVE_LOD_DISTANCES = [0, 80, 220] as const

/**
 * Map architectural quadrant → Three.js SphereGeometry phiStart.
 * phiLength is always π/2; theta sweeps the upper octant [0, π/2].
 */
export function quadrantToPhiStart(quadrant: HsPendentiveQuadrant): number {
  switch (quadrant) {
    case 'ne':
      return 0
    case 'nw':
      return Math.PI / 2
    case 'se':
      return Math.PI
    case 'sw':
      return (3 * Math.PI) / 2
    default: {
      const _exhaustive: never = quadrant
      return _exhaustive
    }
  }
}

/** The true pendentive as a mesh: the spherical triangle between two arches and the ring. */
export function buildTruePendentiveGeometry(
  side: number,
  quadrant: HsPendentiveQuadrant,
  A: number,
  U: number,
): BufferGeometry {
  const rows = truePendentiveGrid(side, quadrant, A, U)
  const pos: number[] = []
  for (const row of rows) for (const p of row) pos.push(p[0]!, p[1]!, p[2]!)
  const idx: number[] = []
  const w = U + 1
  for (let i = 0; i < A; i++) {
    for (let j = 0; j < U; j++) {
      const a = i * w + j
      const b = (i + 1) * w + j
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geom.setIndex(idx)
  geom.computeVertexNormals()
  return geom
}

function buildDetailLevel(
  node: HsPendentiveNode,
  widthSegs: number,
  heightSegs: number,
  material: MeshStandardMaterial,
): Group {
  const group = new Group()
  if (node.squareSide) {
    const mesh = new Mesh(
      buildTruePendentiveGeometry(node.squareSide, node.quadrant, widthSegs, heightSegs),
      material,
    )
    mesh.name = 'hs-pendentive-true'
    group.add(mesh)
    return group
  }
  const phiStart = quadrantToPhiStart(node.quadrant)
  const geom = new SphereGeometry(
    node.sphereRadius,
    widthSegs,
    heightSegs,
    phiStart,
    Math.PI / 2,
    0,
    Math.PI / 2,
  )
  const mesh = new Mesh(geom, material)
  mesh.name = 'hs-pendentive-shell'
  group.add(mesh)
  return group
}

/**
 * Pure pendentive builder — local-space LOD only; never sets group position/rotation.
 * One spherical octant/quadrant selected by `quadrant`.
 */
export function buildPendentiveGeometry(node: HsPendentiveNode): LOD {
  const material = new MeshStandardMaterial({
    color: '#b8b2a6',
    roughness: 0.85,
    metalness: 0,
    side: DoubleSide,
  })

  const lod = new LOD()
  lod.addLevel(buildDetailLevel(node, 24, 12, material), PENDENTIVE_LOD_DISTANCES[0])
  lod.addLevel(buildDetailLevel(node, 12, 8, material), PENDENTIVE_LOD_DISTANCES[1])
  lod.addLevel(buildDetailLevel(node, 6, 4, material), PENDENTIVE_LOD_DISTANCES[2])
  return lod
}
