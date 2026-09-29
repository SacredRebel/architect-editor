/**
 * The editor's "Export IFC 4.3", written by the eco exporter. Prepares the live
 * scene the way the editor's own exports do (export mode so instanced plants
 * swap in real geometry; editor affordances hidden; levels at their true
 * heights), gathers the eco forms and placed assets that are not scene nodes,
 * and writes the file with the site's georeference.
 */
import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { getWebIfcWasmPath, snapLevelsToTruePositions, useViewer } from '@pascal-app/viewer'
import type { Object3D } from 'three'
import { getEcoAssetsState } from '../eco-assets-store'
import { setEcoExportState } from '../eco-export-store'
import { getEcoOrganicState } from '../eco-organic-store'
import { getEcoShellsState } from '../eco-shell-store'
import { getEcoSiteState } from '../eco-site-store'
import { getEcoTreesState } from '../eco-trees-store'
import {
  compactParams,
  type EcoIfcExtra,
  type EcoIfcResult,
  exportEcoIfc,
} from './eco-ifc-export'

function nextFrames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}

function sceneRoot(): Object3D | null {
  for (const object of sceneRegistry.nodes.values()) {
    let o: Object3D = object
    while (o.parent) o = o.parent
    return o
  }
  return null
}

/** Object-name prefix under eco-presentation → the kind written to Pset_Playground. */
const EXTRA_KINDS: [string, string][] = [
  ['eco-loft:', 'eco:loft'],
  ['eco-vault:', 'eco:vault'],
  ['eco-catenary:', 'eco:catenary'],
  ['eco-minimal:', 'eco:minimal'],
  ['eco-rib:', 'eco:rib'],
  ['eco-cat-ribbon:', 'eco:catenary-ribbon'],
  ['eco-shell:', 'eco:shell'],
  ['prop:', 'eco:asset'],
  ['eco-trees:', 'eco:trees'],
]

/** Eco forms, shells, placed assets and planted trees, as they are drawn. */
export function collectEcoExtras(root: Object3D | null = sceneRoot()): EcoIfcExtra[] {
  const presentation = root?.getObjectByName('eco-presentation')
  if (!presentation) return []
  const organic = getEcoOrganicState()
  const params = new Map<string, unknown>()
  for (const list of [organic.lofts, organic.vaults, organic.catenaries, organic.minimal]) {
    for (const item of list as { id: string }[]) params.set(item.id, item)
  }
  for (const shell of getEcoShellsState().shells) params.set(shell.id, shell)
  for (const placement of getEcoAssetsState().placements) params.set(placement.id, placement)
  const treeCount = new Map<string, number>()
  for (const tree of getEcoTreesState().trees)
    treeCount.set(tree.variant, (treeCount.get(tree.variant) ?? 0) + 1)

  const extras: EcoIfcExtra[] = []
  const groups = ['eco-organics', 'eco-shells', 'eco-placed-assets', 'eco-trees']
  for (const groupName of groups) {
    const group = presentation.getObjectByName(groupName)
    for (const child of group?.children ?? []) {
      const match = EXTRA_KINDS.find(([prefix]) => child.name.startsWith(prefix))
      if (!match) continue
      const [prefix, kind] = match
      const id = child.name.slice(prefix.length)
      const found =
        kind === 'eco:trees'
          ? { variant: id, count: treeCount.get(id) ?? 0 }
          : compactParams(params.get(id))
      extras.push({ id: child.name, kind, name: child.name, params: found, object: child })
    }
  }
  return extras
}

const SPATIAL = new Set(['IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcSpace'])

/** One line for the export's reader: what went out, and the print of its GlobalIds. */
export function ifcExportSummary(result: EcoIfcResult): string {
  const elements = Object.entries(result.stats)
    .filter(([cls]) => !SPATIAL.has(cls))
    .reduce((sum, [, n]) => sum + n, 0)
  const spaces = result.stats.IfcSpace ?? 0
  const storeys = result.stats.IfcBuildingStorey ?? 0
  return `IFC 4.3 · ${elements} elements, ${spaces} spaces, ${storeys} storeys · GlobalIds ${result.idPrint}`
}

/**
 * Export the open scene as FreeCAD-ready IFC 4.3. The summary goes to the eco
 * panel and the console: the same scene exported again shows the same print.
 */
export async function exportEcoIfcFromEditor(): Promise<EcoIfcResult> {
  const result = await exportOpenScene()
  const summary = ifcExportSummary(result)
  setEcoExportState({ ifcSummary: summary })
  console.info(`[eco-ifc] ${summary}`)
  return result
}

async function exportOpenScene(): Promise<EcoIfcResult> {
  const { nodes, rootNodeIds } = useScene.getState()
  const site = getEcoSiteState().site
  useViewer.getState().setExporting(true)
  let restoreLevels: (() => void) | null = null
  try {
    await nextFrames()
    return await exportEcoIfc({
      nodes: nodes as never,
      rootNodeIds,
      objectOf: (id) => sceneRegistry.nodes.get(id),
      extras: () => collectEcoExtras(),
      site: site
        ? { originLL: site.originLL, originElevM: site.originElevM, northDeg: site.northDeg }
        : null,
      wasmPath: getWebIfcWasmPath(),
      beforeWalk: () => {
        emitter.emit('thumbnail:before-capture', undefined)
        restoreLevels = snapLevelsToTruePositions()
        sceneRoot()?.updateMatrixWorld(true)
      },
      afterWalk: () => {
        restoreLevels?.()
        restoreLevels = null
        emitter.emit('thumbnail:after-capture', undefined)
      },
    })
  } finally {
    useViewer.getState().setExporting(false)
  }
}
