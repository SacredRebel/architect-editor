import type { EditorHostPanel } from '@pascal-app/editor'
import type { ViewerPresentationContribution } from '@pascal-app/viewer'

export const geometryHostPanel: EditorHostPanel = {
  id: 'pascal:geometry:panel',
  label: 'Geometry',
  icon: { kind: 'url', src: '/icons/mesh.webp' },
  description: 'Universal geometry kit — plain-named construction figures',
  pluginId: 'pascal:geometry',
  component: () => import('./panel'),
  defaultInstalled: true,
}

export const geometryPresentation: ViewerPresentationContribution = {
  id: 'pascal:geometry:presentation',
  pluginId: 'pascal:geometry',
  component: () => import('./presentation'),
}
