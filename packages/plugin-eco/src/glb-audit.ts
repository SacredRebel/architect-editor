/**
 * GLB audit — adapted from pascalorg/skills glb-web-export (MIT).
 * Hard gate for eco exports: failures throw, they do not warn.
 */
import { NodeIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

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
  /** Max raw file bytes (default 500 KiB for phone / architects download). */
  maxBytes?: number
  /** Reject models whose longest world extent exceeds this (metres). */
  maxExtentM?: number
  /** Reject models whose longest world extent is below this (metres). */
  minExtentM?: number
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
  for (const texture of root.listTextures()) {
    const size = texture.getSize()
    const image = texture.getImage()
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
  const maxBytes = options.maxBytes ?? 500 * 1024
  const maxExtentM = options.maxExtentM ?? 500
  const minExtentM = options.minExtentM ?? 0.05
  const fails: string[] = []

  if (report.bytes <= 0) fails.push('empty file')
  if (report.bytes > maxBytes) {
    fails.push(`file ${report.bytes} B exceeds max ${maxBytes} B`)
  }
  if (report.triangles <= 0) fails.push('no triangles')
  if (report.counts.meshes <= 0) fails.push('no meshes')
  if (!report.worldBounds.sizeMeters) fails.push('missing world bounds (metres)')
  else {
    const [sx, sy, sz] = report.worldBounds.sizeMeters
    const longest = Math.max(sx ?? 0, sy ?? 0, sz ?? 0)
    if (longest < minExtentM) {
      fails.push(`world extent ${longest} m below min ${minExtentM} m — likely wrong units`)
    }
    if (longest > maxExtentM) {
      fails.push(`world extent ${longest} m above max ${maxExtentM} m — likely wrong scale`)
    }
    // Y-up: a building export should have measurable height
    if ((sy ?? 0) < minExtentM * 0.5 && longest >= minExtentM) {
      fails.push('Y extent near zero — expected Y-up metres')
    }
  }

  if (fails.length) {
    throw new Error(`glb-audit HARD FAIL: ${fails.join('; ')}`)
  }
}
