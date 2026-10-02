// A mesh read back by its own triangles: what it encloses, its box, how many triangles.
import type { BufferGeometry } from 'three'

export type MeshFacts = {
  triangles: number
  volume: number
  area: number
  min: [number, number, number]
  max: [number, number, number]
}

export function meshFacts(geometry: BufferGeometry): MeshFacts {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : (position?.count ?? 0)
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ]
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]
  let volume = 0
  let area = 0
  const at = (i: number): [number, number, number] => {
    const v = index ? index.getX(i) : i
    return [position.getX(v), position.getY(v), position.getZ(v)]
  }
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const a = at(offset)
    const b = at(offset + 1)
    const c = at(offset + 2)
    for (const p of [a, b, c]) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, p[axis]!)
        max[axis] = Math.max(max[axis]!, p[axis]!)
      }
    }
    // the divergence theorem: a closed mesh encloses the sum of a·(b×c)/6
    const cross: [number, number, number] = [
      b[1] * c[2] - b[2] * c[1],
      b[2] * c[0] - b[0] * c[2],
      b[0] * c[1] - b[1] * c[0],
    ]
    volume += (a[0] * cross[0] + a[1] * cross[1] + a[2] * cross[2]) / 6
    const u: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const w: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    area +=
      Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2
  }
  return { triangles: Math.floor(count / 3), volume: Math.abs(volume), area, min, max }
}

export function polygonArea(points: readonly { x: number; y: number }[]): number {
  let twice = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}
