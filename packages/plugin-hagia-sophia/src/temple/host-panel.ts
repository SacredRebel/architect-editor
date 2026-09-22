import type { EditorHostPanel } from '@pascal-app/editor'

/** The Temple forms rail panel: domed bays at any size, and classic proportions. */
export const templeHostPanel: EditorHostPanel = {
  id: 'pascal:hagia-sophia:temple-forms',
  label: 'Temple forms',
  icon: { kind: 'url', src: '/icons/temple-dome.svg' },
  component: () => import('./panel'),
  kinds: ['hagia-sophia:dome', 'hagia-sophia:arch', 'hagia-sophia:pendentive', 'hagia-sophia:pier'],
  pluginId: 'pascal:hagia-sophia',
  description: 'Domes, arches, pendentives, piers and columns; a domed bay at any size, cut from one sphere.',
  creator: { name: 'ActArtech', url: 'https://github.com/ActArtech/editor' },
  defaultInstalled: true,
}
