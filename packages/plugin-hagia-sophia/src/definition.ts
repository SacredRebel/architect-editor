import type { AnyNode, NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { buildColumnFloorplan } from './floorplan'
import { buildColumnGeometry } from './geometry'
import { HsColumnNode } from './schema'
import { columnParametrics } from './temple/parametrics'

type HsColumnDefinition = NodeDefinition<typeof HsColumnNode> & Record<string, unknown>

const hsColumnFloorPlacement = {
  footprint: (node: unknown) => {
    const col = node as HsColumnNode
    return {
      dimensions: [
        col.shaftRadius * 2,
        col.shaftHeight + col.capitalHeight,
        col.shaftRadius * 2,
      ] as [number, number, number],
      rotation: col.rotation,
    }
  },
  collides: false,
  // a domed bay stands on one base the panel chose; lifting each part to its own ground would split it
  applies: (node: AnyNode) => !(node as { metadata?: { templeBay?: string } }).metadata?.templeBay,
}

/**
 * Geometry-only checkbox — Phase 1 has no custom renderer/system/tool.
 * Framework `<GeometrySystem>` + generic parametric renderer own the mount.
 */
export const hsColumnDefinition: HsColumnDefinition = {
  kind: 'hagia-sophia:column',
  schemaVersion: 1,
  schema: HsColumnNode,
  category: 'furnish',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    variant: 'nave_verde',
    shaftHeight: 8.53,
    capitalHeight: 1.83,
    shaftRadius: 0.45,
    flutes: 0,
    entasis: 0.03,
  }),

  capabilities: {
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    snappable: {},
    floorPlaced: hsColumnFloorPlacement,
  },

  geometry: (node) => buildColumnGeometry(node),
  geometryKey: (n) =>
    `${n.variant}|${n.shaftHeight}|${n.capitalHeight}|${n.shaftRadius}|${n.flutes}|${n.entasis}`,
  floorplan: buildColumnFloorplan,

  parametrics: columnParametrics,
  tool: () => import('./temple/tools/column'),
  toolHints: [
    { key: 'Left click', label: 'Place' },
    { key: 'R / T', label: 'Turn 45° (Shift: 15°)' },
    { key: 'Esc', label: 'Done' },
  ],
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('./temple/tools/column'),
      preferredView: '3d',
    } satisfies FloorplanNodeExtension,
  },

  presentation: {
    label: 'Temple column',
    description: 'A stone column with entasis and a bowl capital. From ActArtech.',
    icon: { kind: 'url', src: '/icons/temple-column.svg' },
    paletteSection: 'structure',
    paletteOrder: 134,
  },

  mcp: {
    description:
      'Hagia Sophia ground-floor column: verde-antico nave (10.36 m), porphyry exedra (9.45 m), aisle verde, aisle pillars. Entasis-tapered shaft + bowl capital.',
  },
}
