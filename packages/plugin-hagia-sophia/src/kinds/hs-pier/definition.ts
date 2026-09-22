import type { AnyNode, NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { DEFAULT_PIER_FOOTPRINT, PIER_HEIGHT } from '../../math/constants'
import { buildPierFloorplan } from './floorplan'
import { buildPierGeometry, footprintBounds } from './geometry'
import { HsPierNode } from './schema'
import { pierParametrics } from '../../temple/parametrics'

type HsPierDefinition = NodeDefinition<typeof HsPierNode> & Record<string, unknown>

const defaultFootprint = DEFAULT_PIER_FOOTPRINT.map(
  ([x, z]) => [x, z] as [number, number],
)

const hsPierFloorPlacement = {
  footprint: (node: unknown) => {
    const pier = node as HsPierNode
    const b = footprintBounds(pier.footprint)
    const w = b.width + pier.impostSize
    const d = b.depth + pier.impostSize
    const h = pier.height + pier.impostThickness
    return {
      dimensions: [w, h, d] as [number, number, number],
      rotation: pier.rotation,
    }
  },
  collides: false,
  // a domed bay stands on one base the panel chose; lifting each part to its own ground would split it
  applies: (node: AnyNode) => !(node as { metadata?: { templeBay?: string } }).metadata?.templeBay,
}

/** Geometry-only great pier — ashlar shaft + impost cap. */
export const hsPierDefinition: HsPierDefinition = {
  kind: 'hagia-sophia:pier',
  schemaVersion: 1,
  schema: HsPierNode,
  category: 'structure',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    footprint: defaultFootprint.map(([x, z]) => [x, z] as [number, number]),
    height: PIER_HEIGHT,
    impostSize: 1.2,
    impostThickness: 1.0,
    batter: 0,
  }),

  capabilities: {
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    snappable: {},
    floorPlaced: hsPierFloorPlacement,
  },

  geometry: (node) => buildPierGeometry(node),
  geometryKey: (n) =>
    `${n.height}|${n.impostSize}|${n.impostThickness}|${n.batter}|${n.footprint.map((p) => p.join(',')).join(';')}`,
  floorplan: buildPierFloorplan,

  parametrics: pierParametrics,
  tool: () => import('../../temple/tools/pier'),
  toolHints: [
    { key: 'Left click', label: 'Place' },
    { key: 'R / T', label: 'Turn 45° (Shift: 15°)' },
    { key: 'Esc', label: 'Done' },
  ],
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('../../temple/tools/pier'),
      preferredView: '3d',
    } satisfies FloorplanNodeExtension,
  },

  presentation: {
    label: 'Pier',
    description: 'A masonry pier with an impost block. From ActArtech.',
    icon: { kind: 'url', src: '/icons/temple-pier.svg' },
    paletteSection: 'structure',
    paletteOrder: 133,
  },

  mcp: {
    description:
      'Great pier: footprint polygon, height to springing, impostSize/impostThickness cap. Base at y=0.',
  },
}
