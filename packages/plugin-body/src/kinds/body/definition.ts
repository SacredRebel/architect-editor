import type { NodeDefinition } from '@pascal-app/core'
import { BodyNode } from '../../schema/body'
import { buildBodyGeometry } from './geometry'

type BodyDefinition = NodeDefinition<typeof BodyNode> & Record<string, unknown>

export const bodyDefinition: BodyDefinition = {
  kind: 'body',
  schemaVersion: 1,
  schema: BodyNode,
  category: 'structure',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    revision: 0,
    shells: [],
    vertices: [],
    halfEdges: [],
    loops: [],
    faces: [],
    curves: [],
    bodyDefaults: {},
  }),

  capabilities: {
    selectable: { hitVolume: 'mesh' },
    duplicable: true,
    deletable: true,
  },

  geometry: (node) => buildBodyGeometry(node),
  geometryKey: (n) => `${n.id}|${n.revision}|${n.faces.length}|${n.vertices.length}`,

  presentation: {
    label: 'Body',
    description: 'Direct-modeling solid with half-edge topology (arcs, sweep, CSG, push-pull).',
    icon: { kind: 'url', src: '/icons/mesh.webp' },
    paletteSection: 'structure',
    paletteOrder: 140,
  },

  mcp: {
    description:
      'Half-edge body: shells, vertices, halfEdges, loops, faces, curves. Use kernel helpers for push-pull, sweep, CSG, offset.',
  },
}
