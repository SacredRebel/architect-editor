import type { NodeDefinition } from '@pascal-app/core'
import { BodyGroupNode } from '../../schema/body-group'

type BodyGroupDefinition = NodeDefinition<typeof BodyGroupNode> & Record<string, unknown>

export const bodyGroupDefinition: BodyGroupDefinition = {
  kind: 'body-group',
  schemaVersion: 1,
  schema: BodyGroupNode,
  category: 'structure',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    children: [],
  }),

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    movable: { axes: ['x', 'y', 'z'], gridSnap: true },
    rotatable: { axes: ['y'] },
    duplicable: true,
    deletable: true,
  },

  presentation: {
    label: 'Body group',
    description: 'Transform container for sibling Body nodes.',
    icon: { kind: 'url', src: '/icons/mesh.webp' },
    paletteSection: 'structure',
    paletteOrder: 141,
  },

  mcp: {
    description: 'Persistent transform container grouping one or more body nodes.',
  },
}
