/**
 * Build THREE meshes for an eco tree variant.
 * ez-tree touches `document` at import — only load it in browser / when polyfilled.
 * Node / SSR falls back to a cheap cone+sphere stand-in so export tests stay green.
 */
import * as THREE from 'three'
import type { EcoTreeVariantId } from './eco-trees-store'
import { ECO_TREE_VARIANTS } from './eco-trees-store'

export type EcoTreeMeshBundle = {
  group: THREE.Group
  /** Shared bark geometry (clone for instances). */
  barkGeometry: THREE.BufferGeometry
  /** Shared leaf geometry (clone for instances). */
  leafGeometry: THREE.BufferGeometry
  barkMaterial: THREE.Material
  leafMaterial: THREE.Material
}

const geometryCache = new Map<string, EcoTreeMeshBundle>()

function cacheKey(variant: EcoTreeVariantId, seed: number): string {
  return `${variant}:${seed}`
}

function standInBundle(variant: EcoTreeVariantId, seed: number): EcoTreeMeshBundle {
  const meta = ECO_TREE_VARIANTS[variant]
  const h = meta.species === 'oak' ? 8 + (seed % 5) : 3 + (seed % 3)
  const r = meta.species === 'oak' ? 0.35 : 0.2
  const canopyR = meta.species === 'oak' ? 2.5 : 1.4

  const barkGeometry = new THREE.CylinderGeometry(r * 0.6, r, h, 8, 1)
  barkGeometry.translate(0, h / 2, 0)
  const leafGeometry = new THREE.SphereGeometry(canopyR, 10, 8)
  leafGeometry.translate(0, h * 0.85, 0)

  const barkMaterial = new THREE.MeshStandardMaterial({
    color: meta.species === 'oak' ? 0x5c4033 : 0x4a3728,
    roughness: 0.9,
  })
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: meta.species === 'oak' ? 0x3d6b2f : 0x6b7c3a,
    roughness: 0.75,
  })

  const group = new THREE.Group()
  group.name = `eco-tree:${variant}`
  group.add(new THREE.Mesh(barkGeometry, barkMaterial))
  group.add(new THREE.Mesh(leafGeometry, leafMaterial))
  return { group, barkGeometry, leafGeometry, barkMaterial, leafMaterial }
}

async function ezTreeBundle(variant: EcoTreeVariantId, seed: number): Promise<EcoTreeMeshBundle> {
  const { Tree } = await import('@dgreenheck/ez-tree')
  const tree = new Tree()
  tree.loadPreset(ECO_TREE_VARIANTS[variant].preset)
  tree.options.seed = seed
  tree.generate()

  const barkMesh = tree.branchesMesh
  const leafMesh = tree.leavesMesh
  if (!barkMesh?.geometry || !leafMesh?.geometry) {
    return standInBundle(variant, seed)
  }

  const barkGeometry = barkMesh.geometry.clone()
  const leafGeometry = leafMesh.geometry.clone()
  const barkMaterial = Array.isArray(barkMesh.material)
    ? barkMesh.material[0]!.clone()
    : barkMesh.material.clone()
  const leafMaterial = Array.isArray(leafMesh.material)
    ? leafMesh.material[0]!.clone()
    : leafMesh.material.clone()

  const group = new THREE.Group()
  group.name = `eco-tree:${variant}`
  group.add(new THREE.Mesh(barkGeometry, barkMaterial))
  group.add(new THREE.Mesh(leafGeometry, leafMaterial))

  // Dispose the generator instance meshes we cloned from.
  tree.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry?.dispose?.()
    }
  })

  return { group, barkGeometry, leafGeometry, barkMaterial, leafMaterial }
}

/** Get (cached) mesh bundle for a variant+seed. */
export async function getEcoTreeMeshBundle(
  variant: EcoTreeVariantId,
  seed: number,
): Promise<EcoTreeMeshBundle> {
  const key = cacheKey(variant, seed)
  const hit = geometryCache.get(key)
  if (hit) return hit

  const bundle =
    typeof document !== 'undefined'
      ? await ezTreeBundle(variant, seed)
      : standInBundle(variant, seed)

  geometryCache.set(key, bundle)
  return bundle
}

/**
 * Build one exportable Object3D for a placement (unique clone, not shared cache meshes).
 */
export async function buildEcoTreeObject3D(options: {
  variant: EcoTreeVariantId
  seed: number
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  id: string
}): Promise<THREE.Object3D> {
  const bundle = await getEcoTreeMeshBundle(options.variant, options.seed)
  const group = new THREE.Group()
  group.name = `tree:${options.id}`
  group.userData.ecoTreeVariant = options.variant
  group.userData.ecoTreeSeed = options.seed

  const bark = new THREE.Mesh(bundle.barkGeometry.clone(), bundle.barkMaterial.clone())
  bark.name = 'bark'
  const leaves = new THREE.Mesh(bundle.leafGeometry.clone(), bundle.leafMaterial.clone())
  leaves.name = 'leaves'
  group.add(bark, leaves)
  group.position.set(...options.position)
  group.rotation.set(...options.rotation)
  group.scale.set(...options.scale)
  return group
}

/** Clear geometry cache (tests). */
export function clearEcoTreeGeometryCache(): void {
  for (const bundle of geometryCache.values()) {
    bundle.barkGeometry.dispose()
    bundle.leafGeometry.dispose()
    ;(bundle.barkMaterial as THREE.Material).dispose?.()
    ;(bundle.leafMaterial as THREE.Material).dispose?.()
  }
  geometryCache.clear()
}
