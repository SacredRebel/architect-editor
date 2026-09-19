'use client'

import { useMemo, useSyncExternalStore } from 'react'
import {
  createEcoThreeMaterial,
  elementKeyForShell,
  getEcoMaterialsState,
  resolveEcoMaterialId,
  subscribeEcoMaterials,
} from './eco-materials'
import { buildShellObject3D } from './eco-shell-geometry'
import { getEcoShellsState, subscribeEcoShells } from './eco-shell-store'

function useShells() {
  return useSyncExternalStore(subscribeEcoShells, getEcoShellsState, getEcoShellsState)
}

function useMats() {
  return useSyncExternalStore(subscribeEcoMaterials, getEcoMaterialsState, getEcoMaterialsState)
}

/** Render Eco shell roofs — walk-through (no colliders). */
export function EcoShells() {
  const { shells } = useShells()
  const mats = useMats()
  const objects = useMemo(
    () =>
      shells.map((s) => {
        const id = resolveEcoMaterialId(elementKeyForShell(s.id), 'shell')
        const mat = createEcoThreeMaterial(id, { doubleSide: true })
        return buildShellObject3D(s, mat, id)
      }),
    [shells, mats],
  )
  return (
    <group name="eco-shells">
      {objects.map((obj) => (
        <primitive key={obj.name} object={obj} />
      ))}
    </group>
  )
}
