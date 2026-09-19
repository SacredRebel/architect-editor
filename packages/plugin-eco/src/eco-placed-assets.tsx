'use client'

import { TransformControls } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Group, Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  base64ToBytes,
  getEcoAssetsState,
  selectEcoPlacement,
  subscribeEcoAssets,
  updateEcoPlacement,
} from './eco-assets-store'

function useAssets() {
  return useSyncExternalStore(subscribeEcoAssets, getEcoAssetsState, getEcoAssetsState)
}

function PlacedModel({
  base64,
  selected,
  placementId,
  position,
  rotation,
  scale,
}: {
  base64: string
  selected: boolean
  placementId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}) {
  const url = useMemo(() => {
    const bytes = base64ToBytes(base64)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const blob = new Blob([copy.buffer], { type: 'model/gltf-binary' })
    return URL.createObjectURL(blob)
  }, [base64])

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const gltf = useLoader(GLTFLoader, url)
  const group = useRef<Group>(null)
  const root = useMemo(() => gltf.scene.clone(true), [gltf])

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        selectEcoPlacement(placementId)
      }}
      position={position}
      ref={group}
      rotation={rotation}
      scale={scale}
    >
      <primitive object={root as Object3D} />
      {selected && group.current && (
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

  return (
    <group name="eco-placed-assets">
      {placements.map((placement) => {
        const asset = assets.find((a) => a.id === placement.assetId)
        if (!asset) return null
        return (
          <Suspense key={placement.id} fallback={null}>
            <PlacedModel
              base64={asset.bytesBase64}
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
  )
}
