/**
 * Pure arch profile curves (no Three.js) — shared by geometry, Poleni checks, and the panel.
 */
import {
  analyseThrust,
  fitCatenary,
  sampleCatenary,
  type ThrustAnalysis,
} from './catenary'

export type ArchProfileType = 'round' | 'segmental' | 'pointed' | 'catenary'
export type ArchPoint = { x: number; y: number }

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

function pointedArcPoints(span: number, rise: number, segments: number): ArchPoint[] {
  const half = span / 2
  const h = Math.max(rise, 1e-6)
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

export function buildArchOuterPoints(
  profileType: ArchProfileType,
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
    case 'catenary':
      return sampleCatenary(fitCatenary(span, rise), segs)
    default: {
      const _exhaustive: never = profileType
      return _exhaustive
    }
  }
}

/** Inward offset of a polyline by `distance` (toward the arch opening). */
export function offsetInward(points: ArchPoint[], distance: number): ArchPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }))
  const out: ArchPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!
    const curr = points[i]!
    const next = points[Math.min(points.length - 1, i + 1)]!
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const nx = dy / len
    const ny = -dx / len
    out.push({ x: curr.x + nx * distance, y: curr.y + ny * distance })
  }
  return out
}

export function buildArchCentreline(
  profileType: ArchProfileType,
  span: number,
  rise: number,
  thickness: number,
  segments: number,
): ArchPoint[] {
  const outer = buildArchOuterPoints(profileType, span, rise, segments)
  return offsetInward(outer, Math.min(thickness, rise * 0.45, span * 0.2) * 0.5)
}

export function archThrustAnalysis(node: {
  profileType: ArchProfileType
  span: number
  rise: number
  thickness: number
}): ThrustAnalysis {
  const centreline = buildArchCentreline(
    node.profileType,
    node.span,
    node.rise,
    node.thickness,
    48,
  )
  return analyseThrust(centreline, node.thickness, node.span, node.rise, 48)
}
