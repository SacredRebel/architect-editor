'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { buildShellObject3D } from './eco-shell-geometry'
import { getEcoShellsState, subscribeEcoShells } from './eco-shell-store'

function useShells() {
  return useSyncExternalStore(subscribeEcoShells, getEcoShellsState, getEcoShellsState)
}

/** Render Eco shell roofs — walk-through (no colliders). */
export function EcoShells() {
  const { shells } = useShells()
  const objects = useMemo(() => shells.map((s) => buildShellObject3D(s)), [shells])
  return (
    <group name="eco-shells">
      {objects.map((obj) => (
        <primitive key={obj.name} object={obj} />
      ))}
    </group>
  )
}
