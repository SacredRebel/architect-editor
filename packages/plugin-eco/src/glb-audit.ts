/**
 * GLB audit — adapted from pascalorg/skills glb-web-export (MIT).
 * Hard gate for eco exports: failures throw, they do not warn.
 */
import { NodeIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

/** Compat download budget (phone / architects). */
export const ECO_GLB_MAX_BYTES = 500 * 1024
/** Building AABB — any axis below this is likely cm / wrong units. */
export const ECO_GLB_MIN_EXTENT_M = 0.5
/** Building AABB — any axis above this is likely feet-as-metres / wrong scale. */
export const ECO_GLB_MAX_EXTENT_M = 500
/** Texture edge ceiling (powers of two). Prefer small given the 500 KB budget. */
export const ECO_GLB_MAX_TEX_DIM = 512

export type GlbTextureAudit = {
  width: number
  height: number
  powerOfTwo: boolean
}

export type GlbFrameAudit = {
  /** Scale.z on the eco-design (or first scaled) node — must be negative for z-south. */
  designScaleZ: number | null
  /** extras.walk present on scene or root. */
  walkPresent: boolean
  /** Min / max ring z from walk (world frame, z south). */
  walkMinZ: number | null
  walkMaxZ: number | null
  /** Names of solids whose ring zs are all negative (editor-north walls). */
  northWallsNegativeZ: string[]
}

export type GlbAuditReport = {
  bytes: number
  gzipBytes: number
  brotliBytes: number
  worldBounds: {
    min: number[] | null
    max: number[] | null
    sizeMeters: number[] | null
  }
  drawCalls: number
  triangles: number
  textureVramMiB: number
  textures: GlbTextureAudit[]
  frame: GlbFrameAudit
  counts: {
    nodes: number
    meshes: number
    materials: number
    textures: number
    animations: number
    skins: number
  }
  namedNodes: string[]
  extensionsUsed: string[]
  extensionsRequired: string[]
}

export type HardAuditOptions = {
  /** Max raw file bytes (default 500 KiB). */
  maxBytes?: number
  /** Reject any world AABB axis above this (metres). */
  maxExtentM?: number
  /** Reject any world AABB axis below this (metres). */
  minExtentM?: number
  /** Max texture width/height (default 512). */
  maxTexDim?: number
  /** Skip mesh-per-material gate (rare fixtures). */
  skipMeshBudget?: boolean
  /** Skip Y-up / z-south frame gate. */
  skipFrame?: boolean
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

let ioPromise: Promise<NodeIO> | null = null

export async function createGlbIo(): Promise<NodeIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'meshopt.decoder': MeshoptDecoder,
          'meshopt.encoder': MeshoptEncoder,
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
        })
      return io
    })()
  }
  return ioPromise
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) out[j * 4 + i]! += a[k * 4 + i]! * b[j * 4 + k]!
    }
  }
  return out
}

function fromTRS(t: number[], r: number[], s: number[]): number[] {
  const [x, y, z, w] = r
  return [
    (1 - 2 * (y! * y! + z! * z!)) * s[0]!,
    2 * (x! * y! + z! * w!) * s[0]!,
    2 * (x! * z! - y! * w!) * s[0]!,
    0,
    2 * (x! * y! - z! * w!) * s[1]!,
    (1 - 2 * (x! * x! + z! * z!)) * s[1]!,
    2 * (y! * z! + x! * w!) * s[1]!,
    0,
    2 * (x! * z! + y! * w!) * s[2]!,
    2 * (y! * z! - x! * w!) * s[2]!,
    (1 - 2 * (x! * x! + y! * y!)) * s[2]!,
    0,
    t[0]!,
    t[1]!,
    t[2]!,
    1,
  ]
}

function transformPoint(m: number[], p: number[]): number[] {
  return [
    m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
    m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!,
  ]
}

function bytesPerTexel(
  mimeType: string,
  imageBytes: number,
  width: number,
  height: number,
): number {
  if (mimeType !== 'image/ktx2') return 4
  return imageBytes / (width * height) > 0.75 ? 1 : 0.5
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

type WalkExtras = {
  floors?: { name?: string; ring?: [number, number][]; top?: number }[]
  solids?: { name?: string; ring?: [number, number][]; base?: number; top?: number }[]
}

function readWalkExtras(extras: unknown): WalkExtras | null {
  if (!extras || typeof extras !== 'object') return null
  const walk = (extras as { walk?: unknown }).walk
  if (!walk || typeof walk !== 'object') return null
  return walk as WalkExtras
}

function auditFrame(doc: Document): GlbFrameAudit {
  const root = doc.getRoot()
  let designScaleZ: number | null = null
  for (const node of root.listNodes()) {
    const name = node.getName()
    const sz = node.getScale()[2] ?? 1
    if (name === 'eco-design' || name.startsWith('eco-design')) {
      designScaleZ = sz
      break
    }
    if (designScaleZ === null && sz < 0) designScaleZ = sz
  }

  let walk: WalkExtras | null = null
  for (const scene of root.listScenes()) {
    walk = readWalkExtras(scene.getExtras())
    if (walk) break
  }
  if (!walk) {
    for (const node of root.listNodes()) {
      walk = readWalkExtras(node.getExtras())
      if (walk) break
    }
  }
  if (!walk) {
    walk = readWalkExtras(root.getExtras())
  }

  let walkMinZ: number | null = null
  let walkMaxZ: number | null = null
  const northWallsNegativeZ: string[] = []
  if (walk) {
    const rings: [number, number][][] = []
    for (const f of walk.floors ?? []) {
      if (f.ring?.length) rings.push(f.ring)
    }
    for (const s of walk.solids ?? []) {
      const ring = s.ring
      if (ring?.length) rings.push(ring)
      const name = s.name ?? ''
      if (
        ring?.length &&
        (/wall:.*N/i.test(name) || /_N(?:_|$)/i.test(name) || /wN(?:_|$)/i.test(name))
      ) {
        const zs = ring.map(([, z]) => z)
        if (zs.every((z) => z < 0)) northWallsNegativeZ.push(name)
      }
    }
    for (const ring of rings) {
      for (const [, z] of ring) {
        walkMinZ = walkMinZ === null ? z : Math.min(walkMinZ, z)
        walkMaxZ = walkMaxZ === null ? z : Math.max(walkMaxZ, z)
      }
    }
  }

  return {
    designScaleZ,
    walkPresent: walk !== null,
    walkMinZ: walkMinZ === null ? null : Number(walkMinZ.toFixed(4)),
    walkMaxZ: walkMaxZ === null ? null : Number(walkMaxZ.toFixed(4)),
    northWallsNegativeZ,
  }
}

function auditDocument(doc: Document, bytes: Uint8Array): GlbAuditReport {
  const root = doc.getRoot()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let drawCalls = 0
  let triangles = 0

  const walk = (node: ReturnType<typeof root.listNodes>[number], parentMatrix: number[]) => {
    const world = multiply(
      parentMatrix,
      fromTRS(node.getTranslation(), node.getRotation(), node.getScale()),
    )
    const mesh = node.getMesh()
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        drawCalls += 1
        const indices = prim.getIndices()
        const position = prim.getAttribute('POSITION')
        if (!position) continue
        triangles += (indices ? indices.getCount() : position.getCount()) / 3
        for (let i = 0; i < position.getCount(); i++) {
          const p = transformPoint(world, position.getElement(i, [0, 0, 0]))
          for (let k = 0; k < 3; k++) {
            if (p[k]! < min[k]!) min[k] = p[k]!
            if (p[k]! > max[k]!) max[k] = p[k]!
          }
        }
      }
    }
    for (const child of node.listChildren()) walk(child, world)
  }

  for (const scene of root.listScenes()) {
    for (const node of scene.listChildren()) walk(node, IDENTITY)
  }

  let vram = 0
  const textures: GlbTextureAudit[] = []
  for (const texture of root.listTextures()) {
    const size = texture.getSize()
    const image = texture.getImage()
    if (size) {
      textures.push({
        width: size[0]!,
        height: size[1]!,
        powerOfTwo: isPowerOfTwo(size[0]!) && isPowerOfTwo(size[1]!),
      })
    }
    if (size && image) {
      vram +=
        size[0]! *
        size[1]! *
        bytesPerTexel(texture.getMimeType(), image.byteLength, size[0]!, size[1]!) *
        (4 / 3)
    }
  }

  const round = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null)
  const finite = Number.isFinite(min[0])

  return {
    bytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(bytes, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_LGWIN]: 24,
      },
    }).byteLength,
    worldBounds: {
      min: finite ? min.map((v) => round(v)!) : null,
      max: finite ? max.map((v) => round(v)!) : null,
      sizeMeters: finite ? max.map((v, i) => round(v - min[i]!)!) : null,
    },
    drawCalls,
    triangles: Math.round(triangles),
    textureVramMiB: Number((vram / 1048576).toFixed(2)),
    textures,
    frame: auditFrame(doc),
    counts: {
      nodes: root.listNodes().length,
      meshes: root.listMeshes().length,
      materials: root.listMaterials().length,
      textures: root.listTextures().length,
      animations: root.listAnimations().length,
      skins: root.listSkins().length,
    },
    namedNodes: root
      .listNodes()
      .map((n) => n.getName())
      .filter(Boolean),
    extensionsUsed: root
      .listExtensionsUsed()
      .map((e) => e.extensionName)
      .sort(),
    extensionsRequired: root
      .listExtensionsRequired()
      .map((e) => e.extensionName)
      .sort(),
  }
}

/** Audit a GLB byte buffer. Throws if the file cannot be parsed. */
export async function auditGlb(input: ArrayBuffer | Uint8Array): Promise<GlbAuditReport> {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (src.byteLength < 12) {
    throw new Error('glb-audit: file too small to be a GLB')
  }
  const bytes = new Uint8Array(src.byteLength)
  bytes.set(src)
  const io = await createGlbIo()
  const doc = await io.readBinary(bytes)
  return auditDocument(doc, bytes)
}

/**
 * Hard gate — throws on any failure. Used by exportEcoGlb and H1 checks.
 * Deliberately broken models (empty, corrupt, wrong scale) must fail here.
 */
export function assertHardGlbAudit(
  report: GlbAuditReport,
  options: HardAuditOptions = {},
): void {
  const maxBytes = options.maxBytes ?? ECO_GLB_MAX_BYTES
  const maxExtentM = options.maxExtentM ?? ECO_GLB_MAX_EXTENT_M
  const minExtentM = options.minExtentM ?? ECO_GLB_MIN_EXTENT_M
  const maxTexDim = options.maxTexDim ?? ECO_GLB_MAX_TEX_DIM
  const fails: string[] = []

  if (report.bytes <= 0) fails.push('empty file')
  if (report.bytes > maxBytes) {
    fails.push(`file ${report.bytes} B exceeds max ${maxBytes} B`)
  }
  if (report.triangles <= 0) fails.push('no triangles')
  if (report.counts.meshes <= 0) fails.push('no meshes')
  if (!report.worldBounds.sizeMeters) fails.push('missing world bounds (metres)')
  else {
    const axes = ['X', 'Y', 'Z'] as const
    for (let i = 0; i < 3; i++) {
      const extent = report.worldBounds.sizeMeters[i] ?? 0
      if (extent < minExtentM) {
        fails.push(
          `${axes[i]} extent ${extent} m below min ${minExtentM} m — likely wrong units`,
        )
      }
      if (extent > maxExtentM) {
        fails.push(
          `${axes[i]} extent ${extent} m above max ${maxExtentM} m — likely wrong scale`,
        )
      }
    }
  }

  if (!options.skipMeshBudget) {
    // One mesh / draw call per material — never one per wall/slab element.
    if (report.counts.materials > 0 && report.counts.meshes > report.counts.materials) {
      fails.push(
        `meshes ${report.counts.meshes} > materials ${report.counts.materials} — expected one mesh per material`,
      )
    }
    if (report.counts.materials > 0 && report.drawCalls > report.counts.materials) {
      fails.push(
        `drawCalls ${report.drawCalls} > materials ${report.counts.materials} — expected one draw per material`,
      )
    }
  }

  for (const tex of report.textures) {
    if (!tex.powerOfTwo) {
      fails.push(`texture ${tex.width}×${tex.height} is not power-of-two`)
    }
    if (tex.width > maxTexDim || tex.height > maxTexDim) {
      fails.push(
        `texture ${tex.width}×${tex.height} exceeds max ${maxTexDim}px`,
      )
    }
  }

  if (!options.skipFrame) {
    const { frame } = report
    // Z-south / Y-up: assert the walk contract signs (H0). Do not require
    // surviving scale.z < 0 — GLTFExporter often bakes the flip into positions.
    if (frame.walkPresent) {
      if (frame.northWallsNegativeZ.length === 0) {
        // Named north walls missing — fall back to ring span must cross into −z
        // for any building that extends past the origin in editor +z.
        if (
          frame.walkMinZ !== null &&
          frame.walkMaxZ !== null &&
          frame.walkMinZ >= 0 &&
          frame.walkMaxZ > 0
        ) {
          fails.push(
            'walk rings all have z≥0 — expected z-south (editor north → world −z)',
          )
        }
      }
      // Y-up: floor tops are metres on Y (positive height above base).
      // Covered by AABB Y extent ≥ minExtent; walk presence is the stamp check.
    } else {
      fails.push('missing extras.walk — expected Y-up / z-south walk stamp')
    }
  }

  if (fails.length) {
    throw new Error(`glb-audit HARD FAIL: ${fails.join('; ')}`)
  }
}

/** Human-readable size for the export UI (`1.9 MB → 280 KB`). */
export function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function formatExportSizeLabel(beforeBytes: number, afterBytes: number): string {
  return `${formatByteSize(beforeBytes)} → ${formatByteSize(afterBytes)}`
}
