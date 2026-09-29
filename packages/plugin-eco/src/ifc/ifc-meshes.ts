/**
 * The rendered geometry of one element, as IFC triangles. Walks an Object3D's
 * visible meshes (instanced ones included), stopping at objects that belong to
 * other elements, and returns triangles in IFC coordinates of a given frame
 * (the element's storey), grouped by colour.
 *
 * Skipped, as the editor's own exporters skip them: hidden subtrees, invisible
 * hit boxes (material.visible false), colour-write-off materials, cutouts,
 * collision meshes, and anything tagged `userData.pascalExport === 'strip'`
 * (batch meshes). Lines and points are not meshes, so they never enter.
 */
import { type BufferGeometry, Color, type Material, Matrix4, type Object3D, Vector3 } from 'three'
import { toIfc } from './ifc-write'

export type MeshPart = {
  positions: number[]
  indices: number[]
  color: [number, number, number]
  opacity: number
}

type ColoredMaterial = Material & { color?: Color; colorWrite?: boolean }

const SKIP_NAMES = new Set(['cutout', 'collision-mesh'])

function skipObject(o: Object3D): boolean {
  if (!o.visible) return true
  if (SKIP_NAMES.has(o.name)) return true
  const data = o.userData as Record<string, unknown> | undefined
  return data?.pascalExport === 'strip' || Boolean(data?.ecoReference)
}

function drawn(material: Material | undefined): material is ColoredMaterial {
  if (!material) return false
  const m = material as ColoredMaterial
  return m.visible !== false && m.colorWrite !== false && !(m.transparent && (m.opacity ?? 1) <= 0.01)
}

/**
 * @param stopAt objects owned by another element: their subtree is skipped.
 * @param worldToFrame Pascal world → the element's frame (e.g. its storey), before the IFC axis swap.
 */
export function collectMeshes(root: Object3D, stopAt: (o: Object3D) => boolean, worldToFrame: Matrix4): MeshPart[] {
  root.updateWorldMatrix(true, true)
  const byColor = new Map<string, MeshPart>()
  const v = new Vector3()
  const toFrame = new Matrix4()
  const instance = new Matrix4()

  const addGeometry = (geometry: BufferGeometry, matrix: Matrix4, material: Material | undefined, start = 0, count = Number.POSITIVE_INFINITY) => {
    const position = geometry.getAttribute('position')
    if (!position || !drawn(material)) return
    const c = material.color instanceof Color ? material.color : new Color(0.8, 0.8, 0.8)
    const color: [number, number, number] = [c.r, c.g, c.b]
    const opacity = material.transparent ? (material.opacity ?? 1) : 1
    const key = `${color.map((x) => x.toFixed(3)).join(',')}|${opacity.toFixed(2)}`
    let part = byColor.get(key)
    if (!part) {
      part = { positions: [], indices: [], color, opacity }
      byColor.set(key, part)
    }
    const target = part
    const index = geometry.getIndex()
    const total = index ? index.count : position.count
    const end = Math.min(total, start + count)
    const remap = new Map<number, number>()
    const vertex = (i: number) => {
      const existing = remap.get(i)
      if (existing !== undefined) return existing
      v.fromBufferAttribute(position, i).applyMatrix4(matrix)
      const [x, y, z] = toIfc([v.x, v.y, v.z])
      const at = target.positions.length / 3
      target.positions.push(x, y, z)
      remap.set(i, at)
      return at
    }
    for (let i = start; i + 2 < end; i += 3) {
      const a = index ? index.getX(i) : i
      const b = index ? index.getX(i + 1) : i + 1
      const c2 = index ? index.getX(i + 2) : i + 2
      target.indices.push(vertex(a), vertex(b), vertex(c2))
    }
  }

  const visit = (o: Object3D, isRoot: boolean) => {
    if (!isRoot && stopAt(o)) return
    if (skipObject(o)) return
    const mesh = o as Object3D & {
      isMesh?: boolean
      isInstancedMesh?: boolean
      geometry?: BufferGeometry
      material?: Material | Material[]
      count?: number
      getMatrixAt?: (i: number, m: Matrix4) => void
    }
    if (mesh.isMesh && mesh.geometry) {
      const geometry = mesh.geometry
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const groups = Array.isArray(mesh.material) && geometry.groups.length > 0 ? geometry.groups : null
      const emit = (matrix: Matrix4) => {
        if (groups) {
          for (const g of groups) addGeometry(geometry, matrix, materials[g.materialIndex ?? 0], g.start, g.count)
        } else {
          addGeometry(geometry, matrix, materials[0])
        }
      }
      if (mesh.isInstancedMesh && mesh.getMatrixAt) {
        for (let i = 0; i < (mesh.count ?? 0); i++) {
          mesh.getMatrixAt(i, instance)
          emit(toFrame.multiplyMatrices(worldToFrame, o.matrixWorld).multiply(instance))
        }
      } else {
        emit(toFrame.multiplyMatrices(worldToFrame, o.matrixWorld))
      }
    }
    for (const child of o.children) visit(child, false)
  }
  visit(root, true)
  return [...byColor.values()].filter((p) => p.indices.length > 0)
}
