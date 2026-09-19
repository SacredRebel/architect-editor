/**
 * GLB web optimise — adapted from pascalorg/skills glb-web-export (MIT).
 *
 * Two profiles:
 * - `compat` — plain GLTFLoader (world eco:glb): dedup/prune/weld/quantize + JPEG textures
 * - `web` — phone / architects download: meshopt + JPEG (no KTX/ktx CLI dependency)
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

export type OptimiseProfile = 'compat' | 'web'

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

  // Texture: resize-ish via textureCompress quality + JPEG (no ktx binary needed).
  // Skip if no textures — common for editor parametric exports.
  if (doc.getRoot().listTextures().length > 0) {
    await doc.transform(
      textureCompress({
        targetFormat: 'jpeg',
        quality: 80,
        resize: [1024, 1024],
      }),
    )
  }

  if (profile === 'web') {
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
