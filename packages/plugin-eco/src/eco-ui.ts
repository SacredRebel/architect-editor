import type { EditorHostPanel } from '@pascal-app/editor'
import type { ViewerPresentationContribution } from '@pascal-app/viewer'

export const ecoPresentation: ViewerPresentationContribution = {
  id: 'eco:plugin-eco:presentation',
  component: () => import('./eco-presentation'),
}

export const ecoHostPanel: EditorHostPanel = {
  id: 'eco:plugin-eco:legend',
  label: 'Eco site',
  icon: { kind: 'url', src: '/icons/mesh.webp' },
  description: 'Terrain guides, Walk, export to world, reference ghost, and north compass',
  pluginId: 'eco:plugin-eco',
  component: () => import('./eco-legend-panel'),
  defaultInstalled: true,
}

export const ecoAssetsHostPanel: EditorHostPanel = {
  id: 'eco:plugin-eco:assets',
  label: 'My assets',
  icon: { kind: 'url', src: '/icons/couch.webp' },
  description: 'Upload and place your own GLB models',
  pluginId: 'eco:plugin-eco',
  component: () => import('./eco-assets-panel'),
  defaultInstalled: true,
}

export const ecoMaterialsHostPanel: EditorHostPanel = {
  id: 'eco:plugin-eco:materials',
  label: 'Materials',
  icon: { kind: 'url', src: '/icons/mesh.webp' },
  description: 'Eco material palette for walls, slabs, and shells',
  pluginId: 'eco:plugin-eco',
  component: () => import('./eco-materials-panel'),
  defaultInstalled: true,
}

export const ecoDrawingsHostPanel: EditorHostPanel = {
  id: 'eco:plugin-eco:drawings',
  label: 'Drawings',
  icon: { kind: 'url', src: '/icons/mesh.webp' },
  description: 'Orthographic plan, section, and elevation PNGs at true scale',
  pluginId: 'eco:plugin-eco',
  component: () => import('./eco-drawings-panel'),
  defaultInstalled: true,
}

export const ecoConstructionHostPanel: EditorHostPanel = {
  id: 'eco:plugin-eco:construction',
  label: 'Construction',
  icon: { kind: 'url', src: '/icons/mesh.webp' },
  description: 'Ventura County material takeoff CSV with basis labels on every quantity',
  pluginId: 'eco:plugin-eco',
  component: () => import('./eco-construction-panel'),
  defaultInstalled: true,
}
