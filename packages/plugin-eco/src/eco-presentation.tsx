'use client'

import { Suspense, useEffect, useSyncExternalStore } from 'react'
import { emitter } from '@pascal-app/core'
import { EcoBuildableEnvelope } from './eco-buildable-envelope'
import { EcoCompass } from './eco-compass'
import { EcoGhost } from './eco-ghost'
import { ensureEcoPlanSnapInstalled } from './eco-ghost-snap'
import { EcoGuides } from './eco-guides'
import { EcoOrganics } from './eco-organics'
import { EcoPlacedAssets } from './eco-placed-assets'
import {
  getEcoPresentationState,
  subscribeEcoPresentation,
} from './eco-presentation-store'
import { EcoShells } from './eco-shells'
import { EcoSiteLighting } from './eco-site-lighting'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'
import { EcoTrees } from './eco-trees'
import { EcoWalk } from './eco-walk'

function usePres() {
  return useSyncExternalStore(subscribeEcoPresentation, getEcoPresentationState, getEcoPresentationState)
}

function useSite() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/** Frame camera onto site / leaf extents when presentation turns on. */
function EcoPresentationFraming() {
  const { presentation } = usePres()
  const { site } = useSite()

  useEffect(() => {
    if (!presentation) return
    let minX = -14
    let maxX = 14
    let minZ = -8
    let maxZ = 8
    if (site) {
      const massing = site.guides.find((g) => g.kind === 'massing-outline')
      const pts = massing?.pts
      if (pts?.length) {
        minX = Infinity
        maxX = -Infinity
        minZ = Infinity
        maxZ = -Infinity
        for (const [x, z] of pts) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minZ = Math.min(minZ, z)
          maxZ = Math.max(maxZ, z)
        }
      }
    }
    const center: [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2]
    const size: [number, number] = [Math.max(4, maxX - minX), Math.max(4, maxZ - minZ)]
    const bounds = {
      min: [minX, minZ] as [number, number],
      max: [maxX, maxZ] as [number, number],
      center,
      size,
    }
    const fire = () => emitter.emit('camera-controls:fit-scene', { bounds })
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(fire))
    } else {
      fire()
    }
  }, [presentation, site])

  return null
}

/** Viewer presentation root — guides, ghost massing, compass, user assets, trees, walk. */
export default function EcoPresentation() {
  const { presentation } = usePres()

  useEffect(() => {
    ensureEcoPlanSnapInstalled()
  }, [])

  return (
    <group name="eco-presentation">
      <EcoSiteLighting />
      <EcoPresentationFraming />
      {!presentation && <EcoGuides />}
      {!presentation && <EcoBuildableEnvelope />}
      {!presentation && (
        <Suspense fallback={null}>
          <EcoGhost />
        </Suspense>
      )}
      <EcoShells />
      <EcoOrganics />
      <EcoPlacedAssets />
      <EcoTrees />
      {!presentation && <EcoCompass />}
      {!presentation && <EcoWalk />}
    </group>
  )
}
