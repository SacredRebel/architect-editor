import * as THREE from 'three'
import { sampleCatenary, tessellateMinimalPatch, type EcoCatenary, type EcoMinimalPatch } from './eco-catenary'
import { tessellateLoft, type EcoLoft } from './eco-loft'
import { tessellateVault, type EcoVault } from './eco-vault'

function meshFromArrays(
  name: string,
  positions: number[],
  indices: number[],
  material: THREE.Material,
  ecoMaterialId?: string,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = name
  if (ecoMaterialId) mesh.userData.ecoMaterialId = ecoMaterialId
  return mesh
}

function addThicknessBottom(
  group: THREE.Group,
  positions: number[],
  indices: number[],
  thickness: number,
  material: THREE.Material,
  name: string,
  ecoMaterialId?: string,
) {
  const bot = positions.slice()
  for (let i = 1; i < bot.length; i += 3) bot[i]! -= thickness
  const botIndex = indices.slice().reverse()
  group.add(meshFromArrays(name, bot, botIndex, material, ecoMaterialId))
}

function addRibTubes(
  group: THREE.Group,
  paths: [number, number, number][][],
  material: THREE.Material,
  ecoMaterialId?: string,
) {
  for (let p = 0; p < paths.length; p++) {
    const path = paths[p]!
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!
      const b = path[i + 1]!
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const dz = b[2] - a[2]
      const len = Math.hypot(dx, dy, dz)
      if (len < 1e-4) continue
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), material)
      rib.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
      rib.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len),
      )
      rib.name = `eco-rib:${p}:${i}`
      if (ecoMaterialId) rib.userData.ecoMaterialId = ecoMaterialId
      group.add(rib)
    }
  }
}

export function buildLoftObject3D(
  loft: EcoLoft,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-loft:${loft.id}`
  const mat =
    material ??
    new THREE.MeshStandardMaterial({
      color: 0x8a9a7b,
      side: THREE.DoubleSide,
      roughness: 0.8,
    })
  const { positions, indices } = tessellateLoft(loft)
  group.add(meshFromArrays(`eco-loft-top:${loft.id}`, positions, indices, mat, ecoMaterialId))
  addThicknessBottom(
    group,
    positions,
    indices,
    loft.thickness,
    mat,
    `eco-loft-bot:${loft.id}`,
    ecoMaterialId,
  )
  return group
}

export function buildVaultObject3D(
  vault: EcoVault,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-vault:${vault.id}`
  const mat =
    material ??
    new THREE.MeshStandardMaterial({
      color: 0x9a8b7a,
      side: THREE.DoubleSide,
      roughness: 0.75,
    })
  const { positions, indices, ribPaths } = tessellateVault(vault)
  group.add(meshFromArrays(`eco-vault-top:${vault.id}`, positions, indices, mat, ecoMaterialId))
  addThicknessBottom(
    group,
    positions,
    indices,
    vault.thickness,
    mat,
    `eco-vault-bot:${vault.id}`,
    ecoMaterialId,
  )
  if (ribPaths.length) addRibTubes(group, ribPaths, mat, ecoMaterialId)
  return group
}

export function buildCatenaryObject3D(
  cat: EcoCatenary,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-catenary:${cat.id}`
  const mat =
    material ??
    new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.7 })
  const pts = sampleCatenary(cat)
  addRibTubes(group, [pts], mat, ecoMaterialId)
  // Also a thin ribbon loft for visibility
  const positions: number[] = []
  const indices: number[] = []
  const half = cat.thickness / 2
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const next = pts[Math.min(i + 1, pts.length - 1)]!
    const dx = next[0] - p[0]
    const dz = next[2] - p[2]
    const L = Math.hypot(dx, dz) || 1
    const nx = -dz / L
    const nz = dx / L
    positions.push(p[0] + nx * half, p[1], p[2] + nz * half)
    positions.push(p[0] - nx * half, p[1], p[2] - nz * half)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  group.add(meshFromArrays(`eco-cat-ribbon:${cat.id}`, positions, indices, mat, ecoMaterialId))
  return group
}

export function buildMinimalObject3D(
  patch: EcoMinimalPatch,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-minimal:${patch.id}`
  const mat =
    material ??
    new THREE.MeshStandardMaterial({
      color: 0x7a8a9a,
      side: THREE.DoubleSide,
      roughness: 0.6,
    })
  const { positions, indices } = tessellateMinimalPatch(patch)
  group.add(meshFromArrays(`eco-minimal-top:${patch.id}`, positions, indices, mat, ecoMaterialId))
  addThicknessBottom(
    group,
    positions,
    indices,
    patch.thickness,
    mat,
    `eco-minimal-bot:${patch.id}`,
    ecoMaterialId,
  )
  return group
}
