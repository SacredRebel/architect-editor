import { isCurvedWall, sampleWallCenterline } from '@pascal-app/core'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { EcoWalk } from './bridge-types'
import { base64ToBytes, getEcoAssetsState } from './eco-assets-store'
import { buildShellObject3D } from './eco-shell-geometry'
import { getEcoShellsState } from './eco-shell-store'
import { buildEcoWalk, ECO_WALL_SAMPLE_STEP_M } from './export-walk'
import { levelWorldY } from './level-y'

type NodeMap = Record<string, Record<string, unknown> | undefined>

export type EcoGlbExportResult = {
  buffer: ArrayBuffer
  walk: EcoWalk
  originLL: [number, number]
}

/** Ensure FileReader exists (Bun / Node lack it; GLTFExporter needs it). */
export function ensureFileReaderPolyfill(): void {
  if (typeof globalThis.FileReader !== 'undefined')
    return // Minimal polyfill matching make-fixture.mjs
  ;(globalThis as unknown as { FileReader: unknown }).FileReader = class FileReader {
    result: ArrayBuffer | null = null
    onloadend: ((ev: { target: FileReader }) => void) | null = null
    onerror: ((err: unknown) => void) | null = null
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then(
        (buf) => {
          this.result = buf
          this.onloadend?.({ target: this })
        },
        (err) => this.onerror?.(err),
      )
    }
  }
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
  const mat = new THREE.MeshStandardMaterial({ color: 0xc4b5a0 })

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
    return group.children.length ? group : null
  }

  const [x0, z0] = wall.start
  const [x1, z1] = wall.end
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 1e-4) return null
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, len), mat)
  mesh.name = `wall:${wall.id}`
  mesh.position.set((x0 + x1) / 2, levelY + height / 2, (z0 + z1) / 2)
  mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0)
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
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b9a7d })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = `slab:${slab.id}`
  mesh.position.set((minX + maxX) / 2, levelY + elevation - thickness / 2, (minZ + maxZ) / 2)
  return mesh
}

/**
 * Build a design-only group in editor frame (exclude terrain/guides/ghost).
 * Walls + slabs as boxes; eco shells; optional placed eco assets.
 * Shells contribute geometry only — never walk solids.
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
    group.add(buildShellObject3D(shell))
  }

  return group
}

async function addPlacedAssets(group: THREE.Group): Promise<void> {
  if (typeof window === 'undefined') return
  const { assets, placements } = getEcoAssetsState()
  const byId = new Map(assets.map((a) => [a.id, a]))
  const loader = new GLTFLoader()

  for (const p of placements) {
    const asset = byId.get(p.assetId)
    if (!asset) continue
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

/**
 * Export design GLB in world frame (x east, y up, z south) with walk extras
 * on both the glTF scene and root node.
 */
export async function exportEcoGlb(options: {
  nodes: NodeMap
  originLL?: [number, number]
  includePlacedAssets?: boolean
}): Promise<EcoGlbExportResult> {
  ensureFileReaderPolyfill()

  const walk = buildEcoWalk(options.nodes)
  const design = buildDesignGroup(options.nodes)
  if (options.includePlacedAssets !== false) {
    await addPlacedAssets(design)
  }

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
        // Force extras onto the glTF JSON before binary pack via onBeforeParse isn't available;
        // stamp via a custom plugin-less path: mutate after parse by re-export with embed.
      },
    )
  })

  // GLTFExporter puts Object3D.userData into node extras; scene.userData → scene extras.
  // Re-parse and patch extras.walk into both scene + root node if missing.
  const patched = await stampWalkExtras(result, walk)

  return {
    buffer: patched,
    walk,
    originLL: options.originLL ?? [0, 0],
  }
}

/** Patch glTF JSON chunk inside a GLB so scene + nodes[0] carry extras.walk. */
export async function stampWalkExtras(glb: ArrayBuffer, walk: EcoWalk): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(glb)
  const dataView = new DataView(glb)
  if (dataView.getUint32(0, true) !== 0x46546c67) {
    throw new Error('Not a GLB')
  }
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
