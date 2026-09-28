'use client'

import { heightAt, terrainFieldOf, useScene } from '@pascal-app/core'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { siteTreesInScene } from './eco-site-reference'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

const TRUNK = new THREE.CylinderGeometry(0.5, 0.6, 1, 7)
const CANOPY = new THREE.IcosahedronGeometry(1, 1)
const noRaycast = () => {}

/**
 * A5 — the site's standing trees, as sent on `eco:load-site`: a reference
 * layer, standing on the terrain the editor draws. Not scene nodes, so never
 * exported, selected or edited; no raycast, so a tool's click on the ground
 * under a canopy reaches the ground. They cast shadows: their shade on the
 * design is part of the site.
 */
export function EcoSiteTrees() {
  const { site, showSiteTrees } = useEcoSiteStore()
  const siteNode = useScene((s) => {
    const id = s.rootNodeIds.find((rid) => s.nodes[rid]?.type === 'site')
    return id ? s.nodes[id] : null
  })
  const field = useMemo(() => {
    if (siteNode?.type !== 'site') return null
    return terrainFieldOf({ id: siteNode.id, terrain: siteNode.terrain })
  }, [siteNode])
  const trees = useMemo(() => siteTreesInScene(site), [site])

  const meshes = useMemo(() => {
    if (!trees.length) return null
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#6f6254', roughness: 0.95 })
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: '#7f9670',
      roughness: 0.9,
      transparent: true,
      opacity: 0.72,
    })
    const trunks = new THREE.InstancedMesh(TRUNK, trunkMaterial, trees.length)
    const canopies = new THREE.InstancedMesh(CANOPY, canopyMaterial, trees.length)
    trunks.name = 'eco-site-tree-trunks'
    canopies.name = 'eco-site-tree-canopies'
    for (const mesh of [trunks, canopies]) {
      mesh.raycast = noRaycast
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    return { trunks, canopies, trunkMaterial, canopyMaterial }
  }, [trees])

  useEffect(() => {
    if (!meshes) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    trees.forEach((tree, i) => {
      const base = field ? heightAt(field, tree.x, tree.z) : 0
      const r = tree.canopyM / 2
      const rv = Math.min(r, tree.heightM * 0.4)
      const trunkH = tree.heightM - rv
      const trunkR = Math.min(0.4, Math.max(0.08, tree.heightM * 0.02))
      m.compose(
        new THREE.Vector3(tree.x, base + trunkH / 2, tree.z),
        q,
        new THREE.Vector3(trunkR, trunkH, trunkR),
      )
      meshes.trunks.setMatrixAt(i, m)
      m.compose(
        new THREE.Vector3(tree.x, base + tree.heightM - rv, tree.z),
        q,
        new THREE.Vector3(r, rv, r),
      )
      meshes.canopies.setMatrixAt(i, m)
    })
    meshes.trunks.instanceMatrix.needsUpdate = true
    meshes.canopies.instanceMatrix.needsUpdate = true
    meshes.trunks.computeBoundingSphere()
    meshes.canopies.computeBoundingSphere()
  }, [meshes, trees, field])

  useEffect(
    () => () => {
      meshes?.trunks.dispose()
      meshes?.canopies.dispose()
      meshes?.trunkMaterial.dispose()
      meshes?.canopyMaterial.dispose()
    },
    [meshes],
  )

  if (!meshes || !showSiteTrees) return null
  return (
    <group name="eco-site-trees" userData={{ ecoReference: 'site-trees', count: trees.length }}>
      <primitive object={meshes.trunks} />
      <primitive object={meshes.canopies} />
    </group>
  )
}
