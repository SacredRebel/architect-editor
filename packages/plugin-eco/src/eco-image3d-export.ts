/**
 * H11 / H14 — post-inference export helpers for image-to-3D soups.
 *
 * Pipeline: raw model GLB (unit cube, usually z-forward Y-up)
 *   → scale from known dimension
 *   → remap to world frame (x east, y up, z south)
 *   → meshopt (+ WebP ≤1024 for H14 `image3d` profile)
 *
 * No walk floors/solids are stamped — props / massing only.
 */
import { NodeIO, type Document } from '@gltf-transform/core'
import { auditGlb, createGlbIo } from './glb-audit'
import {
  enforceImage3dExportBudget,
  IMAGE3D_EXPORT_MAX_BYTES,
  IMAGE3D_EXPORT_MAX_TEX_DIM,
} from './eco-image3d-budget'
import type { Image3dKnownDimension } from './eco-image3d'
import { optimiseGlb, type OptimiseProfile, type OptimiseResult } from './glb-optimise'

export type Image3dSourceFrame = 'z-forward-y-up'

export type Image3dExportOptions = {
  knownDimension: Image3dKnownDimension
  /** Default z-forward Y-up (most image-to-3D exporters). */
  sourceFrame?: Image3dSourceFrame
  /**
   * Default `image3d` (H14) — meshopt + WebP ≤1024, ≤5 MB budget.
   * Legacy H11 tests may pass `web`. Parametric buildings stay on `compat`.
   */
  optimiseProfile?: OptimiseProfile
  /** Enforce H14 loader budget (default true for image3d/web profiles). */
  enforceBudget?: boolean
}

export type Image3dExportResult = {
  buffer: ArrayBuffer
  scaleFactor: number
  extentBeforeM: [number, number, number]
  extentAfterM: [number, number, number]
  optimise: OptimiseResult
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

function multiply(a: readonly number[], b: readonly number[]): number[] {
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

/** World-space AABB min/max of all mesh positions. */
export function measureGlbAabb(doc: Document): {
  min: [number, number, number]
  max: [number, number, number]
} {
  const root = doc.getRoot()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  const walk = (node: ReturnType<typeof root.listNodes>[number], parent: number[]) => {
    const world = multiply(parent, fromTRS(node.getTranslation(), node.getRotation(), node.getScale()))
    const mesh = node.getMesh()
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const position = prim.getAttribute('POSITION')
        if (!position) continue
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
    for (const child of scene.listChildren()) walk(child, [...IDENTITY])
  }

  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0] }
  }
  return {
    min: [min[0]!, min[1]!, min[2]!],
    max: [max[0]!, max[1]!, max[2]!],
  }
}

/** World-space AABB size of all mesh positions (metres if already scaled). */
export function measureGlbExtents(doc: Document): [number, number, number] {
  const { min, max } = measureGlbAabb(doc)
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

export function scaleFactorForKnownDimension(
  extent: readonly [number, number, number],
  known: Image3dKnownDimension,
): number {
  const axisIndex = known.axis === 'x' ? 0 : known.axis === 'y' ? 1 : 2
  const current = extent[axisIndex]!
  if (!(current > 1e-9)) {
    throw new Error(`image3d scale: ${known.axis} extent is zero — cannot set known dimension`)
  }
  if (!(known.meters > 0)) {
    throw new Error('image3d scale: known dimension must be > 0 metres')
  }
  return known.meters / current
}

/**
 * Remap common image-to-3D frame (Y-up, +Z forward) to Eco world
 * (x east, y up, z south) by negating Z on a wrapper node — same family
 * of flip as eco-design scale.z = -1 / siteToWorldXz.
 */
export function applyZForwardToWorldZSouth(doc: Document): void {
  const root = doc.getRoot()
  const scenes = root.listScenes()
  if (scenes.length === 0) return

  const wrapper = doc.createNode('eco-image3d-frame')
  // Mirror Z: +Z forward → −Z south while keeping Y up and X east.
  wrapper.setScale([1, 1, -1])

  for (const scene of scenes) {
    const children = [...scene.listChildren()]
    for (const child of children) {
      scene.removeChild(child)
      wrapper.addChild(child)
    }
    scene.addChild(wrapper)
  }
}

export function applyUniformScale(doc: Document, factor: number): void {
  const root = doc.getRoot()
  const scenes = root.listScenes()
  if (scenes.length === 0) return

  const wrapper = doc.createNode('eco-image3d-scale')
  wrapper.setScale([factor, factor, factor])

  for (const scene of scenes) {
    const children = [...scene.listChildren()]
    for (const child of children) {
      scene.removeChild(child)
      wrapper.addChild(child)
    }
    scene.addChild(wrapper)
  }
}

/**
 * Translate so the AABB sits on y=0 (no under-ground). Mid-base centred on XZ.
 */
export function applyGroundSeat(doc: Document): void {
  const root = doc.getRoot()
  const scenes = root.listScenes()
  if (scenes.length === 0) return
  const { min, max } = measureGlbAabb(doc)
  if (!Number.isFinite(min[0])) return
  const midX = (min[0] + max[0]) / 2
  const midZ = (min[2] + max[2]) / 2
  const wrapper = doc.createNode('eco-image3d-ground')
  wrapper.setTranslation([-midX, -min[1], -midZ])
  for (const scene of scenes) {
    const children = [...scene.listChildren()]
    for (const child of children) {
      scene.removeChild(child)
      wrapper.addChild(child)
    }
    scene.addChild(wrapper)
  }
}

async function writeBinary(io: NodeIO, doc: Document): Promise<ArrayBuffer> {
  const out = await io.writeBinary(doc)
  const copy = new Uint8Array(out.byteLength)
  copy.set(out)
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
}

/**
 * Scale + axis-remap + meshopt a raw image-to-3D GLB for Eco placement.
 * Does not stamp walk data.
 */
export async function prepareImage3dGlb(
  input: ArrayBuffer | Uint8Array,
  options: Image3dExportOptions,
): Promise<Image3dExportResult> {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input)
  const bytes = new Uint8Array(src.byteLength)
  bytes.set(src)

  const io = await createGlbIo()
  const doc = await io.readBinary(bytes)

  const extentBefore = measureGlbExtents(doc)
  const factor = scaleFactorForKnownDimension(extentBefore, options.knownDimension)
  applyUniformScale(doc, factor)

  const sourceFrame = options.sourceFrame ?? 'z-forward-y-up'
  if (sourceFrame === 'z-forward-y-up') {
    applyZForwardToWorldZSouth(doc)
  }
  // Sit on the ground plane and centre mid-base — fixes under-ground / wrong origin.
  applyGroundSeat(doc)

  const extentAfter = measureGlbExtents(doc)
  const scaled = await writeBinary(io, doc)

  const profile = options.optimiseProfile ?? 'image3d'
  const optimise = await optimiseGlb(scaled, profile)

  const enforce =
    options.enforceBudget ?? (profile === 'image3d' || profile === 'web')
  if (enforce) {
    const report = await auditGlb(optimise.buffer)
    enforceImage3dExportBudget(report, {
      maxBytes: IMAGE3D_EXPORT_MAX_BYTES,
      maxTexDim: IMAGE3D_EXPORT_MAX_TEX_DIM,
    })
  }

  return {
    buffer: optimise.buffer,
    scaleFactor: factor,
    extentBeforeM: extentBefore,
    extentAfterM: extentAfter,
    optimise,
  }
}

/**
 * Heuristic height (m) when the user does not supply a known dimension.
 * Object props default ~human-scale furniture; buildings ~single-storey eave.
 */
export function guessServiceHeightM(kind: 'object' | 'building'): number {
  return kind === 'building' ? 3.2 : 0.9
}
