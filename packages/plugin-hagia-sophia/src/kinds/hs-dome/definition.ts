import type { AnyNode, NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { buildDomeFloorplan } from './floorplan'
import { buildDomeGeometry } from './geometry'
import { HsDomeNode } from './schema'
import { domeParametrics } from '../../temple/parametrics'

type HsDomeDefinition = NodeDefinition<typeof HsDomeNode> & Record<string, unknown>

const hsDomeFloorPlacement = {
  footprint: (node: unknown) => {
    const dome = node as HsDomeNode
    const height = dome.radius * 2 * dome.riseRatio + dome.drumHeight
    return {
      dimensions: [dome.radius * 2, height, dome.radius * 2] as [number, number, number],
      rotation: dome.rotation,
    }
  },
  collides: false,
  // a domed bay stands on one base the panel chose; lifting each part to its own ground would split it
  applies: (node: AnyNode) => !(node as { metadata?: { templeBay?: string } }).metadata?.templeBay,
}

/** Geometry-only dome — framework GeometrySystem + parametric renderer own the mount. */
export const hsDomeDefinition: HsDomeDefinition = {
  kind: 'hagia-sophia:dome',
  schemaVersion: 1,
  schema: HsDomeNode,
  category: 'structure',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    radius: 15.55,
    riseRatio: 0.55,
    meridian: 'circular',
    shellThickness: 0.8,
    drumHeight: 5.5,
    drumRadius: 15.55 * 0.92,
    windowCount: 40,
    windowWidth: 0.9,
    windowHeight: 2.4,
    oculusRadius: 0,
    sectorStart: 0,
    sectorAngle: Math.PI * 2,
  }),

  capabilities: {
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    snappable: {},
    floorPlaced: hsDomeFloorPlacement,
  },

  geometry: (node) => buildDomeGeometry(node),
  geometryKey: (n) =>
    `${n.radius}|${n.riseRatio}|${n.meridian}|${n.shellThickness}|${n.drumHeight}|${n.drumRadius}|${n.windowCount}|${n.windowWidth}|${n.windowHeight}|${n.oculusRadius}|${n.sectorStart}|${n.sectorAngle}`,
  floorplan: buildDomeFloorplan,

  parametrics: domeParametrics,
  tool: () => import('../../temple/tools/dome'),
  toolHints: [
    { key: 'Left click', label: 'Place' },
    { key: 'R / T', label: 'Turn 45° (Shift: 15°)' },
    { key: 'Esc', label: 'Done' },
  ],
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('../../temple/tools/dome'),
      preferredView: '3d',
    } satisfies FloorplanNodeExtension,
  },

  presentation: {
    label: 'Dome',
    description: 'A dome on an optional drum of windows; hemisphere, saucer or golden. From ActArtech.',
    icon: { kind: 'url', src: '/icons/temple-dome.svg' },
    paletteSection: 'structure',
    paletteOrder: 131,
  },

  mcp: {
    description:
      'Parametric dome: radius, riseRatio, drum, windowCount recesses (no CSG), optional oculus, sectorStart/sectorAngle for half-domes. Base at y=0.',
  },
}
