import {
  BoxGeometry,
  ExtrudeGeometry,
  Group,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from 'three'
import type { HsArchNode, HsArchProfileType } from './schema'

/** LOD distances (m): L0 full, L1 mid, L2 box. */
export const ARCH_LOD_DISTANCES = [0, 60, 150] as const

export type ArchPoint = { x: number; y: number }

/**
 * Circular-arc points from left springing (-span/2, 0) through apex (0, sagitta)
 * to right springing (+span/2, 0). Centre on the perpendicular bisector.
 */
function circularArcPoints(span: number, sagitta: number, segments: number): ArchPoint[] {
  const half = span / 2
  const h = Math.max(sagitta, 1e-6)
  const cy = (h * h - half * half) / (2 * h)
  const R = h - cy
  const pts: ArchPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = -half + span * t
    const under = R * R - x * x
    const y = cy + Math.sqrt(Math.max(0, under))
    pts.push({ x, y })
  }
  return pts
}

/**
 * Pointed (two-centre) arch: arcs from each springing meet at a single apex (0, rise).
 */
function pointedArcPoints(span: number, rise: number, segments: number): ArchPoint[] {
  const half = span / 2
  const h = Math.max(rise, 1e-6)
  // Left centre (c, 0): equidistant from (-half, 0) and (0, h)
  const c = (h * h - half * half) / span
  const leftCenter = c
  const rightCenter = -c
  const Rleft = Math.hypot(-half - leftCenter, 0)
  const Rright = Math.hypot(half - rightCenter, 0)
  const halfSeg = Math.max(1, Math.floor(segments / 2))
  const pts: ArchPoint[] = []

  for (let i = 0; i <= halfSeg; i++) {
    const t = i / halfSeg
    const a0 = Math.atan2(0, -half - leftCenter)
    const a1 = Math.atan2(h, 0 - leftCenter)
    const a = a0 + (a1 - a0) * t
    pts.push({
      x: leftCenter + Rleft * Math.cos(a),
      y: Rleft * Math.sin(a),
    })
  }
  for (let i = 1; i <= halfSeg; i++) {
    const t = i / halfSeg
    const a0 = Math.atan2(h, 0 - rightCenter)
    const a1 = Math.atan2(0, half - rightCenter)
    const a = a0 + (a1 - a0) * t
    pts.push({
      x: rightCenter + Rright * Math.cos(a),
      y: Rright * Math.sin(a),
    })
  }
  return pts
}

/**
 * Outer arch profile points in local XY (springing on y=0, apex up).
 * - round: circular arc with sagitta = rise
 * - segmental: shallower circular arc (sagitta = rise x 0.55)
 * - pointed: two intersecting arcs meeting at a single apex
 */
export function buildArchOuterPoints(
  profileType: HsArchProfileType,
  span: number,
  rise: number,
  segments: number,
): ArchPoint[] {
  const segs = Math.max(2, segments)
  switch (profileType) {
    case 'round':
      return circularArcPoints(span, rise, segs)
    case 'segmental':
      return circularArcPoints(span, rise * 0.55, segs)
    case 'pointed':
      return pointedArcPoints(span, rise, segs)
    default: {
      const _exhaustive: never = profileType
      return _exhaustive
    }
  }
}

/** Inward offset of a polyline by `thickness` (toward the arch opening). */
function offsetInward(points: ArchPoint[], thickness: number): ArchPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }))
  const out: ArchPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!
    const curr = points[i]!
    const next = points[Math.min(points.length - 1, i + 1)]!
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    // Tangent (dx,dy); inward normal for upper L->R arch is (dy, -dx)
    const nx = dy / len
    const ny = -dx / len
    out.push({ x: curr.x + nx * thickness, y: curr.y + ny * thickness })
  }
  return out
}

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
  return group
}

/**
 * Pure arch builder — local-space LOD only; never sets group position/rotation.
 * Origin at springing-line midpoint; arch springs up +/-span/2.
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
