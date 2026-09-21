/**
 * GLB web optimise — adapted from pascalorg/skills glb-web-export (MIT).
 *
 * Rule: compression is headroom, not the plan. Prefer sparse parametric geometry
 * that lands under budget with empty extensionsRequired (see sibling cabins pack:
 * ~85 KB / 1.2k tris, no meshopt). If a model needs meshopt to fit, fix the
 * geometry first.
 *
 * Three profiles:
 * - `compat` (default for eco:glb) — dedup/prune/weld/quantize + JPEG. No meshopt.
 * - `web` — same cleanup + meshopt. Safe for the world since spatial-map wires
 *   MeshoptDecoder via makeGltfLoader(); still not the primary budget plan.
 * - `image3d` — H14 atlas soups: meshopt + WebP ≤1024 (≤5 MB).
 *
 * Draco is never used: decoder wasm is either a CDN (forbidden in embed) or a
 * binary over the 200 KB limit.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  dedup,
  meshopt,
  prune,
  quantize,
  resample,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { createGlbIo } from './glb-audit'

/**
 * - `compat` — parametric eco:glb (JPEG ≤512, no meshopt)
 * - `web` — meshopt headroom (JPEG ≤512)
 * - `image3d` — H14 atlas props/massing: meshopt + WebP ≤1024, ≤5 MB target
 */
export type OptimiseProfile = 'compat' | 'web' | 'image3d'

export type OptimiseResult = {
  buffer: ArrayBuffer
  beforeBytes: number
  afterBytes: number
  profile: OptimiseProfile
}

async function writeBinary(io: NodeIO, doc: Awaited<ReturnType<NodeIO['readBinary']>>): Promise<ArrayBuffer> {
  const out = await io.writeBinary(doc)
  const copy = new Uint8Array(out.byteLength)
  copy.set(out)
  // Never return copy.buffer raw — engines may over-allocate the ArrayBuffer.
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
}

/**
 * Optimise a GLB for web delivery. Never mutates the input buffer.
 */
export async function optimiseGlb(
  input: ArrayBuffer | Uint8Array,
  profile: OptimiseProfile = 'compat',
): Promise<OptimiseResult> {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input)
  const bytes = new Uint8Array(src.byteLength)
  bytes.set(src)
  const beforeBytes = bytes.byteLength
  const io = await createGlbIo()
  const doc = await io.readBinary(bytes)

  // Lossless cleanup first (skill default name-preserving pipeline).
  await doc.transform(dedup(), prune({ keepLeaves: false }), weld())

  // Texture: resize via textureCompress (no KTX/Basis — loader is meshopt-only for image3d).
  // Skip if no textures — common for editor parametric exports.
  if (doc.getRoot().listTextures().length > 0) {
    if (profile === 'image3d') {
      await doc.transform(
        textureCompress({
          targetFormat: 'webp',
          quality: 80,
          resize: [1024, 1024],
        }),
      )
    } else {
      await doc.transform(
        textureCompress({
          targetFormat: 'jpeg',
          quality: 80,
          // Match ECO_GLB_MAX_TEX_DIM (512) — keep compat under 500 KB.
          resize: [512, 512],
        }),
      )
    }
  }

  if (profile === 'web' || profile === 'image3d') {
    await MeshoptEncoder.ready
    await doc.transform(
      resample(),
      quantize({ quantizePosition: 14 }),
      meshopt({ level: 'high', encoder: MeshoptEncoder }),
    )
  } else {
    // KHR_mesh_quantization — Three.js GLTFLoader supports without extra decoder.
    await doc.transform(quantize({ quantizePosition: 14 }))
  }

  const buffer = await writeBinary(io, doc)
  return { buffer, beforeBytes, afterBytes: buffer.byteLength, profile }
}
