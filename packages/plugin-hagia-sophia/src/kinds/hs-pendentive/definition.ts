import type { AnyNode, NodeDefinition } from '@pascal-app/core'
import { buildPendentiveFloorplan } from './floorplan'
import { buildPendentiveGeometry } from './geometry'
import { HsPendentiveNode } from './schema'
import { pendentiveParametrics } from '../../temple/parametrics'

type HsPendentiveDefinition = NodeDefinition<typeof HsPendentiveNode> & Record<string, unknown>

const hsPendentiveFloorPlacement = {
  footprint: (node: unknown) => {
    const p = node as HsPendentiveNode
    const d = p.squareSide ? p.squareSide / 2 : p.sphereRadius
    return {
      dimensions: [d, d, d] as [number, number, number],
      rotation: p.rotation,
    }
  },
  collides: false,
  applies: (node: AnyNode) => !(node as { metadata?: { templeBay?: string } }).metadata?.templeBay,
}

/** Geometry-only pendentive — spherical quadrant bridging square bay to dome. */
export const hsPendentiveDefinition: HsPendentiveDefinition = {
  kind: 'hagia-sophia:pendentive',
  schemaVersion: 1,
  schema: HsPendentiveNode,
  category: 'structure',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    sphereRadius: 15.55,
    quadrant: 'ne',
  }),

  capabilities: {
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    snappable: {},
    floorPlaced: hsPendentiveFloorPlacement,
  },

  geometry: (node) => buildPendentiveGeometry(node),
  geometryKey: (n) => `${n.sphereRadius}|${n.quadrant}|${n.squareSide ?? ''}`,
  floorplan: buildPendentiveFloorplan,

  parametrics: pendentiveParametrics,

  presentation: {
    label: 'Pendentive',
    description: 'The curved triangle that carries a round dome on a square bay. From ActArtech; true pendentives here.',
    icon: { kind: 'url', src: '/icons/temple-dome.svg' },
    paletteSection: 'structure',
  },

  mcp: {
    description:
      'Parametric pendentive: sphereRadius + quadrant (ne|nw|se|sw). One spherical octant shell.',
  },
}
