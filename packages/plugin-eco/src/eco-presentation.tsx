'use client'

import { Suspense } from 'react'
import { EcoCompass } from './eco-compass'
import { EcoGhost } from './eco-ghost'
import { EcoGuides } from './eco-guides'

/** Viewer presentation root — guides, ghost massing, compass. */
export default function EcoPresentation() {
  return (
    <group name="eco-presentation">
      <EcoGuides />
      <Suspense fallback={null}>
        <EcoGhost />
      </Suspense>
      <EcoCompass />
    </group>
  )
}
