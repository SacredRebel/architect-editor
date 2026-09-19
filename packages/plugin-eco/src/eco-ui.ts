import type { EditorHostPanel } from '@pascal-app/editor'
import type { ViewerPresentationContribution } from '@pascal-app/viewer'

export const ecoPresentation: ViewerPresentationContribution = {
  id: 'eco:plugin-eco:presentation',
  // Always-on while the eco plugin is loaded (no per-scene install gate).
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
