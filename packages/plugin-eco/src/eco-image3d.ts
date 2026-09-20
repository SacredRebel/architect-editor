/**
 * H11 — image-to-3D model selection surface.
 *
 * No multi-GB weights are downloaded here. Backends implement Image3dBackend
 * and run off-box (GPU host). See docs/plans/H11-eval.md.
 */

/** Wiring tier — preview → wire → quality. */
export type Image3dTier = 'preview' | 'wire' | 'quality'

/**
 * Cleared commercial model ids only.
 * InstantMesh is intentionally absent until Zero123++/SD licence is checked.
 */
export type Image3dModelId =
  | 'triposr'
  | 'triposg'
  | 'trellis2'
  | 'trellis-image-large'
  | 'direct3d-s2'

export type Image3dModelDef = {
  id: Image3dModelId
  tier: Image3dTier
  /** Hugging Face repo id (documentation / future download). */
  hfRepo: string
  licence: 'MIT'
  notes: string
}

/** Recommended stack order: TripoSR → TripoSG → TRELLIS.2. */
export const IMAGE3D_MODELS: readonly Image3dModelDef[] = [
  {
    id: 'triposr',
    tier: 'preview',
    hfRepo: 'stabilityai/TripoSR',
    licence: 'MIT',
    notes: 'Small/fast, lowest fidelity — preview smoke when a GPU host exists.',
  },
  {
    id: 'triposg',
    tier: 'wire',
    hfRepo: 'VAST-AI/TripoSG',
    licence: 'MIT',
    notes: 'diffusers-native TripoSGPipeline — cheapest first runnable wire.',
  },
  {
    id: 'trellis2',
    tier: 'quality',
    hfRepo: 'microsoft/TRELLIS.2-4B',
    licence: 'MIT',
    notes: 'Newest/strongest — documented first pick for quality.',
  },
  {
    id: 'trellis-image-large',
    tier: 'quality',
    hfRepo: 'microsoft/TRELLIS-image-large',
    licence: 'MIT',
    notes: 'Proven fallback (~2.7M downloads); DINOv2 encoder Apache-2.0.',
  },
  {
    id: 'direct3d-s2',
    tier: 'quality',
    hfRepo: 'wushuang98/Direct3D-S2',
    licence: 'MIT',
    notes: 'Higher resolution, heavier — optional later.',
  },
] as const

/** Documented quality first pick. */
export const IMAGE3D_QUALITY_FIRST_PICK: Image3dModelId = 'trellis2'

/** First runnable wire target (cheapest). */
export const IMAGE3D_WIRE_FIRST: Image3dModelId = 'triposg'

/** Preview / smoke tier. */
export const IMAGE3D_PREVIEW: Image3dModelId = 'triposr'

export const IMAGE3D_DEFAULT_TIER: Image3dTier = 'wire'

/**
 * Models that must never appear in Eco deps until licences clear.
 * InstantMesh is Apache-2.0 but pulls Zero123++/SD — blocked pending check.
 */
export const IMAGE3D_BANNED_IDS = [
  'instantmesh',
  'sharp',
  'vggt',
  'map-anything',
  'vfusion3d',
  'lyra',
  'hunyuan3d',
  'hunyuanworld',
  'stable-fast-3d',
  'stable-point-aware-3d',
] as const

export const IMAGE3D_SCOPE_NOTE =
  'props / furniture / vegetation / massing only — not walk'

export type Image3dKnownDimension = {
  /** Which AABB axis carries the known real-world length. */
  axis: 'x' | 'y' | 'z'
  /** Length of that axis in metres after export. */
  meters: number
}

export type Image3dInput = {
  /** Raw image bytes (png/jpeg/webp). */
  bytes: Uint8Array
  mimeType: string
  /** Required — unit-cube output has no absolute scale. */
  knownDimension: Image3dKnownDimension
}

export type Image3dResult = {
  glb: ArrayBuffer
  modelId: Image3dModelId
  tier: Image3dTier
  /** Bytes before meshopt / after (when optimised). */
  beforeBytes?: number
  afterBytes?: number
}

export type Image3dBackendStatus = 'ready' | 'unavailable' | 'deferred'

/**
 * Adapter: image → GLB. Implementations live on a GPU host;
 * the in-repo stub returns deferred.
 */
export interface Image3dBackend {
  readonly id: Image3dModelId
  readonly tier: Image3dTier
  readonly status: Image3dBackendStatus
  /**
   * Run inference and return a GLB already scaled + axis-remapped + meshopt’d
   * via eco-image3d-export helpers (or throw if deferred).
   */
  infer(input: Image3dInput): Promise<Image3dResult>
}

export function image3dModelById(id: Image3dModelId): Image3dModelDef {
  const found = IMAGE3D_MODELS.find((m) => m.id === id)
  if (!found) throw new Error(`unknown image3d model: ${id}`)
  return found
}

export function image3dModelForTier(tier: Image3dTier): Image3dModelDef {
  if (tier === 'preview') return image3dModelById(IMAGE3D_PREVIEW)
  if (tier === 'wire') return image3dModelById(IMAGE3D_WIRE_FIRST)
  return image3dModelById(IMAGE3D_QUALITY_FIRST_PICK)
}

/** True if a string looks like a banned / blocked model token. */
export function isBannedImage3dId(raw: string): boolean {
  const s = raw.toLowerCase()
  return IMAGE3D_BANNED_IDS.some((b) => s.includes(b))
}

/**
 * Stub backend — documents first-pick wiring without downloading weights.
 * All tiers share this until a GPU host implements a real backend.
 */
export class DeferredImage3dBackend implements Image3dBackend {
  readonly status: Image3dBackendStatus = 'deferred'
  readonly id: Image3dModelId
  readonly tier: Image3dTier

  constructor(tier: Image3dTier = IMAGE3D_DEFAULT_TIER) {
    const def = image3dModelForTier(tier)
    this.id = def.id
    this.tier = def.tier
  }

  async infer(_input: Image3dInput): Promise<Image3dResult> {
    const def = image3dModelById(this.id)
    throw new Error(
      `image-to-3D inference deferred (backend TBD). ` +
        `Selected ${def.hfRepo} (${this.tier}). ` +
        `Quality first pick remains microsoft/TRELLIS.2-4B; wire target VAST-AI/TripoSG.`,
    )
  }
}

export function createImage3dBackend(tier: Image3dTier = IMAGE3D_DEFAULT_TIER): Image3dBackend {
  return new DeferredImage3dBackend(tier)
}
