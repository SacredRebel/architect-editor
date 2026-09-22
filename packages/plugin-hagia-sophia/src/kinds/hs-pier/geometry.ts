import {
  BoxGeometry,
  ExtrudeGeometry,
  Group,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from 'three'
import type { HsPierNode } from './schema'

/** LOD distances (m): L0 full footprint, L1 simplified, L2 bbox box. */
export const PIER_LOD_DISTANCES = [0, 70, 180] as const

export type PierPoint = readonly [number, number]

/** Shoelace area of a closed polygon in the XZ plane (m²). */
export function shoelaceArea(points: readonly PierPoint[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i]!
    const [x1, z1] = points[(i + 1) % points.length]!
    sum += x0 * z1 - x1 * z0
  }
  return Math.abs(sum) / 2
}

export function footprintBounds(points: readonly PierPoint[]): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  depth: number
  cx: number
  cz: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  }
}

/** Drop every other vertex; keep at least 6 points (or the full ring if shorter). */
export function simplifyFootprint(points: readonly PierPoint[]): [number, number][] {
  if (points.length <= 6) {
    return points.map(([x, z]) => [x, z] as [number, number])
  }
  const out: [number, number][] = []
  for (let i = 0; i < points.length; i += 2) {
    out.push([points[i]![0], points[i]![1]])
  }
  if (out.length < 6) {
    const step = points.length / 6
    const evenly: [number, number][] = []
    for (let i = 0; i < 6; i++) {
      const p = points[Math.min(points.length - 1, Math.floor(i * step))]!
      evenly.push([p[0], p[1]])
    }
    return evenly
  }
  return out
}

function stoneMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: '#c8c2b4',
    roughness: 0.9,
    metalness: 0,
  })
}

function footprintShape(points: readonly PierPoint[]): Shape {
  const shape = new Shape()
  const first = points[0]!
  // ExtrudeGeometry is XY→+Z; rotateX(-π/2) maps shape-Y → −world-Z, so feed −z.
  shape.moveTo(first[0], -first[1])
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    shape.lineTo(p[0], -p[1])
  }
  shape.closePath()
  return shape
}

function buildShaft(points: readonly PierPoint[], height: number, material: MeshStandardMaterial): Mesh {
  const geom = new ExtrudeGeometry(footprintShape(points), {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  })
  geom.rotateX(-Math.PI / 2)
  const mesh = new Mesh(geom, material)
  mesh.name = 'hs-pier-shaft'
  return mesh
}

function buildImpost(
  bounds: ReturnType<typeof footprintBounds>,
  height: number,
  impostSize: number,
  impostThickness: number,
  material: MeshStandardMaterial,
): Mesh {
  const w = bounds.width + impostSize
  const d = bounds.depth + impostSize
  const mesh = new Mesh(new BoxGeometry(w, impostThickness, d), material)
  mesh.name = 'hs-pier-impost'
  mesh.position.set(bounds.cx, height + impostThickness / 2, bounds.cz)
  return mesh
}

function buildDetailLevel(
  node: HsPierNode,
  points: readonly PierPoint[],
  material: MeshStandardMaterial,
): Group {
  const group = new Group()
  const bounds = footprintBounds(points)
  group.add(buildShaft(points, node.height, material))
  group.add(buildImpost(bounds, node.height, node.impostSize, node.impostThickness, material))
  return group
}

function buildBoxLevel(node: HsPierNode, material: MeshStandardMaterial): Group {
  const group = new Group()
  const bounds = footprintBounds(node.footprint)
  const totalH = node.height + node.impostThickness
  const mesh = new Mesh(
    new BoxGeometry(bounds.width + node.impostSize, totalH, bounds.depth + node.impostSize),
    material,
  )
  mesh.name = 'hs-pier-box'
  mesh.position.set(bounds.cx, totalH / 2, bounds.cz)
  group.add(mesh)
  return group
}

/**
 * Pure pier builder — local-space LOD only; never sets group position/rotation.
 * Shaft base at y=0; impost cap sits on the shaft crown.
 */
export function buildPierGeometry(node: HsPierNode): LOD {
  const material = stoneMaterial()
  const lod = new LOD()
  lod.addLevel(buildDetailLevel(node, node.footprint, material), PIER_LOD_DISTANCES[0])
  lod.addLevel(
    buildDetailLevel(node, simplifyFootprint(node.footprint), material),
    PIER_LOD_DISTANCES[1],
  )
  lod.addLevel(buildBoxLevel(node, material), PIER_LOD_DISTANCES[2])
  return lod
}
