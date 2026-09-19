'use client'

import { useLoader } from '@react-three/fiber'
import { useMemo, useSyncExternalStore } from 'react'
import { DoubleSide, type Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

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
        obj.raycast = () => {}
      }
    })
    return root as Group
  }, [gltf])

  return <primitive object={ghost} />
}

/**
 * Optional reference massing as a non-interactive translucent ghost at origin.
 */
export function EcoGhost() {
  const { site, showGhost } = useEcoSiteStore()
  const url = useMemo(() => {
    if (!site?.refGlb || !showGhost) return null
    return base64ToObjectUrl(site.refGlb)
  }, [site?.refGlb, showGhost])

  if (!url) return null
  return (
    <group name="eco-ghost">
      <GhostModel url={url} />
    </group>
  )
}
