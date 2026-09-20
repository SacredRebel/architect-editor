/**
 * Vaults, domes, and gridshell rib paths — parametric, tessellated on demand.
 */

import type { Vec2, Vec3 } from './eco-loft'

export type EcoVaultKind = 'barrel' | 'groin' | 'geodesic' | 'dome'

export type EcoVault = {
  id: string
  name: string
  kind: EcoVaultKind
  /** Plan centre [x, z]. */
  center: Vec2
  /** Half-length along local X (barrel length / dome radius). */
  radiusX: number
  /** Half-width along local Z. */
  radiusZ: number
  /** Rise above base (m). */
  rise: number
  baseHeight: number
  thickness: number
  /** Rib count for gridshell overlay (0 = surface only). */
  ribCount: number
  /** Tessellation density. */
  segmentsU: number
  segmentsV: number
}

export type VaultMeshData = {
  positions: number[]
  indices: number[]
  /** Isocurve polylines for ribs (world xyz). */
  ribPaths: Vec3[][]
}

function barrelHeight(u: number, v: number, vault: EcoVault): number {
  // u along length [-1,1], v across [-1,1]; semicircle across v
  const half = Math.sqrt(Math.max(0, 1 - v * v))
  return vault.baseHeight + vault.rise * half
}

function groinHeight(u: number, v: number, vault: EcoVault): number {
  const a = Math.sqrt(Math.max(0, 1 - u * u))
  const b = Math.sqrt(Math.max(0, 1 - v * v))
  return vault.baseHeight + vault.rise * Math.min(a, b)
}

function domeHeight(u: number, v: number, vault: EcoVault): number {
  const r2 = u * u + v * v
  if (r2 > 1) return vault.baseHeight
  return vault.baseHeight + vault.rise * Math.sqrt(Math.max(0, 1 - r2))
}

function heightAt(vault: EcoVault, u: number, v: number): number {
  switch (vault.kind) {
    case 'barrel':
      return barrelHeight(u, v, vault)
    case 'groin':
      return groinHeight(u, v, vault)
    case 'geodesic':
    case 'dome':
      return domeHeight(u, v, vault)
    default:
      return vault.baseHeight
  }
}

export function tessellateVault(vault: EcoVault): VaultMeshData {
  const nu = Math.max(4, vault.segmentsU)
  const nv = Math.max(4, vault.segmentsV)
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = (i / nu) * 2 - 1
      const v = (j / nv) * 2 - 1
      const x = vault.center[0] + u * vault.radiusX
      const z = vault.center[1] + v * vault.radiusZ
      const y = heightAt(vault, u, v)
      positions.push(x, y, z)
    }
  }

  const cols = nv + 1
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * cols + j
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
    }
  }

  const ribPaths: Vec3[][] = []
  if (vault.ribCount > 0) {
    for (let r = 1; r < vault.ribCount; r++) {
      const u = (r / vault.ribCount) * 2 - 1
      const path: Vec3[] = []
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1
        path.push([
          vault.center[0] + u * vault.radiusX,
          heightAt(vault, u, v),
          vault.center[1] + v * vault.radiusZ,
        ])
      }
      ribPaths.push(path)
    }
    for (let r = 1; r < vault.ribCount; r++) {
      const v = (r / vault.ribCount) * 2 - 1
      const path: Vec3[] = []
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu) * 2 - 1
        path.push([
          vault.center[0] + u * vault.radiusX,
          heightAt(vault, u, v),
          vault.center[1] + v * vault.radiusZ,
        ])
      }
      ribPaths.push(path)
    }
  }

  return { positions, indices, ribPaths }
}

export function makeDefaultBarrelVault(id = `vault-${Date.now()}`): EcoVault {
  return {
    id,
    name: 'Barrel vault',
    kind: 'barrel',
    center: [0, 0],
    radiusX: 8,
    radiusZ: 4,
    rise: 3.5,
    baseHeight: 3,
    thickness: 0.15,
    ribCount: 5,
    segmentsU: 24,
    segmentsV: 16,
  }
}
