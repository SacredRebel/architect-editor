import { useScene } from '@pascal-app/core'
import { getWebIfcWasmPath } from '@pascal-app/viewer'

type IfcModelExport = { data: Uint8Array; warnings: unknown[] }

let hostExporter: (() => Promise<IfcModelExport>) | null = null

/**
 * A host can supply its own IFC writer (the eco plugin's FreeCAD-ready one).
 * Without one, `@pascal-app/ifc-exporter` writes the file.
 */
export function setIfcModelExporter(exporter: (() => Promise<IfcModelExport>) | null): void {
  hostExporter = exporter
}

/**
 * Shared IFC 4.3 download helper — command palette + settings Export section.
 * Uses unmodified `web-ifc` (MPL-2.0) via `@pascal-app/ifc-exporter`, or the
 * host's writer when one is set.
 */
export async function exportIfcModel(): Promise<void> {
  let result: IfcModelExport
  if (hostExporter) {
    result = await hostExporter()
  } else {
    const { exportPascalToIfc } = await import('@pascal-app/ifc-exporter')
    const { nodes, rootNodeIds } = useScene.getState()
    result = await exportPascalToIfc({ nodes, rootNodeIds }, { wasmPath: getWebIfcWasmPath() })
  }
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
