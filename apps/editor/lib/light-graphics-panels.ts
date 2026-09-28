import { setEditorHostPanelsHidden } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'

/**
 * Demo: host panels whose tool errors or does nothing are hidden while graphics
 * are light (the default) and come back with full graphics. Nothing is
 * unregistered; see docs/plans/demo-done.md for why each one is hidden.
 */
const hiddenInLight = new Set<string>()
let subscribed = false

function sync(): void {
  setEditorHostPanelsHidden(useViewer.getState().graphics === 'light' ? [...hiddenInLight] : [])
}

export function hideInLightGraphics(panelId: string): void {
  if (typeof window === 'undefined') return
  hiddenInLight.add(panelId)
  if (!subscribed) {
    subscribed = true
    useViewer.subscribe(sync)
  }
  sync()
}
