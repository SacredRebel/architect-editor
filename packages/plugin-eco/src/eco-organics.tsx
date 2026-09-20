'use client'

import { useMemo, useSyncExternalStore } from 'react'
import type { Object3D } from 'three'
import {
  createEcoThreeMaterial,
  getEcoMaterialsState,
  resolveEcoMaterialId,
  subscribeEcoMaterials,
} from './eco-materials'
import {
  buildCatenaryObject3D,
  buildLoftObject3D,
  buildMinimalObject3D,
  buildVaultObject3D,
} from './eco-organic-geometry'
import { getEcoOrganicState, subscribeEcoOrganic } from './eco-organic-store'

function useOrganic() {
  return useSyncExternalStore(subscribeEcoOrganic, getEcoOrganicState, getEcoOrganicState)
}

function useMats() {
  return useSyncExternalStore(subscribeEcoMaterials, getEcoMaterialsState, getEcoMaterialsState)
}

/** Render parametric loft / vault / catenary / minimal surfaces. */
export function EcoOrganics() {
  const organic = useOrganic()
  const mats = useMats()
  const objects = useMemo(() => {
    const out: Object3D[] = []
    void mats
    for (const loft of organic.lofts) {
      const id = resolveEcoMaterialId(`loft:${loft.id}`, 'shell')
      const mat = createEcoThreeMaterial(id, { doubleSide: true })
      out.push(buildLoftObject3D(loft, mat, id))
    }
    for (const vault of organic.vaults) {
      const id = resolveEcoMaterialId(`vault:${vault.id}`, 'shell')
      const mat = createEcoThreeMaterial(id, { doubleSide: true })
      out.push(buildVaultObject3D(vault, mat, id))
    }
    for (const cat of organic.catenaries) {
      const id = resolveEcoMaterialId(`cat:${cat.id}`, 'shell')
      const mat = createEcoThreeMaterial(id)
      out.push(buildCatenaryObject3D(cat, mat, id))
    }
    for (const patch of organic.minimal) {
      const id = resolveEcoMaterialId(`min:${patch.id}`, 'shell')
      const mat = createEcoThreeMaterial(id, { doubleSide: true })
      out.push(buildMinimalObject3D(patch, mat, id))
    }
    return out
  }, [organic, mats])

  return (
    <group name="eco-organics">
      {objects.map((obj) => (
        <primitive key={obj.name} object={obj} />
      ))}
    </group>
  )
}
