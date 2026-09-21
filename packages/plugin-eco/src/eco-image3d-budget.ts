/**
 * H14 — export budget for atlas / image-to-3D GLBs.
 *
 * Loader contract: plain three.js GLTFLoader + meshopt decoder only.
 * No Draco, no KTX2/Basis. ≤ 5 MB, textures ≤ 1024 (WebP preferred).
 */
import type { GlbAuditReport } from './glb-audit'

/** Absolute ceiling for a placed prop / massing GLB. */
export const IMAGE3D_EXPORT_MAX_BYTES = 5 * 1024 * 1024

/** Texture edge ceiling for image-to-3D exports (WebP). */
export const IMAGE3D_EXPORT_MAX_TEX_DIM = 1024

/** Forbidden extensions for Eco image3d delivery. */
export const IMAGE3D_FORBIDDEN_EXTENSIONS = [
  'KHR_draco_mesh_compression',
  'KHR_texture_basisu',
] as const

export type Image3dBudgetResult = {
  ok: boolean
  fails: string[]
}

/**
 * Assert a GLB audit report meets the H14 loader + size contract.
 * Meshopt is allowed; Draco / KTX2 are not.
 */
export function assertImage3dExportBudget(
  report: GlbAuditReport,
  options: { maxBytes?: number; maxTexDim?: number } = {},
): Image3dBudgetResult {
  const maxBytes = options.maxBytes ?? IMAGE3D_EXPORT_MAX_BYTES
  const maxTexDim = options.maxTexDim ?? IMAGE3D_EXPORT_MAX_TEX_DIM
  const fails: string[] = []

  if (report.bytes <= 0) fails.push('empty file')
  if (report.bytes > maxBytes) {
    fails.push(`file ${report.bytes} B exceeds image3d max ${maxBytes} B`)
  }
  if (report.triangles <= 0) fails.push('no triangles')

  const ext = new Set([...report.extensionsUsed, ...report.extensionsRequired])
  for (const banned of IMAGE3D_FORBIDDEN_EXTENSIONS) {
    if (ext.has(banned)) {
      fails.push(`forbidden extension ${banned} — meshopt only`)
    }
  }

  for (const tex of report.textures) {
    if (tex.width > maxTexDim || tex.height > maxTexDim) {
      fails.push(`texture ${tex.width}×${tex.height} exceeds ${maxTexDim}px`)
    }
  }

  return { ok: fails.length === 0, fails }
}

export function enforceImage3dExportBudget(
  report: GlbAuditReport,
  options?: { maxBytes?: number; maxTexDim?: number },
): void {
  const result = assertImage3dExportBudget(report, options)
  if (!result.ok) {
    throw new Error(`image3d budget FAIL: ${result.fails.join('; ')}`)
  }
}
