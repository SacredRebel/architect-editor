import { isCurvedWall, sampleWallCenterline } from '@pascal-app/core'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { EcoWalk } from './bridge-types'
import { assetRole, base64ToBytes, getEcoAssetsState } from './eco-assets-store'
import {
  createEcoThreeMaterial,
  elementKeyForShell,
  elementKeyForSlab,
  elementKeyForWall,
  type EcoMaterialId,
  resolveEcoMaterialId,
} from './eco-materials'
import { buildShellObject3D } from './eco-shell-geometry'
import { getEcoShellsState } from './eco-shell-store'
import {
  buildCatenaryObject3D,
  buildLoftObject3D,
  buildMinimalObject3D,
  buildVaultObject3D,
} from './eco-organic-geometry'
import { getEcoOrganicState } from './eco-organic-store'
import { buildEcoTreeObject3D } from './eco-tree-mesh'
import { getEcoTreesState } from './eco-trees-store'
import {
  assertHardGlbAudit,
  auditGlb,
  ECO_GLB_MAX_BYTES,
  formatExportSizeLabel,
} from './glb-audit'
import { optimiseGlb, type OptimiseProfile } from './glb-optimise'
import { buildEcoWalk, ECO_WALL_SAMPLE_STEP_M } from './export-walk'
import { levelWorldY } from './level-y'
import { ensureGltfExportPolyfills } from './eco-gltf-polyfill'

type NodeMap = Record<string, Record<string, unknown> | undefined>

export type EcoGlbExportResult = {
  buffer: ArrayBuffer
  walk: EcoWalk
  originLL: [number, number]
  /** Before→after size string for the UI (`1.9 MB → 280 KB`). */
  sizeLabel: string
  /** Present after H1 optimise + hard audit. */
  optimise: {
    beforeBytes: number
    afterBytes: number
    profile: OptimiseProfile
  }
}

/** Ensure FileReader + OffscreenCanvas exist (Bun / Node; GLTFExporter needs both). */
export function ensureFileReaderPolyfill(): void {
  ensureGltfExportPolyfills()
}

function tagMesh(mesh: THREE.Object3D, materialId: EcoMaterialId): void {
  mesh.userData.ecoMaterialId = materialId
  mesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.userData.ecoMaterialId = materialId
    }
  })
}

function wallMesh(
  nodes: NodeMap,
  wall: {
    id: string
    parentId?: string | null
    start: [number, number]
    end: [number, number]
    thickness?: number
    height?: number
    curveOffset?: number
  },
): THREE.Object3D | null {
  const thickness = wall.thickness ?? 0.1
  const height = wall.height ?? 2.7
  const levelY = wall.parentId ? levelWorldY(nodes as never, wall.parentId) : 0
  const materialId = resolveEcoMaterialId(elementKeyForWall(wall.id), 'wall')
  const mat = createEcoThreeMaterial(materialId)

  if (isCurvedWall(wall)) {
    const chord = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    const segments = Math.max(1, Math.ceil(chord / ECO_WALL_SAMPLE_STEP_M))
    const pts = sampleWallCenterline(wall, segments)
    const group = new THREE.Group()
    group.name = `wall:${wall.id}`
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const dx = b.x - a.x
      const dz = b.y - a.y
      const len = Math.hypot(dx, dz)
      if (len < 1e-4) continue
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, len), mat)
      mesh.position.set((a.x + b.x) / 2, levelY + height / 2, (a.y + b.y) / 2)
      mesh.rotation.y = Math.atan2(dx, dz)
      group.add(mesh)
    }
    if (!group.children.length) return null
    tagMesh(group, materialId)
    return group
  }

  const [x0, z0] = wall.start
  const [x1, z1] = wall.end
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 1e-4) return null
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, len), mat)
  mesh.name = `wall:${wall.id}`
  mesh.position.set((x0 + x1) / 2, levelY + height / 2, (z0 + z1) / 2)
  mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0)
  tagMesh(mesh, materialId)
  return mesh
}

function slabMesh(
  nodes: NodeMap,
  slab: {
    id: string
    parentId?: string | null
    polygon: [number, number][]
    elevation?: number
    thickness?: number
  },
): THREE.Mesh | null {
  if (slab.polygon.length < 3) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of slab.polygon) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const levelY = slab.parentId ? levelWorldY(nodes as never, slab.parentId) : 0
  const elevation = slab.elevation ?? 0.05
  const thickness = Math.max(slab.thickness ?? 0.05, 0.05)
  const w = Math.max(maxX - minX, 0.1)
  const d = Math.max(maxZ - minZ, 0.1)
  const geom = new THREE.BoxGeometry(w, thickness, d)
  const materialId = resolveEcoMaterialId(elementKeyForSlab(slab.id), 'slab')
  const mat = createEcoThreeMaterial(materialId)
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = `slab:${slab.id}`
  mesh.position.set((minX + maxX) / 2, levelY + elevation - thickness / 2, (minZ + maxZ) / 2)
  tagMesh(mesh, materialId)
  return mesh
}

/** Planar XZ UVs in metres so shell (no UV) and box (UV) merge, and normal maps tile. */
function ensurePlanarWorldUv(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position
  if (!pos) return
  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = pos.getX(i)
    uvs[i * 2 + 1] = pos.getZ(i)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.deleteAttribute('uv1')
  geo.deleteAttribute('uv2')
  geo.deleteAttribute('uv3')
}

/**
 * Collapse tagged design meshes into one Mesh per Eco material id.
 * Keeps the GLB small the way the massing script does.
 */
export function consolidateByEcoMaterial(source: THREE.Group): THREE.Group {
  source.updateMatrixWorld(true)
  const buckets = new Map<EcoMaterialId, THREE.BufferGeometry[]>()

  source.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const id = mesh.userData.ecoMaterialId as EcoMaterialId | undefined
    if (!id) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    ensurePlanarWorldUv(geo)
    const list = buckets.get(id) ?? []
    list.push(geo)
    buckets.set(id, list)
  })

  const out = new THREE.Group()
  out.name = source.name
  for (const [id, geos] of buckets) {
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (!merged) {
      throw new Error(
        `eco:export mergeGeometries failed for material ${id} (${geos.length} parts)`,
      )
    }
    const mat = createEcoThreeMaterial(id, { doubleSide: id === 'living-roof' || id === 'glass' })
    if (mat.normalMap) {
      mat.normalMap.repeat.set(0.35, 0.35)
      mat.normalMap.needsUpdate = true
    }
    const mesh = new THREE.Mesh(merged, mat)
    mesh.name = `mat:${id}`
    mesh.userData.ecoMaterialId = id
    out.add(mesh)
  }
  return out
}

/**
 * Build a design-only group in editor frame (exclude terrain/guides/ghost).
 * Walls + slabs as boxes; eco shells; optional placed eco assets.
 * Shells contribute geometry only — never walk solids.
 * Meshes are tagged with ecoMaterialId; call consolidateByEcoMaterial before export.
 */
export function buildDesignGroup(nodes: NodeMap): THREE.Group {
  const group = new THREE.Group()
  group.name = 'eco-design'

  for (const node of Object.values(nodes)) {
    if (!node) continue
    if (node.type === 'wall' && Array.isArray(node.start) && Array.isArray(node.end)) {
      const mesh = wallMesh(nodes, node as never)
      if (mesh) group.add(mesh)
    }
    if (node.type === 'slab' && Array.isArray(node.polygon)) {
      const mesh = slabMesh(nodes, node as never)
      if (mesh) group.add(mesh)
    }
  }

  for (const shell of getEcoShellsState().shells) {
    const materialId = resolveEcoMaterialId(elementKeyForShell(shell.id), 'shell')
    const mat = createEcoThreeMaterial(materialId, { doubleSide: true })
    group.add(buildShellObject3D(shell, mat, materialId))
  }

  const organic = getEcoOrganicState()
  for (const loft of organic.lofts) {
    const materialId = resolveEcoMaterialId(`loft:${loft.id}`, 'shell')
    const mat = createEcoThreeMaterial(materialId, { doubleSide: true })
    group.add(buildLoftObject3D(loft, mat, materialId))
  }
  for (const vault of organic.vaults) {
    const materialId = resolveEcoMaterialId(`vault:${vault.id}`, 'shell')
    const mat = createEcoThreeMaterial(materialId, { doubleSide: true })
    group.add(buildVaultObject3D(vault, mat, materialId))
  }
  for (const cat of organic.catenaries) {
    const materialId = resolveEcoMaterialId(`cat:${cat.id}`, 'shell')
    const mat = createEcoThreeMaterial(materialId)
    group.add(buildCatenaryObject3D(cat, mat, materialId))
  }
  for (const patch of organic.minimal) {
    const materialId = resolveEcoMaterialId(`min:${patch.id}`, 'shell')
    const mat = createEcoThreeMaterial(materialId, { doubleSide: true })
    group.add(buildMinimalObject3D(patch, mat, materialId))
  }

  return group
}

async function addPlacedAssets(group: THREE.Group): Promise<void> {
  if (typeof window === 'undefined') return
  const { assets, placements } = getEcoAssetsState()
  const byId = new Map(assets.map((a) => [a.id, a]))
  const loader = new GLTFLoader()

  for (const p of placements) {
    // H14 massing refs are tracing aids only — never enter walk export.
    if (p.excludeFromWalkExport) continue
    const asset = byId.get(p.assetId)
    if (!asset) continue
    if (assetRole(asset) === 'massing') continue
    try {
      const bytes = base64ToBytes(asset.bytesBase64)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const gltf = await loader.parseAsync(copy.buffer, '')
      const root = gltf.scene.clone(true)
      root.name = `asset:${p.id}`
      root.position.set(...p.position)
      root.rotation.set(...p.rotation)
      root.scale.set(...p.scale)
      group.add(root)
    } catch {
      // skip broken asset
    }
  }
}

/** True when a placement must be omitted from walk / eco:glb export. */
export function isExcludedFromWalkExport(
  placement: { excludeFromWalkExport?: boolean; assetId: string },
  asset?: { role?: string } | null,
): boolean {
  if (placement.excludeFromWalkExport) return true
  if (asset && assetRole(asset as { role?: 'prop' | 'massing' }) === 'massing') return true
  return false
}

async function addEcoTrees(group: THREE.Group): Promise<void> {
  for (const t of getEcoTreesState().trees) {
    try {
      group.add(await buildEcoTreeObject3D(t))
    } catch {
      // skip broken tree
    }
  }
}

/**
 * Export design GLB in world frame (x east, y up, z south) with walk extras
 * on both the glTF scene and root node.
 */
export async function exportEcoGlb(options: {
  nodes: NodeMap
  originLL?: [number, number]
  includePlacedAssets?: boolean
  /**
   * Default `compat` — sparse parametric exports should fit without meshopt.
   * `web` adds meshopt as optional headroom (world can decode it as of
   * spatial-map MeshoptDecoder wiring). Prefer fixing geometry over switching.
   */
  optimiseProfile?: OptimiseProfile
  /** Soften size gate for tiny test houses (default 500 KiB). */
  maxBytes?: number
}): Promise<EcoGlbExportResult> {
  ensureFileReaderPolyfill()

  const walk = buildEcoWalk(options.nodes)
  const raw = buildDesignGroup(options.nodes)
  const design = consolidateByEcoMaterial(raw)
  if (options.includePlacedAssets !== false) {
    await addPlacedAssets(design)
  }
  await addEcoTrees(design)

  // Editor +z north → world +z south
  design.scale.z = -1
  design.updateMatrixWorld(true)

  const scene = new THREE.Scene()
  scene.name = 'eco-export'
  scene.add(design)
  ;(scene.userData as { extras?: unknown }).extras = { walk }
  ;(design.userData as { extras?: unknown }).extras = { walk }

  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) resolve(gltf)
        else reject(new Error('Expected binary GLB ArrayBuffer'))
      },
      (err) => reject(err),
      {
        binary: true,
      },
    )
  })

  // Optimise first (gltf-transform), then stamp walk extras so they survive.
  const profile = options.optimiseProfile ?? 'compat'
  const optimised = await optimiseGlb(result, profile)
  const stamped = await stampWalkExtras(optimised.buffer, walk)
  const report = await auditGlb(stamped)
  assertHardGlbAudit(report, { maxBytes: options.maxBytes ?? ECO_GLB_MAX_BYTES })

  const beforeBytes = optimised.beforeBytes
  const afterBytes = stamped.byteLength
  return {
    buffer: stamped,
    walk,
    originLL: options.originLL ?? [0, 0],
    sizeLabel: formatExportSizeLabel(beforeBytes, afterBytes),
    optimise: {
      beforeBytes,
      afterBytes,
      profile,
    },
  }
}

/** Patch glTF JSON chunk inside a GLB so scene + nodes[0] carry extras.walk. */
export async function stampWalkExtras(glb: ArrayBuffer, walk: EcoWalk): Promise<ArrayBuffer> {
  const dataView = new DataView(glb)
  if (dataView.getUint32(0, true) !== 0x46546c67) {
    throw new Error('Not a GLB')
  }
  const totalFromHeader = dataView.getUint32(8, true)
  const bytes = new Uint8Array(glb, 0, Math.min(totalFromHeader, glb.byteLength))
  // header 12 + chunk0 length + chunk0 type
  const jsonChunkLen = dataView.getUint32(12, true)
  const jsonChunkType = dataView.getUint32(16, true)
  if (jsonChunkType !== 0x4e4f534a) throw new Error('GLB missing JSON chunk')
  const jsonStart = 20
  const jsonBytes = bytes.subarray(jsonStart, jsonStart + jsonChunkLen)
  // trim padding nulls
  let end = jsonBytes.length
  while (end > 0 && jsonBytes[end - 1] === 0) end--
  const json = JSON.parse(new TextDecoder().decode(jsonBytes.subarray(0, end))) as {
    scenes?: { extras?: { walk?: EcoWalk } }[]
    nodes?: { extras?: { walk?: EcoWalk } }[]
    extras?: { walk?: EcoWalk }
  }
  if (!json.scenes?.[0]) throw new Error('GLB has no scenes')
  json.scenes[0].extras = { ...(json.scenes[0].extras ?? {}), walk }
  if (json.nodes?.[0]) {
    json.nodes[0].extras = { ...(json.nodes[0].extras ?? {}), walk }
  }
  json.extras = { ...(json.extras ?? {}), walk }

  const jsonStr = JSON.stringify(json)
  const jsonAligned = new TextEncoder().encode(jsonStr)
  const pad = (4 - (jsonAligned.length % 4)) % 4
  const jsonPadded = new Uint8Array(jsonAligned.length + pad)
  jsonPadded.set(jsonAligned)
  // glTF JSON chunk MUST be padded with spaces (0x20), not nulls.
  for (let i = 0; i < pad; i++) jsonPadded[jsonAligned.length + i] = 0x20

  const binChunkStart = jsonStart + jsonChunkLen
  const rest = bytes.subarray(binChunkStart)
  const totalLen = 12 + 8 + jsonPadded.length + rest.length
  const out = new ArrayBuffer(totalLen)
  const outBytes = new Uint8Array(out)
  const outView = new DataView(out)
  outView.setUint32(0, 0x46546c67, true) // glTF
  outView.setUint32(4, 2, true)
  outView.setUint32(8, totalLen, true)
  outView.setUint32(12, jsonPadded.length, true)
  outView.setUint32(16, 0x4e4f534a, true) // JSON
  outBytes.set(jsonPadded, 20)
  outBytes.set(rest, 20 + jsonPadded.length)
  return out
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!)
  return btoa(binary)
}

export function downloadBytes(filename: string, data: ArrayBuffer | string, mime: string): void {
  if (typeof document === 'undefined') return
  const blob =
    typeof data === 'string' ? new Blob([data], { type: mime }) : new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
