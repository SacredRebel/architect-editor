'use client'

import { Suspense, useEffect } from 'react'
import { EcoCompass } from './eco-compass'
import { EcoGhost } from './eco-ghost'
import { ensureEcoPlanSnapInstalled } from './eco-ghost-snap'
import { EcoGuides } from './eco-guides'
import { EcoPlacedAssets } from './eco-placed-assets'
import { EcoShells } from './eco-shells'
import { EcoWalk } from './eco-walk'

/** Viewer presentation root — guides, ghost massing, compass, user assets, walk. */
export default function EcoPresentation() {
  useEffect(() => {
    ensureEcoPlanSnapInstalled()
  }, [])

  return (
    <group name="eco-presentation">
      <EcoGuides />
      <Suspense fallback={null}>
        <EcoGhost />
      </Suspense>
      <EcoShells />
      <EcoPlacedAssets />
      <EcoCompass />
      <EcoWalk />
    </group>
  )
}
