import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from 'three'
import { analyseThrust } from '../../math/catenary'
import {
  buildArchCentreline,
  buildArchOuterPoints,
  offsetInward,
  type ArchPoint,
} from '../../math/arch-profile'
import type { HsArchNode, HsArchProfileType } from './schema'

export type { ArchPoint }
export { buildArchCentreline, buildArchOuterPoints }

/** LOD distances (m): L0 full, L1 mid, L2 box. */
export const ARCH_LOD_DISTANCES = [0, 60, 150] as const

function buildArchShape(
  profileType: HsArchProfileType,
  span: number,
  rise: number,
  thickness: number,
  segments: number,
): Shape {
  const outer = buildArchOuterPoints(profileType, span, rise, segments)
  const inner = offsetInward(outer, Math.min(thickness, rise * 0.45, span * 0.2)).reverse()

  const shape = new Shape()
  const first = outer[0]!
  shape.moveTo(first.x, first.y)
  for (let i = 1; i < outer.length; i++) {
    const p = outer[i]!
    shape.lineTo(p.x, p.y)
  }
  const i0 = inner[0]!
  shape.lineTo(i0.x, i0.y)
  for (let i = 1; i < inner.length; i++) {
    const p = inner[i]!
    shape.lineTo(p.x, p.y)
  }
  shape.closePath()
  return shape
}

/** Poleni overlay: thrust line coloured by middle-third pass/fail. */
function buildThrustLine(node: HsArchNode, segments: number): Line {
  const centreline = buildArchCentreline(
    node.profileType,
    node.span,
    node.rise,
    node.thickness,
    segments,
  )
  const analysis = analyseThrust(centreline, node.thickness, node.span, node.rise, segments)
  const positions: number[] = []
  for (const p of analysis.points) {
    positions.push(p.x, p.y, 0)
  }
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
  const color = analysis.withinMiddleThird ? '#2f9e44' : '#e03131'
  const mat = new LineBasicMaterial({ color })
  const line = new Line(geom, mat)
  line.name = analysis.withinMiddleThird ? 'hs-arch-thrust-ok' : 'hs-arch-thrust-warn'
  return line
}

function buildDetailLevel(
  node: HsArchNode,
  segments: number,
  material: MeshStandardMaterial,
  simple: boolean,
): Group {
  const group = new Group()
  const { span, rise, depth, profileType, thickness } = node

  if (simple) {
    const box = new Mesh(new BoxGeometry(span, rise, depth), material)
    box.name = 'hs-arch-box'
    box.position.y = rise / 2
    group.add(box)
    return group
  }

  const shape = buildArchShape(profileType, span, rise, thickness, segments)
  const geom = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segments })
  const mesh = new Mesh(geom, material)
  mesh.name = 'hs-arch-extrude'
  mesh.position.z = -depth / 2
  group.add(mesh)

  if (node.showThrust !== false) {
    group.add(buildThrustLine(node, segments))
  }

  return group
}

/**
 * Pure arch builder — local-space LOD only; never sets group position/rotation.
 * Origin at springing-line midpoint; arch springs up +/-span/2.
 * Depth is the vault length (catenary vault = catenary profile extruded).
 */
export function buildArchGeometry(node: HsArchNode): LOD {
  const material = new MeshStandardMaterial({
    color: '#b8b2a6',
    roughness: 0.85,
    metalness: 0,
  })

  const lod = new LOD()
  lod.addLevel(buildDetailLevel(node, 48, material, false), ARCH_LOD_DISTANCES[0])
  lod.addLevel(buildDetailLevel(node, 16, material, false), ARCH_LOD_DISTANCES[1])
  lod.addLevel(buildDetailLevel(node, 8, material, true), ARCH_LOD_DISTANCES[2])
  return lod
}

export { archThrustAnalysis } from '../../math/arch-profile'
