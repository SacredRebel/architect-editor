'use client'

import { useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { DoubleSide, type Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ensureEcoPlanSnapInstalled, setEcoGhostMeshSnap } from './eco-ghost-snap'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'
import { extractGhostPlanSnap } from './extract-ghost-plan-edges'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

function base64ToObjectUrl(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'model/gltf-binary' })
  return URL.createObjectURL(blob)
}

/**
 * One object URL per reference GLB, kept outside React. The loader suspends,
 * and a retry renders this component afresh, so a URL minted in render (even
 * memoised) is new on every retry: the loader's cache never hits and the ghost
 * never settles — thousands of blobs a minute. The previous URL is revoked when
 * the host sends a different reference.
 */
let ghostUrl: { glb: string; url: string } | null = null

function objectUrlForGlb(base64: string): string {
  if (ghostUrl?.glb === base64) return ghostUrl.url
  if (ghostUrl) URL.revokeObjectURL(ghostUrl.url)
  ghostUrl = { glb: base64, url: base64ToObjectUrl(base64) }
  return ghostUrl.url
}

function GhostModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url)
  const ghost = useMemo(() => {
    const root = gltf.scene.clone(true)
    const mat = new MeshBasicMaterial({
      color: '#a78bfa',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: DoubleSide,
    })
    root.traverse((obj: Object3D) => {
      if (obj instanceof Mesh) {
        obj.material = mat
        // Keep non-interactive for selection; plan snap uses extracted edges.
        obj.raycast = () => {}
      }
    })
    return root as Group
  }, [gltf])

  useEffect(() => {
    setEcoGhostMeshSnap(extractGhostPlanSnap(ghost))
    return () => setEcoGhostMeshSnap(null)
  }, [ghost])

  return <primitive object={ghost} />
}

/**
 * Optional reference massing as a translucent ghost at origin.
 * When shown, its plan silhouette (and site guides) feed wall/slab snap.
 */
export function EcoGhost() {
  const { site, showGhost } = useEcoSiteStore()
  const url = site?.refGlb && showGhost ? objectUrlForGlb(site.refGlb) : null

  useEffect(() => {
    ensureEcoPlanSnapInstalled()
  }, [])

  useEffect(() => {
    if (!showGhost || !site?.refGlb) setEcoGhostMeshSnap(null)
  }, [showGhost, site?.refGlb])

  if (!url) return null
  return (
    <group name="eco-ghost">
      <GhostModel url={url} />
    </group>
  )
}
