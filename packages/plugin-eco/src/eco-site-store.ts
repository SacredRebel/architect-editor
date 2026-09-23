import type { EcoSite } from './bridge-types'

export type GuideVisibility = Record<string, boolean>

type EcoSiteStore = {
  site: EcoSite | null
  guideVisibility: GuideVisibility
  showGhost: boolean
  showCompass: boolean
  /** Ventura buildable envelope translucent volume (H16.5). */
  showEnvelope: boolean
}

const listeners = new Set<() => void>()

let state: EcoSiteStore = {
  site: null,
  guideVisibility: {},
  showGhost: true,
  showCompass: true,
  showEnvelope: true,
}

function emit() {
  for (const listener of listeners) listener()
}

export function getEcoSiteState(): EcoSiteStore {
  return state
}

export function subscribeEcoSite(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoSite(site: EcoSite | null): void {
  const guideVisibility: GuideVisibility = {}
  if (site) {
    for (let i = 0; i < site.guides.length; i++) {
      const key = `${site.guides[i]!.kind}:${i}`
      guideVisibility[key] = state.guideVisibility[key] ?? true
    }
  }
  state = {
    ...state,
    site,
    guideVisibility,
  }
  emit()
}

export function setGuideVisible(key: string, visible: boolean): void {
  state = {
    ...state,
    guideVisibility: { ...state.guideVisibility, [key]: visible },
  }
  emit()
}

export function setShowGhost(showGhost: boolean): void {
  state = { ...state, showGhost }
  emit()
}

export function setShowCompass(showCompass: boolean): void {
  state = { ...state, showCompass }
  emit()
}

export function setShowEnvelope(showEnvelope: boolean): void {
  state = { ...state, showEnvelope }
  emit()
}
