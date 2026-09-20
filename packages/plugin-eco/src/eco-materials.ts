/** Eco material palette — full PBR knobs for viewport + glTF export (one mesh per material). */

import * as THREE from 'three'

export type EcoMaterialId =
  | 'stone'
  | 'river-stone'
  | 'timber'
  | 'board-batten'
  | 'glass'
  | 'stucco'
  | 'concrete'
  | 'living-roof'
  | 'standing-seam'
  | 'canvas'
  | 'metal'

export type EcoMaterialDef = {
  id: EcoMaterialId
  name: string
  color: string
  roughness: number
  metalness: number
  opacity: number
  /** Tangent-space normal strength 0–1 (procedural 32² map). */
  normalStrength: number
  /** Physical transmission (glass). Exported as MeshPhysicalMaterial → BLEND. */
  transmission?: number
  ior?: number
  thickness?: number
}

export const ECO_MATERIALS: readonly EcoMaterialDef[] = [
  {
    id: 'stone',
    name: 'Stone',
    color: '#8a8680',
    roughness: 0.92,
    metalness: 0.02,
    opacity: 1,
    normalStrength: 0.55,
  },
  {
    id: 'river-stone',
    name: 'River stone',
    color: '#6e7a78',
    roughness: 0.78,
    metalness: 0.04,
    opacity: 1,
    normalStrength: 0.7,
  },
  {
    id: 'timber',
    name: 'Timber',
    color: '#a67c52',
    roughness: 0.7,
    metalness: 0.0,
    opacity: 1,
    normalStrength: 0.4,
  },
  {
    id: 'board-batten',
    name: 'Board and batten',
    color: '#c4b49a',
    roughness: 0.82,
    metalness: 0.0,
    opacity: 1,
    normalStrength: 0.65,
  },
  {
    id: 'glass',
    name: 'Glass',
    color: '#e8f4f8',
    roughness: 0.04,
    metalness: 0.0,
    opacity: 0.22,
    normalStrength: 0.05,
    transmission: 0.92,
    ior: 1.5,
    thickness: 0.02,
  },
  {
    id: 'stucco',
    name: 'Stucco',
    color: '#e8e0d4',
    roughness: 0.88,
    metalness: 0.0,
    opacity: 1,
    normalStrength: 0.35,
  },
  {
    id: 'concrete',
    name: 'Concrete',
    color: '#9a9a96',
    roughness: 0.95,
    metalness: 0.0,
    opacity: 1,
    normalStrength: 0.45,
  },
  {
    id: 'living-roof',
    name: 'Living roof',
    color: '#5d7a55',
    roughness: 0.9,
    metalness: 0.0,
    opacity: 1,
    normalStrength: 0.6,
  },
  {
    id: 'standing-seam',
    name: 'Standing-seam metal',
    color: '#5c6b73',
    roughness: 0.28,
    metalness: 0.9,
    opacity: 1,
    normalStrength: 0.5,
  },
  {
    id: 'canvas',
    name: 'Canvas',
    color: '#e6dcc8',
    roughness: 0.95,
    metalness: 0.0,
    opacity: 1,
    normalStrength: 0.3,
  },
  {
    id: 'metal',
    name: 'Metal',
    color: '#8b949e',
    roughness: 0.35,
    metalness: 0.85,
    opacity: 1,
    normalStrength: 0.25,
  },
] as const

export function ecoMaterialById(id: EcoMaterialId): EcoMaterialDef {
  return ECO_MATERIALS.find((m) => m.id === id) ?? ECO_MATERIALS[0]!
}

/** Tiny shared procedural normals — keep GLB under compat budget (no photo textures). */
const normalCache = new Map<string, THREE.DataTexture>()

function hash2(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 982451653) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function makeProceduralNormalMap(id: EcoMaterialId, strength: number): THREE.DataTexture | null {
  if (strength < 0.02) return null
  const key = `${id}:${strength.toFixed(2)}`
  const hit = normalCache.get(key)
  if (hit) return hit

  const size = 32
  const data = new Uint8Array(size * size * 4)
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let dx = 0
      let dy = 0
      if (id === 'board-batten' || id === 'standing-seam' || id === 'timber') {
        // Vertical battens / grain ridges
        const u = (x / size) * (id === 'timber' ? 8 : 6)
        dx = Math.sin(u * Math.PI * 2) * strength
        dy = (hash2(x, y, seed) - 0.5) * strength * 0.25
      } else if (id === 'river-stone' || id === 'stone' || id === 'concrete') {
        dx = (hash2(x, y, seed) - 0.5) * strength * 2
        dy = (hash2(x + 17, y + 9, seed) - 0.5) * strength * 2
      } else if (id === 'living-roof') {
        dx = (hash2(x >> 1, y >> 1, seed) - 0.5) * strength * 1.6
        dy = (hash2(y >> 1, x >> 1, seed + 3) - 0.5) * strength * 1.6
      } else {
        dx = (hash2(x, y, seed) - 0.5) * strength
        dy = (hash2(x, y + 1, seed) - 0.5) * strength
      }
      const nx = dx
      const ny = dy
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  tex.name = `eco-nml:${id}`
  normalCache.set(key, tex)
  return tex
}

/**
 * Viewport / export material. Glass uses MeshPhysicalMaterial with transmission;
 * GLTFExporter maps opacity + transparent → alphaMode BLEND.
 */
export function createEcoThreeMaterial(
  id: EcoMaterialId,
  opts?: { doubleSide?: boolean },
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const def = ecoMaterialById(id)
  const side = opts?.doubleSide ? THREE.DoubleSide : THREE.FrontSide
  const normalMap = makeProceduralNormalMap(id, def.normalStrength)
  // Negative Y matches glTF OpenGL convention for meshes without tangents and
  // avoids GLTFExporter's canvas flip bake when scale.y would be positive.
  const normalScale = new THREE.Vector2(def.normalStrength, -def.normalStrength)

  if (def.transmission && def.transmission > 0) {
    return new THREE.MeshPhysicalMaterial({
      name: def.id,
      color: def.color,
      roughness: def.roughness,
      metalness: def.metalness,
      opacity: def.opacity,
      transparent: true,
      transmission: def.transmission,
      ior: def.ior ?? 1.5,
      thickness: def.thickness ?? 0.02,
      depthWrite: false,
      side,
      ...(normalMap ? { normalMap, normalScale } : {}),
    })
  }
  const transparent = def.opacity < 1
  return new THREE.MeshStandardMaterial({
    name: def.id,
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    opacity: def.opacity,
    transparent,
    depthWrite: !transparent,
    side,
    ...(normalMap ? { normalMap, normalScale } : {}),
  })
}

type Assignments = Record<string, EcoMaterialId>

type MatState = {
  assignments: Assignments
  defaultWall: EcoMaterialId
  defaultSlab: EcoMaterialId
  defaultShell: EcoMaterialId
}

const listeners = new Set<() => void>()

let state: MatState = {
  assignments: {},
  defaultWall: 'stucco',
  defaultSlab: 'concrete',
  defaultShell: 'living-roof',
}

function emit() {
  for (const l of listeners) l()
}

export function getEcoMaterialsState(): MatState {
  return state
}

export function subscribeEcoMaterials(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoMaterialAssignment(elementKey: string, materialId: EcoMaterialId): void {
  state = {
    ...state,
    assignments: { ...state.assignments, [elementKey]: materialId },
  }
  emit()
}

export function setEcoMaterialDefaults(patch: Partial<Omit<MatState, 'assignments'>>): void {
  state = { ...state, ...patch }
  emit()
}

export function resolveEcoMaterialId(
  elementKey: string,
  kind: 'wall' | 'slab' | 'shell',
): EcoMaterialId {
  const assigned = state.assignments[elementKey]
  if (assigned) return assigned
  if (kind === 'wall') return state.defaultWall
  if (kind === 'slab') return state.defaultSlab
  return state.defaultShell
}

export function elementKeyForWall(id: string): string {
  return `wall:${id}`
}
export function elementKeyForSlab(id: string): string {
  return `slab:${id}`
}
export function elementKeyForShell(id: string): string {
  return `shell:${id}`
}

export function resetEcoMaterialsState(): void {
  state = {
    assignments: {},
    defaultWall: 'stucco',
    defaultSlab: 'concrete',
    defaultShell: 'living-roof',
  }
  emit()
}
