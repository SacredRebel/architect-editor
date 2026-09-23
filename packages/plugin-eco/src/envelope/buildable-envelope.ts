/**
 * Buildable envelope: erode a parcel polygon by Ventura front/side/rear
 * setbacks and extrude to the height limit as a translucent volume.
 *
 * Pure geometry — no Turkish TAKS/KAKS. Uses VENTURA_ENVELOPE defaults.
 */
import { VENTURA_ENVELOPE } from './ventura-envelope'

export type Point2D = readonly [number, number]

export type EdgeRole = 'front' | 'side' | 'rear'

export type BuildableEnvelope = {
  /** Eroded footprint in site-local XZ (empty if degenerate). */
  polygon: Point2D[]
  areaM2: number
  heightM: number
  isDegenerate: boolean
  edgeRoles: EdgeRole[]
}

function signedArea(points: readonly Point2D[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

function polygonArea(points: readonly Point2D[]): number {
  return Math.abs(signedArea(points))
}

export function classifyEdgeRoles(
  edgeCount: number,
  frontEdgeIndex: number = VENTURA_ENVELOPE.frontEdgeIndex,
): EdgeRole[] {
  if (edgeCount < 3) return []
  const front = ((frontEdgeIndex % edgeCount) + edgeCount) % edgeCount
  return Array.from({ length: edgeCount }, (_, i) => {
    if (i === front) return 'front'
    const adjacent = i === (front + 1) % edgeCount || i === (front - 1 + edgeCount) % edgeCount
    return adjacent ? 'side' : 'rear'
  })
}

function setbackForRole(role: EdgeRole): number {
  if (role === 'front') return VENTURA_ENVELOPE.frontSetbackM
  if (role === 'side') return VENTURA_ENVELOPE.sideSetbackM
  return VENTURA_ENVELOPE.rearSetbackM
}

function clipHalfPlane(
  polygon: readonly Point2D[],
  pointOnLine: Point2D,
  normal: Point2D,
): Point2D[] {
  if (polygon.length === 0) return []
  const inside = (p: Point2D) =>
    (p[0] - pointOnLine[0]) * normal[0] + (p[1] - pointOnLine[1]) * normal[1] >= -1e-9
  const intersect = (a: Point2D, b: Point2D): Point2D => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const denom = dx * normal[0] + dz * normal[1]
    if (Math.abs(denom) < 1e-12) return a
    const t =
      ((pointOnLine[0] - a[0]) * normal[0] + (pointOnLine[1] - a[1]) * normal[1]) / denom
    return [a[0] + t * dx, a[1] + t * dz]
  }

  const out: Point2D[] = []
  for (let i = 0; i < polygon.length; i += 1) {
    const cur = polygon[i]!
    const prev = polygon[(i - 1 + polygon.length) % polygon.length]!
    const curIn = inside(cur)
    const prevIn = inside(prev)
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (prevIn) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

/**
 * Erode `parcel` inward by Ventura setbacks. Winding-aware so the
 * interior side of each edge is always the half-plane we keep.
 */
export function deriveBuildableEnvelope(
  parcel: readonly Point2D[],
  options?: { frontEdgeIndex?: number; heightM?: number },
): BuildableEnvelope {
  const heightM = options?.heightM ?? VENTURA_ENVELOPE.maxHeightM
  const edgeRoles = classifyEdgeRoles(parcel.length, options?.frontEdgeIndex)
  if (parcel.length < 3) {
    return { polygon: [], areaM2: 0, heightM, isDegenerate: true, edgeRoles }
  }

  const ccw = signedArea(parcel) > 0
  let eroded: Point2D[] = [...parcel]

  for (let i = 0; i < parcel.length; i += 1) {
    const start = parcel[i]!
    const end = parcel[(i + 1) % parcel.length]!
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const len = Math.hypot(dx, dz)
    if (len < 1e-9) continue
    // Outward normal (right of directed edge when CCW; left when CW).
    const outward: Point2D = ccw ? [dz / len, -dx / len] : [-dz / len, dx / len]
    const inset = setbackForRole(edgeRoles[i]!)
    const pointOnLine: Point2D = [
      start[0] - outward[0] * inset,
      start[1] - outward[1] * inset,
    ]
    // Keep the half-plane opposite the outward normal (interior).
    const inward: Point2D = [-outward[0], -outward[1]]
    eroded = clipHalfPlane(eroded, pointOnLine, inward)
    if (eroded.length < 3) {
      return { polygon: [], areaM2: 0, heightM, isDegenerate: true, edgeRoles }
    }
  }

  return {
    polygon: eroded,
    areaM2: polygonArea(eroded),
    heightM,
    isDegenerate: false,
    edgeRoles,
  }
}
