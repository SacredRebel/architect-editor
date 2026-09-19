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
  description: 'Terrain guides, reference ghost, and north compass',
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
