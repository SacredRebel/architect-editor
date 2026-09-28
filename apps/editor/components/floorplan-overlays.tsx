'use client'

import dynamic from 'next/dynamic'

const GeometryFloorplanOverlay = dynamic(
  () => import('@pascal-app/plugin-geometry').then((m) => m.geometryFloorplanOverlay()),
  { ssr: false },
)

// A5 — the eco site in the plan (contours, survey, standing trees), eco builds only.
const EcoFloorplanOverlay =
  process.env.NEXT_PUBLIC_ECO === '1'
    ? dynamic(() => import('@eco/plugin-eco').then((m) => m.ecoFloorplanOverlay()), { ssr: false })
    : null

/** Everything the app draws into the plan: Editor `floorplanSceneSlot`. */
export function FloorplanOverlays() {
  return (
    <>
      {EcoFloorplanOverlay ? <EcoFloorplanOverlay /> : null}
      <GeometryFloorplanOverlay />
    </>
  )
}
