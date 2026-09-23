/**
 * H18 — ground path helpers for teleport + click-to-walk.
 * Full recast-navigation-js navmesh bake is queued; until then we sample the
 * existing BVH collider mesh so paths stay on walkable geometry.
 */
import {
  type Mesh,
  Raycaster,
  Vector3,
  type Object3D,
} from 'three'

const DOWN = new Vector3(0, -1, 0)
const raycaster = new Raycaster()
const hitPoint = new Vector3()

export function raycastGround(
  meshes: Object3D[],
  from: Vector3,
  direction: Vector3,
  maxDist = 200,
): Vector3 | null {
  if (meshes.length === 0) return null
  raycaster.set(from, direction.clone().normalize())
  raycaster.far = maxDist
  const hits = raycaster.intersectObjects(meshes, false)
  const hit = hits.find((h) => h.face && h.face.normal.y > 0.35)
  if (!hit) return null
  return hitPoint.copy(hit.point)
}

/** Drop a point onto the nearest walkable surface under / near it. */
export function snapToGround(meshes: Object3D[], xz: Vector3, eyeHeight = 1.7): Vector3 | null {
  const origin = xz.clone()
  origin.y += 40
  const hit = raycastGround(meshes, origin, DOWN, 80)
  if (!hit) return null
  hit.y += 0.02
  return hit
}

/**
 * Straight-line ground-following waypoints from `from` toward `to`.
 * When recast lands, replace this with navmesh corridor following.
 */
export function buildGroundPath(
  meshes: Mesh[],
  from: Vector3,
  to: Vector3,
  step = 0.75,
): Vector3[] {
  const start = snapToGround(meshes, from) ?? from.clone()
  const end = snapToGround(meshes, to)
  if (!end) return [start]
  const delta = end.clone().sub(start)
  const dist = Math.hypot(delta.x, delta.z)
  if (dist < 0.05) return [start]
  const count = Math.max(1, Math.ceil(dist / step))
  const points: Vector3[] = [start]
  for (let i = 1; i <= count; i++) {
    const t = i / count
    const sample = new Vector3(
      start.x + delta.x * t,
      start.y,
      start.z + delta.z * t,
    )
    const snapped = snapToGround(meshes, sample)
    points.push(snapped ?? sample)
  }
  return points
}

export function pathLength(points: Vector3[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += points[i]!.distanceTo(points[i - 1]!)
  }
  return len
}
