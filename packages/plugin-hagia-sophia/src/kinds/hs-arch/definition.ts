import type { AnyNode, NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { buildArchFloorplan } from './floorplan'
import { buildArchGeometry } from './geometry'
import { HsArchNode } from './schema'
import { archParametrics } from '../../temple/parametrics'

type HsArchDefinition = NodeDefinition<typeof HsArchNode> & Record<string, unknown>

const hsArchFloorPlacement = {
  footprint: (node: unknown) => {
    const arch = node as HsArchNode
    return {
      dimensions: [arch.span, arch.rise, arch.depth] as [number, number, number],
      rotation: arch.rotation,
    }
  },
  collides: false,
  // a domed bay stands on one base the panel chose; lifting each part to its own ground would split it
  applies: (node: AnyNode) => !(node as { metadata?: { templeBay?: string } }).metadata?.templeBay,
}

/** Geometry-only arch — framework GeometrySystem + parametric renderer own the mount. */
export const hsArchDefinition: HsArchDefinition = {
  kind: 'hagia-sophia:arch',
  schemaVersion: 1,
  schema: HsArchNode,
  category: 'structure',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    span: 7.62,
    rise: 3.81,
    depth: 1.2,
    profileType: 'round',
    thickness: 0.6,
  }),

  capabilities: {
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    snappable: {},
    floorPlaced: hsArchFloorPlacement,
  },

  geometry: (node) => buildArchGeometry(node),
  geometryKey: (n) =>
    `${n.span}|${n.rise}|${n.depth}|${n.profileType}|${n.thickness}`,
  floorplan: buildArchFloorplan,

  parametrics: archParametrics,
  tool: () => import('../../temple/tools/arch'),
  toolHints: [
    { key: 'Left click', label: 'Place' },
    { key: 'R / T', label: 'Turn 45° (Shift: 15°)' },
    { key: 'Esc', label: 'Done' },
  ],
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('../../temple/tools/arch'),
      preferredView: '3d',
    } satisfies FloorplanNodeExtension,
  },

  presentation: {
    label: 'Arch',
    description: 'A masonry arch — round, pointed or segmental. From ActArtech.',
    icon: { kind: 'url', src: '/icons/temple-arch.svg' },
    paletteSection: 'structure',
    paletteOrder: 132,
  },

  mcp: {
    description:
      'Parametric arch block: span, rise, depth, profileType (round|segmental|pointed), thickness. Origin at springing midpoint.',
  },
}
