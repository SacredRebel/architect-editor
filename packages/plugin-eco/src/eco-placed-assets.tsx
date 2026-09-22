'use client'

import { TransformControls } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Group, Material, Mesh, Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import {
  assetRole,
  base64ToBytes,
  getEcoAssetsState,
  selectEcoPlacement,
  subscribeEcoAssets,
  updateEcoPlacement,
} from './eco-assets-store'

function useAssets() {
  return useSyncExternalStore(subscribeEcoAssets, getEcoAssetsState, getEcoAssetsState)
}

function makeMeshoptLoader() {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

function applyOpacity(root: Object3D, opacity: number): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const mat = m as Material & { transparent?: boolean; opacity?: number }
      if (!mat) continue
      mat.transparent = opacity < 0.999
      mat.opacity = opacity
      mat.depthWrite = opacity >= 0.999
      mat.needsUpdate = true
    }
  })
}

function PlacedModel({
  base64,
  selected,
  placementId,
  position,
  rotation,
  scale,
  locked,
  opacity,
  layerName,
}: {
  base64: string
  selected: boolean
  placementId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  locked: boolean
  opacity: number
  layerName: string
}) {
  const url = useMemo(() => {
    const bytes = base64ToBytes(base64)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const blob = new Blob([copy.buffer], { type: 'model/gltf-binary' })
    return URL.createObjectURL(blob)
  }, [base64])

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const gltf = useLoader(GLTFLoader, url, (loader) => {
    ;(loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder)
  })
  const group = useRef<Group>(null)
  const root = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    applyOpacity(cloned, opacity)
    return cloned
  }, [gltf, opacity])

  return (
    <group
      name={layerName}
      onClick={(e) => {
        e.stopPropagation()
        if (!locked) selectEcoPlacement(placementId)
      }}
      position={position}
      ref={group}
      rotation={rotation}
      scale={scale}
    >
      <primitive object={root as Object3D} />
      {selected && !locked && group.current && (
        <TransformControls
          object={group.current}
          onMouseUp={() => {
            const obj = group.current
            if (!obj) return
            updateEcoPlacement(placementId, {
              position: [obj.position.x, obj.position.y, obj.position.z],
              rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
              scale: [obj.scale.x, obj.scale.y, obj.scale.z],
            })
          }}
        />
      )}
    </group>
  )
}

/** Plugin-managed placed user assets with TransformControls when selected. */
export function EcoPlacedAssets() {
  const { assets, placements, selectedPlacementId } = useAssets()

  const props = placements.filter((p) => {
    const asset = assets.find((a) => a.id === p.assetId)
    return asset ? assetRole(asset) !== 'massing' : true
  })
  const massings = placements.filter((p) => {
    const asset = assets.find((a) => a.id === p.assetId)
    return asset ? assetRole(asset) === 'massing' : Boolean(p.excludeFromWalkExport)
  })

  return (
    <>
      <group name="eco-placed-assets">
        {props.map((placement) => {
          const asset = assets.find((a) => a.id === placement.assetId)
          if (!asset) return null
          return (
            <Suspense key={placement.id} fallback={null}>
              <PlacedModel
                base64={asset.bytesBase64}
                layerName={`prop:${placement.id}`}
                locked={Boolean(placement.locked)}
                opacity={placement.opacity ?? 1}
                placementId={placement.id}
                position={placement.position}
                rotation={placement.rotation}
                scale={placement.scale}
                selected={selectedPlacementId === placement.id}
              />
            </Suspense>
          )
        })}
      </group>
      <group name="eco-massing-refs">
        {massings.map((placement) => {
          const asset = assets.find((a) => a.id === placement.assetId)
          if (!asset) return null
          return (
            <Suspense key={placement.id} fallback={null}>
              <PlacedModel
                base64={asset.bytesBase64}
                layerName={`massing:${placement.id}`}
                locked
                opacity={placement.opacity ?? 0.45}
                placementId={placement.id}
                position={placement.position}
                rotation={placement.rotation}
                scale={placement.scale}
                selected={false}
              />
            </Suspense>
          )
        })}
      </group>
    </>
  )
}

/** Exported for tests — loader must carry meshopt, never Draco. */
export function createEcoGlbLoader(): GLTFLoader {
  return makeMeshoptLoader()
}
