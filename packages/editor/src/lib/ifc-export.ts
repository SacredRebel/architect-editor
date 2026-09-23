import { useScene } from '@pascal-app/core'

/**
 * Shared IFC 4.3 download helper — command palette + settings Export section.
 * Uses unmodified `web-ifc` (MPL-2.0) via `@pascal-app/ifc-exporter`.
 */
export async function exportIfcModel(): Promise<void> {
  const { exportPascalToIfc } = await import('@pascal-app/ifc-exporter')
  const { nodes, rootNodeIds } = useScene.getState()
  const result = await exportPascalToIfc({ nodes, rootNodeIds })
  if (result.warnings.length > 0) {
    console.warn('[ifc-export] warnings:', result.warnings)
  }
  const blob = new Blob([result.data as BlobPart], { type: 'application/x-step' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), {
    href: url,
    download: `model_${new Date().toISOString().split('T')[0]}.ifc`,
  }).click()
  URL.revokeObjectURL(url)
}
