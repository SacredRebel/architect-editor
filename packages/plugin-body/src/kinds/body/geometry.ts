import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShapeUtils,
  Vector2,
} from 'three'
import type { BodyNode } from '../../schema/body'
import { getBodyLoopBoundaryPoints } from '../../kernel/body-curves'
import { validateBodyTopology } from '../../kernel/body-topology'

type Point3 = [number, number, number]

function faceProjection(points: Point3[]): (point: Point3) => Vector2 {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    nx += (current[1] - next[1]) * (current[2] + next[2])
    ny += (current[2] - next[2]) * (current[0] + next[0])
    nz += (current[0] - next[0]) * (current[1] + next[1])
  }
  const axis =
    Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz)
      ? 'x'
      : Math.abs(ny) >= Math.abs(nz)
        ? 'y'
        : 'z'
  if (axis === 'x') return ([, y, z]) => new Vector2(y, z)
  if (axis === 'y') return ([x, , z]) => new Vector2(x, z)
  return ([x, y]) => new Vector2(x, y)
}

function surfaceCoordinate(point: Point3, origin: Point3, axis: Point3): number {
  const lengthSquared = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2
  if (lengthSquared <= 1e-12) return 0
  return (
    ((point[0] - origin[0]) * axis[0] +
      (point[1] - origin[1]) * axis[1] +
      (point[2] - origin[2]) * axis[2]) /
    lengthSquared
  )
}

/** Tessellate a Body node’s faces into a Three.js group (kernel-valid topology only). */
export function buildBodyGeometry(body: BodyNode): Group {
  const group = new Group()
  if (!validateBodyTopology(body).valid) return group

  const material = new MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
  })

  for (const face of body.faces) {
    const contour = getBodyLoopBoundaryPoints(body, face.outerLoopId).map(
      (point) => [...point] as Point3,
    )
    if (contour.length < 3) continue
    const holes = face.innerLoopIds.map((loopId) =>
      getBodyLoopBoundaryPoints(body, loopId).map((point) => [...point] as Point3),
    )
    if (holes.some((hole) => hole.length < 3)) continue
    const project = faceProjection(contour)
    const triangles = ShapeUtils.triangulateShape(
      contour.map(project),
      holes.map((hole) => hole.map(project)),
    )
    const vertices = [contour, ...holes].flat()
    const indices = triangles.flat()
    const uvs = vertices.flatMap((point) => [
      surfaceCoordinate(point, face.surface.uvOrigin, face.surface.uvU),
      surfaceCoordinate(point, face.surface.uvOrigin, face.surface.uvV),
    ])
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices.flat(), 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, material)
    mesh.name = `face:${face.id}`
    mesh.userData = { bodyId: body.id, faceId: face.id, pascalNodeId: body.id }
    group.add(mesh)
  }
  return group
}
